import { BodyElement } from "@tuidom/elements/body/bodyElement";
import { BoxElement } from "@tuidom/elements/layout/boxElement";
import { MockTerminalBackend } from "@tuidom/testing/mockTerminalBackend";
import { describe, expect, it } from "vitest";

import { Size } from "../common/geometryPromitives.ts";

import type { TUIContextMenuEvent } from "./events/tuiMouseEvent.ts";
import { TuiApplication } from "./tuiApplication.ts";

// Клавиатурный запрос контекстного меню (ContextMenu-клавиша, Shift+F10)
// синтезируется приложением в общее событие "contextmenu" на сфокусированном
// элементе — но только если keydown никто не съел (preventDefault глобального
// кейбинда отменяет синтез).
describe("TuiApplication — keyboard contextmenu synthesis", () => {
    function setup(): { backend: MockTerminalBackend; box: BoxElement; received: TUIContextMenuEvent[] } {
        const backend = new MockTerminalBackend(new Size(20, 6));
        const app = new TuiApplication(backend);

        const box = new BoxElement();
        box.focusable = true;

        const body = new BodyElement();
        body.setContent(box);
        app.root = body;
        app.run();
        box.focus();

        const received: TUIContextMenuEvent[] = [];
        box.addEventListener("contextmenu", (e) => received.push(e as TUIContextMenuEvent));

        return { backend, box, received };
    }

    it("synthesizes contextmenu from the ContextMenu key on the focused element", () => {
        const { backend, box, received } = setup();

        backend.sendKey("ContextMenu");

        expect(received).toHaveLength(1);
        expect(received[0].trigger).toBe("keyboard");
        expect(received[0].screenX).toBe(box.globalPosition.x);
        expect(received[0].screenY).toBe(box.globalPosition.y);
    });

    it("synthesizes contextmenu from Shift+F10", () => {
        const { backend, received } = setup();

        backend.sendKey("Shift+F10");

        expect(received).toHaveLength(1);
        expect(received[0].trigger).toBe("keyboard");
    });

    it("does not synthesize when the keydown was prevented", () => {
        const { backend, box, received } = setup();
        box.addEventListener("keydown", (e) => {
            e.preventDefault();
        });

        backend.sendKey("Shift+F10");
        backend.sendKey("ContextMenu");

        expect(received).toHaveLength(0);
    });

    it("does not synthesize from F10 without shift", () => {
        const { backend, received } = setup();

        backend.sendKey("F10");

        expect(received).toHaveLength(0);
    });
});
