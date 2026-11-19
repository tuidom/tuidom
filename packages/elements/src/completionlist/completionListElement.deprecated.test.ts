import { BoxConstraints, Offset, Point, Rect, Size } from "@tuidom/core/common/geometryPromitives";
import { StyleFlags } from "@tuidom/core/common/styleFlags";
import { ROOT_STYLE_CONTEXT } from "@tuidom/core/dom/styles/tuiStyle";
import { RenderContext } from "@tuidom/core/dom/tuiElement";
import { TerminalScreen } from "@tuidom/core/rendering/terminalScreen";
import { describe, expect, it } from "vitest";

import type { CompletionListItem } from "./completionListElement.ts";
import { CompletionListElement } from "./completionListElement.ts";

function render(items: CompletionListItem[]): TerminalScreen {
    const w = new CompletionListElement();
    w.setItems(items);
    const size = new Size(w.getMaxIntrinsicWidth(0), w.getMaxIntrinsicHeight(0));
    w.localPosition = new Offset(0, 0);
    w.layout(BoxConstraints.tight(size));
    w.performStyleResolution(ROOT_STYLE_CONTEXT);
    const screen = new TerminalScreen(size);
    w.render(new RenderContext(screen, new Offset(0, 0), new Rect(new Point(0, 0), size)));
    return screen;
}

function rowStyles(screen: TerminalScreen, y: number, from: number, to: number): number[] {
    const styles: number[] = [];
    for (let x = from; x < to; x++) styles.push(screen.getCell(new Point(x, y)).style);
    return styles;
}

// [│(0)][pad(1)][icon(2)][gap(3,4)][label…]
const LABEL_X = 5;

describe("CompletionListElement — deprecated", () => {
    it("strikes through the label of a deprecated item only: not the icon, the signature or the detail", () => {
        const screen = render([{ label: "oldFn", labelDetail: "()", detail: "fn", kind: 2, deprecated: true }]);
        expect(rowStyles(screen, 1, LABEL_X, LABEL_X + 5)).toEqual(Array(5).fill(StyleFlags.Strikethrough));
        expect(screen.getCell(new Point(2, 1)).style).toBe(StyleFlags.None);
        // The signature sits one cell after the label.
        expect(rowStyles(screen, 1, LABEL_X + 5, LABEL_X + 8)).toEqual(Array(3).fill(StyleFlags.None));
        const detailX = screen.width - 2 - "fn".length;
        expect(screen.getCell(new Point(detailX, 1)).char).toBe("f");
        expect(screen.getCell(new Point(detailX, 1)).style).toBe(StyleFlags.None);
    });

    it("draws a regular item next to a deprecated one without the strike", () => {
        const screen = render([
            { label: "oldFn", deprecated: true },
            { label: "newFn", deprecated: false },
        ]);
        expect(rowStyles(screen, 1, LABEL_X, LABEL_X + 5)).toEqual(Array(5).fill(StyleFlags.Strikethrough));
        expect(rowStyles(screen, 2, LABEL_X, LABEL_X + 5)).toEqual(Array(5).fill(StyleFlags.None));
    });
});
