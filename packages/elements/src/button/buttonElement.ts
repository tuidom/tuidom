import { DisplayLine } from "@tuidom/core/common/displayLine";
import { BoxConstraints, Size } from "@tuidom/core/common/geometryPromitives";
import type { TUIEventBase } from "@tuidom/core/dom/events/tuiEventBase";
import { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";
import { RenderContext, TUIElement } from "@tuidom/core/dom/tuiElement";

import { wrapText } from "../completionlist/completionDetailsElement.ts";

/** `[ ` и ` ]` вокруг подписи. */
const FRAME_WIDTH = 4;

export interface ButtonElementOptions {
    /**
     * Подпись шире выделенной ширины переносится по словам, а не режется: кнопка
     * растёт в высоту (getMin/MaxIntrinsicHeight по ширине), `[` — в начале первой
     * строки, `]` — в конце последней, фон — на весь прямоугольник. Так кнопки
     * welcome-видов VS Code (`width: 100%`, перенос текста) в узком сайдбаре.
     */
    readonly wrap?: boolean;
}

export class ButtonElement extends TUIElement {
    public onActivate?: () => void;

    private readonly label: string;
    private readonly wrap: boolean;

    public constructor(label: string, options: ButtonElementOptions = {}) {
        super();
        this.label = label;
        this.wrap = options.wrap ?? false;
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

    public getLabel(): string {
        return this.label;
    }

    /** Режим «включённого тумблера» (кнопки-переключатели поиска): primary-вид. */
    public setChecked(checked: boolean): void {
        this.setStyleState("checked", checked);
    }

    public override getMinIntrinsicWidth(_height: number): number {
        return this.label.length + 4;
    }

    public override getMaxIntrinsicWidth(_height: number): number {
        return this.label.length + 4;
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
        if (lines.length === 1) {
            context.drawText(0, 0, `[ ${this.label} ]`, { fg, bg }, { maxWidth: width });
            return;
        }
        const last = lines.length - 1;
        for (const [y, line] of lines.entries()) {
            const head = `${y === 0 ? "[" : " "} ${line}`;
            const tail = y === last ? " ]" : "";
            const gap = " ".repeat(Math.max(0, width - new DisplayLine(head).displayWidth - tail.length));
            context.drawText(0, y, head + gap + tail, { fg, bg }, { maxWidth: width });
        }
    }

    /** Строки подписи при ширине `width`; без `wrap` и когда влезает — одна. */
    private lines(width: number): readonly string[] {
        if (!this.wrap || width >= this.getMaxIntrinsicWidth(1)) return [this.label];
        return wrapText(this.label, Math.max(1, width - FRAME_WIDTH));
    }
}
