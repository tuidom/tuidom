import { Point, Size } from "@tuidom/core/common/geometryPromitives";
import { TUIMouseEvent } from "@tuidom/core/dom/events/tuiMouseEvent";
import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it } from "vitest";

import { TextLabelElement } from "../text/textLabelElement.ts";

import { type IListViewOptions, ListViewElement } from "./listViewElement.ts";

// The TestApp palette is dark+.
const ACTIVE_BG = 0x04395e;
const HOVER_BG = 0x2a2d2e;
const WIDGET_BORDER = 0x303031;
const GROUP_FG = 0x123456;
const LINE = "─";

/** `ids` with a leading `|` start a group: `["a", "|b", "c"]` draws a line above `b`. */
function makeList(
    ids: readonly string[],
    options: { list?: IListViewOptions; size?: Size } = {},
): { list: ListViewElement; app: TestApp } {
    const list = new ListViewElement(options.list ?? { groupSeparatorColor: GROUP_FG });
    for (const spec of ids) {
        const separatorBefore = spec.startsWith("|");
        const id = separatorBefore ? spec.slice(1) : spec;
        const label = new TextLabelElement(id);
        label.id = id;
        list.appendRow(label, { separatorBefore, label: id });
    }
    const app = TestApp.createWithContent(list, options.size ?? new Size(10, 10));
    list.focus();
    return { list, app };
}

function lines(app: TestApp, count: number): string[] {
    return Array.from({ length: count }, (_, y) => app.backend.getTextAt(new Point(0, y), 3).trimEnd());
}

function mouse(list: ListViewElement, type: "click" | "mousemove", localY: number): void {
    list.dispatchEvent(new TUIMouseEvent(type, { button: "left", screenX: 1, screenY: localY, localX: 1, localY }));
}

function wheelDown(list: ListViewElement): void {
    list.dispatchEvent(
        new TUIMouseEvent("wheel", {
            button: "none",
            screenX: 0,
            screenY: 0,
            localX: 0,
            localY: 0,
            wheelDirection: "down",
        }),
    );
}

describe("ListViewElement group separators (separatorBefore)", () => {
    it("draws a full-width line above a row that starts a group, in the group color", () => {
        const { app } = makeList(["a", "b", "|c", "d"]);

        expect(lines(app, 5)).toEqual(["a", "b", LINE.repeat(3), "c", "d"]);
        expect(app.backend.getTextAt(new Point(0, 2), 10)).toBe(LINE.repeat(10));
        expect(app.backend.getFgAt(new Point(9, 2))).toBe(GROUP_FG);
    });

    it("draws no line above the first visible row", () => {
        const { list, app } = makeList(["|a", "b"]);

        expect(lines(app, 3)).toEqual(["a", "b", ""]);
        expect(list.contentHeight).toBe(2);
    });

    it("drops the line of a row that becomes first, and of a hidden row", () => {
        const { list, app } = makeList(["a", "|b", "|c"]);

        list.setRowHidden("a", true);
        app.render();
        expect(lines(app, 3)).toEqual(["b", LINE.repeat(3), "c"]);

        list.setRowHidden("c", true);
        app.render();
        expect(lines(app, 2)).toEqual(["b", ""]);
    });

    it("defaults the line color to widget.border", () => {
        const { app } = makeList(["a", "|b"], { list: {} });

        expect(app.backend.getFgAt(new Point(0, 1))).toBe(WIDGET_BORDER);
    });

    it("adds no second line next to the per-row separator", () => {
        const { list, app } = makeList(["a", "|b"], { list: { rowSeparatorColor: GROUP_FG } });

        expect(lines(app, 4)).toEqual(["a", LINE.repeat(3), "b", LINE.repeat(3)]);
        expect(list.contentHeight).toBe(4);
    });

    it("counts the lines in the content height, also for rows appended after layout", () => {
        const { list, app } = makeList(["a", "|b", "c", "|d"]);
        expect(list.contentHeight).toBe(6);

        list.appendRow(Object.assign(new TextLabelElement("e"), { id: "e" }), { separatorBefore: true });
        app.render();

        expect(list.contentHeight).toBe(8);
        expect(lines(app, 8)).toEqual(["a", LINE.repeat(3), "b", "c", LINE.repeat(3), "d", LINE.repeat(3), "e"]);
    });

    it("the line is not part of a row: the cursor highlight does not paint it", () => {
        const { app } = makeList(["a", "|b"]);

        app.sendKey("ArrowDown");
        app.render();

        expect(app.backend.getBgAt(new Point(0, 2))).toBe(ACTIVE_BG);
        expect(app.backend.getBgAt(new Point(0, 1))).not.toBe(ACTIVE_BG);
    });

    it("a click on the line selects nothing, a click on the row below selects it", () => {
        const { list, app } = makeList(["a", "|b"]);

        mouse(list, "click", 1);
        expect(list.getCursorElement()?.id).toBe("a");

        mouse(list, "click", 2);
        app.render();
        expect(list.getCursorElement()?.id).toBe("b");
    });

    it("hovering the line highlights no row", () => {
        const { list, app } = makeList(["a", "|b"]);

        mouse(list, "mousemove", 1);
        app.render();

        expect(list.inspectState()).toMatchObject({ cursorId: "a" });
        expect(app.backend.getBgAt(new Point(0, 0))).not.toBe(HOVER_BG);
        expect(app.backend.getBgAt(new Point(0, 1))).not.toBe(HOVER_BG);
        expect(app.backend.getBgAt(new Point(0, 2))).not.toBe(HOVER_BG);
    });

    it("arrows, Home and End step over the line from row to row", () => {
        const { list, app } = makeList(["a", "|b", "|c"]);

        app.sendKey("ArrowDown");
        expect(list.getCursorElement()?.id).toBe("b");
        app.sendKey("End");
        expect(list.getCursorElement()?.id).toBe("c");
        app.sendKey("ArrowUp");
        expect(list.getCursorElement()?.id).toBe("b");
        app.sendKey("Home");
        expect(list.getCursorElement()?.id).toBe("a");
    });

    it("scrolling to a row below snaps to its top and keeps it whole in the viewport", () => {
        // a ─ b c ─ d e: 7 lines in a 4-line viewport.
        const { list, app } = makeList(["a", "|b", "c", "|d", "e"], { size: new Size(10, 4) });

        list.setCursorTo("e");
        app.render();

        expect(lines(app, 4)).toEqual(["c", LINE.repeat(3), "d", "e"]);
        expect(list.scrollTop).toBe(3);
    });

    it("PageDown counts the lines of the page", () => {
        // Lines: a0 ─1 b2 c3 ─4 d5 e6; a page in a 4-line viewport is 3 lines.
        const { list, app } = makeList(["a", "|b", "c", "|d", "e"], { size: new Size(10, 4) });

        list.focusPageDown();
        app.render();

        expect(list.getCursorElement()?.id).toBe("c");
    });

    it("the wheel scrolls by lines including the separator lines", () => {
        const { list, app } = makeList(["a", "|b", "c", "|d", "e", "f", "g"], { size: new Size(10, 4) });

        wheelDown(list);
        app.render();

        // Three lines down from 0 is c (line 3).
        expect(list.scrollTop).toBe(3);
        expect(lines(app, 1)).toEqual(["c"]);
    });

    it("draws the line of a group whose row is cut off at the bottom of the viewport", () => {
        const { app } = makeList(["a", "b", "c", "|d"], { size: new Size(10, 4) });

        expect(lines(app, 4)).toEqual(["a", "b", "c", LINE.repeat(3)]);
    });
});
