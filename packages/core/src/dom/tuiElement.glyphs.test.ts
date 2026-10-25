import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it, vi } from "vitest";

import { BoxConstraints, Point, Size } from "../common/geometryPromitives.ts";

import { GLYPH_TOKEN_DEFAULTS } from "./glyphTokens.ts";
import { type RenderContext, TUIElement } from "./tuiElement.ts";

/** Рисует глиф шеврона в (0,0) — как виджет, читающий глиф в render. */
class ChevronElement extends TUIElement {
    public override render(context: RenderContext): void {
        context.setCell(0, 0, { char: this.glyph("tree.expanded"), fg: 0, bg: 0 });
    }
}

/** Обёртка, раскладывающая единственного ребёнка на всю свою площадь. */
class WrapperElement extends TUIElement {
    public constructor(child: TUIElement) {
        super();
        this.appendChild(child);
    }

    protected override performLayout(constraints: BoxConstraints): Size {
        const size = super.performLayout(constraints);
        for (const child of this.getChildren()) this.layoutChild(child, 0, 0, BoxConstraints.tight(size));
        return size;
    }
}

function nest(depth: number, leaf: TUIElement): TUIElement {
    let current = leaf;
    for (let i = 0; i < depth; i++) {
        current = new WrapperElement(current);
    }
    return current;
}

describe("TUIElement glyphs", () => {
    it("falls back to the tuidom default (Nerd Font) without a table", () => {
        const element = new TUIElement();
        expect(element.glyph("tree.expanded")).toBe("\uF107");
        expect(element.glyph("editorTab.readOnly")).toBe(GLYPH_TOKEN_DEFAULTS["editorTab.readOnly"]);
    });

    it("inherits an ancestor table and lets a nearer one win per token", () => {
        const leaf = new TUIElement();
        const middle = nest(1, leaf);
        const root = nest(2, middle);
        root.setGlyphs({ "tree.expanded": "v", "tree.collapsed": ">" });
        middle.setGlyphs({ "tree.collapsed": "+" });

        expect(leaf.glyph("tree.expanded")).toBe("v");
        expect(leaf.glyph("tree.collapsed")).toBe("+");
        expect(root.glyph("tree.collapsed")).toBe(">");
        expect(leaf.glyph("editorTab.readOnly")).toBe(GLYPH_TOKEN_DEFAULTS["editorTab.readOnly"]);
    });

    it("null removes the table", () => {
        const element = new TUIElement();
        element.setGlyphs({ "tree.expanded": "v" });
        element.setGlyphs(null);
        expect(element.glyph("tree.expanded")).toBe(GLYPH_TOKEN_DEFAULTS["tree.expanded"]);
    });

    it("repaints a deep descendant when the root table changes", () => {
        const chevron = new ChevronElement();
        const app = TestApp.createWithContent(nest(3, chevron), new Size(10, 3));
        expect(app.backend.getTextAt(new Point(0, 0), 1)).toBe("\uF107");

        app.root.setGlyphs({ "tree.expanded": "▾" });
        app.render();
        expect(app.backend.getTextAt(new Point(0, 0), 1)).toBe("▾");

        app.root.setGlyphs(null);
        app.render();
        expect(app.backend.getTextAt(new Point(0, 0), 1)).toBe("\uF107");
    });

    it("the same table again schedules nothing", () => {
        const element = new TUIElement();
        const table = { "tree.expanded": "v" };
        element.setGlyphs(table);
        const markDirty = vi.spyOn(element, "markDirty");
        element.setGlyphs(table);
        expect(markDirty).not.toHaveBeenCalled();
        element.setGlyphs({ "tree.expanded": "v" });
        expect(markDirty).toHaveBeenCalledOnce();
    });
});
