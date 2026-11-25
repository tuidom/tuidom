import { BoxConstraints, Point, Size } from "@tuidom/core/common/geometryPromitives";
import { GLYPH_TOKEN_DEFAULTS } from "@tuidom/core/dom/glyphTokens";
import { renderElement } from "@tuidom/testing/renderElement";
import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it } from "vitest";

import { FillerElement } from "../layout/fillerElement.ts";
import { HFlexElement, hflexFill, hflexFit } from "../layout/hFlexElement.ts";

import { ButtonElement } from "./buttonElement.ts";

describe("ButtonElement — bare", () => {
    it("renders the label with one space each side instead of brackets", () => {
        const button = new ButtonElement("Aa", { bare: true });
        const backend = renderElement(button, 4, 1, { resolveStyles: true });
        expect(backend.getTextAt(new Point(0, 0), 4)).toBe(" Aa ");
    });

    it("intrinsic width is label length plus 2", () => {
        const button = new ButtonElement(".*", { bare: true });
        expect(button.getMinIntrinsicWidth(1)).toBe(4);
        expect(button.getMaxIntrinsicWidth(1)).toBe(4);
        expect(button.layout(BoxConstraints.loose(new Size(40, 5)))).toEqual(new Size(4, 1));
    });

    it("the checked background covers the padding cells too", () => {
        const button = new ButtonElement("Aa", { bare: true });
        const unchecked = renderElement(button, 4, 1, { resolveStyles: true }).getBgAt(new Point(0, 0));
        button.setChecked(true);
        const backend = renderElement(button, 4, 1, { resolveStyles: true });
        for (const x of [0, 3]) {
            expect(backend.getBgAt(new Point(x, 0))).not.toBe(unchecked);
            expect(backend.getBgAt(new Point(x, 0))).toBe(backend.getBgAt(new Point(1, 0)));
        }
    });

    it("wraps without brackets: rows are indented by the padding", () => {
        const button = new ButtonElement("Open Folder", { bare: true, wrap: true });
        const backend = renderElement(button, 8, 2, { resolveStyles: true });
        expect(backend.getTextAt(new Point(0, 0), 8)).toBe(" Open   ");
        expect(backend.getTextAt(new Point(0, 1), 8)).toBe(" Folder ");
    });
});

describe("ButtonElement — glyph label and setLabel", () => {
    it("a glyph label resolves to the tuidom default without a host table", () => {
        const button = new ButtonElement({ glyph: "tree.collapsed" });
        expect(button.getLabel()).toBe(GLYPH_TOKEN_DEFAULTS["tree.collapsed"]);
    });

    it("a glyph label follows the host glyph table and sizes by the resolved glyph", () => {
        const button = new ButtonElement({ glyph: "tree.collapsed" }, { bare: true });
        const app = TestApp.createWithContent(button, new Size(10, 1));
        app.root.setGlyphs({ "tree.collapsed": ">" });
        app.render();
        expect(button.getLabel()).toBe(">");
        expect(button.getMaxIntrinsicWidth(1)).toBe(3);
        expect(app.backend.getTextAt(button.globalPosition, 3)).toBe(" > ");
    });

    it("setLabel swaps the label and relayouts to the new width", () => {
        const button = new ButtonElement("ab", { bare: true });
        const row = new HFlexElement();
        row.addChild(button, { width: hflexFit(), height: 1 });
        row.addChild(new FillerElement(), { width: hflexFill(), height: 1 });
        const app = TestApp.createWithContent(row, new Size(10, 1));
        app.render();
        button.setLabel({ glyph: "tree.expanded" });
        app.root.setGlyphs({ "tree.expanded": "v" });
        app.render();
        expect(button.getLabel()).toBe("v");
        expect(button.layoutSize.width).toBe(3);
        expect(app.backend.getTextAt(button.globalPosition, 3)).toBe(" v ");
    });
});
