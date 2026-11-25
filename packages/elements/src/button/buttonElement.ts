import { DisplayLine } from "@tuidom/core/common/displayLine";
import { BoxConstraints, Size } from "@tuidom/core/common/geometryPromitives";
import type { TUIEventBase } from "@tuidom/core/dom/events/tuiEventBase";
import { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";
import type { GlyphToken } from "@tuidom/core/dom/glyphTokens";
import { RenderContext, TUIElement } from "@tuidom/core/dom/tuiElement";

import { wrapText } from "../completionlist/completionDetailsElement.ts";

/** `[ ` и ` ]` вокруг подписи; без рамки — по пробелу с каждой стороны. */
const FRAME_WIDTH = 4;
const BARE_FRAME_WIDTH = 2;

/**
 * Подпись кнопки: текст или глиф по токену. Глиф резолвится на рендере через
 * {@link TUIElement.glyph} — кнопка-шеврон рисует тот же символ, что дерево, и
 * следует за таблицей хоста (Nerd Font или нет).
 */
export type ButtonLabel = string | { readonly glyph: GlyphToken };

export interface ButtonElementOptions {
    /**
     * Подпись шире выделенной ширины переносится по словам, а не режется: кнопка
     * растёт в высоту (getMin/MaxIntrinsicHeight по ширине), `[` — в начале первой
     * строки, `]` — в конце последней, фон — на весь прямоугольник. Так кнопки
     * welcome-видов VS Code (`width: 100%`, перенос текста) в узком сайдбаре.
     */
    readonly wrap?: boolean;
    /**
     * Без скобок: ` label ` — по пробелу с каждой стороны, ширина = подпись + 2.
     * Для компактных кнопок-тумблеров в строке поля ввода (`Aa`, `.*`) и
     * иконок-шевронов, где `[ Aa ]` занимает слишком много места.
     */
    readonly bare?: boolean;
}

export class ButtonElement extends TUIElement {
    public onActivate?: () => void;

    private label: ButtonLabel;
    private readonly wrap: boolean;
    private readonly bare: boolean;

    public constructor(label: ButtonLabel, options: ButtonElementOptions = {}) {
        super();
        this.label = label;
        this.wrap = options.wrap ?? false;
        this.bare = options.bare ?? false;
        this.focusable = true;
        // Вся state-логика цвета — в when-вариантах: hover/focus ставит ядро,
        // "checked" (тумблеры) — setChecked. Порядок = приоритет: checked
        // объявлен ПОСЛЕ focus — включённый тумблер выглядит primary
        // независимо от фокуса.
        this.style = {
            fg: "button.secondaryForeground",
            bg: "button.secondaryBackground",
            when: [
                { states: ["hover"], bg: "button.secondaryHoverBackground" },
                { states: ["focus"], fg: "button.foreground", bg: "button.background" },
                { states: ["focus", "hover"], bg: "button.hoverBackground" },
                { states: ["checked"], fg: "button.foreground", bg: "button.background" },
                { states: ["checked", "hover"], bg: "button.hoverBackground" },
            ],
        };

        this.addEventListener("click", (event) => {
            if (event.defaultPrevented) return;
            this.onActivate?.();
        });
    }

    /** Текст подписи; у глифа — символ по ближайшей таблице глифов. */
    public getLabel(): string {
        return typeof this.label === "string" ? this.label : this.glyph(this.label.glyph);
    }

    /** Меняет подпись (шеврон «свёрнуто/развёрнуто»); ширина может измениться. */
    public setLabel(label: ButtonLabel): void {
        this.label = label;
        this.markDirty();
    }

    /** Режим «включённого тумблера» (кнопки-переключатели поиска): primary-вид. */
    public setChecked(checked: boolean): void {
        this.setStyleState("checked", checked);
    }

    public override getMinIntrinsicWidth(_height: number): number {
        return this.getLabel().length + this.frameWidth;
    }

    public override getMaxIntrinsicWidth(_height: number): number {
        return this.getLabel().length + this.frameWidth;
    }

    public override getMinIntrinsicHeight(width: number): number {
        return this.lines(width).length;
    }

    public override getMaxIntrinsicHeight(width: number): number {
        return this.lines(width).length;
    }

    protected override performLayout(constraints: BoxConstraints): Size {
        const width = Math.min(this.getMaxIntrinsicWidth(1), constraints.maxWidth);
        const natural = new Size(width, this.getMaxIntrinsicHeight(width));
        return super.performLayout(BoxConstraints.tight(constraints.constrain(natural)));
    }

    protected override performDefaultAction(event: TUIEventBase): void {
        if (event.type !== "keydown") return;
        const keyEvent = event as TUIKeyboardEvent;
        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
            event.preventDefault();
            this.onActivate?.();
        }
    }

    public override render(context: RenderContext): void {
        const { fg, bg } = this.resolvedStyle;
        const width = this.layoutSize.width;
        const lines = this.lines(width);
        const [open, close] = this.bare ? [" ", " "] : ["[ ", " ]"];
        if (lines.length === 1) {
            context.drawText(0, 0, `${open}${lines[0]}${close}`, { fg, bg }, { maxWidth: width });
            return;
        }
        const last = lines.length - 1;
        for (const [y, line] of lines.entries()) {
            const head = `${y === 0 ? open : " ".repeat(open.length)}${line}`;
            const tail = y === last ? close : "";
            const gap = " ".repeat(Math.max(0, width - new DisplayLine(head).displayWidth - tail.length));
            context.drawText(0, y, head + gap + tail, { fg, bg }, { maxWidth: width });
        }
    }

    /** Строки подписи при ширине `width`; без `wrap` и когда влезает — одна. */
    private lines(width: number): readonly string[] {
        const label = this.getLabel();
        if (!this.wrap || width >= this.getMaxIntrinsicWidth(1)) return [label];
        return wrapText(label, Math.max(1, width - this.frameWidth));
    }

    private get frameWidth(): number {
        return this.bare ? BARE_FRAME_WIDTH : FRAME_WIDTH;
    }
}
