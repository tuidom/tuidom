import { BoxConstraints, Size } from "@tuidom/core/common/geometryPromitives";
import type { RenderContext } from "@tuidom/core/dom/tuiElement";
import { TUIElement } from "@tuidom/core/dom/tuiElement";

import { FillerElement } from "../layout/fillerElement.ts";
import { HFlexElement, hflexFill, hflexFit } from "../layout/hFlexElement.ts";

import { DELETED_STATE, EditorTabItemElement, TAB_HEIGHT } from "./editorTabItemElement.ts";

// ─── Tab Info ───

export interface TabInfo {
    label: string;
    icon: string;
    iconColor: number;
    isModified: boolean;
    /** Read-only буфер — вкладка получает метку-замок. */
    isReadOnly: boolean;
    /**
     * Файл вкладки удалён с диска: имя зачёркнуто и окрашено
     * `list.errorForeground` (как orphaned-вкладка VS Code).
     */
    isDeleted?: boolean;
    /**
     * Вкладка-предпросмотр: следующее открытие превью её заменит. Имя —
     * курсивом (как preview editor VS Code).
     */
    isPreview?: boolean;
}

// ─── EditorTabStripElement ───

/**
 * Tabs as boxes standing on a baseline, three rows tall. The baseline is the top line of the
 * editor's frame: the strip spans the frame's full width, its first column is the frame's left
 * side (the first tab's left side goes on into it) and, with {@link endCorner}, its last column
 * closes the frame with `╮`. Above the baseline, beside the tabs, lies the workbench surface
 * (`editorGroupHeader.tabsBackground`).
 */
export class EditorTabStripElement extends TUIElement {
    private hflex: HFlexElement;
    private itemElements: EditorTabItemElement[] = [];
    private filler: FillerElement;
    private activeIndexValue = -1;
    private endCornerValue = true;

    public onTabActivate: ((index: number) => void) | null = null;
    public onTabClose: ((index: number) => void) | null = null;
    /**
     * Правый клик по вкладке: индекс вкладки под курсором и якорь меню в
     * экранных координатах. Виджет только сигналит — меню собирает приложение
     * (как {@link TreeViewElement.onContextMenu}).
     */
    public onTabContextMenu: ((index: number, screenX: number, screenY: number) => void) | null = null;

    public constructor() {
        super();
        this.hflex = new HFlexElement();
        this.filler = new FillerElement();
        this.filler.style = { bg: "editorGroupHeader.tabsBackground" };
        this.hflex.addChild(this.filler, { width: hflexFill(), height: TAB_HEIGHT });
        this.appendChild(this.hflex);
    }

    public get activeIndex(): number {
        return this.activeIndexValue;
    }

    public set activeIndex(value: number) {
        if (this.activeIndexValue === value) return;
        this.activeIndexValue = value;
        this.updateItemStyles();
        this.markDirty();
    }

    /**
     * The strip's last column is the frame's top-right corner `╮`. Off when something else follows
     * the strip on the same rows (editor title actions) and closes the frame itself.
     */
    public get endCorner(): boolean {
        return this.endCornerValue;
    }

    public set endCorner(value: boolean) {
        if (this.endCornerValue === value) return;
        this.endCornerValue = value;
        this.markDirty();
    }

    /** Observable state: tab labels with active/modified/readonly/deleted/preview flags. */
    public override inspectState(): Record<string, unknown> {
        return {
            activeIndex: this.activeIndexValue,
            tabs: this.itemElements.map((item, i) => ({
                label: item.getLabel(),
                active: i === this.activeIndexValue,
                modified: item.getModified(),
                readOnly: item.getReadOnly(),
                deleted: item.getDeleted(),
                preview: item.getPreview(),
            })),
        };
    }

    public getItemElements(): readonly EditorTabItemElement[] {
        return this.itemElements;
    }

    public setTabs(tabs: TabInfo[]): void {
        const newItems: EditorTabItemElement[] = [];

        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            let item: EditorTabItemElement;

            if (i < this.itemElements.length) {
                item = this.itemElements[i];
                item.setLabel(tab.label);
                item.setIcon(tab.icon, tab.iconColor);
                item.setModified(tab.isModified);
                item.setReadOnly(tab.isReadOnly);
                item.setDeleted(tab.isDeleted ?? false);
                item.setPreview(tab.isPreview ?? false);
            } else {
                item = new EditorTabItemElement(tab.label, tab.icon, tab.iconColor, {
                    modified: tab.isModified,
                    readOnly: tab.isReadOnly,
                    deleted: tab.isDeleted ?? false,
                    preview: tab.isPreview ?? false,
                    paddingLeft: 1,
                    paddingRight: 1,
                });
                // Вкладка декларирует оба вида токенами; активность — состояние.
                // Удалённый файл красится поверх любой активности (запись позже —
                // приоритет выше), как декорация VS Code.
                // Every tab is cut from the editor's surface (the active tab's background): the
                // boxes, not a fill, tell tabs apart; activity shows in the label and the open foot.
                item.style = {
                    fg: "tab.inactiveForeground",
                    bg: "tab.activeBackground",
                    when: [
                        { states: ["active"], fg: "tab.activeForeground" },
                        { states: [DELETED_STATE], fg: "list.errorForeground" },
                    ],
                };
                const index = i;
                item.onActivate = () => this.onTabActivate?.(index);
                item.onClose = () => this.onTabClose?.(index);
                item.onContextMenu = (screenX, screenY) => this.onTabContextMenu?.(index, screenX, screenY);
            }

            newItems.push(item);
        }

        this.itemElements = newItems;
        this.rebuildHFlex();
        this.updateItemStyles();
        this.markDirty();
    }

    private rebuildHFlex(): void {
        const children: TUIElement[] = [];

        for (const item of this.itemElements) {
            item.layoutStyle = { width: hflexFit(), height: TAB_HEIGHT };
            children.push(item);
        }

        this.filler.layoutStyle = { width: hflexFill(), height: TAB_HEIGHT };
        children.push(this.filler);

        this.hflex.replaceChildren(children);
    }

    private updateItemStyles(): void {
        for (let i = 0; i < this.itemElements.length; i++) {
            this.itemElements[i].setStyleState("active", i === this.activeIndexValue);
            this.itemElements[i].setLeadingEdge(i === 0);
        }
    }

    // ─── Children ───

    // ─── Intrinsic Size ───

    public override getMinIntrinsicWidth(height: number): number {
        return this.hflex.getMinIntrinsicWidth(height);
    }

    public override getMaxIntrinsicWidth(height: number): number {
        return this.hflex.getMaxIntrinsicWidth(height);
    }

    public override getMinIntrinsicHeight(_width: number): number {
        return TAB_HEIGHT;
    }

    public override getMaxIntrinsicHeight(_width: number): number {
        return TAB_HEIGHT;
    }

    // ─── Layout ───

    protected override performLayout(constraints: BoxConstraints): Size {
        const containerSize = super.performLayout(constraints);

        this.layoutChild(this.hflex, 0, 0, BoxConstraints.tight(new Size(containerSize.width, TAB_HEIGHT)));

        return containerSize;
    }

    // ─── Render ───

    public override render(context: RenderContext): void {
        this.renderChildren(context);
        // The baseline under the free space: the frame's top line, on the editor's surface.
        const width = this.layoutSize.width;
        const border = this.styleVar("tab.border");
        const bg = this.styleVar("tab.activeBackground");
        const baseline = TAB_HEIGHT - 1;
        const tabsEnd = this.itemElements.reduce((end, item) => end + item.layoutSize.width, 0);
        for (let x = tabsEnd; x < width; x++) context.setCell(x, baseline, { char: "─", fg: border, bg });
        // No tabs: the baseline itself starts the frame's left side.
        if (this.itemElements.length === 0 && width > 0) {
            context.setCell(0, baseline, { char: "╭", fg: border, bg });
        }
        if (this.endCornerValue && width > 1) context.setCell(width - 1, baseline, { char: "╮", fg: border, bg });
    }
}
