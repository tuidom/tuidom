import { BoxConstraints, Offset, Point, Rect, Size } from "@tuidom/core/common/geometryPromitives";
import type { TUIMouseEvent } from "@tuidom/core/dom/events/tuiMouseEvent";
import { RenderContext, TUIElement } from "@tuidom/core/dom/tuiElement";

import type { IScrollable, IScrollBarMarker } from "./iScrollable.ts";
import type { ScrollBarColors } from "./scrollBarRenderer.ts";
import {
    computeScrollBarCellMetrics,
    renderHorizontalScrollBar,
    renderOverviewScrollBar,
    renderScrollBar,
    renderScrollBarMarkerColumn,
    scrollPositionForThumbStart,
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

type ScrollBarAxis = "vertical" | "horizontal";

/** A thumb held by the left button: the axis and the cell of the thumb under the pointer. */
interface ThumbDrag {
    readonly axis: ScrollBarAxis;
    readonly grabOffset: number;
}

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

    private drag: ThumbDrag | null = null;

    public constructor(child: TUIElement & IScrollable) {
        super();
        this.child = child;
        this.appendChild(this.child);
        // A thumb drag keeps going when the pointer leaves the bar, as in VS Code. Presses on the
        // child target the child, so the capture covers only the decorator's own cells.
        this.capturesPointer = true;
        this.addEventListener("mousedown", (event) => {
            this.handleMouseDown(event);
        });
        this.addEventListener("mousemove", (event) => {
            this.handleMouseMove(event);
        });
        this.addEventListener("mouseup", () => {
            this.drag = null;
        });
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

        const layOut = (): string => {
            const { showVertical, showHorizontal, markers } = this.resolveScrollBarVisibility(containerSize);
            const childWidth = containerSize.width - (showVertical ? 1 : 0) - (markers === "outside" ? 1 : 0);
            const childHeight = containerSize.height - (showHorizontal ? 1 : 0);
            this.layoutChild(this.child, 0, 0, BoxConstraints.tight(new Size(childWidth, childHeight)));
            return `${String(childWidth)}x${String(childHeight)}`;
        };
        // Полосы решаются по размеру контента, а он мог стать другим от самого layout ребёнка: строки
        // с переносом по новой ширине стали выше — и полоса нужна. Второй проход отдаёт ребёнку место
        // под неё, иначе он остался бы разложенным под колонку, где рисуется полоса.
        const first = layOut();
        if (layOut() !== first) layOut();

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

    /**
     * VS Code's `AbstractScrollbar`: a press on the thumb grabs it; a press on the track moves the
     * thumb's middle under the pointer (`getDesiredScrollPositionFromOffset`) and grabs it there,
     * so the same press can go on dragging.
     */
    private handleMouseDown(event: TUIMouseEvent): void {
        // A press bubbling up from the child is the child's own business.
        if (event.target !== this || event.button !== "left" || this.child.scrollTo === undefined) return;
        const axis = this.scrollBarAt(event.localX, event.localY);
        if (axis === null) return;
        const offset = axis === "vertical" ? event.localY : event.localX;
        const { thumbStart, thumbSize } = this.thumbMetrics(axis);
        const onThumb = offset >= thumbStart && offset < thumbStart + thumbSize;
        const grabOffset = onThumb ? offset - thumbStart : Math.floor(thumbSize / 2);
        this.drag = { axis, grabOffset };
        if (!onThumb) this.moveThumb(axis, offset - grabOffset);
    }

    private handleMouseMove(event: TUIMouseEvent): void {
        if (this.drag === null) return;
        const offset = this.drag.axis === "vertical" ? event.localY : event.localX;
        this.moveThumb(this.drag.axis, offset - this.drag.grabOffset);
    }

    /** Which bar the decorator's own cell belongs to; the marker column counts as the vertical bar. */
    private scrollBarAt(localX: number, localY: number): ScrollBarAxis | null {
        const childWidth = this.child.layoutSize.width;
        const childHeight = this.child.layoutSize.height;
        if (localX >= childWidth && localY < childHeight) return "vertical";
        if (localY >= childHeight && localX < childWidth) return "horizontal";
        // The corner where the bars meet belongs to neither.
        return null;
    }

    private thumbMetrics(axis: ScrollBarAxis): { thumbStart: number; thumbSize: number } {
        const { child } = this;
        const { width, height } = child.layoutSize;
        return axis === "vertical"
            ? computeScrollBarCellMetrics(height, child.contentHeight, child.scrollTop, height)
            : computeScrollBarCellMetrics(width, child.contentWidth, child.scrollLeft, width);
    }

    private moveThumb(axis: ScrollBarAxis, thumbStart: number): void {
        const { child } = this;
        const { width, height } = child.layoutSize;
        if (axis === "vertical") {
            child.scrollTo?.(
                child.scrollLeft,
                scrollPositionForThumbStart(thumbStart, height, child.contentHeight, height),
            );
        } else {
            child.scrollTo?.(
                scrollPositionForThumbStart(thumbStart, width, child.contentWidth, width),
                child.scrollTop,
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
