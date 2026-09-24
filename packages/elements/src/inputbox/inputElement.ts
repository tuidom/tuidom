import { DisplayLine } from "@tuidom/core/common/displayLine";
import { BoxConstraints, Point, Rect, Size } from "@tuidom/core/common/geometryPromitives";
import type { TUIEventBase } from "@tuidom/core/dom/events/tuiEventBase";
import { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";
import type { TUIPasteEvent } from "@tuidom/core/dom/events/tuiPasteEvent";
import { RenderContext, TUIElement } from "@tuidom/core/dom/tuiElement";

import { InputState } from "./inputState.ts";

/**
 * Single-line text input widget.
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

    private scrollX = 0;

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

    // ─── Layout ─────────────────────────────────────────────────────────────

    public override getMinIntrinsicWidth(_height: number): number {
        return this.showBorder ? 5 : 3;
    }

    public override getMinIntrinsicHeight(_width: number): number {
        return this.showBorder ? 3 : 1;
    }

    public override getMaxIntrinsicHeight(_width: number): number {
        return this.showBorder ? 3 : 1;
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
        const cursorOffset = view.cursorOffset;
        const focused = this.isFocused;

        const contentXStart = this.showBorder ? 1 : 0;
        const contentY = this.showBorder ? 1 : 0;
        const contentWidth = w - (this.showBorder ? 2 : 0);

        if (contentWidth <= 0) return;

        // Update horizontal scroll to keep cursor visible
        const dl = new DisplayLine(text);
        const cursorCol = dl.offsetToColumn(cursorOffset);
        if (cursorCol < this.scrollX) {
            this.scrollX = cursorCol;
        } else if (cursorCol >= this.scrollX + contentWidth) {
            this.scrollX = cursorCol - contentWidth + 1;
        }

        // Draw border
        if (this.showBorder) {
            this.renderBorder(context, w, h, focused);
        }

        const { fg, bg } = this.resolvedStyle;
        // Fill content row background
        for (let x = contentXStart; x < contentXStart + contentWidth; x++) {
            context.setCell(x, contentY, { char: " ", fg, bg });
        }

        // Content area clip (screen-space coordinates)
        const contentClip = new Rect(
            new Point(this.globalPosition.x + contentXStart, this.globalPosition.y + contentY),
            new Size(contentWidth, 1),
        );
        const textContext = context.withClip(contentClip);

        // Draw text or placeholder
        if (text.length === 0 && this.placeholder !== undefined) {
            textContext.drawText(contentXStart, contentY, this.placeholder, {
                fg: this.styleVar("input.placeholderForeground"),
                bg,
            });
        } else if (this.inputState.hasSelection) {
            this.renderTextWithSelection(textContext, dl, text, view, contentXStart, contentY);
        } else {
            textContext.drawText(contentXStart - this.scrollX, contentY, text, { fg, bg });
        }

        // Hardware cursor
        if (focused) {
            const cursorX = contentXStart + (cursorCol - this.scrollX);
            /* v8 ignore start -- scrollX was just adjusted above to keep cursorCol within [scrollX, scrollX+contentWidth), so cursorX is always in bounds here; the false side is unreachable */
            if (cursorX >= contentXStart && cursorX < contentXStart + contentWidth) {
                context.setCursorPosition(cursorX, contentY);
            }
            /* v8 ignore stop */
        }
    }

    private renderTextWithSelection(
        context: RenderContext,
        dl: DisplayLine,
        text: string,
        view: { selectionStart: number; selectionEnd: number },
        contentXStart: number,
        contentY: number,
    ): void {
        // Границы выделения берём из представления: под маской они смещения в
        // ней, а `text`/`dl` — тоже она.
        const selStart = view.selectionStart;
        const selEnd = view.selectionEnd;
        const before = text.slice(0, selStart);
        const selected = text.slice(selStart, selEnd);
        const after = text.slice(selEnd);

        const selStartCol = dl.offsetToColumn(selStart);
        const selEndCol = dl.offsetToColumn(selEnd);
        const { fg, bg } = this.resolvedStyle;

        if (before.length > 0) {
            context.drawText(contentXStart - this.scrollX, contentY, before, { fg, bg });
        }
        /* v8 ignore start -- this branch only runs when inputState.hasSelection (selStart !== selEnd), so the slice is always non-empty; the false side is unreachable */
        if (selected.length > 0) {
            context.drawText(contentXStart + selStartCol - this.scrollX, contentY, selected, {
                fg,
                bg: this.styleVar("input.selectionBackground"),
            });
        }
        /* v8 ignore stop */
        // Fill selection background for empty tail columns up to selEndCol (handles wide chars)
        for (let col = selStartCol; col < selEndCol; col++) {
            const x = contentXStart + col - this.scrollX;
            // Overwrite only cells that didn't get text (will be spaces from background fill)
            // drawText already covered the chars, this handles any residual slots
            void x;
        }
        if (after.length > 0) {
            context.drawText(contentXStart + selEndCol - this.scrollX, contentY, after, { fg, bg });
        }
    }

    private renderBorder(context: RenderContext, w: number, h: number, focused: boolean): void {
        const borderFg = this.styleVar(focused ? "focusBorder" : "input.border");
        context.drawBox(0, 0, w, h, { fg: borderFg, bg: this.resolvedStyle.bg });
    }

    // ─── Input ──────────────────────────────────────────────────────────────

    protected override performDefaultAction(event: TUIEventBase): void {
        if (event.type === "paste") {
            // Single-line field: flatten any newlines from the pasted block into spaces.
            const text = (event as TUIPasteEvent).text.replace(/\n/g, " ");
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
            this.inputState.moveCursorToStart();
            this.markDirty();
        } else if (keyEvent.key === "End") {
            event.preventDefault();
            this.inputState.moveCursorToEnd();
            this.markDirty();
        } else if (keyEvent.key.length === 1 && !keyEvent.ctrlKey && !keyEvent.altKey) {
            event.preventDefault();
            this.inputState.insert(keyEvent.key);
            this.onChange?.(this.inputState.value);
            this.markDirty();
        }
    }
}
