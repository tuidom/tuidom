import { DisplayLine } from "@tuidom/core/common/displayLine";
import { BoxConstraints, Point, Rect, Size } from "@tuidom/core/common/geometryPromitives";
import type { TUIEventBase } from "@tuidom/core/dom/events/tuiEventBase";
import { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";
import type { TUIPasteEvent } from "@tuidom/core/dom/events/tuiPasteEvent";
import { RenderContext, TUIElement } from "@tuidom/core/dom/tuiElement";

import { InputState } from "./inputState.ts";

/** A line of the value as `[start, end)` code units, without its line break. */
type LineRange = readonly [number, number];

/**
 * Text input widget: one line, or several with {@link InputElement.multiline}.
 *
 * By default rendered without a border — just a plain editable text line.
 * Set `showBorder = true` to get a Unicode box-drawing frame around it.
 * The border colour changes between focused (#007FD4) and unfocused (#3C3C3C).
 *
 * Usage:
 *   const input = new InputElement();
 *   input.placeholder = "Search…";
 *   input.onChange = value => console.log(value);
 */
export class InputElement extends TUIElement {
    public readonly inputState: InputState;
    public placeholder: string | undefined = undefined;
    public showBorder = false;
    /**
     * Маска поля пароля: каждый графемный кластер значения рисуется этой
     * строкой, сам текст на экран не попадает и не отдаётся инспектору.
     * `undefined` — обычное поле. Модель (`inputState`) хранит настоящий текст:
     * маска — это только представление, редактирование и `onChange` работают
     * по-прежнему с реальным значением.
     */
    public maskChar: string | undefined = undefined;
    public onChange: ((value: string) => void) | undefined = undefined;
    /**
     * Многострочное поле: `\n` значения — перевод строки, поле растёт по числу
     * строк до {@link maxVisibleLines} и прокручивается к курсору; стрелки
     * вверх/вниз ходят по строкам, Home/End — по началу и концу строки, вставка
     * сохраняет переводы строк. Перевод строки по клавише вставляет владелец
     * (`inputState.insert("\n")`): у кого-то это Enter, у кого-то Shift+Enter.
     * Стрелка вверх на первой строке и вниз на последней полем не съедаются.
     */
    public multiline = false;
    /** Предел высоты многострочного поля в строках текста. */
    public maxVisibleLines = 10;

    private scrollX = 0;
    private scrollY = 0;

    public constructor(inputState?: InputState) {
        super();
        this.inputState = inputState ?? new InputState();
        this.focusable = true;
        // Цвета — токены темы (Н3); рамка в фокусе перекрашивается тем, что
        // ядро ставит focus-состояние и перерезолвит стиль (render дёргается).
        this.style = { fg: "input.foreground", bg: "input.background" };
    }

    /**
     * Наблюдаемость для инспектора/e2e: текст, курсор, выделение, плейсхолдер.
     * Под маской (`maskChar`) отдаётся ровно то, что на экране, — секрет наружу
     * не уходит; `cursorOffset` при этом тоже смещение в маске.
     */
    public override inspectState(): Record<string, unknown> {
        const view = this.displayView();
        return {
            value: view.text,
            cursorOffset: view.cursorOffset,
            hasSelection: this.inputState.hasSelection,
            showsPlaceholder: this.inputState.value.length === 0 && this.placeholder !== undefined,
        };
    }

    /**
     * Что рисуем и где в нарисованном стоят курсор и выделение.
     *
     * Без маски — сам текст и его же смещения. С маской — по одному
     * {@link maskChar} на графемный кластер, а смещения пересчитаны в этот новый
     * текст: курсор за N-й графемой стоит за N-й маской. Смещения считаем через
     * длину самой маски, а не «одна графема = один символ», — маской может быть
     * и многокодовый глиф.
     */
    private displayView(): { text: string; cursorOffset: number; selectionStart: number; selectionEnd: number } {
        const state = this.inputState;
        const mask = this.maskChar;
        if (mask === undefined) {
            return {
                text: state.text,
                cursorOffset: state.cursorOffset,
                selectionStart: state.selectionStart,
                selectionEnd: state.selectionEnd,
            };
        }
        const slots = new DisplayLine(state.text).slots;
        const toMask = (offset: number): number => slots.filter((slot) => slot.offset < offset).length * mask.length;
        return {
            text: mask.repeat(slots.length),
            cursorOffset: toMask(state.cursorOffset),
            selectionStart: toMask(state.selectionStart),
            selectionEnd: toMask(state.selectionEnd),
        };
    }

    /** Строки значения: у однострочного поля — одна, во всё значение. */
    private lineRanges(text: string): LineRange[] {
        if (!this.multiline) return [[0, text.length]];
        const ranges: LineRange[] = [];
        let start = 0;
        for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", start)) {
            ranges.push([start, i]);
            start = i + 1;
        }
        ranges.push([start, text.length]);
        return ranges;
    }

    private static lineIndexOf(ranges: readonly LineRange[], offset: number): number {
        // Строки идут по возрастанию и разделены переводом строки: смещение принадлежит первой, что его накрывает.
        // The last line ends at the end of the value: every offset of it is covered.
        return ranges.findIndex(([, end]) => offset <= end);
    }

    /** Строк в значении (у однострочного поля — 1). */
    public get lineCount(): number {
        return this.lineRanges(this.inputState.text).length;
    }

    /** Строка курсора, с нуля. */
    public get cursorLine(): number {
        const state = this.inputState;
        return InputElement.lineIndexOf(this.lineRanges(state.text), state.cursorOffset);
    }

    private get visibleLines(): number {
        return this.multiline ? Math.max(1, Math.min(this.lineCount, this.maxVisibleLines)) : 1;
    }

    // ─── Layout ─────────────────────────────────────────────────────────────

    public override getMinIntrinsicWidth(_height: number): number {
        return this.showBorder ? 5 : 3;
    }

    public override getMinIntrinsicHeight(_width: number): number {
        return this.visibleLines + (this.showBorder ? 2 : 0);
    }

    public override getMaxIntrinsicHeight(width: number): number {
        return this.getMinIntrinsicHeight(width);
    }

    protected override performLayout(constraints: BoxConstraints): Size {
        const height = this.getMaxIntrinsicHeight(0);
        const width = Number.isFinite(constraints.maxWidth) ? constraints.maxWidth : Math.max(constraints.minWidth, 20);
        return super.performLayout(BoxConstraints.tight(constraints.constrain(new Size(width, height))));
    }

    // ─── Render ─────────────────────────────────────────────────────────────

    public override render(context: RenderContext): void {
        const w = this.layoutSize.width;
        const h = this.layoutSize.height;
        // Рисуем ПРЕДСТАВЛЕНИЕ значения: без маски это сам текст, под маской —
        // её символы со смещениями, пересчитанными в них.
        const view = this.displayView();
        const text = view.text;
        const focused = this.isFocused;

        const contentXStart = this.showBorder ? 1 : 0;
        const contentYStart = this.showBorder ? 1 : 0;
        const contentWidth = w - (this.showBorder ? 2 : 0);
        const contentHeight = Math.max(1, h - (this.showBorder ? 2 : 0));

        if (contentWidth <= 0) return;

        const ranges = this.lineRanges(text);
        const cursorLine = InputElement.lineIndexOf(ranges, view.cursorOffset);
        const [cursorLineStart, cursorLineEnd] = ranges[cursorLine];
        const cursorLineText = new DisplayLine(text.slice(cursorLineStart, cursorLineEnd));

        // Update horizontal scroll to keep cursor visible
        const cursorCol = cursorLineText.offsetToColumn(view.cursorOffset - cursorLineStart);
        const widest = Math.max(...ranges.map(([start, end]) => new DisplayLine(text.slice(start, end)).displayWidth));
        // Text that got shorter brings the scroll back: nothing stays hidden while it fits, the end cell is the cursor's.
        this.scrollX = Math.min(this.scrollX, Math.max(0, widest + 1 - contentWidth));
        if (cursorCol < this.scrollX) {
            this.scrollX = cursorCol;
        } else if (cursorCol >= this.scrollX + contentWidth) {
            this.scrollX = cursorCol - contentWidth + 1;
        }
        // The same for the lines: fewer lines bring the scroll back, the cursor's line stays in view.
        this.scrollY = Math.min(this.scrollY, Math.max(0, ranges.length - contentHeight));
        if (cursorLine < this.scrollY) {
            this.scrollY = cursorLine;
        } else if (cursorLine >= this.scrollY + contentHeight) {
            this.scrollY = cursorLine - contentHeight + 1;
        }

        // Draw border
        if (this.showBorder) {
            this.renderBorder(context, w, h, focused);
        }

        const { fg, bg } = this.resolvedStyle;
        for (let row = 0; row < contentHeight; row++) {
            const y = contentYStart + row;
            // Fill content row background
            for (let x = contentXStart; x < contentXStart + contentWidth; x++) {
                context.setCell(x, y, { char: " ", fg, bg });
            }
            // Content area clip (screen-space coordinates)
            const contentClip = new Rect(
                new Point(this.globalPosition.x + contentXStart, this.globalPosition.y + y),
                new Size(contentWidth, 1),
            );
            const textContext = context.withClip(contentClip);

            if (text.length === 0) {
                // Draw the placeholder
                if (row === 0 && this.placeholder !== undefined) {
                    textContext.drawText(contentXStart, y, this.placeholder, {
                        fg: this.styleVar("input.placeholderForeground"),
                        bg,
                    });
                }
                continue;
            }
            const range = ranges[this.scrollY + row] as LineRange | undefined;
            if (range === undefined) continue;
            this.renderLine(textContext, text, range, view, contentXStart, y);
        }

        // Hardware cursor
        if (focused) {
            const cursorX = contentXStart + (cursorCol - this.scrollX);
            /* v8 ignore start -- the scrolls were just adjusted above to keep the cursor within the content, so it is always in bounds here; the false side is unreachable */
            if (cursorX >= contentXStart && cursorX < contentXStart + contentWidth) {
                context.setCursorPosition(cursorX, contentYStart + cursorLine - this.scrollY);
            }
            /* v8 ignore stop */
        }
    }

    /** One line of the value with the part of the selection that falls on it. */
    private renderLine(
        context: RenderContext,
        text: string,
        [start, end]: LineRange,
        view: { selectionStart: number; selectionEnd: number },
        contentXStart: number,
        y: number,
    ): void {
        const line = text.slice(start, end);
        const { fg, bg } = this.resolvedStyle;
        const x = contentXStart - this.scrollX;
        // Границы выделения берём из представления: под маской они смещения в
        // ней, а `text` — тоже она.
        const selStart = Math.max(start, view.selectionStart) - start;
        const selEnd = Math.min(end, view.selectionEnd) - start;
        if (!this.inputState.hasSelection || selStart >= selEnd) {
            context.drawText(x, y, line, { fg, bg });
            return;
        }
        const dl = new DisplayLine(line);
        const before = line.slice(0, selStart);
        const after = line.slice(selEnd);
        if (before.length > 0) {
            context.drawText(x, y, before, { fg, bg });
        }
        context.drawText(x + dl.offsetToColumn(selStart), y, line.slice(selStart, selEnd), {
            fg,
            bg: this.styleVar("input.selectionBackground"),
        });
        if (after.length > 0) {
            context.drawText(x + dl.offsetToColumn(selEnd), y, after, { fg, bg });
        }
    }

    private renderBorder(context: RenderContext, w: number, h: number, focused: boolean): void {
        const borderFg = this.styleVar(focused ? "focusBorder" : "input.border");
        context.drawBox(0, 0, w, h, { fg: borderFg, bg: this.resolvedStyle.bg });
    }

    // ─── Input ──────────────────────────────────────────────────────────────

    protected override performDefaultAction(event: TUIEventBase): void {
        if (event.type === "paste") {
            // Single-line field: flatten any newlines from the pasted block into spaces; a multi-line one keeps them.
            const pasted = (event as TUIPasteEvent).text;
            const text = this.multiline ? pasted.replace(/\r\n?/g, "\n") : pasted.replace(/\n/g, " ");
            if (text !== "") {
                event.preventDefault();
                this.inputState.insert(text);
                this.onChange?.(this.inputState.value);
                this.markDirty();
            }
            return;
        }
        if (event.type !== "keydown") {
            // Non-keydown events (notably mousedown) fall through to the base
            // handler, which focuses a tabbable element — so a click focuses the
            // field. Without this, the input could only be focused programmatically.
            super.performDefaultAction(event);
            return;
        }
        const keyEvent = event as TUIKeyboardEvent;

        if (keyEvent.key === "Backspace") {
            event.preventDefault();
            this.inputState.deleteLeft();
            this.onChange?.(this.inputState.value);
            this.markDirty();
        } else if (keyEvent.key === "Delete") {
            event.preventDefault();
            this.inputState.deleteRight();
            this.onChange?.(this.inputState.value);
            this.markDirty();
        } else if (keyEvent.key === "ArrowLeft") {
            event.preventDefault();
            this.inputState.moveCursorLeft();
            this.markDirty();
        } else if (keyEvent.key === "ArrowRight") {
            event.preventDefault();
            this.inputState.moveCursorRight();
            this.markDirty();
        } else if (keyEvent.key === "Home") {
            event.preventDefault();
            if (this.multiline) this.inputState.moveCursorTo(this.cursorLineRange()[0]);
            else this.inputState.moveCursorToStart();
            this.markDirty();
        } else if (keyEvent.key === "End") {
            event.preventDefault();
            if (this.multiline) this.inputState.moveCursorTo(this.cursorLineRange()[1]);
            else this.inputState.moveCursorToEnd();
            this.markDirty();
        } else if (this.multiline && (keyEvent.key === "ArrowUp" || keyEvent.key === "ArrowDown")) {
            this.moveCursorVertically(event, keyEvent.key === "ArrowUp" ? -1 : 1);
        } else if (keyEvent.key.length === 1 && !keyEvent.ctrlKey && !keyEvent.altKey) {
            event.preventDefault();
            this.inputState.insert(keyEvent.key);
            this.onChange?.(this.inputState.value);
            this.markDirty();
        }
    }

    private cursorLineRange(): LineRange {
        const state = this.inputState;
        const ranges = this.lineRanges(state.text);
        return ranges[InputElement.lineIndexOf(ranges, state.cursorOffset)];
    }

    /** To the same column of the next line up or down; past the first or the last line the key is the owner's. */
    private moveCursorVertically(event: TUIEventBase, delta: -1 | 1): void {
        const state = this.inputState;
        const ranges = this.lineRanges(state.text);
        const line = InputElement.lineIndexOf(ranges, state.cursorOffset);
        const target = ranges[line + delta] as LineRange | undefined;
        if (target === undefined) return;
        event.preventDefault();
        const [start, end] = ranges[line];
        const column = new DisplayLine(state.text.slice(start, end)).offsetToColumn(state.cursorOffset - start);
        const targetLine = new DisplayLine(state.text.slice(target[0], target[1]));
        state.moveCursorTo(target[0] + targetLine.columnToOffset(column));
        this.markDirty();
    }
}
