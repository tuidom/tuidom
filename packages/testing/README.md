# @tuidom/testing

Test harness for [TUIDom](https://github.com/tuidom/tuidom) hosts — the same
one TUIDom's own suite uses: `TestApp` (scripted app loop), `renderElement`
(single-shot render), `expectScreen` assertions, `MockTerminalBackend`, and a
Dark+ palette snapshot so style tokens resolve to real colors.

> ⚠️ Experimental — the API is unstable, deep imports expose internals on purpose.

```sh
npm install --save-dev @tuidom/testing
```

```ts
import { BoxElement } from "@tuidom/elements/layout/boxElement";
import { expectScreen, screen } from "@tuidom/testing/expectScreen";
import { renderElement } from "@tuidom/testing/renderElement";
import { TestApp } from "@tuidom/testing/TestApp";

const backend = renderElement(new BoxElement(), 6, 3);
expectScreen(
    backend,
    screen`
        +----+
        |    |
        +----+
    `,
);

const app = TestApp.createWithContent(new BoxElement());
app.sendKey("Tab");
```

`TestApp` also validates tree invariants after every frame.

Full guide: <https://github.com/tuidom/tuidom/blob/main/GUIDE.md>
