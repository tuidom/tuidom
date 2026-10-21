import { BoxConstraints, Offset, Size } from "@tuidom/core/common/geometryPromitives";
import { StyleFlags } from "@tuidom/core/common/styleFlags";
import { ROOT_STYLE_CONTEXT } from "@tuidom/core/dom/styles/tuiStyle";
import { RenderContext } from "@tuidom/core/dom/tuiElement";
import type { CellPatch } from "@tuidom/core/rendering/grid";
import { TerminalScreen } from "@tuidom/core/rendering/terminalScreen";
import { describe, expect, it } from "vitest";

import { EditorTabItemElement, PREVIEW_STATE } from "./editorTabItemElement.ts";

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

describe("EditorTabItemElement — предпросмотр", () => {
    it("пишет курсивом только имя: иконка и крестик — прямым начертанием", () => {
        // [1 pad][icon][space][a.ts][space][×][1 pad]
        const context = render(new EditorTabItemElement("a.ts", ICON, 0, { preview: true }));
        for (let x = 3; x < 7; x++) {
            expect(context.patchAt(x)?.style, `колонка имени ${String(x)}`).toBe(StyleFlags.Italic);
        }
        expect(context.patchAt(1)?.char).toBe(ICON);
        expect(context.patchAt(1)?.style ?? StyleFlags.None).toBe(StyleFlags.None);
        expect(context.patchAt(8)?.char).toBe("×");
        expect(context.patchAt(8)?.style).toBe(StyleFlags.None);
    });

    it("приколотая вкладка рисуется прямым начертанием", () => {
        const context = render(new EditorTabItemElement("a.ts", ICON, 0));
        expect(context.patchAt(3)?.style).toBe(StyleFlags.None);
    });

    it("удалённый файл в предпросмотре — и курсив, и зачёркивание", () => {
        const context = render(new EditorTabItemElement("a.ts", ICON, 0, { preview: true, deleted: true }));
        expect(context.patchAt(3)?.style).toBe(StyleFlags.Italic | StyleFlags.Strikethrough);
    });

    it("флаг из опций ставит стилевое состояние preview", () => {
        expect(new EditorTabItemElement("a.ts", ICON, 0, { preview: true }).hasStyleState(PREVIEW_STATE)).toBe(true);
        expect(new EditorTabItemElement("a.ts", ICON, 0).hasStyleState(PREVIEW_STATE)).toBe(false);
    });

    it("setPreview переключает курсив, состояние и геттер, не меняя ширину", () => {
        const tab = new EditorTabItemElement("a.ts", ICON, 0);
        const width = tab.getMaxIntrinsicWidth(1);

        tab.setPreview(true);
        expect(tab.getPreview()).toBe(true);
        expect(tab.hasStyleState(PREVIEW_STATE)).toBe(true);
        expect(tab.getMaxIntrinsicWidth(1)).toBe(width);
        expect(render(tab).patchAt(3)?.style).toBe(StyleFlags.Italic);

        tab.setPreview(false);
        expect(tab.getPreview()).toBe(false);
        expect(tab.hasStyleState(PREVIEW_STATE)).toBe(false);
        expect(render(tab).patchAt(3)?.style).toBe(StyleFlags.None);
    });

    it("setPreview с тем же значением не помечает вкладку грязной", () => {
        const tab = new EditorTabItemElement("a.ts", ICON, 0);
        render(tab);
        expect(tab.isLayoutDirty).toBe(false);
        tab.setPreview(false);
        expect(tab.isLayoutDirty).toBe(false);
        tab.setPreview(true);
        expect(tab.isLayoutDirty).toBe(true);
    });
});
