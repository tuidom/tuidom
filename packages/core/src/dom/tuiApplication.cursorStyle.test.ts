import { InputElement } from "@tuidom/elements/inputbox/inputElement";
import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it } from "vitest";

import type { CursorStyle } from "../common/cursorStyle.ts";
import { BoxConstraints, Point, Size } from "../common/geometryPromitives.ts";

import { type RenderContext, TUIElement } from "./tuiElement.ts";

const BAR: CursorStyle = { shape: "bar", blinking: true };

/** A focusable caret owner that asks for a bar cursor while focused — what an editor does. */
class BarCaretElement extends TUIElement {
    public constructor() {
        super();
        this.focusable = true;
    }

    public override render(context: RenderContext): void {
        context.setCell(0, 0, { char: "E" });
        if (this.isFocused) context.setCursorPosition(1, 0, BAR);
    }
}

/** The bar caret at (0,0) and a plain input at (0,2), each 10×1. */
class CaretAndInputElement extends TUIElement {
    public readonly caret = new BarCaretElement();
    public readonly input = new InputElement();

    public constructor() {
        super();
        this.appendChild(this.caret);
        this.appendChild(this.input);
    }

    protected override performLayout(constraints: BoxConstraints): Size {
        const size = super.performLayout(constraints);
        const row = BoxConstraints.tight(new Size(10, 1));
        this.layoutChild(this.caret, 0, 0, row);
        this.layoutChild(this.input, 0, 2, row);
        return size;
    }
}

describe("TuiApplication — cursor shape follows the element that owns the cursor", () => {
    it("the focused element's shape reaches the backend with the position", () => {
        const content = new CaretAndInputElement();
        const app = TestApp.createWithContent(content, new Size(20, 4));
        content.caret.focus();
        app.render();

        expect(app.backend.cursorPosition).toEqual(new Point(1, 0));
        expect(app.backend.cursorStyle).toEqual(BAR);
    });

    it("focus moving to an input brings back the terminal's default shape, and back again", () => {
        const content = new CaretAndInputElement();
        const app = TestApp.createWithContent(content, new Size(20, 4));
        content.caret.focus();
        app.render();

        content.input.focus();
        app.render();
        expect(app.backend.cursorPosition.y).toBe(2);
        expect(app.backend.cursorStyle).toBeNull();

        content.caret.focus();
        app.render();
        expect(app.backend.cursorStyle).toEqual(BAR);
    });

    it("a frame that repaints elsewhere keeps the cursor's shape", () => {
        const content = new CaretAndInputElement();
        const app = TestApp.createWithContent(content, new Size(20, 4));
        content.caret.focus();
        app.render();

        content.input.markDirty();
        app.render();

        expect(app.backend.cursorStyle).toEqual(BAR);
    });
});
