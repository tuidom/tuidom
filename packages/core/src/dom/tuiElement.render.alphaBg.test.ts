import { describe, expect, it } from "vitest";

import { compositeOver, DEFAULT_COLOR, packRgb, packRgba, TRANSPARENT_COLOR } from "../common/colorUtils.ts";
import { BoxConstraints, Offset, Point, Rect, Size } from "../common/geometryPromitives.ts";
import { TerminalScreen } from "../rendering/terminalScreen.ts";

import { INHERITED_BG, INHERITED_FG, ROOT_STYLE_CONTEXT } from "./styles/tuiStyle.ts";
import { RenderContext, TUIElement } from "./tuiElement.ts";

// Цвет с альфой в стиле элемента: каскад композитит его с унаследованным bg,
// resolvedStyle и дети получают непрозрачный результат. Так заливка фона и
// текст, нарисованный тем же resolvedStyle.bg, не накладываются на ячейку
// дважды, а INHERITED_* и токены остаются прежней семантики.

class ContainerElement extends TUIElement {
    public addChild(child: TUIElement, x: number, y: number, size: Size): void {
        this.appendChild(child);
        this.childPlacements.set(child, { x, y, size });
    }
    private readonly childPlacements = new Map<TUIElement, { x: number; y: number; size: Size }>();

    protected override performLayout(constraints: BoxConstraints): Size {
        const size = super.performLayout(constraints);
        for (const [child, p] of this.childPlacements) {
            this.layoutChild(child, p.x, p.y, BoxConstraints.tight(p.size));
        }
        return size;
    }
}

/** Лейбл: заливает фон базовым render и пишет текст своим resolvedStyle — как штатные виджеты. */
class LabelElement extends TUIElement {
    public constructor(private readonly text: string) {
        super();
    }
    public override render(context: RenderContext): void {
        super.render(context);
        const { fg, bg } = this.resolvedStyle;
        context.drawText(0, 0, this.text, { fg, bg });
    }
}

const SIZE = new Size(10, 2);
const ROOT_BG = packRgb(0x1e, 0x1e, 0x2e);
const HOVER = packRgba(0x31, 0x32, 0x44, 0x80);

function renderToScreen(root: TUIElement): TerminalScreen {
    const screen = new TerminalScreen(SIZE);
    root.layout(BoxConstraints.tight(SIZE));
    root.performStyleResolution(ROOT_STYLE_CONTEXT);
    root.render(new RenderContext(screen, new Offset(0, 0), new Rect(new Point(0, 0), SIZE)));
    return screen;
}

describe("Каскад стилей — цвет с альфой", () => {
    it("bg с альфой резолвится в непрозрачную смесь с унаследованным bg", () => {
        const root = new ContainerElement();
        root.setAsRoot();
        root.style = { bg: ROOT_BG };
        const child = new TUIElement();
        root.addChild(child, 0, 0, new Size(4, 1));
        child.style = { bg: HOVER };

        const screen = renderToScreen(root);
        const expected = compositeOver(HOVER, ROOT_BG);
        expect(child.resolvedStyle.bg).toBe(expected);
        expect(screen.getCell(new Point(0, 0)).bg).toBe(expected);
        expect(screen.getCell(new Point(5, 0)).bg).toBe(ROOT_BG);
    });

    it("заливка + текст тем же resolvedStyle.bg — один слой, а не два", () => {
        const root = new ContainerElement();
        root.setAsRoot();
        root.style = { bg: ROOT_BG };
        const label = new LabelElement("ab");
        root.addChild(label, 0, 0, new Size(4, 1));
        label.style = { bg: HOVER };

        const screen = renderToScreen(root);
        const expected = compositeOver(HOVER, ROOT_BG);
        expect(screen.getCell(new Point(0, 0)).char).toBe("a");
        expect(screen.getCell(new Point(0, 0)).bg).toBe(expected);
        expect(screen.getCell(new Point(3, 0)).bg).toBe(expected);
    });

    it("вложенные полупрозрачные фоны накладываются друг на друга", () => {
        const root = new ContainerElement();
        root.setAsRoot();
        root.style = { bg: ROOT_BG };
        const mid = new ContainerElement();
        root.addChild(mid, 0, 0, new Size(6, 1));
        mid.style = { bg: HOVER };
        const leaf = new TUIElement();
        mid.addChild(leaf, 0, 0, new Size(2, 1));
        leaf.style = { bg: HOVER };

        const screen = renderToScreen(root);
        const midBg = compositeOver(HOVER, ROOT_BG);
        expect(screen.getCell(new Point(3, 0)).bg).toBe(midBg);
        expect(screen.getCell(new Point(0, 0)).bg).toBe(compositeOver(HOVER, midBg));
    });

    it("дети наследуют уже скомпозиченный bg; INHERITED_BG перезаливает им же", () => {
        const root = new ContainerElement();
        root.setAsRoot();
        root.style = { bg: ROOT_BG };
        const mid = new ContainerElement();
        root.addChild(mid, 0, 0, new Size(6, 1));
        mid.style = { bg: HOVER };
        const filler = new TUIElement();
        mid.addChild(filler, 0, 0, new Size(2, 1));
        filler.style = { bg: INHERITED_BG };

        const screen = renderToScreen(root);
        const midBg = compositeOver(HOVER, ROOT_BG);
        expect(filler.resolvedStyle.bg).toBe(midBg);
        expect(screen.getCell(new Point(0, 0)).bg).toBe(midBg);
    });

    it("fg с альфой композитится с собственным (итоговым) bg элемента", () => {
        const root = new ContainerElement();
        root.setAsRoot();
        root.style = { bg: ROOT_BG, fg: 0xffffff };
        const child = new TUIElement();
        root.addChild(child, 0, 0, new Size(2, 1));
        const fg = packRgba(255, 255, 255, 0x80);
        child.style = { bg: HOVER, fg };

        renderToScreen(root);
        const childBg = compositeOver(HOVER, ROOT_BG);
        expect(child.resolvedStyle.fg).toBe(compositeOver(fg, childBg));

        const inverted = new TUIElement();
        root.addChild(inverted, 4, 0, new Size(2, 1));
        inverted.style = { fg: INHERITED_FG };
        renderToScreen(root);
        expect(inverted.resolvedStyle.fg).toBe(0xffffff);
    });

    it("над DEFAULT_COLOR (корень без фона) альфа отбрасывается", () => {
        const root = new ContainerElement();
        root.setAsRoot();
        root.style = { bg: HOVER };
        const screen = renderToScreen(root);
        expect(root.resolvedStyle.bg).toBe(packRgb(0x31, 0x32, 0x44));
        expect(screen.getCell(new Point(0, 0)).bg).toBe(packRgb(0x31, 0x32, 0x44));
    });

    it("TRANSPARENT_COLOR как собственный bg — элемент не красит (как CSS transparent)", () => {
        const root = new ContainerElement();
        root.setAsRoot();
        root.style = { bg: ROOT_BG };
        const child = new TUIElement();
        root.addChild(child, 0, 0, new Size(2, 1));
        child.style = { bg: TRANSPARENT_COLOR };

        const screen = renderToScreen(root);
        expect(child.hasOwnBackground).toBe(false);
        expect(child.resolvedStyle.bg).toBe(ROOT_BG);
        expect(screen.getCell(new Point(0, 0)).bg).toBe(ROOT_BG);
        // Ниже прозрачного — всё ещё DEFAULT-ячейки, если корень их не красил.
        const bare = new ContainerElement();
        bare.setAsRoot();
        bare.style = { bg: TRANSPARENT_COLOR };
        expect(renderToScreen(bare).getCell(new Point(0, 0)).bg).toBe(DEFAULT_COLOR);
    });

    it("токены с альфой: таблица принимает RGBA и TRANSPARENT_COLOR, сентинелы каскада — нет", () => {
        const root = new ContainerElement();
        root.setAsRoot();
        root.setStyleVars({ "list.hoverBackground": HOVER, focusBorder: TRANSPARENT_COLOR, opaque: 0xfeffff });
        root.style = { bg: ROOT_BG };
        const row = new TUIElement();
        root.addChild(row, 0, 0, new Size(4, 1));
        row.style = { when: [{ states: ["hover"], bg: "list.hoverBackground" }] };
        row.setStyleState("hover", true);

        const screen = renderToScreen(root);
        expect(screen.getCell(new Point(0, 0)).bg).toBe(compositeOver(HOVER, ROOT_BG));
        expect(root.styleVar("list.hoverBackground")).toBe(HOVER);

        expect(() => {
            root.setStyleVars({ bad: INHERITED_BG });
        }).toThrow(/сентинел/);
        expect(() => {
            root.setStyleVars({ bad: 0xffffffff });
        }).toThrow(/сентинел/);
    });
});
