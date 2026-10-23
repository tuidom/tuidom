import { compositeOver, packRgb, packRgba } from "@tuidom/core/common/colorUtils";
import { describe, expect, it } from "vitest";

import type { IScrollBarMarker } from "./iScrollable.ts";
import {
    computeScrollBarCellMetrics,
    getFlatTrackColor,
    getScrollBarMarkerCells,
    getScrollBarMarkerChar,
} from "./scrollBarRenderer.ts";

const marker = (start: number, end: number, color: number, priority = 0): IScrollBarMarker => ({
    start,
    end,
    color,
    priority,
});

describe("getScrollBarMarkerCells", () => {
    it("maps content rows proportionally onto the track", () => {
        // 100 rows over 10 cells: rows 0..9 → cell 0, rows 90..99 → cell 9.
        const cells = getScrollBarMarkerCells(10, 100, [marker(5, 6, 1), marker(99, 100, 2)]);
        expect(cells[0]).toEqual({ color: 1, priority: 0, count: 1, fill: undefined });
        expect(cells[9]).toEqual({ color: 2, priority: 0, count: 1, fill: undefined });
        expect(cells.slice(1, 9).every((c) => c === undefined)).toBe(true);
    });

    it("keeps one row per cell when the content is shorter than the track", () => {
        const cells = getScrollBarMarkerCells(10, 4, [marker(3, 4, 1)]);
        expect(cells[3]?.count).toBe(1);
        expect(cells.filter((c) => c !== undefined)).toHaveLength(1);
    });

    it("spans every cell a multi-row marker covers", () => {
        const cells = getScrollBarMarkerCells(10, 100, [marker(15, 45, 1)]);
        expect(cells.map((c) => c !== undefined)).toEqual([
            false,
            true,
            true,
            true,
            true,
            false,
            false,
            false,
            false,
            false,
        ]);
    });

    it("treats an empty marker as its start row", () => {
        const cells = getScrollBarMarkerCells(10, 100, [marker(30, 30, 1)]);
        expect(cells[3]?.count).toBe(1);
        expect(cells[2]).toBeUndefined();
    });

    it("clamps rows past the content into the last cell", () => {
        const cells = getScrollBarMarkerCells(10, 100, [marker(150, 151, 1), marker(-5, -4, 2)]);
        expect(cells[9]?.color).toBe(1);
        expect(cells[0]?.color).toBe(2);
    });

    it("lets the highest priority colour a shared cell and counts every marker", () => {
        const cells = getScrollBarMarkerCells(10, 100, [marker(1, 2, 1, 5), marker(2, 3, 2, 9), marker(3, 4, 3, 1)]);
        expect(cells[0]).toEqual({ color: 2, priority: 9, count: 3, fill: undefined });
    });

    it("keeps the first marker on a priority tie", () => {
        const cells = getScrollBarMarkerCells(10, 100, [marker(1, 2, 1, 5), marker(2, 3, 2, 5)]);
        expect(cells[0]?.color).toBe(1);
    });

    it("fills the cells under a run, its ends at half-cell precision", () => {
        // 100 rows over 10 cells; rows 15..44 cover cells 2..3 whole, the bottom of cell 1 and
        // the top of cell 4.
        const cells = getScrollBarMarkerCells(10, 100, [marker(15, 45, 1)]);
        expect(cells.map((c) => c?.fill)).toEqual([
            undefined,
            "bottom",
            "full",
            "full",
            "top",
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
        ]);
    });

    it("joins overlapping marks of one kind into one run", () => {
        // Rows 10..19 as three pieces, one of them doubled: cell 1 is covered once, fully.
        const cells = getScrollBarMarkerCells(10, 100, [marker(10, 14, 1), marker(12, 16, 1), marker(16, 20, 1)]);
        expect(cells[1]?.fill).toBe("full");
        expect(cells[1]?.count).toBe(3);
    });

    it("leaves a cell barely touched by a run to the density glyph", () => {
        // Rows 18..21: two rows at the bottom of cell 1 and the top of cell 2, under a quarter
        // of either half.
        const cells = getScrollBarMarkerCells(10, 100, [marker(18, 22, 1)]);
        expect(cells[1]?.fill).toBeUndefined();
        expect(cells[2]?.fill).toBeUndefined();
    });

    it("keeps adjacent one-row marks sparse", () => {
        // Find matches on every row of a cell are still separate matches.
        const rows = Array.from({ length: 10 }, (_, i) => marker(10 + i, 11 + i, 1));
        expect(getScrollBarMarkerCells(10, 100, rows)[1]?.fill).toBeUndefined();
    });

    it("fills solid only with the winner's own kind", () => {
        // A one-row change (priority 2) over word occurrences on every row (priority 1, multi-row
        // block for the test): the change wins the cell and stays thin.
        const cells = getScrollBarMarkerCells(10, 100, [marker(0, 100, 7, 1), marker(15, 16, 9, 2)]);
        expect(cells[1]).toEqual({ color: 9, priority: 2, count: 2, fill: undefined });
        // Elsewhere the block is alone and fills its cells.
        expect(cells[5]).toEqual({ color: 7, priority: 1, count: 1, fill: "full" });
    });

    it("keeps a lone one-row mark sparse even when it fills its cell", () => {
        // Short content: one row per cell. A single changed line stays a thin mark, a block of
        // two lines becomes solid.
        const cells = getScrollBarMarkerCells(10, 10, [marker(2, 3, 1), marker(5, 7, 1)]);
        expect(cells[2]?.fill).toBeUndefined();
        expect(cells[5]?.fill).toBe("full");
        expect(cells[6]?.fill).toBe("full");
    });

    it("returns no cells for an empty track", () => {
        expect(getScrollBarMarkerCells(0, 100, [marker(1, 2, 1)])).toEqual([]);
    });

    it("orders the marks of a kind by row before joining them into a run", () => {
        // The same three pieces as above, handed out of row order.
        const cells = getScrollBarMarkerCells(10, 100, [marker(16, 20, 1), marker(10, 14, 1), marker(12, 16, 1)]);
        expect(cells[1]?.fill).toBe("full");
        expect(cells[1]?.count).toBe(3);
    });

    it("tells kinds apart by priority as well as by colour", () => {
        // One colour, two priorities: the one-row mark is not part of the block's run.
        const cells = getScrollBarMarkerCells(10, 100, [marker(0, 100, 7, 1), marker(15, 16, 7, 2)]);
        expect(cells[1]).toEqual({ color: 7, priority: 2, count: 2, fill: undefined });
        expect(cells[5]).toEqual({ color: 7, priority: 1, count: 1, fill: "full" });
    });

    it("lays out the same array once and reuses the cells", () => {
        const markers = [marker(5, 6, 1), marker(15, 45, 2)];
        const cells = getScrollBarMarkerCells(10, 100, markers);
        expect(getScrollBarMarkerCells(10, 100, markers)).toBe(cells);
        // A new array with the same marks is laid out again; a new track or content size too.
        expect(getScrollBarMarkerCells(10, 100, [...markers])).not.toBe(cells);
        expect(getScrollBarMarkerCells(10, 100, [...markers])).toEqual(cells);
        expect(getScrollBarMarkerCells(20, 100, markers)).toHaveLength(20);
        // Rows 40..49 of 100 are in the run; rows 80..99 of 200 are not.
        expect(cells[4]).toBeDefined();
        expect(getScrollBarMarkerCells(10, 200, markers)[4]).toBeUndefined();
        expect(getScrollBarMarkerCells(10, 100, markers)).toEqual(cells);
    });
});

describe("getScrollBarMarkerChar", () => {
    it("grows denser with the marker count", () => {
        expect(getScrollBarMarkerChar(1)).toBe("─");
        expect(getScrollBarMarkerChar(2)).toBe("═");
        expect(getScrollBarMarkerChar(3)).toBe("≡");
        expect(getScrollBarMarkerChar(40)).toBe("≡");
    });
});

describe("getFlatTrackColor", () => {
    it("is the track colour at a quarter of its alpha over the background", () => {
        const background = packRgb(0, 0, 0);
        expect(getFlatTrackColor(packRgb(200, 100, 40), background)).toBe(
            compositeOver(packRgba(200, 100, 40, 64), background),
        );
    });

    it("falls back to the background for a sentinel track colour", () => {
        expect(getFlatTrackColor(-1, packRgb(1, 2, 3))).toBe(packRgb(1, 2, 3));
    });
});

describe("computeScrollBarCellMetrics", () => {
    it("spans the whole track when the content fits", () => {
        expect(computeScrollBarCellMetrics(10, 8, 0, 10)).toEqual({ thumbStart: 0, thumbSize: 10 });
    });

    it("moves a whole-cell thumb proportionally", () => {
        expect(computeScrollBarCellMetrics(10, 100, 0, 10)).toEqual({ thumbStart: 0, thumbSize: 1 });
        expect(computeScrollBarCellMetrics(10, 100, 90, 10)).toEqual({ thumbStart: 9, thumbSize: 1 });
        expect(computeScrollBarCellMetrics(10, 100, 45, 10)).toEqual({ thumbStart: 5, thumbSize: 1 });
    });
});
