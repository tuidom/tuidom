import { describe, expect, it } from "vitest";

import { BoxConstraints, Point, Rect, Size } from "../common/geometryPromitives.ts";
import { DamageList } from "../rendering/damage.ts";

import { TUIElement } from "./tuiElement.ts";

function rect(x: number, y: number, w: number, h: number): Rect {
    return new Rect(new Point(x, y), new Size(w, h));
}

/** Рамка 10×4 вокруг листа: перерисовывается сама, когда лист сменил «высоту». */
class FrameLikeElement extends TUIElement {
    public readonly leaf = new TUIElement();
    public leafHeight = 2;
    private lastLeafHeight = -1;

    public constructor() {
        super();
        this.appendChild(this.leaf);
    }

    protected override performLayout(constraints: BoxConstraints): Size {
        const size = super.performLayout(constraints);
        this.layoutChild(this.leaf, 1, 1, BoxConstraints.tight(new Size(3, this.leafHeight)));
        if (this.leafHeight !== this.lastLeafHeight) {
            this.lastLeafHeight = this.leafHeight;
            this.markPaintDirtyDuringLayout();
        }
        return size;
    }
}

class RootElement extends TUIElement {
    public readonly frame = new FrameLikeElement();

    public constructor() {
        super();
        this.appendChild(this.frame);
    }

    protected override performLayout(constraints: BoxConstraints): Size {
        const size = super.performLayout(constraints);
        this.layoutChild(this.frame, 2, 3, BoxConstraints.tight(new Size(10, 4)));
        return size;
    }
}

const SIZE = new Size(20, 10);

function frame(root: TUIElement): readonly Rect[] {
    root.layout(BoxConstraints.tight(SIZE));
    const sink = new DamageList();
    root.collectDamage(sink, new Point(0, 0));
    return sink.snapshot();
}

describe("TUIElement.markPaintDirtyDuringLayout", () => {
    it("damages the element's rect in the same frame, not its ancestors'", () => {
        const root = new RootElement();
        root.setAsRoot();
        frame(root);

        root.frame.leafHeight = 1;
        root.frame.leaf.markDirty();

        // The leaf moved nowhere, but the frame repaints whole: its look follows the leaf's layout.
        const damage = frame(root);
        expect(damage).toContainEqual(rect(2, 3, 10, 4));
        expect(damage).not.toContainEqual(rect(0, 0, 20, 10));
        expect(frame(root)).toEqual([]);
    });

    it("leaves nothing dirty after the frame", () => {
        const root = new RootElement();
        root.setAsRoot();
        frame(root);

        root.frame.leafHeight = 3;
        root.frame.leaf.markDirty();
        frame(root);

        expect(root.needsRepaint).toBe(false);
    });
});
