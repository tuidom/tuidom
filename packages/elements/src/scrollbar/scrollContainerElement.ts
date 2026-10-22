import { BoxConstraints, Offset, Point, Rect, Size } from "@tuidom/core/common/geometryPromitives";
import { RenderContext, TUIElement } from "@tuidom/core/dom/tuiElement";

import type { IScrollable, IScrollBarMarker } from "./iScrollable.ts";
import type { ScrollBarColors } from "./scrollBarRenderer.ts";
import {
    renderHorizontalScrollBar,
    renderOverviewScrollBar,
    renderScrollBar,
    renderScrollBarMarkerColumn,
} from "./scrollBarRenderer.ts";

export type ScrollBarPolicy = "auto" | "always" | "never";

/**
 * Where the child's scrollbar markers ({@link IScrollable.getScrollBarMarkers}) go:
 * - `"none"` — not drawn;
 * - `"inside"` — over the bar itself, the thumb moving in whole cells;
 * - `"outside"` — a column of their own left of the bar, the bar untouched (costs the child a column);
 * - `"auto"` — outside when the decorator is at least {@link ScrollBarDecorator.markerColumnMinWidth}
 *   wide, inside otherwise.
 */
export type ScrollBarMarkerPlacement = "none" | "inside" | "outside" | "auto";

type ResolvedMarkerPlacement = "none" | "inside" | "outside";

/**
 * Draws scrollbars alongside a scrollable child.
 *
 * The child is rendered as-is — it must handle its own content rendering.
 * For simple widgets that draw full content in local coordinates, wrap
 * them in a ScrollViewport before passing to ScrollBarDecorator:
 *
 *   new ScrollBarDecorator(new ScrollViewport(textBlock))
 *
 * For self-scrolling widgets (e.g. EditorElement) that already manage
 * their own scroll offset, pass them directly:
 *
 *   new ScrollBarDecorator(editorElement)
 */
export class ScrollBarDecorator extends TUIElement {
    private child: TUIElement & IScrollable;
    public verticalScrollBar: ScrollBarPolicy = "auto";
    public horizontalScrollBar: ScrollBarPolicy = "auto";
    public markerPlacement: ScrollBarMarkerPlacement = "inside";
    /** Narrowest decorator that `"auto"` gives a marker column. */
    public markerColumnMinWidth = 80;

    public constructor(child: TUIElement & IScrollable) {
        super();
        this.child = child;
        this.appendChild(this.child);
    }

    public getChild(): TUIElement & IScrollable {
        return this.child;
    }

    public setChild(child: TUIElement & IScrollable): void {
        // setChildren, а не appendChild: старый ребёнок обязан отцепиться. До
        // рефакторинга владения он молча оставался с parent=декоратор навсегда.
        this.child = child;
        this.setChildren([this.child]);
        this.markDirty();
    }

    /**
     * Бегунок — хром декоратора, рисуемый по состоянию РЕБЁНКА (scrollTop /
     * contentHeight) в колонке вне его rect'а. Damage ребёнка обязан повреждать
     * и колонку скроллбара — атомарность даёт это автоматически ценой +1
     * строки/колонки к области.
     */
    protected override get paintsSubtreeAtomically(): boolean {
        return true;
    }

    protected override performLayout(constraints: BoxConstraints): Size {
        const containerSize = super.performLayout(constraints);

        const { showVertical, showHorizontal, markers } = this.resolveScrollBarVisibility(containerSize);
        const childWidth = containerSize.width - (showVertical ? 1 : 0) - (markers === "outside" ? 1 : 0);
        const childHeight = containerSize.height - (showHorizontal ? 1 : 0);

        this.layoutChild(this.child, 0, 0, BoxConstraints.tight(new Size(childWidth, childHeight)));

        return containerSize;
    }

    public render(context: RenderContext): void {
        const { showVertical, showHorizontal, markers } = this.resolveScrollBarVisibility(this.layoutSize);

        this.renderChildren(context);

        const childWidth = this.child.layoutSize.width;
        const childHeight = this.child.layoutSize.height;
        // Токены темы + фон колонки от КАСКАДА: декоратор внутри панели/сайдбара
        // наследует фон хозяина — бывшая параметризация getScrollBarStyles(theme,
        // backgroundKey) стала свойством дерева.
        const colors: ScrollBarColors = {
            thumb: this.styleVar("scrollbarSlider.background"),
            track: this.styleVar("scrollbar.background"),
            background: this.resolvedStyle.bg,
        };

        if (showVertical) {
            const x = this.layoutSize.width - 1;
            const { contentHeight, scrollTop } = this.child;
            const markerList = markers === "none" ? [] : this.readMarkers();
            if (markers === "inside") {
                renderOverviewScrollBar(
                    context,
                    x,
                    childHeight,
                    contentHeight,
                    scrollTop,
                    childHeight,
                    colors,
                    markerList,
                );
            } else {
                renderScrollBar(context, x, childHeight, contentHeight, scrollTop, childHeight, colors);
            }
            if (markers === "outside") {
                renderScrollBarMarkerColumn(context, x - 1, childHeight, contentHeight, colors.background, markerList);
            }
        }

        if (showHorizontal) {
            renderHorizontalScrollBar(
                context,
                this.layoutSize.height - 1,
                childWidth,
                this.child.contentWidth,
                this.child.scrollLeft,
                childWidth,
                colors,
            );
        }
    }

    private resolveScrollBarVisibility(containerSize: Size): {
        showVertical: boolean;
        showHorizontal: boolean;
        markers: ResolvedMarkerPlacement;
    } {
        const showVertical = this.resolvePolicy(this.verticalScrollBar, this.child.contentHeight, containerSize.height);
        const markers = showVertical ? this.resolveMarkerPlacement(containerSize.width) : "none";
        const showHorizontal = this.resolvePolicy(
            this.horizontalScrollBar,
            this.child.contentWidth,
            containerSize.width - (showVertical ? 1 : 0) - (markers === "outside" ? 1 : 0),
        );
        return { showVertical, showHorizontal, markers };
    }

    /** Only called once {@link resolveMarkerPlacement} found the child's getter. */
    private readMarkers(): readonly IScrollBarMarker[] {
        /* v8 ignore next -- unreachable: placement is "none" for a child without getScrollBarMarkers */
        return this.child.getScrollBarMarkers?.() ?? [];
    }

    /** Markers ride on the vertical bar: no bar, no markers (and no column for them). */
    private resolveMarkerPlacement(width: number): ResolvedMarkerPlacement {
        if (this.child.getScrollBarMarkers === undefined) return "none";
        switch (this.markerPlacement) {
            case "auto":
                return width >= this.markerColumnMinWidth ? "outside" : "inside";
            default:
                return this.markerPlacement;
        }
    }

    private resolvePolicy(policy: ScrollBarPolicy, contentSize: number, viewportSize: number): boolean {
        switch (policy) {
            case "always":
                return true;
            case "never":
                return false;
            case "auto":
                return contentSize > viewportSize;
        }
    }
}

/** @deprecated Use ScrollBarDecorator instead */
export const ScrollContainerElement = ScrollBarDecorator;
