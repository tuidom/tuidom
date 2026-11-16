import { Point } from "@tuidom/core/common/geometryPromitives";
import { renderElement } from "@tuidom/testing/renderElement";
import { describe, expect, it } from "vitest";

import { TextLabelElement } from "./textLabelElement.ts";

function wrapped(text: string): TextLabelElement {
    const label = new TextLabelElement(text);
    label.wrap = true;
    return label;
}

describe("TextLabelElement wrap", () => {
    it("is as tall as the lines the width cuts the text into", () => {
        const label = wrapped("abcdefgh");
        expect(label.getMinIntrinsicHeight(3)).toBe(3);
        expect(label.getMaxIntrinsicHeight(4)).toBe(2);
        expect(label.getMinIntrinsicHeight(8)).toBe(1);
    });

    it("is one line when empty or without wrap", () => {
        expect(wrapped("").getMinIntrinsicHeight(3)).toBe(1);
        expect(new TextLabelElement("abcdefgh").getMinIntrinsicHeight(3)).toBe(1);
    });

    it("moves a wide grapheme that does not fit whole to the next line", () => {
        // 'a' and two wide chars: at width 3 the second one does not fit after 'a' and the first one.
        const label = wrapped("a中文");
        expect(label.getMinIntrinsicHeight(3)).toBe(2);
        // A grapheme wider than the line takes a line of its own.
        expect(label.getMinIntrinsicHeight(1)).toBe(3);
    });

    it("renders each wrapped line with the styles of its own offsets", () => {
        const label = wrapped("abcdef");
        label.setCharStyle(4, { fg: 42 });
        const backend = renderElement(label, 4, 3, { resolveStyles: true });
        expect(backend.getTextAt(new Point(0, 0), 4)).toBe("abcd");
        expect(backend.getTextAt(new Point(0, 1), 2)).toBe("ef");
        expect(backend.getFgAt(new Point(0, 1))).toBe(42);
        expect(backend.getFgAt(new Point(1, 1))).not.toBe(42);
    });

    it("measures again after the text changes", () => {
        const label = wrapped("abcdef");
        expect(label.getMinIntrinsicHeight(2)).toBe(3);
        label.setText("ab");
        expect(label.getMinIntrinsicHeight(2)).toBe(1);
    });

    it("keeps to one line when it fits", () => {
        const label = wrapped("abcdef");
        const backend = renderElement(label, 10, 2, { resolveStyles: true });
        expect(backend.getTextAt(new Point(0, 0), 6)).toBe("abcdef");
    });
});

describe("TextLabelElement offsetAt", () => {
    it("finds the grapheme under a cell of a wrapped line", () => {
        const label = wrapped("abcdef");
        renderElement(label, 4, 2, { resolveStyles: true });
        expect(label.offsetAt(0, 0)).toBe(0);
        expect(label.offsetAt(1, 1)).toBe(5);
        expect(label.offsetAt(2, 1)).toBeUndefined();
        expect(label.offsetAt(0, 2)).toBeUndefined();
        expect(label.offsetAt(-1, 0)).toBeUndefined();
        expect(label.offsetAt(0, -1)).toBeUndefined();
    });

    it("counts both cells of a wide grapheme and works without wrap", () => {
        const label = new TextLabelElement("a中b");
        renderElement(label, 6, 1, { resolveStyles: true });
        expect(label.offsetAt(1, 0)).toBe(1);
        expect(label.offsetAt(2, 0)).toBe(1);
        expect(label.offsetAt(3, 0)).toBe(2);
        expect(label.offsetAt(0, 1)).toBeUndefined();
    });
});
