import { packRgb } from "@tuidom/core/common/colorUtils";
import { Offset, Point, Rect, Size } from "@tuidom/core/common/geometryPromitives";
import { RenderContext } from "@tuidom/core/dom/tuiElement";
import { TerminalScreen } from "@tuidom/core/rendering/terminalScreen";
import { MockTerminalBackend } from "@tuidom/testing/mockTerminalBackend";
import { describe, expect, it } from "vitest";

import { renderScrollBar } from "./scrollBarRenderer.ts";

const colors = { thumb: packRgb(200, 200, 200), track: packRgb(60, 60, 60), background: packRgb(20, 20, 20) };

/** The bar's column, top to bottom, as glyphs. */
function bar(trackHeight: number, contentHeight: number, scrollTop: number, viewportHeight: number): string {
    const size = new Size(1, trackHeight);
    const backend = new MockTerminalBackend(size);
    const screen = new TerminalScreen(size);
    const context = new RenderContext(screen, new Offset(0, 0), new Rect(new Point(0, 0), size));
    renderScrollBar(context, 0, trackHeight, contentHeight, scrollTop, viewportHeight, colors);
    screen.flush(backend);
    let column = "";
    for (let y = 0; y < trackHeight; y++) column += backend.getTextAt(new Point(0, y), 1);
    return column;
}

describe("renderScrollBar", () => {
    it("fills the whole track with the thumb when the content fits", () => {
        expect(bar(5, 5, 0, 5)).toBe("█████");
        expect(bar(5, 3, 0, 5)).toBe("█████");
    });

    it("puts the thumb at the top, the middle and the bottom in whole cells", () => {
        expect(bar(10, 100, 0, 10)).toBe("█░░░░░░░░░");
        expect(bar(10, 100, 45, 10)).toBe("░░░░░█░░░░");
        expect(bar(10, 100, 90, 10)).toBe("░░░░░░░░░█");
    });

    it("never draws half-block thumb ends, whatever the scroll offset", () => {
        for (let scrollTop = 0; scrollTop <= 45; scrollTop++) {
            expect(bar(5, 50, scrollTop, 5)).toMatch(/^[█░]+$/);
        }
    });

    it("sizes the thumb by the viewport's share of the content", () => {
        expect(bar(10, 20, 0, 10)).toBe("█████░░░░░");
    });

    it("clamps a scroll offset past the end", () => {
        expect(bar(10, 100, 200, 10)).toBe("░░░░░░░░░█");
    });

    it("paints the thumb and the track in their own colours over the background", () => {
        const size = new Size(1, 2);
        const backend = new MockTerminalBackend(size);
        const screen = new TerminalScreen(size);
        const context = new RenderContext(screen, new Offset(0, 0), new Rect(new Point(0, 0), size));
        renderScrollBar(context, 0, 2, 4, 0, 2, colors);
        screen.flush(backend);

        expect(backend.getFgAt(new Point(0, 0))).toBe(colors.thumb);
        expect(backend.getFgAt(new Point(0, 1))).toBe(colors.track);
        expect(backend.getBgAt(new Point(0, 1))).toBe(colors.background);
    });
});
