# TUIDom

> ⚠️ **Experimental.** This is the TUI engine that powers the
> [Vexx](https://github.com/tihonove/vexx) terminal editor. The API is
> **unstable** — no semver guarantees, anything may change between releases.
> Deep imports expose internals on purpose: there is no curated public surface yet.

A DOM-like terminal UI engine: element tree with flex layout, double-buffered
grid rendering with ANSI diffing, keyboard/mouse input parsing (incl. Kitty
protocol), focus management, capture/bubble events, widgets (lists, trees,
menus, inputs, quick pick), and a WebSocket inspector for devtools/e2e.

Ships as a set of packages (lockstep-versioned) from this monorepo:

| Package | What's inside |
|---|---|
| `@tuidom/core` | element tree, flex layout, styles cascade, events/focus, grid rendering, input parsing, the `ITerminalBackend` contract |
| `@tuidom/elements` | widgets: lists, trees, menus, inputs, quick pick, scrollbars, … |
| `@tuidom/terminal-backend` | the real Node terminal backend (tty, ANSI diffing, Kitty protocol) |
| `@tuidom/headless-backend` | in-memory backend for screenshots/e2e (`captureFrame()`) |
| `@tuidom/inspector` | WebSocket inspector for devtools/e2e (hand-written RFC6455, zero-dep) |
| `@tuidom/testing` | test harness: `TestApp`, `renderElement`, `expectScreen`, mock backend |

## Requirements

- Node.js ≥ 24
- TypeScript consumers: `moduleResolution` must be `"node16"`, `"nodenext"` or
  `"bundler"` (the packages use subpath `exports`)
- `@types/node` — some public signatures reference `Buffer`/`process`

Zero runtime dependencies.

## Install

```sh
npm install @tuidom/core @tuidom/elements @tuidom/terminal-backend
```

## Hello world

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

Headless rendering (tests, screenshots) — swap the backend:

```ts
import { Size } from "@tuidom/core/common/geometryPromitives";
import { HeadlessCaptureBackend } from "@tuidom/headless-backend/headlessCaptureBackend";

const backend = new HeadlessCaptureBackend(new Size(80, 24));
// ...app.run(), then:
const frame = backend.captureFrame(); // plain-data GridSnapshot
```

## Testing your host

The test harness that TUIDom's own suite uses ships as `@tuidom/testing`:

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

// Full app loop with a scripted backend (sendKey, frame assertions):
const app = TestApp.createWithContent(new BoxElement());
app.sendKey("Tab");
```

By default the harness seeds the root var-scope with a snapshot of the VS Code
Dark+ palette (`@tuidom/testing/darkPlusStyleVars`), so widget style tokens
resolve to concrete colors. Pass your own palette (or `null`) as the last
argument of `TestApp.create`/`createWithContent`, or via the `styleVars` option
of `renderElement`.

## License

MIT
