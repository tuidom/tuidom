import { BoxConstraints, Offset, Point, Rect, Size } from "@tuidom/core/common/geometryPromitives";
import { RenderContext, TUIElement } from "@tuidom/core/dom/tuiElement";

export type HFlexChildSize = { type: "fixed"; value: number } | { type: "fit" } | { type: "fill" };

export interface HFlexLayoutStyle {
    width: HFlexChildSize;
    height: number | "fill";
}

export function hflexFixed(value: number): HFlexChildSize {
    return { type: "fixed", value };
}

export function hflexFit(): HFlexChildSize {
    return { type: "fit" };
}

export function hflexFill(): HFlexChildSize {
    return { type: "fill" };
}

export class HFlexElement extends TUIElement {
    public addChild(child: TUIElement, style: HFlexLayoutStyle): void {
        if (style.width.type === "fill") {
            const hasFill = this.getChildren().some((c) => (c.layoutStyle as HFlexLayoutStyle).width.type === "fill");
            if (hasFill) {
                throw new Error("HFlexElement supports at most one fill child");
            }
        }
        child.layoutStyle = style;
        this.appendChild(child);
    }

    public replaceChildren(newChildren: TUIElement[]): void {
        let fillCount = 0;
        for (const child of newChildren) {
            const style = child.layoutStyle as HFlexLayoutStyle | undefined;
            if (style?.width.type === "fill") fillCount++;
        }
        if (fillCount > 1) {
            throw new Error("HFlexElement supports at most one fill child");
        }
        this.setChildren(newChildren);
    }

    // ─── Intrinsic Size ───

    public override getMinIntrinsicWidth(height: number): number {
        let sum = 0;
        for (const child of this.getChildren()) {
            const style = child.layoutStyle as HFlexLayoutStyle;
            if (style.width.type === "fixed") {
                sum += style.width.value;
            } else {
                sum += child.getMinIntrinsicWidth(height);
            }
        }
        return sum;
    }

    public override getMaxIntrinsicWidth(height: number): number {
        let sum = 0;
        for (const child of this.getChildren()) {
            const style = child.layoutStyle as HFlexLayoutStyle;
            if (style.width.type === "fixed") {
                sum += style.width.value;
            } else {
                sum += child.getMaxIntrinsicWidth(height);
            }
        }
        return sum;
    }

    public override getMinIntrinsicHeight(width: number): number {
        let max = 0;
        for (const child of this.getChildren()) {
            const style = child.layoutStyle as HFlexLayoutStyle;
            if (style.height === "fill") {
                max = Math.max(max, child.getMinIntrinsicHeight(this.childWidthWithin(child, width)));
            } else {
                max = Math.max(max, style.height);
            }
        }
        return max;
    }

    public override getMaxIntrinsicHeight(width: number): number {
        let max = 0;
        for (const child of this.getChildren()) {
            const style = child.layoutStyle as HFlexLayoutStyle;
            if (style.height === "fill") {
                max = Math.max(max, child.getMaxIntrinsicHeight(this.childWidthWithin(child, width)));
            } else {
                max = Math.max(max, style.height);
            }
        }
        return max;
    }

    /**
     * The width a child gets in a container of `width` columns, as {@link performLayout} gives it: the fill child
     * gets what the fixed and fit children leave (a wrapping text is as tall as the lines it gets there). A fit
     * child of fill height is measured at one line: the container's height is what is being asked.
     */
    private childWidthWithin(child: TUIElement, width: number): number {
        const childStyle = child.layoutStyle as HFlexLayoutStyle;
        if (childStyle.width.type !== "fill") return HFlexElement.fixedOrFitWidth(child);
        let taken = 0;
        for (const sibling of this.getChildren()) {
            if (sibling !== child) taken += HFlexElement.fixedOrFitWidth(sibling);
        }
        return Math.max(0, width - taken);
    }

    private static fixedOrFitWidth(child: TUIElement): number {
        const style = child.layoutStyle as HFlexLayoutStyle;
        if (style.width.type === "fixed") return style.width.value;
        return child.getMaxIntrinsicWidth(style.height === "fill" ? 1 : style.height);
    }

    // ─── Layout ───

    protected override performLayout(constraints: BoxConstraints): Size {
        const containerSize = super.performLayout(constraints);
        const containerWidth = containerSize.width;
        const containerHeight = containerSize.height;

        let fixedSum = 0;
        let fitSum = 0;
        let fillChild: TUIElement | null = null;

        // Pass 1: measure fixed and fit children
        for (const child of this.getChildren()) {
            const style = child.layoutStyle as HFlexLayoutStyle;
            const childHeight = style.height === "fill" ? containerHeight : style.height;

            if (style.width.type === "fixed") {
                fixedSum += style.width.value;
            } else if (style.width.type === "fit") {
                fitSum += child.getMaxIntrinsicWidth(childHeight);
            } else {
                fillChild = child;
            }
        }

        // Pass 2: compute fill width and lay out all children
        const remaining = Math.max(0, containerWidth - fixedSum - fitSum);
        let currentX = 0;

        for (const child of this.getChildren()) {
            const style = child.layoutStyle as HFlexLayoutStyle;
            // Инвариант вложенности (Н2): дети не вылезают за контейнер — при
            // нехватке места жадный кламп по остатку в порядке детей.
            const childHeight = Math.min(style.height === "fill" ? containerHeight : style.height, containerHeight);

            let childWidth: number;
            if (style.width.type === "fixed") {
                childWidth = style.width.value;
            } else if (style.width.type === "fit") {
                childWidth = child.getMaxIntrinsicWidth(childHeight);
            } else {
                childWidth = remaining;
            }
            childWidth = Math.max(0, Math.min(childWidth, containerWidth - currentX));

            this.layoutChild(child, currentX, 0, BoxConstraints.tight(new Size(childWidth, childHeight)));
            currentX += childWidth;
        }

        return containerSize;
    }

    // ─── Render ───
}
