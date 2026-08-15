# @tuidom/elements

Widgets for [TUIDom](https://github.com/tuidom/tuidom): boxes, flex containers,
text, buttons, inputs, lists (virtualized), trees, menus, quick pick,
scrollbars, editor tabs, workbench shell, embedded-terminal view.

> ⚠️ Experimental — the API is unstable, deep imports expose internals on purpose.

```sh
npm install @tuidom/core @tuidom/elements @tuidom/terminal-backend
```

```ts
import { TuiApplication } from "@tuidom/core/dom/tuiApplication";
import { BodyElement } from "@tuidom/elements/body/bodyElement";
import { BoxElement } from "@tuidom/elements/layout/boxElement";
import { NodeTerminalBackend } from "@tuidom/terminal-backend/nodeTerminalBackend";

const app = new TuiApplication(new NodeTerminalBackend());
const body = new BodyElement();
body.title = "hello";
body.setContent(new BoxElement());
app.root = body;
app.run();
```

Full guide (incl. an overview table of all elements):
<https://github.com/tuidom/tuidom/blob/main/GUIDE.md>
