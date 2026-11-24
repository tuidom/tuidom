import { BoxConstraints, Offset, Size } from "@tuidom/core/common/geometryPromitives";
import { TUIMouseEvent } from "@tuidom/core/dom/events/tuiMouseEvent";
import { TUIElement } from "@tuidom/core/dom/tuiElement";
import { describe, expect, it } from "vitest";

import { SashElement } from "../sash/sashElement.ts";

import { EditorPartElement } from "./editorPartElement.ts";

function framedPart(orientation: "columns" | "rows"): { part: EditorPartElement; a: TUIElement; b: TUIElement } {
    const part = new EditorPartElement();
    part.framedGroups = true;
    part.orientation = orientation;
    // A visible separator is ignored: the two frames are the boundary.
    part.separatorColorVar = "test.separator";
    const a = new TUIElement();
    const b = new TUIElement();
    part.setViews([a, b]);
    part.localPosition = new Offset(0, 0);
    part.layout(BoxConstraints.tight(new Size(100, 30)));
    return { part, a, b };
}

function sashOf(part: EditorPartElement): SashElement {
    return part.getChildren().find((c): c is SashElement => c instanceof SashElement)!;
}

function drag(sash: SashElement, from: { x: number; y: number; localX: number; localY: number }, to: number): void {
    const vertical = sash.layoutSize.width === 2;
    sash.dispatchEvent(
        new TUIMouseEvent("mousedown", {
            button: "left",
            screenX: from.x,
            screenY: from.y,
            localX: from.localX,
            localY: from.localY,
        }),
    );
    const screenX = vertical ? to : from.x;
    const screenY = vertical ? from.y : to;
    sash.dispatchEvent(new TUIMouseEvent("mousemove", { button: "left", screenX, screenY, localX: 0, localY: 0 }));
    sash.dispatchEvent(new TUIMouseEvent("mouseup", { button: "left", screenX, screenY, localX: 0, localY: 0 }));
}

describe("EditorPartElement.framedGroups", () => {
    it("puts the groups side by side with no separator cell", () => {
        const { a, b } = framedPart("columns");

        expect(a.layoutSize.width + b.layoutSize.width).toBe(100);
        expect(b.localPosition.dx).toBe(a.layoutSize.width);
    });

    it("lays the sash over both frame lines at the boundary, with no hover line", () => {
        const { part, a } = framedPart("columns");
        const sash = sashOf(part);

        expect(sash.localPosition.dx).toBe(a.layoutSize.width - 1);
        expect(sash.layoutSize).toEqual(new Size(2, 30));
        expect(sash.hoverColorVar).toBeNull();
    });

    it("moves the boundary by the drag whichever frame line was grabbed", () => {
        for (const localX of [0, 1]) {
            const { part, a, b } = framedPart("columns");
            drag(sashOf(part), { x: 49 + localX, y: 5, localX, localY: 5 }, 59 + localX);
            part.layout(BoxConstraints.tight(new Size(100, 30)));

            expect(a.layoutSize.width).toBe(60);
            expect(b.layoutSize.width).toBe(40);
        }
    });

    it("spans the bottom line of the upper group and the top row of the lower one in rows", () => {
        const { part, a } = framedPart("rows");
        const sash = sashOf(part);

        expect(sash.localPosition.dy).toBe(a.layoutSize.height - 1);
        expect(sash.layoutSize).toEqual(new Size(100, 2));

        drag(sash, { x: 5, y: 14, localX: 5, localY: 0 }, 19);
        part.layout(BoxConstraints.tight(new Size(100, 30)));
        expect(a.layoutSize.height).toBe(20);
    });

    it("reports the mode and keeps the sashes when it is set to what it already is", () => {
        const { part } = framedPart("columns");
        const sash = sashOf(part);

        expect(part.framedGroups).toBe(true);
        part.framedGroups = true;
        expect(sashOf(part)).toBe(sash);

        part.framedGroups = false;
        expect(part.framedGroups).toBe(false);
        expect(sashOf(part).hoverColorVar).toBe("sash.hoverBorder");
    });
});
