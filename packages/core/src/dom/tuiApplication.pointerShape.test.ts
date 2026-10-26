import { BodyElement } from "@tuidom/elements/body/bodyElement";
import { MockTerminalBackend } from "@tuidom/testing/mockTerminalBackend";
import { describe, expect, it, vi } from "vitest";

import { Size } from "../common/geometryPromitives.ts";
import type { MouseToken } from "../input/rawTerminalToken.ts";

import { TuiApplication } from "./tuiApplication.ts";
import { TUIElement } from "./tuiElement.ts";

function startApp(): { backend: MockTerminalBackend; app: TuiApplication; setPointerShape: ReturnType<typeof vi.fn> } {
    const backend = new MockTerminalBackend(new Size(20, 5));
    const setPointerShape = vi.spyOn(backend, "setPointerShape");
    const app = new TuiApplication(backend);
    const body = new BodyElement();
    const content = new TUIElement();
    content.pointerShape = "text";
    body.setContent(content);
    app.root = body;
    app.run();
    return { backend, app, setPointerShape };
}

function token(action: MouseToken["action"], button: MouseToken["button"]): MouseToken {
    return { kind: "mouse", action, button, x: 3, y: 2, shiftKey: false, altKey: false, ctrlKey: false, raw: "" };
}

describe("TuiApplication — mouse pointer shape", () => {
    it("hands the backend the shape under the pointer after every mouse token", () => {
        const { backend, setPointerShape } = startApp();

        backend.simulateMouse(token("move", "none"));
        backend.simulateMouse(token("scroll-down", "none"));

        expect(setPointerShape.mock.calls).toEqual([["text"], ["text"]]);
        expect(backend.pointerShape).toBe("text");
    });

    it("startup, keys and resize leave the pointer alone", () => {
        const { backend, setPointerShape } = startApp();

        backend.sendKey("a");
        backend.resize(new Size(30, 6));

        expect(setPointerShape).not.toHaveBeenCalled();
    });
});
