import { describe, expect, it } from "vitest";

import { DEFAULT_COLOR, packRgb } from "../common/colorUtils.ts";
import { Point, Size } from "../common/geometryPromitives.ts";
import { StyleFlags } from "../common/styleFlags.ts";

import { Grid } from "./grid.ts";
import { emptyGridSnapshot, snapshotGrid } from "./gridSnapshot.ts";

describe("snapshotGrid", () => {
    it("copies dimensions, cursor and cell data row-major", () => {
        const grid = new Grid(new Size(2, 2));
        const fg = packRgb(1, 2, 3);
        const bg = packRgb(4, 5, 6);
        grid.setCell(new Point(0, 0), "a", fg, bg, StyleFlags.Bold, 1);
        grid.setCell(new Point(1, 1), "b");

        const snap = snapshotGrid(grid, new Point(1, 0));

        expect(snap.cols).toBe(2);
        expect(snap.rows).toBe(2);
        expect(snap.cursor).toEqual({ x: 1, y: 0 });
        expect(snap.cells).toHaveLength(4);
        expect(snap.cells[0]).toEqual({ char: "a", fg, bg, style: StyleFlags.Bold, width: 1 });
        expect(snap.cells[3].char).toBe("b");
    });

    it("represents a null cursor", () => {
        const snap = snapshotGrid(new Grid(new Size(1, 1)), null);
        expect(snap.cursor).toBeNull();
        expect(snap.cursorStyle).toBeNull();
    });

    it("keeps the cursor shape as plain data next to the cursor", () => {
        const style = { shape: "underline", blinking: false } as const;
        const snap = snapshotGrid(new Grid(new Size(2, 1)), new Point(1, 0), style);
        expect(snap.cursorStyle).toEqual(style);
        expect(snap.cursorStyle).not.toBe(style);
        expect(snapshotGrid(new Grid(new Size(2, 1)), new Point(1, 0)).cursorStyle).toBeNull();
    });

    it("drops the shape of a hidden cursor", () => {
        const snap = snapshotGrid(new Grid(new Size(1, 1)), null, { shape: "bar", blinking: true });
        expect(snap.cursorStyle).toBeNull();
    });
});

describe("emptyGridSnapshot", () => {
    it("fills a blank grid of the given size", () => {
        const snap = emptyGridSnapshot(3, 2);
        expect(snap.cols).toBe(3);
        expect(snap.rows).toBe(2);
        expect(snap.cursor).toBeNull();
        expect(snap.cursorStyle).toBeNull();
        expect(snap.cells).toHaveLength(6);
        expect(snap.cells.every((c) => c.char === " " && c.fg === DEFAULT_COLOR && c.bg === DEFAULT_COLOR)).toBe(true);
    });
});
