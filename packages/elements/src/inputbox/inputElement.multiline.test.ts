import { Point, Size } from "@tuidom/core/common/geometryPromitives";
import { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";
import { TUIPasteEvent } from "@tuidom/core/dom/events/tuiPasteEvent";
import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it } from "vitest";

import { VFlexElement, vflexFit } from "../layout/vFlexElement.ts";

import { InputElement } from "./inputElement.ts";

function multiline(value: string, size = new Size(10, 6)): { input: InputElement; app: TestApp } {
    const input = new InputElement();
    input.multiline = true;
    input.inputState.value = value;
    const stack = new VFlexElement();
    stack.addChild(input, { width: "fill", height: vflexFit() });
    const app = TestApp.createWithContent(stack, size);
    input.focus();
    app.render();
    return { input, app };
}

function press(input: InputElement, key: string): boolean {
    return input.dispatchEvent(new TUIKeyboardEvent("keydown", { key }));
}

function line(app: TestApp, y: number, width = 10): string {
    return app.backend.getTextAt(new Point(0, y), width).trimEnd();
}

describe("InputElement multiline", () => {
    it("draws every line and grows with them", () => {
        const { input, app } = multiline("one\ntwo\nthree");

        expect([0, 1, 2].map((y) => line(app, y))).toEqual(["one", "two", "three"]);
        expect(input.layoutSize.height).toBe(3);
        expect(input.lineCount).toBe(3);
    });

    it("stops growing at the limit and keeps the cursor's line in view", () => {
        const { input, app } = multiline("1\n2\n3\n4");
        input.maxVisibleLines = 2;
        input.markDirty();
        app.render();

        // The cursor is at the end: the last two lines.
        expect(input.layoutSize.height).toBe(2);
        expect([0, 1].map((y) => line(app, y))).toEqual(["3", "4"]);
        expect(app.backend.cursorPosition).toEqual(new Point(1, 1));

        input.inputState.moveCursorTo(0);
        input.markDirty();
        app.render();
        expect([0, 1].map((y) => line(app, y))).toEqual(["1", "2"]);
    });

    it("moves the cursor to the same column of the line above and below", () => {
        const { input } = multiline("abcd\nab\nabcdef");
        input.inputState.moveCursorTo(3);

        expect(press(input, "ArrowDown")).toBe(false);
        // Column 3 is past the end of "ab": its end.
        expect(input.inputState.cursorOffset).toBe(7);
        expect(input.cursorLine).toBe(1);
        press(input, "ArrowDown");
        expect(input.inputState.cursorOffset).toBe(10);
        press(input, "ArrowUp");
        press(input, "ArrowUp");
        expect(input.inputState.cursorOffset).toBe(2);
        expect(input.cursorLine).toBe(0);
    });

    it("leaves Up on the first line and Down on the last line to the owner", () => {
        const { input } = multiline("ab\ncd");
        input.inputState.moveCursorTo(1);
        expect(press(input, "ArrowUp")).toBe(true);
        expect(input.inputState.cursorOffset).toBe(1);

        input.inputState.moveCursorTo(4);
        expect(press(input, "ArrowDown")).toBe(true);
        expect(input.inputState.cursorOffset).toBe(4);
    });

    it("goes to the start and the end of the cursor's line by Home and End", () => {
        const { input } = multiline("ab\ncde\nf");
        input.inputState.moveCursorTo(4);
        press(input, "Home");
        expect(input.inputState.cursorOffset).toBe(3);
        press(input, "End");
        expect(input.inputState.cursorOffset).toBe(6);
    });

    it("keeps the line breaks of a paste", () => {
        const { input } = multiline("");
        input.dispatchEvent(new TUIPasteEvent("a\r\nb\rc\nd"));
        expect(input.inputState.value).toBe("a\nb\nc\nd");
    });

    it("draws the part of the selection on each line it covers", () => {
        const { input, app } = multiline("abc\ndef");
        input.inputState.moveCursorTo(1);
        input.inputState.selectToEnd();
        // Only the cursor moved: back to the second line's middle.
        input.inputState.selectLeft();
        input.markDirty();
        app.render();

        const plain = app.backend.getBgAt(new Point(0, 0));
        expect(app.backend.getBgAt(new Point(1, 0))).not.toBe(plain);
        expect(app.backend.getBgAt(new Point(0, 1))).not.toBe(plain);
        expect(app.backend.getBgAt(new Point(2, 1))).toBe(plain);
    });

    it("shows the placeholder on the first line of an empty field", () => {
        const { input, app } = multiline("");
        input.placeholder = "type";
        input.markDirty();
        app.render();
        expect(line(app, 0)).toBe("type");
        expect(input.layoutSize.height).toBe(1);
    });

    it("is a single line without the option", () => {
        const input = new InputElement();
        input.inputState.value = "a\nb";
        expect(input.lineCount).toBe(1);
        expect(input.getMinIntrinsicHeight(10)).toBe(1);
        input.showBorder = true;
        expect(input.getMaxIntrinsicHeight(10)).toBe(3);
    });
});
