import { Size } from "@tuidom/core/common/geometryPromitives";
import { TUIMouseEvent } from "@tuidom/core/dom/events/tuiMouseEvent";
import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it, vi } from "vitest";

import { TextLabelElement } from "../text/textLabelElement.ts";

import { ListViewElement } from "./listViewElement.ts";

function makeRow(id: string): TextLabelElement {
    const row = new TextLabelElement(id);
    row.id = id;
    return row;
}

function click(
    list: ListViewElement,
    localY: number,
    init: { localX?: number; ctrlKey?: boolean; shiftKey?: boolean; button?: "left" | "right" } = {},
): void {
    const localX = init.localX ?? 5;
    list.dispatchEvent(
        new TUIMouseEvent("click", {
            button: init.button ?? "left",
            screenX: localX,
            screenY: localY,
            localX,
            localY,
            ctrlKey: init.ctrlKey,
            shiftKey: init.shiftKey,
        }),
    );
}

/** `group` (with the child `leaf`) and `plain`. */
function makeList(openOnSingleClick: boolean | (() => boolean)): {
    list: ListViewElement;
    onActivate: ReturnType<typeof vi.fn>;
} {
    const list = new ListViewElement({ openOnSingleClick });
    list.appendRow(makeRow("group"));
    list.appendRow(makeRow("leaf"), { parentId: "group" });
    list.appendRow(makeRow("plain"));
    TestApp.createWithContent(list, new Size(20, 5));
    const onActivate = vi.fn();
    list.onActivate = onActivate;
    return { list, onActivate };
}

describe("ListViewElement openOnSingleClick", () => {
    it("is off by default: a single click only moves the cursor", () => {
        const list = new ListViewElement();
        list.appendRow(makeRow("a"));
        TestApp.createWithContent(list, new Size(20, 5));
        const onActivate = vi.fn();
        list.onActivate = onActivate;

        click(list, 0);

        expect(list.getCursorElement()?.id).toBe("a");
        expect(onActivate).not.toHaveBeenCalled();
    });

    it("a single click on a row without children opens it", () => {
        const { list, onActivate } = makeList(true);

        click(list, 1);

        expect(list.getCursorElement()?.id).toBe("leaf");
        expect(onActivate).toHaveBeenCalledTimes(1);
        expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "leaf" }));
    });

    it("a single click on a row with children does not open it", () => {
        const { list, onActivate } = makeList(true);

        click(list, 0);

        expect(list.getCursorElement()?.id).toBe("group");
        expect(onActivate).not.toHaveBeenCalled();
    });

    it("modifier and right clicks do not open", () => {
        const { list, onActivate } = makeList(true);

        click(list, 2, { ctrlKey: true });
        click(list, 2, { shiftKey: true });
        click(list, 2, { button: "right" });

        expect(onActivate).not.toHaveBeenCalled();
    });

    it("the setting is read on every click", () => {
        let single = false;
        const { list, onActivate } = makeList(() => single);

        click(list, 2);
        expect(onActivate).not.toHaveBeenCalled();

        single = true;
        click(list, 2);
        expect(onActivate).toHaveBeenCalledTimes(1);
    });
});
