import { BoxConstraints, Point, Size } from "@tuidom/core/common/geometryPromitives";
import { TUIElement } from "@tuidom/core/dom/tuiElement";
import type { MouseToken } from "@tuidom/core/input/rawTerminalToken";
import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it } from "vitest";

import { HFlexElement, hflexFill, hflexFixed } from "../layout/hFlexElement.ts";

import { SashElement, type SashOrientation } from "./sashElement.ts";

/** Element that lays out to a fixed footprint, so the modal's bounds are deterministic. */
class FixedSizeElement extends TUIElement {
    private readonly desired: Size;

    public constructor(desired: Size) {
        super();
        this.desired = desired;
    }

    protected override performLayout(constraints: BoxConstraints): Size {
        return super.performLayout(BoxConstraints.tight(constraints.constrain(this.desired)));
    }
}

/** Left panel (x 0..9), a sash at x=10, the rest to the right — in a 40×10 terminal. */
function buildApp(orientation: SashOrientation = "vertical"): { app: TestApp; sash: SashElement } {
    const flex = new HFlexElement();
    const sash = new SashElement(orientation);
    flex.addChild(new TUIElement(), { width: hflexFixed(10), height: "fill" });
    flex.addChild(sash, { width: hflexFixed(1), height: "fill" });
    flex.addChild(new TUIElement(), { width: hflexFill(), height: "fill" });
    const app = TestApp.createWithContent(flex, new Size(40, 10));
    return { app, sash };
}

/** Mouse token at 0-based screen coordinates. */
function mouse(app: TestApp, init: Pick<MouseToken, "action" | "button" | "x" | "y">): void {
    app.backend.simulateMouse({
        kind: "mouse",
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        raw: "",
        ...init,
        x: init.x + 1,
        y: init.y + 1,
    });
}

describe("SashElement — mouse pointer shape", () => {
    it("is default until the first mouse event", () => {
        const { app } = buildApp();

        expect(app.backend.pointerShape).toBe("default");
    });

    it("hovering a vertical sash gives ew-resize, moving off it — default", () => {
        const { app } = buildApp();

        mouse(app, { action: "move", button: "none", x: 10, y: 3 });
        expect(app.backend.pointerShape).toBe("ew-resize");

        mouse(app, { action: "move", button: "none", x: 11, y: 3 });
        expect(app.backend.pointerShape).toBe("default");
    });

    it("hovering a horizontal sash gives ns-resize", () => {
        const { app } = buildApp("horizontal");

        mouse(app, { action: "move", button: "none", x: 10, y: 3 });
        expect(app.backend.pointerShape).toBe("ns-resize");
    });

    it("keeps the shape for the whole drag off the sash and drops it on release there", () => {
        const { app } = buildApp();

        mouse(app, { action: "press", button: "left", x: 10, y: 3 });
        mouse(app, { action: "move", button: "left", x: 30, y: 8 });
        expect(app.backend.pointerShape).toBe("ew-resize");

        mouse(app, { action: "release", button: "left", x: 30, y: 8 });
        expect(app.backend.pointerShape).toBe("default");
    });

    it("a release back on the sash keeps the shape", () => {
        const { app } = buildApp();

        mouse(app, { action: "press", button: "left", x: 10, y: 3 });
        mouse(app, { action: "move", button: "left", x: 20, y: 3 });
        mouse(app, { action: "release", button: "left", x: 10, y: 3 });
        expect(app.backend.pointerShape).toBe("ew-resize");
    });

    it("a press elsewhere dragged over the sash does not take its shape", () => {
        const { app } = buildApp();

        mouse(app, { action: "press", button: "left", x: 2, y: 3 });
        mouse(app, { action: "move", button: "left", x: 10, y: 3 });
        expect(app.backend.pointerShape).toBe("ew-resize");
        // Not a captor: the element under the pointer decides, as without a button.
        mouse(app, { action: "move", button: "left", x: 5, y: 3 });
        expect(app.backend.pointerShape).toBe("default");
    });

    it("a hidden sash gives no shape", () => {
        const { app, sash } = buildApp();
        sash.hidden = true;
        app.render();

        mouse(app, { action: "move", button: "none", x: 10, y: 3 });
        expect(app.backend.pointerShape).toBe("default");
    });

    it("a modal overlay hides the sash behind it", () => {
        const { app } = buildApp();
        app.root.overlayLayer.createSession(new FixedSizeElement(new Size(6, 2)), new Point(25, 1), {
            visible: true,
            pointerPolicy: "modal",
        });
        app.render();

        mouse(app, { action: "move", button: "none", x: 10, y: 3 });
        expect(app.backend.pointerShape).toBe("default");
    });

    it("an element's own shape wins over its parent's, null inherits it", () => {
        const flex = new HFlexElement();
        const inheriting = new TUIElement();
        const own = new TUIElement();
        own.pointerShape = "pointer";
        flex.pointerShape = "text";
        flex.addChild(inheriting, { width: hflexFixed(10), height: "fill" });
        flex.addChild(own, { width: hflexFill(), height: "fill" });
        const app = TestApp.createWithContent(flex, new Size(40, 10));

        mouse(app, { action: "move", button: "none", x: 2, y: 2 });
        expect(app.backend.pointerShape).toBe("text");
        mouse(app, { action: "move", button: "none", x: 20, y: 2 });
        expect(app.backend.pointerShape).toBe("pointer");
    });
});
