import { BoxConstraints, Point, Size } from "@tuidom/core/common/geometryPromitives";
import { DARK_PLUS_STYLE_VARS } from "@tuidom/testing/darkPlusStyleVars";
import { renderElement } from "@tuidom/testing/renderElement";
import { describe, expect, it } from "vitest";

import { TAB_HEIGHT } from "./editorTabItemElement.ts";
import type { TabInfo } from "./editorTabStripElement.ts";
import { EditorTabStripElement } from "./editorTabStripElement.ts";

function tabs(...names: string[]): TabInfo[] {
    return names.map((label) => ({ label, icon: "", iconColor: 0, isModified: false, isReadOnly: false }));
}

function rows(strip: EditorTabStripElement, width: number): string[] {
    const backend = renderElement(strip, width, TAB_HEIGHT);
    return [0, 1, 2].map((y) => backend.getTextAt(new Point(0, y), width));
}

describe("EditorTabStripElement as the editor frame's top", () => {
    it("draws the first tab active: its left side goes on as the frame's side", () => {
        const strip = new EditorTabStripElement();
        strip.setTabs(tabs("a.ts", "b.ts"));
        strip.activeIndex = 0;

        expect(rows(strip, 24)).toEqual([
            "╭────────╮╭────────╮    ",
            "│ a.ts × ││ b.ts × │    ",
            "│        ╰┴────────┴───╮",
        ]);
    });

    it("opens the active tab into the editor and stands the others on the baseline", () => {
        const strip = new EditorTabStripElement();
        strip.setTabs(tabs("a.ts", "b.ts"));
        strip.activeIndex = 1;

        expect(rows(strip, 24)[2]).toBe("├────────┴╯        ╰───╮");
    });

    it("leaves the corner to whatever follows the strip when endCorner is off", () => {
        const strip = new EditorTabStripElement();
        strip.setTabs(tabs("a.ts"));
        strip.activeIndex = 0;
        strip.endCorner = false;

        expect(rows(strip, 14)[2]).toBe("│        ╰────");
    });

    it("draws a bare frame top when the group has no tabs", () => {
        const strip = new EditorTabStripElement();

        expect(rows(strip, 6)).toEqual(["      ", "      ", "╭────╮"]);
    });

    it("moves the open foot and the frame side when the active tab changes", () => {
        const strip = new EditorTabStripElement();
        strip.setTabs(tabs("a.ts", "b.ts"));
        strip.activeIndex = 0;
        rows(strip, 24);

        strip.activeIndex = 1;
        strip.activeIndex = 0;

        expect(rows(strip, 24)[2]).toBe("│        ╰┴────────┴───╮");
    });

    it("paints the lines in tab.border on the editor's surface", () => {
        const strip = new EditorTabStripElement();
        strip.setTabs(tabs("a.ts"));
        strip.activeIndex = 0;
        const backend = renderElement(strip, 14, TAB_HEIGHT, { themeVars: true });

        const line = new Point(12, 2);
        expect(backend.getTextAt(line, 1)).toBe("─");
        expect(backend.getBgAt(line)).toBe(DARK_PLUS_STYLE_VARS["tab.activeBackground"]);
        expect(backend.getBgAt(new Point(1, 1))).toBe(DARK_PLUS_STYLE_VARS["tab.activeBackground"]);
        // Above the baseline, beside the tabs: the workbench surface.
        expect(backend.getBgAt(new Point(12, 0))).toBe(DARK_PLUS_STYLE_VARS["editorGroupHeader.tabsBackground"]);
    });

    it("marks only the first tab as standing on the frame's edge, and reports endCorner", () => {
        const strip = new EditorTabStripElement();
        strip.setTabs(tabs("a.ts", "b.ts"));

        expect(strip.getItemElements().map((item) => item.getLeadingEdge())).toEqual([true, false]);
        expect(strip.endCorner).toBe(true);
        strip.endCorner = false;
        expect(strip.endCorner).toBe(false);
    });

    it("does not repaint when endCorner or the leading edge is set to what it already is", () => {
        const strip = new EditorTabStripElement();
        strip.setTabs(tabs("a.ts"));
        strip.layout(BoxConstraints.tight(new Size(20, TAB_HEIGHT)));
        const [item] = strip.getItemElements();
        item.layout(BoxConstraints.tight(new Size(10, TAB_HEIGHT)));

        strip.endCorner = true;
        item.setLeadingEdge(true);

        expect(strip.isLayoutDirty).toBe(false);
        expect(item.isLayoutDirty).toBe(false);
    });

    it("draws nothing but the background in a tab narrower than its two sides", () => {
        const strip = new EditorTabStripElement();
        strip.setTabs(tabs("a.ts"));
        const [item] = strip.getItemElements();

        const backend = renderElement(item, 1, TAB_HEIGHT);

        expect([0, 1, 2].map((y) => backend.getTextAt(new Point(0, y), 1))).toEqual([" ", " ", " "]);
    });
});
