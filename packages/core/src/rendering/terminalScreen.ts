import type { ITerminalBackend } from "../backend/iTerminalBackend.ts";
import { DEFAULT_COLOR } from "../common/colorUtils.ts";
import type { CursorStyle } from "../common/cursorStyle.ts";
import { Point, type Rect, Size } from "../common/geometryPromitives.ts";
import { StyleFlags } from "../common/styleFlags.ts";

import type { CellPatch, ReadonlyCellData } from "./grid.ts";
import { Grid } from "./grid.ts";

export class TerminalScreen {
    private grid: Grid;
    public size: Size;
    public cursorPosition: Point | null = null;
    /** Shape of the cursor at {@link cursorPosition}; `null` — the terminal's default. Lives and dies with the position. */
    public cursorStyle: CursorStyle | null = null;

    public get width(): number {
        return this.size.width;
    }
    public get height(): number {
        return this.size.height;
    }

    public constructor(size: Size = new Size(80, 24)) {
        this.size = size;
        this.grid = new Grid(size);
    }

    public setCursorPosition(position: Point, style: CursorStyle | null = null): void {
        this.cursorPosition = position;
        this.cursorStyle = style;
    }

    public clearCursorPosition(): void {
        this.cursorPosition = null;
        this.cursorStyle = null;
    }

    public setCell(position: Point, cell: CellPatch): void {
        this.grid.updateCell(position, cell);
    }

    public getCell(position: Point): ReadonlyCellData {
        return this.grid.getCell(position);
    }

    public flush(backend: ITerminalBackend): void {
        backend.renderFrame(this.grid, this.cursorPosition, this.cursorStyle);
    }

    public clear(): void {
        this.grid.fill(" ", DEFAULT_COLOR, DEFAULT_COLOR, StyleFlags.None);
        this.clearCursorPosition();
    }

    /**
     * Семантика {@link clear} в границах rect'а — очистка damage-области перед
     * частичным проходом отрисовки. Курсор НЕ трогает: им управляет кадр
     * (renderFrame гасит позицию, только если она попала в damage).
     */
    public clearRect(rect: Rect): void {
        this.grid.clearRect(rect);
    }

    /** См. {@link Grid.snapToWideChars} — границы области не рассекают wide-пары. */
    public snapToWideChars(rect: Rect): Rect {
        return this.grid.snapToWideChars(rect);
    }
}
