import { describe, expect, it } from "vitest";

import { BoxConstraints, Point, Rect, Size } from "../common/geometryPromitives.ts";
import { DamageList } from "../rendering/damage.ts";

import { TUIElement } from "./tuiElement.ts";

function rect(x: number, y: number, w: number, h: number): Rect {
    return new Rect(new Point(x, y), new Size(w, h));
}

/** Контейнер с одним «попапом» 5×2; позиция настраивается. */
class HostElement extends TUIElement {
    public readonly popup = new TUIElement();
    public popupPosition = new Point(10, 0);

    public constructor() {
        super();
        this.appendChild(this.popup);
    }

    protected override performLayout(constraints: BoxConstraints): Size {
        const size = super.performLayout(constraints);
        if (!this.popup.hidden) {
            this.layoutChild(
                this.popup,
                this.popupPosition.x,
                this.popupPosition.y,
                BoxConstraints.tight(new Size(5, 2)),
            );
        }
        return size;
    }
}

const SIZE = new Size(20, 10);

function createSettled(shadow: boolean): HostElement {
    const root = new HostElement();
    root.popup.shadow = shadow;
    root.setAsRoot();
    root.layout(BoxConstraints.tight(SIZE));
    root.collectDamage(new DamageList(), new Point(0, 0));
    return root;
}

function collect(root: TUIElement): readonly Rect[] {
    root.layout(BoxConstraints.tight(SIZE));
    const sink = new DamageList();
    root.collectDamage(sink, new Point(0, 0));
    return sink.snapshot();
}

describe("TUIElement.collectDamage — тень расширяет damage-rect на outset", () => {
    it("markDirty элемента с тенью повреждает rect с колонкой справа и строкой снизу", () => {
        const root = createSettled(true);
        root.popup.markDirty();

        expect(collect(root)).toEqual([rect(10, 0, 6, 3)]);
        expect(collect(root)).toHaveLength(0);
    });

    it("без тени rect остаётся точным (outset 0)", () => {
        const root = createSettled(false);
        root.popup.markDirty();

        expect(collect(root)).toEqual([rect(10, 0, 5, 2)]);
    });

    it("переезд повреждает old∪new вместе с тенью", () => {
        const root = createSettled(true);
        root.popupPosition = new Point(3, 5);
        root.popup.markDirty();

        const damage = collect(root);
        expect(damage).toContainEqual(rect(10, 0, 6, 3)); // старое место + тень
        expect(damage).toContainEqual(rect(3, 5, 6, 3)); // новое место + тень
    });

    it("скрытие повреждает старое место вместе с тенью — под ней ничего не остаётся", () => {
        const root = createSettled(true);
        root.popup.hidden = true;

        expect(collect(root)).toEqual([rect(10, 0, 6, 3)]);
    });

    it("включение тени у устоявшегося элемента — paint-dirty с расширенным rect'ом", () => {
        const root = createSettled(false);
        root.popup.shadow = true;

        expect(collect(root)).toEqual([rect(10, 0, 6, 3)]);
    });
});
