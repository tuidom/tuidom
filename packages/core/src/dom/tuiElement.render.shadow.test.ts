import { describe, expect, it, vi } from "vitest";

import { compositeOver, DEFAULT_COLOR, packRgb, packRgba, TRANSPARENT_COLOR } from "../common/colorUtils.ts";
import { BoxConstraints, Offset, Point, Rect, Size } from "../common/geometryPromitives.ts";
import { TerminalScreen } from "../rendering/terminalScreen.ts";

import { STYLE_TOKEN_DEFAULTS } from "./styles/styleTokens.ts";
import { ROOT_STYLE_CONTEXT } from "./styles/tuiStyle.ts";
import { RenderContext, TUIElement } from "./tuiElement.ts";

const ROOT_BG = packRgb(30, 30, 46);
const ROOT_FG = packRgb(205, 214, 244);
const POPUP_BG = packRgb(30, 30, 46);
const SHADOW = STYLE_TOKEN_DEFAULTS["widget.shadow"];

/** Контейнер с текстом на фоне и одним «попапом» 4×2 в (2,1). */
class HostElement extends TUIElement {
    public readonly popup = new PopupElement();
    public popupPosition = new Point(2, 1);

    public constructor() {
        super();
        this.appendChild(this.popup);
    }

    protected override performLayout(constraints: BoxConstraints): Size {
        const size = super.performLayout(constraints);
        this.layoutChild(this.popup, this.popupPosition.x, this.popupPosition.y, BoxConstraints.tight(new Size(4, 2)));
        return size;
    }

    public override render(context: RenderContext): void {
        this.paintOwnBackground(context);
        for (let y = 0; y < this.layoutSize.height; y++) {
            context.drawText(0, y, "text under the popup".slice(0, this.layoutSize.width), {
                fg: this.resolvedStyle.fg,
                bg: this.resolvedStyle.bg,
            });
        }
        this.renderChildren(context);
    }
}

class PopupElement extends TUIElement {
    public override render(context: RenderContext): void {
        context.drawBox(0, 0, this.layoutSize.width, this.layoutSize.height, { fg: ROOT_FG, bg: POPUP_BG, fill: true });
    }
}

function renderHost(
    width = 12,
    height = 5,
    vars?: Record<string, number>,
): { host: HostElement; screen: TerminalScreen } {
    const host = new HostElement();
    host.setAsRoot();
    host.style = { fg: ROOT_FG, bg: ROOT_BG };
    if (vars !== undefined) host.setStyleVars(vars);
    const size = new Size(width, height);
    const screen = new TerminalScreen(size);
    host.layout(BoxConstraints.tight(size));
    host.performStyleResolution(ROOT_STYLE_CONTEXT);
    host.render(new RenderContext(screen, new Offset(0, 0), new Rect(new Point(0, 0), size)));
    return { host, screen };
}

function cell(screen: TerminalScreen, x: number, y: number): { fg: number; bg: number } {
    const c = screen.getCell(new Point(x, y));
    return { fg: c.fg, bg: c.bg };
}

describe("TUIElement.shadow — тень оверлея рисует родитель", () => {
    it("без shadow ячейки справа и снизу от ребёнка не тронуты", () => {
        const { screen } = renderHost();
        // Попап 4×2 в (2,1): справа колонка x=6 (y=2..3), снизу строка y=3 (x=3..6).
        expect(cell(screen, 6, 2)).toEqual({ fg: ROOT_FG, bg: ROOT_BG });
        expect(cell(screen, 3, 3)).toEqual({ fg: ROOT_FG, bg: ROOT_BG });
    });

    it("shadow: колонка справа и строка снизу (сдвиг 1×1) затемнены widget.shadow поверх нарисованного", () => {
        const host = new HostElement();
        host.popup.shadow = true;
        host.setAsRoot();
        host.style = { fg: ROOT_FG, bg: ROOT_BG };
        const size = new Size(12, 5);
        const screen = new TerminalScreen(size);
        host.layout(BoxConstraints.tight(size));
        host.performStyleResolution(ROOT_STYLE_CONTEXT);
        host.render(new RenderContext(screen, new Offset(0, 0), new Rect(new Point(0, 0), size)));

        const shadedBg = compositeOver(SHADOW, ROOT_BG);
        const shadedFg = compositeOver(SHADOW, ROOT_FG);
        expect(shadedBg).not.toBe(ROOT_BG);
        // Правая колонка: y = top+1 … bottom (включая угол).
        expect(cell(screen, 6, 2)).toEqual({ fg: shadedFg, bg: shadedBg });
        expect(cell(screen, 6, 3)).toEqual({ fg: shadedFg, bg: shadedBg });
        // Нижняя строка: x = left+1 … right-1.
        expect(cell(screen, 3, 3)).toEqual({ fg: shadedFg, bg: shadedBg });
        expect(cell(screen, 5, 3)).toEqual({ fg: shadedFg, bg: shadedBg });
        // Верхний правый и нижний левый углы сдвига — вне тени.
        expect(cell(screen, 6, 1)).toEqual({ fg: ROOT_FG, bg: ROOT_BG });
        expect(cell(screen, 2, 3)).toEqual({ fg: ROOT_FG, bg: ROOT_BG });
        // Сам попап не задет.
        expect(cell(screen, 2, 1).bg).toBe(POPUP_BG);
        expect(cell(screen, 5, 2).bg).toBe(POPUP_BG);
        // Глиф под тенью остаётся — тень только красит.
        expect(screen.getCell(new Point(3, 3)).char).toBe("t");
    });

    it("терминальный DEFAULT_COLOR у fg не смешивается — остаётся как есть", () => {
        const host = new HostElement();
        host.popup.shadow = true;
        host.setAsRoot();
        host.style = { fg: DEFAULT_COLOR, bg: ROOT_BG };
        const size = new Size(12, 5);
        const screen = new TerminalScreen(size);
        host.layout(BoxConstraints.tight(size));
        host.performStyleResolution(ROOT_STYLE_CONTEXT);
        host.render(new RenderContext(screen, new Offset(0, 0), new Rect(new Point(0, 0), size)));

        expect(cell(screen, 6, 2)).toEqual({ fg: DEFAULT_COLOR, bg: compositeOver(SHADOW, ROOT_BG) });
    });

    it("хост задаёт свой widget.shadow через var-scope; TRANSPARENT_COLOR — тени нет", () => {
        const custom = packRgba(255, 0, 0, 0x80);
        const withCustom = renderHost(12, 5, { "widget.shadow": custom });
        withCustom.host.popup.shadow = true;
        const size = new Size(12, 5);
        const screen = new TerminalScreen(size);
        withCustom.host.render(new RenderContext(screen, new Offset(0, 0), new Rect(new Point(0, 0), size)));
        expect(cell(screen, 6, 2).bg).toBe(compositeOver(custom, ROOT_BG));

        const none = renderHost(12, 5, { "widget.shadow": TRANSPARENT_COLOR });
        none.host.popup.shadow = true;
        const screen2 = new TerminalScreen(size);
        none.host.render(new RenderContext(screen2, new Offset(0, 0), new Rect(new Point(0, 0), size)));
        expect(cell(screen2, 6, 2)).toEqual({ fg: ROOT_FG, bg: ROOT_BG });
    });

    it("тень у края экрана клипуется молча", () => {
        const host = new HostElement();
        host.popup.shadow = true;
        host.popupPosition = new Point(8, 3); // попап 4×2 занимает x=8..11, y=3..4 — тень за экраном 12×5
        host.setAsRoot();
        host.style = { fg: ROOT_FG, bg: ROOT_BG };
        const size = new Size(12, 5);
        const screen = new TerminalScreen(size);
        host.layout(BoxConstraints.tight(size));
        host.performStyleResolution(ROOT_STYLE_CONTEXT);
        expect(() => {
            host.render(new RenderContext(screen, new Offset(0, 0), new Rect(new Point(0, 0), size)));
        }).not.toThrow();
        expect(cell(screen, 11, 4).bg).toBe(POPUP_BG);
    });

    it("сеттер shadow метит элемент dirty только при смене значения", () => {
        const element = new TUIElement();
        const markDirty = vi.spyOn(element, "markDirty");
        expect(element.shadow).toBe(false);
        element.shadow = true;
        element.shadow = true;
        expect(element.shadow).toBe(true);
        expect(markDirty).toHaveBeenCalledTimes(1);
        element.shadow = false;
        expect(markDirty).toHaveBeenCalledTimes(2);
    });
});
