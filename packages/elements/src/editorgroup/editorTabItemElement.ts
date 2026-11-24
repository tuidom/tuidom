import { BoxConstraints, Size } from "@tuidom/core/common/geometryPromitives";
import { StyleFlags } from "@tuidom/core/common/styleFlags";
import type { TUIContextMenuEvent, TUIMouseEvent } from "@tuidom/core/dom/events/tuiMouseEvent";
import { RenderContext, TUIElement } from "@tuidom/core/dom/tuiElement";

const CLOSE_CHAR = "×";
const MODIFIED_CHAR = "●";
/** Rows of a tab: its top line, the label row, and the baseline it stands on. */
export const TAB_HEIGHT = 3;
/** The tab's side lines, one cell each. */
const SIDES = 2;
const LABEL_ROW = 1;
const BASELINE_ROW = 2;

/** Стилевое состояние вкладки удалённого файла (см. {@link EditorTabItemElement.setDeleted}). */
export const DELETED_STATE = "deleted";

/** Стилевое состояние вкладки-предпросмотра (см. {@link EditorTabItemElement.setPreview}). */
export const PREVIEW_STATE = "preview";

export class EditorTabItemElement extends TUIElement {
    private label: string;
    private icon: string;
    private iconColor: number;
    private modified: boolean;
    private readOnly: boolean;
    private deleted: boolean;
    private preview: boolean;
    private paddingLeft: number;
    private paddingRight: number;
    private hovered = false;
    private leadingEdgeValue = false;

    public onActivate: (() => void) | null = null;
    public onClose: (() => void) | null = null;
    /** Правый клик по вкладке — якорь в экранных координатах курсора. */
    public onContextMenu: ((screenX: number, screenY: number) => void) | null = null;

    public constructor(
        label: string,
        icon: string,
        iconColor: number,
        options?: {
            modified?: boolean;
            readOnly?: boolean;
            deleted?: boolean;
            preview?: boolean;
            paddingLeft?: number;
            paddingRight?: number;
        },
    ) {
        super();
        this.label = label;
        this.icon = icon;
        this.iconColor = iconColor;
        this.modified = options?.modified ?? false;
        this.readOnly = options?.readOnly ?? false;
        this.deleted = options?.deleted ?? false;
        this.setStyleState(DELETED_STATE, this.deleted);
        this.preview = options?.preview ?? false;
        this.setStyleState(PREVIEW_STATE, this.preview);
        this.paddingLeft = options?.paddingLeft ?? 1;
        this.paddingRight = options?.paddingRight ?? 1;

        this.addEventListener("click", (event) => {
            const mouseEvent = event;
            // Активируют и закрывают вкладку только левая и средняя кнопки: правый
            // клик обязан лишь открыть контекстное меню, не трогая ни активную
            // вкладку, ни крестик (VS Code так же). Гард — как у остальных
            // виджетов пакета (treeViewElement, listViewElement, quickPickElement).
            if (mouseEvent.button !== "left" && mouseEvent.button !== "middle") return;
            // Middle click closes the tab regardless of where it lands (VSCode behaviour).
            if (mouseEvent.button === "middle") {
                this.onClose?.();
                return;
            }
            const closeStart = this.getCloseButtonStart();
            if (mouseEvent.localX >= closeStart && mouseEvent.localX < closeStart + CLOSE_CHAR.length) {
                this.onClose?.();
            } else {
                this.onActivate?.();
            }
        });

        // Ядро синтезирует "contextmenu" из правого клика (contextMenuEventSource);
        // вкладка только сигналит наружу — меню собирает приложение.
        this.addEventListener("contextmenu", (event) => {
            const contextMenuEvent = event as TUIContextMenuEvent;
            this.onContextMenu?.(contextMenuEvent.screenX, contextMenuEvent.screenY);
        });

        this.addEventListener("mouseenter", () => {
            if (this.hovered) return;
            this.hovered = true;
            this.markDirty();
        });

        this.addEventListener("mouseleave", () => {
            if (!this.hovered) return;
            this.hovered = false;
            this.markDirty();
        });
    }

    public getLabel(): string {
        return this.label;
    }

    public setLabel(label: string): void {
        this.label = label;
        this.markDirty();
    }

    public getIcon(): string {
        return this.icon;
    }

    public setIcon(icon: string, color: number): void {
        this.icon = icon;
        this.iconColor = color;
        this.markDirty();
    }

    public getModified(): boolean {
        return this.modified;
    }

    public setModified(modified: boolean): void {
        if (this.modified === modified) return;
        this.modified = modified;
        this.markDirty();
    }

    public getReadOnly(): boolean {
        return this.readOnly;
    }

    /** Показывает/прячет метку-замок перед именем файла (VS Code read-only tab). */
    public setReadOnly(readOnly: boolean): void {
        if (this.readOnly === readOnly) return;
        this.readOnly = readOnly;
        this.markDirty();
    }

    public getDeleted(): boolean {
        return this.deleted;
    }

    /**
     * Файл вкладки удалён (orphaned-модель VS Code): имя зачёркнуто, а на
     * элементе стоит стилевое состояние {@link DELETED_STATE} — цвет по нему
     * объявляет владелец (`when` в `style`), как VS Code красит удалённый файл
     * декорацией `list.errorForeground`.
     */
    public setDeleted(deleted: boolean): void {
        if (this.deleted === deleted) return;
        this.deleted = deleted;
        this.setStyleState(DELETED_STATE, deleted);
        this.markDirty();
    }

    public getPreview(): boolean {
        return this.preview;
    }

    /**
     * Вкладка-предпросмотр (preview editor VS Code): имя курсивом, на элементе —
     * стилевое состояние {@link PREVIEW_STATE}. Своего цвета у предпросмотра в
     * VS Code нет; состояние — зацепка для владельца, если курсив терминал не
     * рисует (тогда метка выглядит как у обычной вкладки).
     */
    public setPreview(preview: boolean): void {
        if (this.preview === preview) return;
        this.preview = preview;
        this.setStyleState(PREVIEW_STATE, preview);
        this.markDirty();
    }

    public getLeadingEdge(): boolean {
        return this.leadingEdgeValue;
    }

    /**
     * The tab stands at the very start of the strip, its left side over the frame's left side: the
     * baseline cell under it is the frame's side going on (`│`) for the active tab, and the
     * frame's side meeting the baseline (`├`) for an inactive one.
     */
    public setLeadingEdge(value: boolean): void {
        if (this.leadingEdgeValue === value) return;
        this.leadingEdgeValue = value;
        this.markDirty();
    }

    public getPaddingLeft(): number {
        return this.paddingLeft;
    }

    public setPaddingLeft(value: number): void {
        this.paddingLeft = value;
        this.markDirty();
    }

    public getPaddingRight(): number {
        return this.paddingRight;
    }

    public setPaddingRight(value: number): void {
        this.paddingRight = value;
        this.markDirty();
    }

    // ─── Content Layout ───

    private getContentWidth(): number {
        // [paddingLeft][icon " "][lock " "][label][" ●/×"][paddingRight]
        // The trailing slot shows the modified dot OR the close cross — never both —
        // so the tab width stays stable regardless of modified/hover state. The lock
        // is the one part that does change the width: read-only is a rare, sticky
        // state, and squeezing it into an existing slot would hide the file icon.
        const iconPart = this.icon.length > 0 ? this.icon.length + 1 : 0; // icon + space
        const lockPart = this.readOnly ? 2 : 0; // lock (one cell, see GLYPH_TOKEN_DEFAULTS) + space
        const trailingPart = 2; // " ●" or " ×"
        return SIDES + this.paddingLeft + iconPart + lockPart + this.label.length + trailingPart + this.paddingRight;
    }

    private getCloseButtonStart(): number {
        return this.getContentWidth() - 1 - this.paddingRight - CLOSE_CHAR.length;
    }

    // ─── Intrinsic Size ───

    public override getMinIntrinsicWidth(_height: number): number {
        return this.getContentWidth();
    }

    public override getMaxIntrinsicWidth(_height: number): number {
        return this.getContentWidth();
    }

    public override getMinIntrinsicHeight(_width: number): number {
        return TAB_HEIGHT;
    }

    public override getMaxIntrinsicHeight(_width: number): number {
        return TAB_HEIGHT;
    }

    protected override performLayout(constraints: BoxConstraints): Size {
        const natural = new Size(this.getMaxIntrinsicWidth(1), this.getMaxIntrinsicHeight(0));
        return super.performLayout(BoxConstraints.tight(constraints.constrain(natural)));
    }

    // ─── Render ───

    /**
     * A tab is a box three rows tall: `╭──╮` on top, `│ label × │`, and the baseline. The active
     * tab opens into the editor below (`╯  ╰`); an inactive one stands on the baseline (`┴──┴`),
     * which runs on under the free space of the strip and is the editor frame's top line.
     */
    public override render(context: RenderContext): void {
        const width = this.layoutSize.width;
        const resolved = this.resolvedStyle;
        const bg = resolved.bg;
        const border = this.styleVar("tab.border");
        const active = this.hasStyleState("active");

        for (let y = 0; y < TAB_HEIGHT; y++) {
            for (let x = 0; x < width; x++) context.setCell(x, y, { char: " ", fg: resolved.fg, bg });
        }
        if (width < SIDES) return;
        const right = width - 1;

        context.setCell(0, 0, { char: "╭", fg: border, bg });
        context.setCell(right, 0, { char: "╮", fg: border, bg });
        for (let x = 1; x < right; x++) context.setCell(x, 0, { char: "─", fg: border, bg });
        context.setCell(0, LABEL_ROW, { char: "│", fg: border, bg });
        context.setCell(right, LABEL_ROW, { char: "│", fg: border, bg });

        const leftFoot = this.leadingEdgeValue ? (active ? "│" : "├") : active ? "╯" : "┴";
        context.setCell(0, BASELINE_ROW, { char: leftFoot, fg: border, bg });
        context.setCell(right, BASELINE_ROW, { char: active ? "╰" : "┴", fg: border, bg });
        if (!active) {
            for (let x = 1; x < right; x++) context.setCell(x, BASELINE_ROW, { char: "─", fg: border, bg });
        }

        this.renderLabelRow(context, right);
    }

    /** `[paddingLeft][icon ][lock ][label][ ●/×][paddingRight]` between the side lines. */
    private renderLabelRow(context: RenderContext, end: number): void {
        const resolved = this.resolvedStyle;
        const fg = resolved.fg;
        const bg = resolved.bg;
        const y = LABEL_ROW;
        let x = 1 + this.paddingLeft;

        if (this.icon.length > 0 && x < end) {
            context.setCell(x, y, { char: this.icon, fg: this.iconColor, bg });
            x += this.icon.length + 1;
        }

        // Read-only lock, between the file icon and the label.
        if (this.readOnly && x < end) {
            // Codicon-замок по умолчанию — тот же глиф, которым VS Code метит read-only вкладку.
            context.setCell(x, y, { char: this.glyph("editorTab.readOnly"), fg, bg });
            x += 2;
        }

        // Label — struck through when the file is gone (VS Code strikethrough decoration),
        // italic while the tab is a preview (VS Code preview editor).
        const labelStyle =
            (this.deleted ? StyleFlags.Strikethrough : StyleFlags.None) |
            (this.preview ? StyleFlags.Italic : StyleFlags.None);
        for (let i = 0; i < this.label.length && x < end; i++) {
            context.setCell(x, y, { char: this.label[i], fg, bg, style: labelStyle });
            x += 1;
        }

        // Trailing indicator: the modified dot until the tab is hovered, then
        // the close cross (VSCode behaviour). Clicking the slot always closes.
        const trailingChar = this.modified && !this.hovered ? MODIFIED_CHAR : CLOSE_CHAR;
        if (x + 1 < end) {
            context.setCell(x + 1, y, { char: trailingChar, fg, bg, style: StyleFlags.None });
        }
    }
}
