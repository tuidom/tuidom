export interface IContentSized {
    readonly contentHeight: number;
    readonly contentWidth: number;
}

/**
 * A mark on the vertical scrollbar track (an overview ruler à la VS Code): content rows
 * `[start, end)` squeezed into the track's cells. `end === start` marks the single row `start`.
 */
export interface IScrollBarMarker {
    readonly start: number;
    readonly end: number;
    /** Packed colour, as `styleVar` returns it. */
    readonly color: number;
    /** When several markers share a cell, the highest priority paints it. */
    readonly priority: number;
}

export interface IScrollable extends IContentSized {
    readonly scrollTop: number;
    readonly scrollLeft: number;
    /**
     * Marks to draw over the vertical scrollbar. Read on every render of the decorator, so a
     * change must reach the screen through the child's own `markDirty`.
     */
    getScrollBarMarkers?(): readonly IScrollBarMarker[];
}
