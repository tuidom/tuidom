import { Point } from "@tuidom/core/common/geometryPromitives";
import { renderElement } from "@tuidom/testing/renderElement";
import { describe, expect, it } from "vitest";

import { EditorTabItemElement } from "./editorTabItemElement.ts";

function renderText(tab: EditorTabItemElement): string {
    const width = tab.getMaxIntrinsicWidth(1);
    return renderElement(tab, width, 1).getTextAt(new Point(0, 0), width);
}

describe("EditorTabItemElement glyphs", () => {
    it("draws the codicon lock of a read-only tab by default", () => {
        const tab = new EditorTabItemElement("file.ts", "", 0, { readOnly: true });
        expect(renderText(tab)).toBe(" \uEA75 file.ts × ");
    });

    it("draws the lock of the host table in the same single cell", () => {
        const tab = new EditorTabItemElement("file.ts", "", 0, { readOnly: true });
        const width = tab.getMaxIntrinsicWidth(1);
        tab.setGlyphs({ "editorTab.readOnly": "•" });
        expect(tab.getMaxIntrinsicWidth(1)).toBe(width);
        expect(renderText(tab)).toBe(" • file.ts × ");
    });
});
