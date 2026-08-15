# TUIDom Usage Guide

> ⚠️ **Experimental.** The API is unstable — no semver guarantees, anything may
> change between releases. Deep imports expose internals on purpose: there is no
> curated public surface yet.

TUIDom is a DOM-like terminal UI engine: an element tree with flex layout,
double-buffered grid rendering with ANSI diffing, keyboard/mouse input parsing
(incl. the Kitty protocol), focus management, capture/bubble events, widgets,
and a WebSocket inspector for devtools/e2e.

This guide covers the usage basics. Per-widget API reference is intentionally
not written by hand — it will be generated from source
(see `docs/TODO/ApiReferenceGeneration.md`).

- [Packages](#packages)
- [Getting started](#getting-started)
- [Core concepts](#core-concepts)
- [Layout](#layout)
- [Styling and themes](#styling-and-themes)
- [Input and events](#input-and-events)
- [Backends](#backends)
- [Inspector](#inspector)
- [Testing](#testing)
- [Elements overview](#elements-overview)
- [Demos](#demos)

## Packages

Lockstep-versioned, zero runtime dependencies (besides each other):

| Package | What's inside |
|---|---|
| `@tuidom/core` | element tree, flex layout, styles cascade, events/focus, grid rendering, input parsing, the `ITerminalBackend` contract |
| `@tuidom/elements` | widgets: lists, trees, menus, inputs, quick pick, scrollbars, … |
| `@tuidom/terminal-backend` | the real Node terminal backend (tty, ANSI diffing, Kitty protocol) |
| `@tuidom/headless-backend` | in-memory backend for screenshots/e2e (`captureFrame()`) |
| `@tuidom/inspector` | WebSocket inspector for devtools/e2e (hand-written RFC6455, zero-dep) |
| `@tuidom/testing` | test harness: `TestApp`, `renderElement`, `expectScreen`, mock backend |

## Getting started

Requirements:

- Node.js ≥ 24
- TypeScript consumers: `moduleResolution` must be `"node16"`, `"nodenext"` or
  `"bundler"` (the packages use subpath `exports`)
- `@types/node` — some public signatures reference `Buffer`/`process`

```sh
npm install @tuidom/core @tuidom/elements @tuidom/terminal-backend
```

Everything is imported via deep paths — one module per file, no barrel:

```ts
import { TuiApplication } from "@tuidom/core/dom/tuiApplication";
import { BodyElement } from "@tuidom/elements/body/bodyElement";
```

### Hello world

```ts
import { TuiApplication } from "@tuidom/core/dom/tuiApplication";
import { BodyElement } from "@tuidom/elements/body/bodyElement";
import { BoxElement } from "@tuidom/elements/layout/boxElement";
import { NodeTerminalBackend } from "@tuidom/terminal-backend/nodeTerminalBackend";

const backend = new NodeTerminalBackend();
const app = new TuiApplication(backend);

const body = new BodyElement();
body.title = "TUIDom host — minimal (Ctrl+C to exit)";
body.setContent(new BoxElement());

// With the Kitty protocol Ctrl+C arrives as an input event, not SIGINT.
backend.onInput((event) => {
    if (event.ctrlKey && event.key === "c") {
        backend.teardown();
        process.exit(0);
    }
});

app.root = body;
app.run();
```

`TuiApplication` owns the frame loop: it lays out the tree to the terminal
size, resolves styles, collects damage and flushes a minimal ANSI diff.
`BodyElement` is the typical root widget: a full-screen chrome (title bar)
with a single content slot (`setContent`) and the overlay layer for popups.

## Core concepts

**The tree.** Everything on screen is a `TUIElement` in one tree rooted at
`app.root`. Child lists are owned by the base class — you never splice them
directly; each container exposes its own domain API instead (`setContent`,
`addChild`, `appendRow`, …). Child order is significant, and it is a single
source of truth for three things at once: paint order (last child on top),
hit-testing (scanned in reverse) and Tab traversal. There is deliberately no
`z-index` and no numeric `tabIndex`.

**Visibility.** The `hidden` flag is the analogue of `display: none`: the
element stays in the tree (styles and the root still reach it) but is skipped
by layout, rendering, hit-testing and Tab traversal.

**Focus.** An element opts into focus with `focusable = true` (default
`false`). Focus moves with Tab/Shift+Tab in child order, or by mouse click.

**The frame.** Each frame runs layout (full, cheap) → style resolution
(gated by dirty flags) → damage collection → rendering of damaged regions →
ANSI diff to the terminal. The contract that makes damage tracking work:
**any visible change must go through `markDirty()`** on the element that
changed. Built-in widget setters do this for you; a custom widget mutating
its own paint state must call it itself. `app.invalidateScreen()` is the
escape hatch that forces a full repaint.

**Custom widgets.** Subclass `TUIElement`, override `render(context)` and draw
through `RenderContext` in local coordinates: `context.setCell(x, y, cell)`,
`drawText` (wide-char aware), `drawBox` (borders). The context translates to
screen coordinates and clips to the element's bounds — a widget cannot paint
outside the area its parent allocated.

## Layout

The mental model is Flutter's, not CSS's: **an element has no width, height or
position of its own**. The parent container decides where each child goes and
how much space it gets; the child only gets a vote through its *intrinsic
size* methods, and that vote counts only when the container asks (Fit mode or
loose constraints). So:

- want a fixed-size element → wrap it in `SizedBoxElement`;
- want an element sized to its content → `FitContentElement`;
- want a fixed slot in a row/column → `hflexFixed(n)` / `vflexFixed(n)`;
- want an element at an explicit position → put it in the overlay layer.

### Flex rows and columns

`HFlexElement` lays children out in a row; each child is added with a layout
style in the container's vocabulary:

```ts
import { HFlexElement, hflexFill, hflexFixed } from "@tuidom/elements/layout/hFlexElement";

const row = new HFlexElement();
row.addChild(sidebar, { width: hflexFixed(30), height: "fill" });
row.addChild(content, { width: hflexFill(), height: "fill" });
```

Width modes: `hflexFixed(n)` — exactly n columns; `hflexFit()` — measure the
child's intrinsic width; `hflexFill()` — take what remains (at most one fill
child). `VFlexElement` is the same with the axes swapped
(`vflexFixed`/`vflexFit`/`vflexFill`).

### Scrolling

Scrolling is composed: `ScrollViewport` is the engine (offsets and clips a
scrollable child), `ScrollBarDecorator` draws the scrollbar next to it:

```
ScrollBarDecorator → ScrollViewport → TextBlockElement
```

### Overlays (popups, dialogs)

Anything that visually "overflows" its anchor — popup, dropdown, dialog — is
not a child of the anchor. It goes into the `OverlayLayer` (a full-screen
child of `BodyElement`) via `layer.createSession(element, position, options)`.
The session's `pointerPolicy` option is mandatory and defines the click
contract:

- `"close-on-outside"` — a click outside closes the session and still reaches
  the element behind it (context menus, quick open);
- `"modal"` — clicks outside are blocked and Tab focus is trapped (dialogs);
- `"passthrough"` — clicks go through, the session doesn't auto-close (find
  widgets, menu bar dropdowns).

### Workbench shell

For an IDE-like shell there is `WorkbenchLayoutElement` (sidebar + editor
area + collapsible bottom panel, VS Code-style) with mouse-draggable
`SashElement` splitters between the parts.

## Styling and themes

Colors are never set imperatively at render time. An element declares a
`TUIStyle` and the core cascade resolves it:

```ts
element.style = {
    fg: "menu.foreground",                  // number | INHERITED_* sentinel | token name
    bg: INHERITED_BG,
    when: [                                 // state variants
        { states: ["hover"], bg: "list.hoverBackground" },
        { states: ["selected"], fg: "...", bg: "..." },
        { states: ["selected", "in:focus"], bg: "..." },
    ],
};
```

- A `when` entry applies when **all** of its selectors are active (AND); of
  the active entries, the one declared later wins — order is priority, like
  CSS rules.
- Selector `"x"` matches a state on the element itself; `"in:x"` — on itself
  or any ancestor (the descendant combinator). This is the key to
  active/inactive selection styling: the row declares
  `["selected", "in:focus"]` while the focus state lives on the list.
- `hover` and `focus` states are managed by the core (mouse dispatcher and
  focus manager). Arbitrary string states (`"selected"`, `"checked"`, …) are
  set by widgets via `setStyleState(state, active)`.
- Children inherit the parent's **resolved** style — a hovered list row's
  background automatically flows into its labels.

**Tokens.** `fg`/`bg` values are either concrete numbers or theme token names
in the VS Code color-id convention (`"list.activeSelectionBackground"`).
Token→color tables cascade down the tree; the bottom of the chain is
`STYLE_TOKEN_DEFAULTS` (`@tuidom/core/dom/styles/styleTokens`). An unknown
token throws on the first frame — fail fast instead of silently rendering
wrong colors.

**Theme delivery is one call.** The host puts the whole palette of the active
theme into the root var scope:

```ts
root.setStyleVars(vars); // Record<string, number>: token name → color
```

Hot-swapping the theme is just calling it again — the tree re-resolves through
the cascade. Widgets declare token *names* once at construction and never
listen to theme changes.

## Input and events

Events propagate like in the web DOM: **capture → target → bubble → default
action on the target**. Listeners attach with
`addEventListener(type, listener)` / `removeEventListener`.

- `preventDefault()` (at any phase) cancels the element's built-in default
  action; `stopPropagation()` does **not** — it only stops other listeners.
- The default action runs **only on `event.target`**, not along the chain.
  Gotcha: if the hit-test lands on an inner child (a label inside a menu
  item), the parent's default action will not run — use a bubble listener and
  check `defaultPrevented`.

**Keyboard.** Parsed stdin arrives as `keydown`/`keypress`/`keyup` events on
the focused element. With the Kitty protocol enabled by the terminal backend,
chords like Ctrl+C arrive as regular key events, not signals — the host
decides what quits the app.

**Mouse.** Click, double-click, move, wheel and hover events hit-test through
the tree (last child on top). A widget that drags (splitters, scrollbar
thumbs) sets `capturesPointer = true` to receive `mousemove`/`mouseup` during
the drag even when the cursor leaves its bounds.

**Context menu.** Right click, the ContextMenu key and Shift+F10 are unified
into a single `contextmenu` event with a normalized anchor.

## Backends

The engine talks to the outside world through the `ITerminalBackend` contract
(`@tuidom/core/backend/iTerminalBackend`); the application code stays
identical across backends.

- `NodeTerminalBackend` (`@tuidom/terminal-backend`) — the real thing: raw-mode
  tty, ANSI diffing, Kitty keyboard protocol, mouse tracking. Environment
  helpers like `isInsideTmux` live in `@tuidom/terminal-backend/terminalEnv`.
- `HeadlessCaptureBackend` (`@tuidom/headless-backend`) — renders into memory;
  used for screenshots, e2e and CI:

```ts
import { Size } from "@tuidom/core/common/geometryPromitives";
import { HeadlessCaptureBackend } from "@tuidom/headless-backend/headlessCaptureBackend";

const backend = new HeadlessCaptureBackend(new Size(80, 24));
// ...app.run(), then:
const frame = backend.captureFrame(); // plain-data GridSnapshot
```

- `MockTerminalBackend` (`@tuidom/testing`) — a scripted backend for unit
  tests (send keys, assert frames), see [Testing](#testing).

## Inspector

`@tuidom/inspector` attaches a WebSocket server to a running app for devtools
and e2e drivers: inspect the element tree, send keys/mouse, capture frames,
await idle by frame count. Zero dependencies (hand-written RFC 6455).

```ts
import { attachInspector } from "@tuidom/inspector/attachInspector";

await attachInspector(app, { host: "127.0.0.1", port: 7007 });
```

See `npm run demo:inspect` for a complete host.

## Testing

The harness TUIDom's own suite uses ships as `@tuidom/testing`:

```ts
import { BoxElement } from "@tuidom/elements/layout/boxElement";
import { expectScreen, screen } from "@tuidom/testing/expectScreen";
import { renderElement } from "@tuidom/testing/renderElement";
import { TestApp } from "@tuidom/testing/TestApp";

// Single-shot render of a standalone element:
const backend = renderElement(new BoxElement(), 6, 3);
expectScreen(
    backend,
    screen`
        +----+
        |    |
        +----+
    `,
);

// Full app loop with a scripted backend:
const app = TestApp.createWithContent(new BoxElement());
app.sendKey("Tab");
app.querySelector("BoxElement");   // by class name; also "#id" and "@role"
app.focusedElement;                // who has focus now
```

By default the harness seeds the root var scope with a snapshot of the VS Code
Dark+ palette (`@tuidom/testing/darkPlusStyleVars`), so widget style tokens
resolve to concrete colors. Pass your own palette (or `null`) as the last
argument of `TestApp.create`/`createWithContent`, or via the `styleVars`
option of `renderElement`.

`TestApp` also validates tree invariants after every frame (topology, layout
contract, child-inside-parent). In a real app the same check is opt-in via
`app.validateTreeAfterRender = true`.

## Elements overview

A one-line map of `@tuidom/elements` (import paths follow the source layout,
e.g. `@tuidom/elements/list/listViewElement`). A full per-widget reference
will be generated from source — see `docs/TODO/ApiReferenceGeneration.md`.

| Element | What it is |
|---|---|
| **Layout** | |
| `BoxElement` | bordered box |
| `BoxContainerElement` | bordered box with a child, optional title |
| `HFlexElement` / `VFlexElement` | flex row / column (`fixed`/`fit`/`fill` children) |
| `VStackElement` | vertical stack with per-child width/height style |
| `SizedBoxElement` | forces a preferred size onto its child |
| `FitContentElement` | sizes itself to its child's content (dialog/popover root) |
| `PaddingContainerElement` | insets around a child |
| `FillerElement` | empty area repainted with the inherited background |
| **Text** | |
| `TextLabelElement` | single-line label, per-char styling (`setCharStyle`) |
| `TextBlockElement` | multi-line word-wrapped text, scrollable content |
| **Controls** | |
| `ButtonElement` | push button |
| `InputElement` | single-line text input |
| `SelectBoxElement` | dropdown select |
| `QuickPickElement` | VS Code-style quick pick (filter input + list) |
| `CompletionListElement` / `CompletionWidgetElement` / `CompletionDetailsElement` | completion popup family |
| **Lists** | |
| `ListViewElement` | virtualized list of element rows (100k rows ≈ 1 ms/frame); cursor, multi-select, typeahead, collapsible hierarchy |
| `TreeViewElement` | data-driven tree (provider model) |
| **Menus** | |
| `MenuBarElement` / `MenuBarItemElement` | horizontal menu bar with mnemonics |
| `PopupMenuElement` / `PopupMenuItemElement` / `PopupMenuSeparatorElement` | popup menu |
| `ContextMenuController` | wires the `contextmenu` event to a popup over the overlay layer |
| **App chrome** | |
| `BodyElement` | full-screen root: title, content slot, overlay layer |
| `TitledPanelElement` | panel with a title row |
| `PanelContainerElement` | tabbed bottom-panel host (Problems/Output-style views) |
| `EditorPartElement` / `EditorTabStripElement` / `EditorTabItemElement` | editor area with a tab strip |
| `WorkbenchLayoutElement` | sidebar + editor + bottom panel shell |
| `SashElement` | invisible draggable splitter |
| `OverlayHostElement` | content + local overlay layer on top |
| **Scrolling** | |
| `ScrollViewport` | scroll engine: offsets and clips a scrollable child |
| `ScrollBarDecorator` | draws a scrollbar next to its child |
| **Terminal** | |
| `TerminalViewElement` | embedded-terminal view over an `ITerminalSurface` (PTY wiring is host-side) |

## Demos

Standalone hosts live in `demos/` and run straight from the repo:

| Command | What it shows |
|---|---|
| `npm run demo` | minimal host (the hello world above) |
| `npm run demo:inspect` | host with the WebSocket inspector attached |
| `npm run demo:events` | event log: capture/bubble, focus, default actions |
| `npm run demo:mouse` | mouse events and hover |
| `npm run demo:layout` | layout/rendering internals |
| `npm run demo:renderer` | grid renderer |
| `npm run demo:raw-events` / `demo:key-parser` | input tokenization and key parsing |
