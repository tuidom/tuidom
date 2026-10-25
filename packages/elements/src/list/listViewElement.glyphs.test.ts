import { Point, Size } from "@tuidom/core/common/geometryPromitives";
import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it } from "vitest";

import { TextLabelElement } from "../text/textLabelElement.ts";

import { ListViewElement } from "./listViewElement.ts";

function makeRow(id: string): TextLabelElement {
    const row = new TextLabelElement(id);
    row.id = id;
    return row;
}

function makeList(): { app: TestApp; chevrons: () => string[] } {
    const list = new ListViewElement();
    list.appendRow(makeRow("open"));
    list.appendRow(makeRow("child"), { parentId: "open" });
    list.appendRow(makeRow("closed"));
    list.appendRow(makeRow("hidden"), { parentId: "closed" });
    list.setCollapsed("closed", true);
    const app = TestApp.createWithContent(list, new Size(20, 4));
    const chevrons = (): string[] => [
        app.backend.getTextAt(new Point(0, 0), 1),
        app.backend.getTextAt(new Point(0, 2), 1),
    ];
    return { app, chevrons };
}

describe("ListViewElement glyphs", () => {
    it("draws the Nerd Font chevrons by default", () => {
        expect(makeList().chevrons()).toEqual(["\uF107", "\uF105"]);
    });

    it("draws the chevrons of the host table and follows its change", () => {
        const { app, chevrons } = makeList();
        app.root.setGlyphs({ "tree.expanded": "▾", "tree.collapsed": "▸" });
        app.render();
        expect(chevrons()).toEqual(["▾", "▸"]);

        app.root.setGlyphs(null);
        app.render();
        expect(chevrons()).toEqual(["\uF107", "\uF105"]);
    });
});
