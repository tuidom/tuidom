import { BoxConstraints, Offset, Size } from "@tuidom/core/common/geometryPromitives";
import { StyleFlags } from "@tuidom/core/common/styleFlags";
import { ROOT_STYLE_CONTEXT } from "@tuidom/core/dom/styles/tuiStyle";
import { RenderContext } from "@tuidom/core/dom/tuiElement";
import type { CellPatch } from "@tuidom/core/rendering/grid";
import { TerminalScreen } from "@tuidom/core/rendering/terminalScreen";
import { describe, expect, it } from "vitest";

import { DELETED_STATE, EditorTabItemElement } from "./editorTabItemElement.ts";

// Записывающий контекст — style ячеек MockTerminalBackend наружу не отдаёт.
class RecordingContext extends RenderContext {
    public readonly calls: { x: number; patch: CellPatch }[] = [];
    public override setCell(x: number, y: number, patch: CellPatch): void {
        this.calls.push({ x, patch });
        super.setCell(x, y, patch);
    }
    /** Последний патч ячейки — фон заливается первым, поверх ложится содержимое. */
    public patchAt(x: number): CellPatch | undefined {
        return this.calls.findLast((c) => c.x === x)?.patch;
    }
}

function render(tab: EditorTabItemElement): RecordingContext {
    const size = new Size(tab.getMaxIntrinsicWidth(1), 1);
    const context = new RecordingContext(new TerminalScreen(size));
    tab.localPosition = new Offset(0, 0);
    tab.layout(BoxConstraints.tight(size));
    tab.performStyleResolution(ROOT_STYLE_CONTEXT);
    tab.render(context);
    return context;
}

const ICON = "";

describe("EditorTabItemElement — удалённый файл", () => {
    it("зачёркивает только имя: иконка и крестик — без зачёркивания", () => {
        // [1 pad][icon][space][a.ts][space][×][1 pad]
        const context = render(new EditorTabItemElement("a.ts", ICON, 0, { deleted: true }));
        for (let x = 3; x < 7; x++) {
            expect(context.patchAt(x)?.style, `колонка имени ${String(x)}`).toBe(StyleFlags.Strikethrough);
        }
        expect(context.patchAt(1)?.char).toBe(ICON);
        expect(context.patchAt(1)?.style ?? StyleFlags.None).toBe(StyleFlags.None);
        expect(context.patchAt(8)?.char).toBe("×");
        expect(context.patchAt(8)?.style).toBe(StyleFlags.None);
    });

    it("живой файл рисуется без зачёркивания", () => {
        const context = render(new EditorTabItemElement("a.ts", ICON, 0));
        expect(context.patchAt(3)?.style).toBe(StyleFlags.None);
    });

    it("флаг из опций ставит стилевое состояние deleted", () => {
        expect(new EditorTabItemElement("a.ts", ICON, 0, { deleted: true }).hasStyleState(DELETED_STATE)).toBe(true);
        expect(new EditorTabItemElement("a.ts", ICON, 0).hasStyleState(DELETED_STATE)).toBe(false);
    });

    it("setDeleted переключает зачёркивание, состояние и геттер, не меняя ширину", () => {
        const tab = new EditorTabItemElement("a.ts", ICON, 0);
        const width = tab.getMaxIntrinsicWidth(1);

        tab.setDeleted(true);
        expect(tab.getDeleted()).toBe(true);
        expect(tab.hasStyleState(DELETED_STATE)).toBe(true);
        expect(tab.getMaxIntrinsicWidth(1)).toBe(width);
        expect(render(tab).patchAt(3)?.style).toBe(StyleFlags.Strikethrough);

        tab.setDeleted(false);
        expect(tab.getDeleted()).toBe(false);
        expect(tab.hasStyleState(DELETED_STATE)).toBe(false);
        expect(render(tab).patchAt(3)?.style).toBe(StyleFlags.None);
    });

    it("setDeleted с тем же значением не помечает вкладку грязной", () => {
        const tab = new EditorTabItemElement("a.ts", ICON, 0);
        render(tab);
        expect(tab.isLayoutDirty).toBe(false);
        tab.setDeleted(false);
        expect(tab.isLayoutDirty).toBe(false);
        tab.setDeleted(true);
        expect(tab.isLayoutDirty).toBe(true);
    });
});
