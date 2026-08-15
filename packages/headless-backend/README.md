# @tuidom/headless-backend

Headless capture backend for [TUIDom](https://github.com/tuidom/tuidom):
renders frames into memory instead of a terminal — for screenshots, e2e and CI.

> ⚠️ Experimental — the API is unstable, deep imports expose internals on purpose.

```sh
npm install @tuidom/core @tuidom/headless-backend
```

```ts
import { Size } from "@tuidom/core/common/geometryPromitives";
import { TuiApplication } from "@tuidom/core/dom/tuiApplication";
import { HeadlessCaptureBackend } from "@tuidom/headless-backend/headlessCaptureBackend";

const backend = new HeadlessCaptureBackend(new Size(80, 24));
const app = new TuiApplication(backend);
// ...build the tree, app.run(), then:
const frame = backend.captureFrame(); // plain-data GridSnapshot
```

For unit tests prefer the scripted harness in `@tuidom/testing`
(`renderElement`, `TestApp`, screen assertions).

Full guide: <https://github.com/tuidom/tuidom/blob/main/GUIDE.md>
