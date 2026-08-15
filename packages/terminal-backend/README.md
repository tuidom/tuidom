# @tuidom/terminal-backend

The real Node terminal backend for [TUIDom](https://github.com/tuidom/tuidom):
raw-mode tty, double-buffered ANSI diffing, Kitty keyboard protocol, mouse
tracking.

> ⚠️ Experimental — the API is unstable, deep imports expose internals on purpose.

```sh
npm install @tuidom/core @tuidom/terminal-backend
```

```ts
import { TuiApplication } from "@tuidom/core/dom/tuiApplication";
import { NodeTerminalBackend } from "@tuidom/terminal-backend/nodeTerminalBackend";

const backend = new NodeTerminalBackend();
const app = new TuiApplication(backend);
// With the Kitty protocol Ctrl+C arrives as an input event, not SIGINT:
backend.onInput((event) => {
    if (event.ctrlKey && event.key === "c") {
        backend.teardown();
        process.exit(0);
    }
});
```

Environment helpers (`isInsideTmux`, …) live in
`@tuidom/terminal-backend/terminalEnv`. For in-memory rendering
(tests/screenshots) use `@tuidom/headless-backend` instead.

Full guide: <https://github.com/tuidom/tuidom/blob/main/GUIDE.md>
