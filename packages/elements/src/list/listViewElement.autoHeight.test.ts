import { Point, Size } from "@tuidom/core/common/geometryPromitives";
import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it } from "vitest";

import { TextLabelElement } from "../text/textLabelElement.ts";

import { ListViewElement } from "./listViewElement.ts";

function wrapping(id: string, text: string): TextLabelElement {
    const label = new TextLabelElement(text);
    label.id = id;
    label.wrap = true;
    return label;
}

function plain(id: string, text: string): TextLabelElement {
    const label = new TextLabelElement(text);
    label.id = id;
    return label;
}

function lines(app: TestApp, count: number, width: number): string[] {
    return Array.from({ length: count }, (_, y) => app.backend.getTextAt(new Point(0, y), width).trimEnd());
}

describe("ListViewElement rows of auto height", () => {
    it("gives a wrapping row the lines its text takes at the list width", () => {
        const list = new ListViewElement();
        list.appendRow(wrapping("a", "aaaaaaaaaaaa"), { height: "auto" });
        list.appendRow(wrapping("b", "bb"), { height: "auto" });
        const app = TestApp.createWithContent(list, new Size(5, 6));

        expect(lines(app, 4, 5)).toEqual(["aaaaa", "aaaaa", "aa", "bb"]);
        expect(list.contentHeight).toBe(4);
    });

    it("measures the rows again when the width changes", () => {
        const list = new ListViewElement();
        list.appendRow(wrapping("a", "aaaaaaaaaaaa"), { height: "auto" });
        list.appendRow(wrapping("b", "bb"), { height: "auto" });
        const app = TestApp.createWithContent(list, new Size(5, 6));

        app.backend.resize(new Size(6, 6));
        app.render();

        expect(lines(app, 3, 6)).toEqual(["aaaaaa", "aaaaaa", "bb"]);
    });

    it("measures a row appended after the layout at the known width", () => {
        const list = new ListViewElement();
        list.appendRow(wrapping("a", "a"), { height: "auto" });
        const app = TestApp.createWithContent(list, new Size(4, 6));
        list.appendRow(wrapping("b", "bbbbbb"), { height: "auto" });
        app.render();

        expect(lines(app, 3, 4)).toEqual(["a", "bbbb", "bb"]);
    });

    it("leaves the chevron gutter out of the width a child row wraps in", () => {
        const list = new ListViewElement();
        list.appendRow(wrapping("p", "p"), { height: "auto" });
        const app = TestApp.createWithContent(list, new Size(6, 6));
        // The first child brings the gutter: every row loses its columns.
        list.appendRow(wrapping("c", "cccccc"), { height: "auto", parentId: "p" });
        app.render();

        // Depth 1 (indent 2) and the gutter (2): 2 columns left for the child.
        expect(list.contentHeight).toBe(4);
        expect(app.backend.getTextAt(new Point(4, 1), 2)).toBe("cc");
    });

    it("is one line before the first layout", () => {
        const list = new ListViewElement();
        list.appendRow(wrapping("a", "aaaaaaaa"), { height: "auto" });
        expect(list.contentHeight).toBe(1);
    });

    it("forgets the auto rows on clear", () => {
        const list = new ListViewElement();
        list.appendRow(wrapping("a", "aaaaaaaa"), { height: "auto" });
        const app = TestApp.createWithContent(list, new Size(4, 6));
        list.clear();
        list.appendRow(plain("b", "bbbbbbbb"));
        app.backend.resize(new Size(3, 6));
        app.render();

        expect(list.contentHeight).toBe(1);
    });
});
