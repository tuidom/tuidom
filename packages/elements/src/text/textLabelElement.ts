import { DisplayLine } from "@tuidom/core/common/displayLine";
import { BoxConstraints, Size } from "@tuidom/core/common/geometryPromitives";
import { StyleFlags } from "@tuidom/core/common/styleFlags";
import type { StyleColor } from "@tuidom/core/dom/styles/tuiStyle";
import { RenderContext, TUIElement } from "@tuidom/core/dom/tuiElement";

/** Посимвольный стиль; цвета — StyleColor: числа ИЛИ имена токенов темы. */
export interface StyledChar {
    fg?: StyleColor;
    bg?: StyleColor;
    style?: StyleFlags;
}

export class TextLabelElement extends TUIElement {
    /**
     * Перенос по ширине: текст, не влезший в строку, продолжается на следующей
     * (по графемам, как терминал), `\n` начинает новую строку (`white-space:
     * pre-wrap`), а высота лейбла — число получившихся строк.
     * Выключен — одна строка, хвост срезается справа.
     */
    public wrap = false;
    private text: string;
    private charStyles = new Map<number, StyledChar>();
    // Сегментация — O(длины текста) на каждое построение DisplayLine, а лейбл
    // строил его дважды за кадр (layout + render). Кэш живёт до setText;
    // charStyles/цвета на текст не влияют и кэш не трогают.
    private cachedDisplayLine: DisplayLine | null = null;
    /** Строки переноса последней ширины: список спрашивает высоту каждой строки при каждой пересборке. */
    private cachedWrap: { readonly width: number; readonly lines: readonly (readonly [number, number])[] } | null =
        null;

    public constructor(text: string) {
        super();
        this.text = text;
    }

    private get displayLine(): DisplayLine {
        return (this.cachedDisplayLine ??= new DisplayLine(this.text));
    }

    public getText(): string {
        return this.text;
    }

    public setText(text: string): void {
        this.text = text;
        this.cachedDisplayLine = null;
        this.cachedWrap = null;
        this.markDirty();
    }

    public setColors(fg: StyleColor, bg: StyleColor): void {
        this.style = { ...this.style, fg, bg };
    }

    public setCharStyle(index: number, charStyle: StyledChar): void {
        this.charStyles.set(index, charStyle);
        this.markDirty();
    }

    public clearCharStyles(): void {
        this.charStyles.clear();
        this.markDirty();
    }

    public override getMinIntrinsicWidth(_height: number): number {
        return this.displayLine.displayWidth;
    }

    public override getMaxIntrinsicWidth(_height: number): number {
        return this.displayLine.displayWidth;
    }

    public override getMinIntrinsicHeight(width: number): number {
        return this.wrap ? this.wrappedLines(width).length : 1;
    }

    public override getMaxIntrinsicHeight(width: number): number {
        return this.getMinIntrinsicHeight(width);
    }

    protected override performLayout(constraints: BoxConstraints): Size {
        if (this.wrap && Number.isFinite(constraints.maxWidth)) {
            const width = constraints.maxWidth;
            const natural = new Size(Math.min(width, this.getMaxIntrinsicWidth(1)), this.getMaxIntrinsicHeight(width));
            return super.performLayout(BoxConstraints.tight(constraints.constrain(natural)));
        }
        const natural = new Size(this.getMaxIntrinsicWidth(1), 1);
        return super.performLayout(BoxConstraints.tight(constraints.constrain(natural)));
    }

    /**
     * Границы строк переноса как `[start, end)` в code units: строка набирает
     * графемы, пока они влезают в `width`; графема шире строки занимает строку
     * одна. Пустой текст — одна пустая строка.
     */
    private wrappedLines(width: number): readonly (readonly [number, number])[] {
        if (this.cachedWrap?.width === width) return this.cachedWrap.lines;
        const lines: [number, number][] = [];
        let start = 0;
        let used = 0;
        for (const slot of this.displayLine.slots) {
            // Перевод строки — конец строки переноса; сам он не рисуется.
            if (this.text.charCodeAt(slot.offset) === 10) {
                lines.push([start, slot.offset]);
                start = slot.offset + 1;
                used = 0;
                continue;
            }
            if (used > 0 && used + slot.displayWidth > width) {
                lines.push([start, slot.offset]);
                start = slot.offset;
                used = 0;
            }
            used += slot.displayWidth;
        }
        lines.push([start, this.text.length]);
        this.cachedWrap = { width, lines };
        return lines;
    }

    /**
     * Смещение (code units) графемы в ячейке `(x, y)` лейбла после последнего
     * layout — по нему владелец находит кусок текста под кликом (ссылку).
     * `undefined` — в ячейке нет текста (за концом строки или ниже строк).
     */
    public offsetAt(x: number, y: number): number | undefined {
        const lines = this.wrap ? this.wrappedLines(this.layoutSize.width) : [[0, this.text.length] as const];
        const line = lines.at(y);
        if (y < 0 || line === undefined || x < 0) return undefined;
        let column = 0;
        for (const slot of this.displayLine.slots) {
            if (slot.offset < line[0] || slot.offset >= line[1]) continue;
            if (x < column + slot.displayWidth) return slot.offset;
            column += slot.displayWidth;
        }
        return undefined;
    }

    public override render(context: RenderContext): void {
        if (!this.wrap) {
            this.renderLine(context, 0, 0, this.text.length, this.displayLine);
            return;
        }
        const lines = this.wrappedLines(this.layoutSize.width);
        for (let y = 0; y < Math.min(lines.length, this.layoutSize.height); y++) {
            const [start, end] = lines[y];
            this.renderLine(context, y, start, end);
        }
    }

    private renderLine(context: RenderContext, y: number, start: number, end: number, displayLine?: DisplayLine): void {
        const resolved = this.resolvedStyle;
        context.drawText(
            0,
            y,
            this.text.slice(start, end),
            { fg: resolved.fg, bg: resolved.bg, style: StyleFlags.None },
            {
                maxWidth: this.layoutSize.width,
                displayLine,
                getStyle: (offset) => {
                    const charStyle = this.charStyles.get(start + offset);
                    if (charStyle === undefined) return undefined;
                    // Ключи — только для заданных полей: drawText мёржит
                    // спредом, и ключ с undefined затёр бы базовый цвет.
                    const override: { fg?: number; bg?: number; style?: StyleFlags } = {};
                    if (charStyle.fg !== undefined) override.fg = this.resolveColor(charStyle.fg);
                    if (charStyle.bg !== undefined) override.bg = this.resolveColor(charStyle.bg);
                    if (charStyle.style !== undefined) override.style = charStyle.style;
                    return override;
                },
            },
        );
    }
}
