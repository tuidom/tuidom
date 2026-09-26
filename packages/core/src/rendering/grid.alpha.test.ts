import { describe, expect, it } from "vitest";

import { blendRgb, compositeOver, DEFAULT_COLOR, packRgb, packRgba, TRANSPARENT_COLOR } from "../common/colorUtils.ts";
import { Point, Rect, Size } from "../common/geometryPromitives.ts";
import { StyleFlags } from "../common/styleFlags.ts";

import { Grid } from "./grid.ts";

// Композитинг в порядке отрисовки: цвет с альфой в патче ложится на то, что
// уже лежит в ячейке в этом кадре; ячейки грида хранят только непрозрачное.

const EDITOR_BG = packRgb(0x1e, 0x1e, 0x2e);
const LINE_HIGHLIGHT = packRgba(0xcd, 0xd6, 0xf4, 0x12);
const SELECTION = packRgba(0x93, 0x99, 0xb2, 0x40);

function gridWithBg(bg: number): Grid {
    const grid = new Grid(new Size(4, 1));
    for (let x = 0; x < 4; x++)
        grid.updateCell(new Point(x, 0), { char: " ", bg, fg: 0xcccccc, style: StyleFlags.None });
    return grid;
}

describe("Grid — композитинг цветов с альфой", () => {
    it("непрозрачный патч — как раньше, ячейка получает цвет без изменений", () => {
        const grid = gridWithBg(EDITOR_BG);
        grid.updateCell(new Point(0, 0), { bg: 0xabcdef, fg: 0x123456 });
        expect(grid.getCellAt(0, 0).bg).toBe(0xabcdef);
        expect(grid.getCellAt(0, 0).fg).toBe(0x123456);
    });

    it("полупрозрачный bg смешивается с текущим bg ячейки", () => {
        const grid = gridWithBg(EDITOR_BG);
        grid.updateCell(new Point(0, 0), { bg: LINE_HIGHLIGHT });
        expect(grid.getCellAt(0, 0).bg).toBe(blendRgb(packRgb(0xcd, 0xd6, 0xf4), EDITOR_BG, 0x12 / 0xff));
        expect(grid.getCellAt(0, 0).bg).toBeLessThanOrEqual(0xffffff);
    });

    it("выделение поверх подсветки текущей строки — смесь смеси, а не замена", () => {
        const grid = gridWithBg(EDITOR_BG);
        grid.updateCell(new Point(0, 0), { bg: LINE_HIGHLIGHT });
        const highlighted = grid.getCellAt(0, 0).bg;
        grid.updateCell(new Point(0, 0), { bg: SELECTION });
        expect(grid.getCellAt(0, 0).bg).toBe(compositeOver(SELECTION, highlighted));
        // Порядок наложения имеет значение: обратный порядок даёт другой цвет.
        const reversed = compositeOver(LINE_HIGHLIGHT, compositeOver(SELECTION, EDITOR_BG));
        expect(grid.getCellAt(0, 0).bg).not.toBe(reversed);
    });

    it("полупрозрачный fg ложится на ИТОГОВЫЙ bg ячейки — в том числе из того же патча", () => {
        const grid = gridWithBg(EDITOR_BG);
        const fg = packRgba(255, 255, 255, 0x80);
        grid.updateCell(new Point(0, 0), { fg });
        expect(grid.getCellAt(0, 0).fg).toBe(compositeOver(fg, EDITOR_BG));

        grid.updateCell(new Point(1, 0), { fg, bg: 0x000000 });
        expect(grid.getCellAt(1, 0).fg).toBe(packRgb(128, 128, 128));
    });

    it("повторная запись того же полупрозрачного fg идемпотентна (зависит от bg, не от прежнего fg)", () => {
        const grid = gridWithBg(EDITOR_BG);
        const fg = packRgba(255, 255, 255, 0x80);
        grid.updateCell(new Point(0, 0), { fg });
        const once = grid.getCellAt(0, 0).fg;
        grid.updateCell(new Point(0, 0), { char: "x", fg, style: StyleFlags.None });
        expect(grid.getCellAt(0, 0).fg).toBe(once);
    });

    it("TRANSPARENT_COLOR ничего не меняет", () => {
        const grid = gridWithBg(EDITOR_BG);
        grid.updateCell(new Point(0, 0), { bg: TRANSPARENT_COLOR, fg: TRANSPARENT_COLOR });
        expect(grid.getCellAt(0, 0).bg).toBe(EDITOR_BG);
        // Прозрачный fg — невидимый текст: цвет подложки.
        expect(grid.getCellAt(0, 0).fg).toBe(EDITOR_BG);
    });

    it("над DEFAULT_COLOR (пустая ячейка после clear) альфа отбрасывается", () => {
        const grid = new Grid(new Size(2, 1));
        grid.updateCell(new Point(0, 0), { bg: LINE_HIGHLIGHT });
        expect(grid.getCellAt(0, 0).bg).toBe(packRgb(0xcd, 0xd6, 0xf4));
        grid.updateCell(new Point(1, 0), { fg: packRgba(1, 2, 3, 0x10) });
        expect(grid.getCellAt(1, 0).fg).toBe(packRgb(1, 2, 3));
        expect(grid.getCellAt(1, 0).bg).toBe(DEFAULT_COLOR);
    });

    it("продолжение wide-char получает те же скомпозиченные цвета, что и голова", () => {
        const grid = gridWithBg(EDITOR_BG);
        const fg = packRgba(255, 255, 255, 0x80);
        grid.updateCell(new Point(0, 0), { char: "漢", width: 2, bg: LINE_HIGHLIGHT, fg, style: StyleFlags.None });
        const head = grid.getCellAt(0, 0);
        const cont = grid.getCellAt(1, 0);
        expect(cont.width).toBe(0);
        expect(cont.bg).toBe(head.bg);
        expect(cont.fg).toBe(head.fg);
        expect(head.bg).toBe(compositeOver(LINE_HIGHLIGHT, EDITOR_BG));
    });

    it("setCell (полная запись) композитит так же, как updateCell", () => {
        const grid = gridWithBg(EDITOR_BG);
        grid.setCell(new Point(0, 0), "a", packRgba(255, 255, 255, 0x80), LINE_HIGHLIGHT, StyleFlags.None, 1);
        const expectedBg = compositeOver(LINE_HIGHLIGHT, EDITOR_BG);
        expect(grid.getCellAt(0, 0).bg).toBe(expectedBg);
        expect(grid.getCellAt(0, 0).fg).toBe(compositeOver(packRgba(255, 255, 255, 0x80), expectedBg));
        grid.setCell(new Point(1, 0), "漢", 0xffffff, LINE_HIGHLIGHT, StyleFlags.None, 2);
        expect(grid.getCellAt(2, 0).bg).toBe(expectedBg);
    });

    it("clearRect сбрасывает подложку: следующее наложение идёт на DEFAULT_COLOR", () => {
        const grid = gridWithBg(EDITOR_BG);
        grid.updateCell(new Point(0, 0), { bg: LINE_HIGHLIGHT });
        grid.clearRect(new Rect(new Point(0, 0), new Size(4, 1)));
        expect(grid.getCellAt(0, 0).bg).toBe(DEFAULT_COLOR);
    });
});
