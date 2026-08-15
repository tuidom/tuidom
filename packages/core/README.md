# @tuidom/core

The core of [TUIDom](https://github.com/tuidom/tuidom), a DOM-like terminal UI
engine: element tree, flex layout, styles cascade, events/focus, grid rendering
with ANSI diffing, input parsing (incl. the Kitty protocol) and the
`ITerminalBackend` contract.

> ⚠️ Experimental — the API is unstable, deep imports expose internals on purpose.

```sh
npm install @tuidom/core @tuidom/elements @tuidom/terminal-backend
```

Everything is imported via deep paths (requires `moduleResolution` `node16`,
`nodenext` or `bundler`):

```ts
import { TuiApplication } from "@tuidom/core/dom/tuiApplication";
import { TUIElement, RenderContext } from "@tuidom/core/dom/tuiElement";
```

`TuiApplication` owns the frame loop (layout → styles → damage → ANSI diff);
widgets subclass `TUIElement` and draw through `RenderContext`. Ready-made
widgets live in `@tuidom/elements`, the real terminal backend in
`@tuidom/terminal-backend`.

Full guide: <https://github.com/tuidom/tuidom/blob/main/GUIDE.md>
