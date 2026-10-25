import { Point } from "@tuidom/core/common/geometryPromitives";
import { renderElement } from "@tuidom/testing/renderElement";
import { describe, expect, it } from "vitest";

import { CompletionListElement } from "./completionListElement.ts";

// Иконка вида — колонка 2 строки (рамка, отступ, иконка); строки элементов — с 1-й (0-я — рамка).
function kindIcons(list: CompletionListElement): string[] {
    const backend = renderElement(list, 30, 5, { resolveStyles: true });
    return [backend.getTextAt(new Point(2, 1), 1), backend.getTextAt(new Point(2, 2), 1)];
}

function makeList(): CompletionListElement {
    const list = new CompletionListElement();
    list.setItems([
        { label: "getTime", kind: 1 },
        { label: "Date", kind: 6 },
    ]);
    return list;
}

describe("CompletionListElement glyphs", () => {
    it("draws the codicon of each kind by default", () => {
        expect(kindIcons(makeList())).toEqual(["\uEA8C", "\uEB5B"]);
    });

    it("draws the kind glyphs of the host table", () => {
        const list = makeList();
        list.setGlyphs({ "completionKind.method": "ƒ", "completionKind.class": "▭" });
        expect(kindIcons(list)).toEqual(["ƒ", "▭"]);
    });
});
