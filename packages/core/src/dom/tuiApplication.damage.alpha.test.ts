import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it } from "vitest";

import { compositeOver, packRgb, packRgba } from "../common/colorUtils.ts";
import { BoxConstraints, Point, Size } from "../common/geometryPromitives.ts";

import { type RenderContext, TUIElement } from "./tuiElement.ts";

// Частичная перерисовка: damage-область чистится в DEFAULT_COLOR, и если бы
// проход не начинался с корня, полупрозрачный виджет смешался бы с пустотой
// (альфа отброшена → яркая плашка). Кадр канонический: непрозрачный фон корня
// ложится первым, поэтому цвет после частичного кадра равен цвету полного.

const ROOT_BG = packRgb(0x1e, 0x1e, 0x2e);
const LINE_HIGHLIGHT = packRgba(0xcd, 0xd6, 0xf4, 0x12);

/** Painter: заливает строку `highlightRow` полупрозрачным патчем поверх своего фона. */
class HighlightPaneElement extends TUIElement {
    public highlightRow = 0;

    public setHighlightRow(row: number): void {
        this.highlightRow = row;
        this.markDirty();
    }

    public override render(context: RenderContext): void {
        super.render(context);
        for (let x = 0; x < this.layoutSize.width; x++) {
            context.setCell(x, this.highlightRow, { bg: LINE_HIGHLIGHT });
        }
    }
}

class TwoPanesElement extends TUIElement {
    public readonly left = new HighlightPaneElement();
    public readonly right = new HighlightPaneElement();

    public constructor() {
        super();
        this.appendChild(this.left);
        this.appendChild(this.right);
    }

    protected override performLayout(constraints: BoxConstraints): Size {
        const size = super.performLayout(constraints);
        const pane = BoxConstraints.tight(new Size(8, 3));
        this.layoutChild(this.left, 0, 0, pane);
        this.layoutChild(this.right, 10, 0, pane);
        return size;
    }
}

describe("TuiApplication — damage-кадр и цвета с альфой", () => {
    it("после частичной перерисовки полупрозрачный патч лежит на фоне корня, а не на пустоте", () => {
        const panes = new TwoPanesElement();
        panes.style = { bg: ROOT_BG };
        const app = TestApp.createWithContent(panes, new Size(20, 4));
        const expected = compositeOver(LINE_HIGHLIGHT, ROOT_BG);
        expect(app.backend.getBgAt(new Point(0, 0))).toBe(expected);
        expect(app.backend.getBgAt(new Point(0, 1))).toBe(ROOT_BG);

        panes.left.setHighlightRow(1);
        app.render();

        expect(app.backend.getBgAt(new Point(0, 1))).toBe(expected);
        expect(app.backend.getBgAt(new Point(0, 0))).toBe(ROOT_BG);
        // Сосед не перерисовывался и не «доложился» вторым слоем.
        expect(app.backend.getBgAt(new Point(10, 0))).toBe(expected);
    });

    it("повторные кадры без изменений не накапливают слои", () => {
        const panes = new TwoPanesElement();
        panes.style = { bg: ROOT_BG };
        const app = TestApp.createWithContent(panes, new Size(20, 4));
        const expected = compositeOver(LINE_HIGHLIGHT, ROOT_BG);
        app.render();
        panes.left.markDirty();
        app.render();
        panes.left.markDirty();
        app.render();
        expect(app.backend.getBgAt(new Point(0, 0))).toBe(expected);
    });
});
