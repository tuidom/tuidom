import { renderElement } from "@tuidom/testing/renderElement";
import { describe, expect, it } from "vitest";

import type { CompletionListItem } from "./completionListElement.ts";
import { CompletionListElement } from "./completionListElement.ts";

function makeWidget(items: CompletionListItem[]): CompletionListElement {
    const w = new CompletionListElement();
    w.setItems(items);
    return w;
}

describe("CompletionListElement — preselect", () => {
    it("opens with the first preselect item selected, not the first row", () => {
        const w = makeWidget([
            { label: "alpha" },
            { label: "beta", preselect: true },
            { label: "gamma", preselect: true },
        ]);
        expect(w.getSelectedItem()?.label).toBe("beta");
        expect(w.selectedIndex).toBe(1);
    });

    it("without preselect items the first row is selected", () => {
        const w = makeWidget([{ label: "alpha" }, { label: "beta", preselect: false }]);
        expect(w.selectedIndex).toBe(0);
    });

    it("re-applies preselect after every refilter, inside the best-rank group", () => {
        const w = makeWidget([
            { label: "colorRed" },
            { label: "colorBlue", preselect: true },
            { label: "myColor", preselect: true },
        ]);
        w.refineFilter("col");
        // Prefix matches (colorRed, colorBlue) rank above the substring match (myColor).
        expect(w.items.map((i) => i.label)).toEqual(["colorRed", "colorBlue", "myColor"]);
        expect(w.getSelectedItem()?.label).toBe("colorBlue");
        w.selectNext();
        w.refineFilter("colo");
        expect(w.getSelectedItem()?.label).toBe("colorBlue");
    });

    it("a preselect item below the best-rank group does not pull the selection", () => {
        const w = makeWidget([{ label: "colorRed" }, { label: "myColor", preselect: true }]);
        w.setFilter("col");
        expect(w.items.map((i) => i.label)).toEqual(["colorRed", "myColor"]);
        expect(w.selectedIndex).toBe(0);
    });

    it("a substring-only list keeps preselect: the best rank is the first item's", () => {
        const w = makeWidget([{ label: "myColor" }, { label: "yourColor", preselect: true }]);
        w.setFilter("col");
        expect(w.getSelectedItem()?.label).toBe("yourColor");
    });

    it("scrolls a preselect item below the window into view", () => {
        const items: CompletionListItem[] = Array.from({ length: 20 }, (_, i) => ({
            label: `item${String(i).padStart(2, "0")}`,
            preselect: i === 14,
        }));
        const w = makeWidget(items);
        w.maxVisibleItems = 5;
        w.setItems(items);
        expect(w.getSelectedItem()?.label).toBe("item14");
        const screen = renderElement(w, w.getMaxIntrinsicWidth(0), w.getMaxIntrinsicHeight(0)).screenToString();
        // The window ends on the selection.
        expect(screen).toContain("item10");
        expect(screen).toContain("item14");
        expect(screen).not.toContain("item09");
        expect(screen).not.toContain("item15");
    });

    it("reports the preselected item through onSelectionChanged", () => {
        const w = new CompletionListElement();
        const seen: (string | undefined)[] = [];
        w.onSelectionChanged = (item) => seen.push(item?.label);
        w.setItems([{ label: "alpha" }, { label: "beta", preselect: true }]);
        expect(seen).toEqual(["beta"]);
    });

    it("an empty list selects nothing", () => {
        const w = makeWidget([]);
        expect(w.selectedIndex).toBe(0);
        expect(w.getSelectedItem()).toBeNull();
    });
});
