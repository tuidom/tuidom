// Demo app that hosts a TUIDom instance AND exposes the inspector over a port.
// Used by the e2e smoke test: spawned as a real process (under a pty for a real
// TTY), the test then connects over WebSocket and calls TUIDom.getDocument.
//
// Port is argv[2] (0 = ephemeral). Ctrl+C exits.
// Run: npm run demo:tuidom:inspect -- <port>

import { TuiApplication } from "@tuidom/core/dom/tuiApplication";
import { BodyElement } from "@tuidom/elements/body/bodyElement";
import { BoxElement } from "@tuidom/elements/layout/boxElement";
import { attachInspector } from "@tuidom/inspector/index";
import { NodeTerminalBackend } from "@tuidom/terminal-backend/nodeTerminalBackend";

const port = Number(process.argv[2] ?? 0);

const backend = new NodeTerminalBackend();
const app = new TuiApplication(backend);

const body = new BodyElement();
body.title = "TUIDom host + inspector (Ctrl+C to exit)";
const box = new BoxElement();
box.id = "main";
body.setContent(box);

backend.onInput((event) => {
    if (event.ctrlKey && event.key === "c") {
        backend.teardown();
        process.exit(0);
    }
});

app.root = body;
app.run();

await attachInspector(app, { host: "127.0.0.1", port });
