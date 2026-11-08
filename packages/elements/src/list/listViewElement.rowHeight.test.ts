import { Point, Size } from "@tuidom/core/common/geometryPromitives";
import { TUIContextMenuEvent, TUIMouseEvent } from "@tuidom/core/dom/events/tuiMouseEvent";
import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it, vi } from "vitest";

import { VStackElement } from "../layout/vStackElement.ts";
import { TextLabelElement } from "../text/textLabelElement.ts";

import { ListViewElement } from "./listViewElement.ts";

// The TestApp palette is dark+.
const HOVER_BG = 0x2a2d2e;
const ACTIVE_BG = 0x04395e;
const SEPARATOR_FG = 0x123456;
const SEPARATOR = "─";

/** A three-line row: `<id>:1`, `<id>:2`, `<id>:3`. */
function makeTallRow(id: string, lines = 3): VStackElement {
    const stack = new VStackElement();
    stack.id = id;
    for (let i = 1; i <= lines; i++) {
        stack.addChild(new TextLabelElement(`${id}:${i}`), { width: "fill", height: 1 });
    }
    return stack;
}

function makeList(
    count: number,
    options: { separator?: boolean; size?: Size; height?: number } = {},
): { list: ListViewElement; app: TestApp } {
    const list = new ListViewElement(options.separator === true ? { rowSeparatorColor: SEPARATOR_FG } : undefined);
    const height = options.height ?? 3;
    for (let i = 0; i < count; i++) list.appendRow(makeTallRow(`r${i}`, height), { height });
    const app = TestApp.createWithContent(list, options.size ?? new Size(20, 10));
    list.focus();
    return { list, app };
}

function mouse(list: ListViewElement, type: "click" | "dblclick" | "mousemove", localY: number, localX = 2): void {
    list.dispatchEvent(new TUIMouseEvent(type, { button: "left", screenX: localX, screenY: localY, localX, localY }));
}

function lineText(app: TestApp, y: number, length = 4): string {
    return app.backend.getTextAt(new Point(0, y), length);
}

describe("ListViewElement rows taller than one line", () => {
    it("stacks rows by their height", () => {
        const { app } = makeList(3);

        expect([0, 1, 2, 3, 4, 5, 6].map((y) => lineText(app, y))).toEqual([
            "r0:1",
            "r0:2",
            "r0:3",
            "r1:1",
            "r1:2",
            "r1:3",
            "r2:1",
        ]);
    });

    it("draws the separator line after each row in the given color", () => {
        const { app } = makeList(2, { separator: true });

        expect(lineText(app, 2)).toBe("r0:3");
        expect(lineText(app, 3)).toBe(SEPARATOR.repeat(4));
        expect(app.backend.getFgAt(new Point(0, 3))).toBe(SEPARATOR_FG);
        expect(lineText(app, 4)).toBe("r1:1");
        expect(lineText(app, 7)).toBe(SEPARATOR.repeat(4));
    });

    it("counts rows and separators in the content height", () => {
        expect(makeList(3, { size: new Size(20, 3) }).list.contentHeight).toBe(9);
        expect(makeList(3, { separator: true, size: new Size(20, 4) }).list.contentHeight).toBe(12);
    });

    it("pads the content height so that the last scroll position is the top of a row", () => {
        // 12 lines in a 10-line viewport: the tail fits from r1 (line 4), so content is 4 + 10.
        const { list } = makeList(3, { separator: true, size: new Size(20, 10) });

        expect(list.contentHeight).toBe(14);
        list.scrollTo(0, 100);
        expect(list.scrollTop).toBe(4);
    });

    it("rejects a height that is not a positive integer", () => {
        const list = new ListViewElement();
        const row = new TextLabelElement("x");
        row.id = "x";
        expect(() => {
            list.appendRow(row, { height: 0 });
        }).toThrow(/height must be an integer >= 1/);
        expect(() => {
            list.appendRow(row, { height: 1.5 });
        }).toThrow(/height must be an integer >= 1/);
    });

    it("paints the selection over every line of the cursor row, not over the separator", () => {
        const { app } = makeList(2, { separator: true });
        app.render();

        for (const y of [0, 1, 2]) expect(app.backend.getBgAt(new Point(10, y))).toBe(ACTIVE_BG);
        expect(app.backend.getBgAt(new Point(10, 3))).not.toBe(ACTIVE_BG);
        expect(app.backend.getBgAt(new Point(10, 4))).not.toBe(ACTIVE_BG);
    });

    it("hovering any line of a row paints the whole row", () => {
        const { list, app } = makeList(2, { separator: true });

        mouse(list, "mousemove", 6);
        app.render();

        for (const y of [4, 5, 6]) expect(app.backend.getBgAt(new Point(10, y))).toBe(HOVER_BG);
        expect(app.backend.getBgAt(new Point(10, 7))).not.toBe(HOVER_BG);
    });

    it("hovering the separator hovers no row", () => {
        const { list, app } = makeList(2, { separator: true });

        mouse(list, "mousemove", 5);
        app.render();
        mouse(list, "mousemove", 3);
        app.render();

        expect(app.backend.getBgAt(new Point(10, 5))).not.toBe(HOVER_BG);
    });

    it("a click on a lower line of a row moves the cursor to that row", () => {
        const { list } = makeList(3);

        mouse(list, "click", 5);

        expect(list.getCursorElement()?.id).toBe("r1");
    });

    it("a click on the separator does not move the cursor", () => {
        const { list } = makeList(3, { separator: true });

        mouse(list, "click", 3);

        expect(list.getCursorElement()?.id).toBe("r0");
    });

    it("a click below the last row does not move the cursor", () => {
        const { list } = makeList(2);

        mouse(list, "click", 8);

        expect(list.getCursorElement()?.id).toBe("r0");
    });

    it("a double click on a lower line activates that row", () => {
        const { list } = makeList(3);
        const onActivate = vi.fn();
        list.onActivate = onActivate;

        mouse(list, "dblclick", 8);

        expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "r2" }));
    });

    it("arrow keys step by rows", () => {
        const { list, app } = makeList(3, { separator: true });

        app.sendKey("ArrowDown");
        expect(list.getCursorElement()?.id).toBe("r1");
        app.sendKey("ArrowDown");
        expect(list.getCursorElement()?.id).toBe("r2");
        app.sendKey("ArrowUp");
        expect(list.getCursorElement()?.id).toBe("r1");
    });

    it("scrolls a row below the viewport fully into view, starting at a row top", () => {
        const { list, app } = makeList(4, { separator: true, size: new Size(20, 5) });

        app.sendKey("ArrowDown");
        app.render();

        // r1 occupies content lines 4..6; the lowest row top that shows it whole is its own.
        expect(list.scrollTop).toBe(4);
        expect([0, 1, 2].map((y) => lineText(app, y))).toEqual(["r1:1", "r1:2", "r1:3"]);
    });

    it("snaps a scroll position inside a row to the top of that row", () => {
        const { list, app } = makeList(5, { separator: true, size: new Size(20, 5) });

        list.scrollTo(0, 6);
        app.render();

        expect(list.scrollTop).toBe(4);
        expect(lineText(app, 0)).toBe("r1:1");
    });

    it("leaves a row that does not fit at the bottom out of the frame", () => {
        const { list, app } = makeList(3, { size: new Size(20, 4) });

        expect([0, 1, 2].map((y) => lineText(app, y))).toEqual(["r0:1", "r0:2", "r0:3"]);
        expect(lineText(app, 3)).toBe("    ");
        mouse(list, "click", 3);
        expect(list.getCursorElement()?.id).toBe("r0");
    });

    it("the wheel scrolls by at least one row", () => {
        const { list, app } = makeList(5, { separator: true, size: new Size(20, 5) });

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
        app.render();
        expect(list.scrollTop).toBe(4);

        list.dispatchEvent(
            new TUIMouseEvent("wheel", {
                button: "none",
                screenX: 0,
                screenY: 0,
                localX: 0,
                localY: 0,
                wheelDirection: "up",
            }),
        );
        app.render();
        expect(list.scrollTop).toBe(0);
    });

    it("scrolls a row above the viewport so that its top line is visible", () => {
        const { list, app } = makeList(4, { separator: true, size: new Size(20, 5) });
        list.scrollTo(0, 9);
        app.render();

        list.setCursorTo("r1");
        app.render();

        expect(list.scrollTop).toBe(4);
        expect(lineText(app, 0)).toBe("r1:1");
    });

    it("keeps the top of a row taller than the viewport visible", () => {
        const { list, app } = makeList(3, { height: 6, size: new Size(20, 4) });

        app.sendKey("ArrowDown");
        app.render();

        expect(list.scrollTop).toBe(6);
        expect(lineText(app, 0)).toBe("r1:1");
    });

    it("the wheel on an empty list does nothing", () => {
        const list = new ListViewElement({ rowSeparatorColor: SEPARATOR_FG });
        TestApp.createWithContent(list, new Size(20, 5));

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

        expect(list.scrollTop).toBe(0);
    });

    it("PageDown moves to the row a page of lines below", () => {
        const { list, app } = makeList(10, { size: new Size(20, 7) });

        list.focusPageDown();
        app.render();

        // From line 0 a page (6 lines) down is line 6: row r2.
        expect(list.getCursorElement()?.id).toBe("r2");
        list.focusPageUp();
        expect(list.getCursorElement()?.id).toBe("r0");
    });

    it("PageDown with a viewport shorter than a row still moves one row", () => {
        const { list, app } = makeList(3, { size: new Size(20, 2) });

        list.focusPageDown();
        app.render();

        expect(list.getCursorElement()?.id).toBe("r1");
        list.focusPageUp();
        expect(list.getCursorElement()?.id).toBe("r0");
    });

    it("a keyboard context menu anchors at the top line of the cursor row", () => {
        const { list, app } = makeList(3, { separator: true });
        const onContextMenu = vi.fn();
        list.onContextMenu = onContextMenu;
        app.sendKey("ArrowDown");
        app.render();

        list.dispatchEvent(
            new TUIContextMenuEvent({
                trigger: "keyboard",
                button: "none",
                screenX: 0,
                screenY: 0,
                localX: 0,
                localY: 0,
            }),
        );

        expect(onContextMenu).toHaveBeenCalledWith(
            expect.objectContaining({ id: "r1" }),
            list.globalPosition.x,
            list.globalPosition.y + 4,
        );
    });

    it("a row appended after layout lands below the existing ones", () => {
        const { list, app } = makeList(1, { separator: true });

        list.appendRow(makeTallRow("late"), { height: 3 });
        app.render();
        mouse(list, "click", 5);

        expect(lineText(app, 4, 6)).toBe("late:1");
        expect(list.getCursorElement()?.id).toBe("late");
    });

    it("mixes rows of different heights", () => {
        const list = new ListViewElement();
        const header = new TextLabelElement("head");
        header.id = "head";
        list.appendRow(header);
        list.appendRow(makeTallRow("r0", 2), { height: 2 });
        list.appendRow(makeTallRow("r1"), { height: 3 });
        const app = TestApp.createWithContent(list, new Size(20, 10));

        expect([0, 1, 2, 3, 4, 5].map((y) => lineText(app, y))).toEqual([
            "head",
            "r0:1",
            "r0:2",
            "r1:1",
            "r1:2",
            "r1:3",
        ]);
        mouse(list, "click", 4);
        expect(list.getCursorElement()?.id).toBe("r1");
    });
});
