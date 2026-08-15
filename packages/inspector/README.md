# @tuidom/inspector

WebSocket inspector for [TUIDom](https://github.com/tuidom/tuidom) apps —
devtools and e2e drivers: inspect the element tree, send keys/mouse, capture
frames, await idle. Zero dependencies (hand-written RFC 6455 server).

> ⚠️ Experimental — the API is unstable, deep imports expose internals on purpose.

```sh
npm install @tuidom/core @tuidom/elements @tuidom/inspector
```

```ts
import { attachInspector } from "@tuidom/inspector/attachInspector";

// app is a running TuiApplication:
await attachInspector(app, { host: "127.0.0.1", port: 7007 });
```

Full guide: <https://github.com/tuidom/tuidom/blob/main/GUIDE.md>
