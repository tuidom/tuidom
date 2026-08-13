# @tuidom/all

> ⚠️ **Experimental.** This is the TUI engine that powers the
> [Vexx](https://github.com/tihonove/vexx) terminal editor. The API is
> **unstable** — no semver guarantees, anything may change between releases.
> Deep imports expose internals on purpose: there is no curated public surface yet.

A DOM-like terminal UI engine: element tree with flex layout, double-buffered
grid rendering with ANSI diffing, keyboard/mouse input parsing (incl. Kitty
protocol), focus management, capture/bubble events, widgets (lists, trees,
menus, inputs, quick pick), and a WebSocket inspector for devtools/e2e.

## Requirements

- Node.js ≥ 24
- TypeScript consumers: `moduleResolution` must be `"node16"`, `"nodenext"` or
  `"bundler"` (the package uses subpath `exports`)
- `@types/node` — some public signatures reference `Buffer`/`process`

Zero runtime dependencies.

## Install

```sh
npm install @tuidom/all
```

## Hello world

```ts
import { NodeTerminalBackend } from "@tuidom/all/backend/nodeTerminalBackend";
import { TuiApplication } from "@tuidom/all/dom/tuiApplication";
import { BodyElement } from "@tuidom/all/ui/body/bodyElement";
import { BoxElement } from "@tuidom/all/ui/layout/boxElement";

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
import { HeadlessCaptureBackend } from "@tuidom/all/backend/headlessCaptureBackend";
import { Size } from "@tuidom/all/common/geometryPromitives";

const backend = new HeadlessCaptureBackend(new Size(80, 24));
// ...app.run(), then:
const frame = backend.captureFrame(); // plain-data GridSnapshot
```

## Testing your host

The test harness that TUIDom's own suite uses ships in the package under
`testing/*`:

```ts
import { expectScreen, screen } from "@tuidom/all/testing/expectScreen";
import { renderElement } from "@tuidom/all/testing/renderElement";
import { TestApp } from "@tuidom/all/testing/TestApp";
import { BoxElement } from "@tuidom/all/ui/layout/boxElement";

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
Dark+ palette (`@tuidom/all/testing/darkPlusStyleVars`), so widget style tokens
resolve to concrete colors. Pass your own palette (or `null`) as the last
argument of `TestApp.create`/`createWithContent`, or via the `styleVars` option
of `renderElement`.

## License

MIT
