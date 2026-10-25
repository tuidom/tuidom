import { BoxConstraints, Point, Size } from "@tuidom/core/common/geometryPromitives";
import { renderElement } from "@tuidom/testing/renderElement";
import { describe, expect, it } from "vitest";

import { ButtonElement } from "./buttonElement.ts";

function rows(button: ButtonElement, width: number, height: number): string[] {
    const backend = renderElement(button, width, height, { resolveStyles: true });
    return Array.from({ length: height }, (_, y) => backend.getTextAt(new Point(0, y), width));
}

describe("ButtonElement — wrap", () => {
    it("a label that fits stays one row, as without wrap", () => {
        const button = new ButtonElement("Save", { wrap: true });
        expect(button.getMaxIntrinsicHeight(8)).toBe(1);
        expect(button.getMinIntrinsicHeight(30)).toBe(1);
        expect(button.layout(BoxConstraints.loose(new Size(40, 5)))).toEqual(new Size(8, 1));
        expect(rows(button, 8, 1)).toEqual(["[ Save ]"]);
    });

    it("a wider label wraps by words: `[` opens the first row, `]` closes the last, the box is filled", () => {
        const button = new ButtonElement("Learn more about providers", { wrap: true });
        expect(button.getMinIntrinsicHeight(20)).toBe(2);
        expect(button.getMaxIntrinsicHeight(20)).toBe(2);
        expect(button.layout(BoxConstraints.loose(new Size(20, 5)))).toEqual(new Size(20, 2));
        expect(rows(button, 20, 2)).toEqual(["[ Learn more about  ", "  providers        ]"]);
    });

    it("every row is painted in the button colors to the right edge", () => {
        const button = new ButtonElement("Learn more about providers", { wrap: true });
        const backend = renderElement(button, 20, 2, { resolveStyles: true });
        const bg = backend.getBgAt(new Point(0, 0));
        for (const point of [new Point(19, 0), new Point(0, 1), new Point(12, 1)]) {
            expect(backend.getBgAt(point)).toBe(bg);
        }
    });

    it("three rows: the middle one has neither bracket", () => {
        const button = new ButtonElement("aaa bbb ccc", { wrap: true });
        expect(button.getMaxIntrinsicHeight(8)).toBe(3);
        expect(rows(button, 8, 3)).toEqual(["[ aaa   ", "  bbb   ", "  ccc  ]"]);
    });

    it("a word longer than the row is cut onto the next rows, nothing is lost", () => {
        const button = new ButtonElement("abcdefgh", { wrap: true });
        expect(rows(button, 7, 3)).toEqual(["[ abc  ", "  def  ", "  gh  ]"]);
    });

    it("a box narrower than the frame still wraps one character per row", () => {
        const button = new ButtonElement("ab", { wrap: true });
        expect(button.getMaxIntrinsicHeight(3)).toBe(2);
    });

    it("without wrap the label is cut, as before", () => {
        const button = new ButtonElement("Learn more about providers");
        expect(button.getMaxIntrinsicHeight(20)).toBe(1);
        expect(button.layout(BoxConstraints.loose(new Size(20, 5)))).toEqual(new Size(20, 1));
        expect(rows(button, 20, 1)).toEqual(["[ Learn more about p"]);
    });
});
