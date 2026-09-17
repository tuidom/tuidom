import { describe, expect, it } from "vitest";

import { packRgb } from "../common/colorUtils.ts";
import { Point, Size } from "../common/geometryPromitives.ts";
import { StyleFlags } from "../common/styleFlags.ts";
import { TerminalScreen } from "../rendering/terminalScreen.ts";

import { RenderContext } from "./tuiElement.ts";

/**
 * Контракт непрозрачной записи ячейки: кладёшь свой `char` — кладёшь и стиль.
 * Иначе оверлей донашивает атрибуты того, что нарисовано под ним РАНЬШЕ В ЭТОМ
 * ЖЕ КАДРЕ: попап поверх диагностики в редакторе проступал волной сквозь свой
 * фон и рамку. Патч без `char` (проходы подсветки) по-прежнему мерджится.
 */
function setup(width: number, height: number): { ctx: RenderContext; screen: TerminalScreen } {
    const screen = new TerminalScreen(new Size(width, height));
    return { ctx: new RenderContext(screen), screen };
}

/** Кадр «под оверлеем»: текст с волной по всей строке — как squiggle редактора. */
function paintUndercurledRow(ctx: RenderContext, width: number): void {
    ctx.drawText(0, 0, "x".repeat(width), { fg: packRgb(200, 0, 0), style: StyleFlags.Undercurl });
}

describe("RenderContext.drawText — стиль ячейки", () => {
    it("сбрасывает флаги ячейки, если стиль не передан", () => {
        const { ctx, screen } = setup(6, 1);
        paintUndercurledRow(ctx, 6);

        ctx.drawText(0, 0, "abc", { fg: packRgb(1, 2, 3) });

        expect(screen.getCell(new Point(0, 0)).style).toBe(StyleFlags.None);
        expect(screen.getCell(new Point(2, 0)).style).toBe(StyleFlags.None);
        // За текстом ячейка не тронута — волна там остаётся.
        expect(screen.getCell(new Point(3, 0)).style).toBe(StyleFlags.Undercurl);
    });

    it("кладёт переданные флаги", () => {
        const { ctx, screen } = setup(6, 1);
        ctx.drawText(0, 0, "ab", { style: StyleFlags.Bold | StyleFlags.Italic });

        expect(screen.getCell(new Point(0, 0)).style).toBe(StyleFlags.Bold | StyleFlags.Italic);
    });

    it("слот из getStyle без своих флагов не наследует флаги ячейки", () => {
        const { ctx, screen } = setup(6, 1);
        paintUndercurledRow(ctx, 6);

        // Слот перебивает только цвет — флагов не даёт ни он, ни общий стиль.
        ctx.drawText(
            0,
            0,
            "ab",
            { fg: packRgb(1, 2, 3) },
            { getStyle: (offset) => (offset === 1 ? { fg: packRgb(9, 9, 9) } : undefined) },
        );

        expect(screen.getCell(new Point(0, 0)).style).toBe(StyleFlags.None);
        expect(screen.getCell(new Point(1, 0)).style).toBe(StyleFlags.None);
        expect(screen.getCell(new Point(1, 0)).fg).toBe(packRgb(9, 9, 9));
    });

    it("флаги слота побеждают общий стиль строки", () => {
        const { ctx, screen } = setup(6, 1);

        ctx.drawText(
            0,
            0,
            "ab",
            { style: StyleFlags.Bold },
            { getStyle: (offset) => (offset === 1 ? { style: StyleFlags.Italic } : undefined) },
        );

        expect(screen.getCell(new Point(0, 0)).style).toBe(StyleFlags.Bold);
        expect(screen.getCell(new Point(1, 0)).style).toBe(StyleFlags.Italic);
    });

    it("обрезанный широкий символ (пробел вместо головы) тоже сбрасывает флаги", () => {
        const { ctx, screen } = setup(2, 1);
        paintUndercurledRow(ctx, 2);

        // maxWidth 2: "a" занимает колонку 0, на широкий "🙂" остаётся одна — он
        // выродится в пробел.
        ctx.drawText(0, 0, "a🙂", undefined, { maxWidth: 2 });

        expect(screen.getCell(new Point(1, 0)).char).toBe(" ");
        expect(screen.getCell(new Point(1, 0)).style).toBe(StyleFlags.None);
    });
});

describe("RenderContext.drawBox — стиль ячейки", () => {
    it("рамка и заливка сбрасывают флаги ячеек под собой", () => {
        const { ctx, screen } = setup(6, 3);
        for (let y = 0; y < 3; y++) {
            ctx.drawText(0, y, "xxxxxx", { style: StyleFlags.Undercurl });
        }

        ctx.drawBox(0, 0, 6, 3, { fg: packRgb(1, 2, 3), bg: packRgb(4, 5, 6), fill: true });

        expect(screen.getCell(new Point(0, 0)).style).toBe(StyleFlags.None); // угол
        expect(screen.getCell(new Point(2, 0)).style).toBe(StyleFlags.None); // горизонталь
        expect(screen.getCell(new Point(0, 1)).style).toBe(StyleFlags.None); // вертикаль
        expect(screen.getCell(new Point(2, 1)).style).toBe(StyleFlags.None); // заливка
        expect(screen.getCell(new Point(3, 2)).style).toBe(StyleFlags.None); // нижняя граница
    });

    it("T-коннекторы сепаратора тоже кладут чистый стиль", () => {
        const { ctx, screen } = setup(6, 4);
        for (let y = 0; y < 4; y++) {
            ctx.drawText(0, y, "xxxxxx", { style: StyleFlags.Undercurl });
        }

        ctx.drawBox(0, 0, 6, 4, { separators: [1] });

        expect(screen.getCell(new Point(0, 1)).char).toBe("├");
        expect(screen.getCell(new Point(0, 1)).style).toBe(StyleFlags.None);
        expect(screen.getCell(new Point(3, 1)).style).toBe(StyleFlags.None);
    });
});
