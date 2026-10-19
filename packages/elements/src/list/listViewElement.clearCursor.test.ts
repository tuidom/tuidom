import { Size } from "@tuidom/core/common/geometryPromitives";
import { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";
import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it } from "vitest";

import { TextLabelElement } from "../text/textLabelElement.ts";

import { ListViewElement } from "./listViewElement.ts";

function makeRow(id: string): TextLabelElement {
    const row = new TextLabelElement(id);
    row.id = id;
    return row;
}

function setup(count = 4): { list: ListViewElement; app: TestApp; activated: string[] } {
    const list = new ListViewElement();
    for (let i = 0; i < count; i++) list.appendRow(makeRow(`r${i}`));
    list.appendRow(makeRow("child"), { parentId: "r1" });
    const app = TestApp.createWithContent(list, new Size(20, 10));
    list.focus();
    const activated: string[] = [];
    list.onActivate = (element) => activated.push(element.id ?? "");
    return { list, app, activated };
}

function key(list: ListViewElement, name: string, shiftKey = false): void {
    list.dispatchEvent(new TUIKeyboardEvent("keypress", { key: name, shiftKey }));
}

/** Подсвечена ли строка (`selected` стоит на её обёртке). */
function highlighted(list: ListViewElement, app: TestApp, id: string): boolean {
    app.render();
    return list.querySelector(`#${id}`)?.hasStyleStateWithin("selected") === true;
}

describe("ListViewElement.clearCursor", () => {
    it("снятый курсор: строк под курсором нет, подсветки нет", () => {
        const { list, app } = setup();
        list.setCursorTo("r2");
        expect(highlighted(list, app, "r2")).toBe(true);

        list.clearCursor();

        expect(list.isCursorCleared).toBe(true);
        expect(list.getCursorElement()).toBeNull();
        expect(list.getSelectedElements()).toEqual([]);
        expect(list.inspectState().cursorId).toBeNull();
        expect(highlighted(list, app, "r2")).toBe(false);
    });

    it("Enter, Space, ←/→ при снятом курсоре ни на что не действуют", () => {
        const { list, activated } = setup();
        list.setCursorTo("r1");
        list.clearCursor();
        key(list, "Enter");
        key(list, " ");
        key(list, "ArrowLeft");
        key(list, "ArrowRight");
        expect(activated).toEqual([]);
        expect(list.isCollapsed("r1")).toBe(false);
        expect(list.isCursorCleared).toBe(true);
    });

    it("↓ из снятого курсора — на первую строку, ↑ — на последнюю, не от прежнего места", () => {
        const { list } = setup();
        list.setCursorTo("r2");
        list.clearCursor();
        key(list, "ArrowDown");
        expect(list.inspectState().cursorId).toBe("r0");

        list.clearCursor();
        key(list, "ArrowUp", true);
        expect(list.inspectState().cursorId).toBe("r3");
        expect(list.isCursorCleared).toBe(false);
    });

    it("постановка курсора возвращает его; clear() списка снятие сбрасывает", () => {
        const { list, app } = setup();
        list.clearCursor();
        list.clearCursor();
        list.setCursorTo("r3");
        expect(list.isCursorCleared).toBe(false);
        expect(highlighted(list, app, "r3")).toBe(true);

        list.clearCursor();
        list.clear();
        list.appendRow(makeRow("fresh"));
        expect(list.isCursorCleared).toBe(false);
        expect(list.getCursorElement()?.id).toBe("fresh");
    });

    it("снятие переживает пересборку проекции (свёртка группы)", () => {
        const { list } = setup();
        list.clearCursor();
        list.setCollapsed("r1", true);
        expect(list.getCursorElement()).toBeNull();
    });
});
