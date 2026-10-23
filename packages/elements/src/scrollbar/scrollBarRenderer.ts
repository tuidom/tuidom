import { compositeOver, packRgba, unpackA, unpackB, unpackG, unpackR } from "@tuidom/core/common/colorUtils";
import type { RenderContext } from "@tuidom/core/dom/tuiElement";

import type { IScrollBarMarker } from "./iScrollable.ts";

/**
 * Resolved scrollbar colours. `background` fills the half of each cell the bar
 * itself does not paint — the scrollbar lives on a dedicated row/column that the
 * child never draws into, so without it those cells keep the terminal's default
 * background and the bar looks like a hole punched through the widget.
 */
export interface ScrollBarColors {
    readonly thumb: number;
    readonly track: number;
    readonly background: number;
}

export interface ScrollBarMetrics {
    /** Thumb start position in half-cell units (0 = top of track). */
    thumbStartHalves: number;
    /** Thumb size in half-cell units (minimum 2 = 1 full cell). */
    thumbSizeHalves: number;
}

export function computeScrollBarMetrics(
    trackHeight: number,
    contentHeight: number,
    scrollTop: number,
    viewportHeight: number,
): ScrollBarMetrics {
    const trackHalves = trackHeight * 2;

    if (contentHeight <= viewportHeight) {
        return { thumbStartHalves: 0, thumbSizeHalves: trackHalves };
    }

    const thumbSizeHalves = Math.max(2, Math.round((viewportHeight / contentHeight) * trackHalves));
    const maxScroll = contentHeight - viewportHeight;
    const scrollFraction = Math.min(1, Math.max(0, scrollTop / maxScroll));
    const thumbStartHalves = Math.round(scrollFraction * (trackHalves - thumbSizeHalves));

    return { thumbStartHalves, thumbSizeHalves };
}

/**
 * For each cell row, determine the character to display.
 *
 * Each cell covers 2 halves: top half and bottom half.
 * - Both halves inside thumb → "█"
 * - Only top half inside thumb → "▀"
 * - Only bottom half inside thumb → "▄"
 * - Neither half inside thumb → " "
 */
export function getScrollBarCellChars(trackHeight: number, metrics: ScrollBarMetrics): string[] {
    const { thumbStartHalves, thumbSizeHalves } = metrics;
    const thumbEndHalves = thumbStartHalves + thumbSizeHalves;
    const result: string[] = [];

    for (let row = 0; row < trackHeight; row++) {
        const topHalf = row * 2;
        const bottomHalf = topHalf + 1;

        const topInThumb = topHalf >= thumbStartHalves && topHalf < thumbEndHalves;
        const bottomInThumb = bottomHalf >= thumbStartHalves && bottomHalf < thumbEndHalves;

        if (topInThumb && bottomInThumb) {
            result.push("█");
        } else if (topInThumb) {
            result.push("▀");
        } else if (bottomInThumb) {
            result.push("▄");
        } else {
            result.push("░");
        }
    }

    return result;
}

/** The marker that won a track cell, and how many markers fell into it. */
export interface ScrollBarMarkerCell {
    readonly color: number;
    readonly priority: number;
    readonly count: number;
    /**
     * The part of the cell covered by marks of the winner's kind longer than one row: a block of
     * added lines reads as one bar (ends at half-cell precision) instead of a ladder of marks.
     * `undefined` draws the density glyph.
     */
    readonly fill: ScrollBarMarkerFill | undefined;
}

export type ScrollBarMarkerFill = "full" | "top" | "bottom";

/** Marks sharing a colour and priority, and (once a cell asks) the cells they fill. */
interface MarkerKind {
    /** Positions in the marker array, in marker order. */
    readonly indices: number[];
    fills: (ScrollBarMarkerFill | undefined)[] | undefined;
}

interface MarkerWinner {
    color: number;
    priority: number;
    count: number;
    kind: MarkerKind;
}

interface MarkerLayout {
    readonly trackHeight: number;
    readonly contentHeight: number;
    readonly cells: readonly (ScrollBarMarkerCell | undefined)[];
}

/**
 * The last layout of each marker array. A scrollable hands out the same array while its marks
 * do not change, so a frame that only scrolls or moves the caret pays nothing for them. Created
 * on first use: the module's top level stays free of live objects (V8 snapshot).
 */
let layouts: WeakMap<readonly IScrollBarMarker[], MarkerLayout> | null = null;

/**
 * Squeezes markers into track cells. Content row `r` lands in cell
 * `floor(r * trackHeight / max(contentHeight, trackHeight))`: short content keeps one row per
 * cell, long content shares a cell among several rows.
 *
 * The layout is computed once per marker array (and track) and reused for the same array: a
 * scrollable must return a new array when its marks change, never mutate the one it gave out.
 */
export function getScrollBarMarkerCells(
    trackHeight: number,
    contentHeight: number,
    markers: readonly IScrollBarMarker[],
): readonly (ScrollBarMarkerCell | undefined)[] {
    layouts ??= new WeakMap();
    const cached = layouts.get(markers);
    if (cached?.trackHeight === trackHeight && cached.contentHeight === contentHeight) return cached.cells;
    const cells = layoutScrollBarMarkers(trackHeight, contentHeight, markers);
    layouts.set(markers, { trackHeight, contentHeight, cells });
    return cells;
}

function layoutScrollBarMarkers(
    trackHeight: number,
    contentHeight: number,
    markers: readonly IScrollBarMarker[],
): (ScrollBarMarkerCell | undefined)[] {
    const cells: (ScrollBarMarkerCell | undefined)[] = new Array<ScrollBarMarkerCell | undefined>(trackHeight).fill(
        undefined,
    );
    if (trackHeight <= 0 || markers.length === 0) return cells;
    const rows = Math.max(contentHeight, trackHeight);
    const clampRow = (row: number): number => Math.min(rows - 1, Math.max(0, row));
    const cellOf = (row: number): number => Math.floor((clampRow(row) * trackHeight) / rows);
    const firstRowOf = (cell: number): number => Math.ceil((cell * rows) / trackHeight);

    // One pass over the marks: the span clamped to the content (`end === start` widened to the
    // single row it marks), its kind, and the cells it wins. Typed arrays and no per-mark
    // objects: a word with 200 K occurrences lays out on every caret move.
    const count = markers.length;
    const starts = new Float64Array(count);
    const ends = new Float64Array(count);
    // A cell is filled only under marks of its winner's kind (same colour and priority): a
    // one-line change among occurrences of the word under the cursor stays a thin mark. Within a
    // kind the spans are merged, so overlapping marks do not count a row twice, and one of them
    // must itself run past a row: adjacent one-row marks (find matches) stay sparse.
    const kindsByPriority = new Map<number, Map<number, MarkerKind>>();
    const winners = new Array<MarkerWinner | undefined>(trackHeight).fill(undefined);
    // Marks of one kind come in runs; only a change of kind looks it up.
    let kind: MarkerKind | undefined;
    let kindPriority = NaN;
    let kindColor = NaN;
    for (let i = 0; i < count; i++) {
        const { priority, color } = markers[i];
        const start = clampRow(markers[i].start);
        const end = Math.min(rows, Math.max(markers[i].end, start + 1));
        starts[i] = start;
        ends[i] = end;
        if (kind === undefined || priority !== kindPriority || color !== kindColor) {
            let byColor = kindsByPriority.get(priority);
            if (byColor === undefined) {
                byColor = new Map();
                kindsByPriority.set(priority, byColor);
            }
            kind = byColor.get(color);
            if (kind === undefined) {
                kind = { indices: [], fills: undefined };
                byColor.set(color, kind);
            }
            kindPriority = priority;
            kindColor = color;
        }
        kind.indices.push(i);
        const last = cellOf(end - 1);
        for (let cell = cellOf(start); cell <= last; cell++) {
            const prev = winners[cell];
            if (prev === undefined) {
                winners[cell] = { color, priority, count: 1, kind };
            } else {
                if (priority > prev.priority) {
                    prev.color = color;
                    prev.priority = priority;
                    prev.kind = kind;
                }
                prev.count++;
            }
        }
    }

    const overlap = (start: number, end: number, from: number, to: number): number =>
        Math.max(0, Math.min(end, to) - Math.max(start, from));
    // The kind's marks in row order. Marks usually arrive sorted (occurrences, find matches), and
    // then the order is the marker order; only an unsorted kind pays for a sort.
    const inRowOrder = (indices: readonly number[]): readonly number[] => {
        for (let k = 1; k < indices.length; k++) {
            if (starts[indices[k]] < starts[indices[k - 1]]) {
                return [...indices].sort((a, b) => starts[a] - starts[b]);
            }
        }
        return indices;
    };
    const computeFills = (ofKind: MarkerKind): (ScrollBarMarkerFill | undefined)[] => {
        const top = new Array<number>(trackHeight).fill(0);
        const bottom = new Array<number>(trackHeight).fill(0);
        const inRun = new Array<boolean>(trackHeight).fill(false);
        const sorted = inRowOrder(ofKind.indices);
        for (const i of sorted) {
            if (ends[i] - starts[i] < 2) continue;
            const last = cellOf(ends[i] - 1);
            for (let cell = cellOf(starts[i]); cell <= last; cell++) inRun[cell] = true;
        }
        let k = 0;
        while (k < sorted.length) {
            const start = starts[sorted[k]];
            let end = ends[sorted[k]];
            for (k++; k < sorted.length && starts[sorted[k]] <= end; k++) end = Math.max(end, ends[sorted[k]]);
            for (let cell = cellOf(start); cell <= cellOf(end - 1); cell++) {
                const from = firstRowOf(cell);
                const mid = (from + firstRowOf(cell + 1)) / 2;
                top[cell] += overlap(start, end, from, mid);
                bottom[cell] += overlap(start, end, mid, firstRowOf(cell + 1));
            }
        }
        return top.map((topRows, cell): ScrollBarMarkerFill | undefined => {
            if (!inRun[cell]) return undefined;
            // A half counts as filled when the marks cover more than half of its rows.
            const quarter = (firstRowOf(cell + 1) - firstRowOf(cell)) / 4;
            const topFilled = topRows > quarter;
            const bottomFilled = bottom[cell] > quarter;
            if (topFilled && bottomFilled) return "full";
            if (topFilled) return "top";
            return bottomFilled ? "bottom" : undefined;
        });
    };

    for (let cell = 0; cell < trackHeight; cell++) {
        const winner = winners[cell];
        if (winner === undefined) continue;
        winner.kind.fills ??= computeFills(winner.kind);
        cells[cell] = {
            color: winner.color,
            priority: winner.priority,
            count: winner.count,
            fill: winner.kind.fills[cell],
        };
    }
    return cells;
}

/** Density glyph: one, two, three or more markers in the cell. */
export function getScrollBarMarkerChar(count: number): string {
    if (count >= 3) return "≡";
    return count === 2 ? "═" : "─";
}

/**
 * The ░ shade as a flat colour: the glyph inks about a quarter of the cell. Marked cells cannot
 * keep the glyph (their own glyph takes the cell), so with markers inside the bar the whole
 * track goes flat.
 */
export function getFlatTrackColor(track: number, background: number): number {
    if (track < 0) return background;
    const alpha = Math.round(unpackA(track) / 4);
    return compositeOver(packRgba(unpackR(track), unpackG(track), unpackB(track), alpha), background);
}

/** Classic bar: a half-block thumb over a ░ track. */
export function renderScrollBar(
    context: RenderContext,
    x: number,
    trackHeight: number,
    contentHeight: number,
    scrollTop: number,
    viewportHeight: number,
    colors: ScrollBarColors,
): void {
    const metrics = computeScrollBarMetrics(trackHeight, contentHeight, scrollTop, viewportHeight);
    const chars = getScrollBarCellChars(trackHeight, metrics);

    for (let row = 0; row < trackHeight; row++) {
        const char = chars[row];
        const fg = char === "░" ? colors.track : colors.thumb;
        context.setCell(x, row, { char, fg, bg: colors.background });
    }
}

/** Thumb position in whole cells: the bar with markers inside it. */
export interface ScrollBarCellMetrics {
    readonly thumbStart: number;
    readonly thumbSize: number;
}

export function computeScrollBarCellMetrics(
    trackHeight: number,
    contentHeight: number,
    scrollTop: number,
    viewportHeight: number,
): ScrollBarCellMetrics {
    if (contentHeight <= viewportHeight) return { thumbStart: 0, thumbSize: trackHeight };
    const thumbSize = Math.min(trackHeight, Math.max(1, Math.round((viewportHeight / contentHeight) * trackHeight)));
    const scrollFraction = Math.min(1, Math.max(0, scrollTop / (contentHeight - viewportHeight)));
    return { thumbStart: Math.round(scrollFraction * (trackHeight - thumbSize)), thumbSize };
}

/**
 * Paints one marked cell over `bg`: a density glyph, a half block at the end of a run, or a full
 * fill (`fullBg` — the run's colour, possibly tinted by the thumb).
 */
function paintMarkerCell(
    context: RenderContext,
    x: number,
    row: number,
    marker: ScrollBarMarkerCell,
    bg: number,
    fullBg: number,
): void {
    if (marker.fill === "full") {
        context.setCell(x, row, { char: " ", bg: fullBg });
        return;
    }
    const char = marker.fill === undefined ? getScrollBarMarkerChar(marker.count) : marker.fill === "top" ? "▀" : "▄";
    context.setCell(x, row, { char, fg: compositeOver(marker.color, bg), bg });
}

/**
 * Markers inside the bar (an overview ruler, as in VS Code). One cell has one foreground, so the
 * thumb cannot keep its half-block edge under a mark; instead it moves in whole cells and shows
 * as the cell background. Coarser, but it never jumps by half a cell when an edge meets a mark.
 */
export function renderOverviewScrollBar(
    context: RenderContext,
    x: number,
    trackHeight: number,
    contentHeight: number,
    scrollTop: number,
    viewportHeight: number,
    colors: ScrollBarColors,
    markers: readonly IScrollBarMarker[],
): void {
    // Colours are flattened up front: every cell is painted opaque, whatever the theme's alpha.
    const trackBg = getFlatTrackColor(colors.track, colors.background);
    const thumbBg = compositeOver(colors.thumb, colors.background);
    const { thumbStart, thumbSize } = computeScrollBarCellMetrics(
        trackHeight,
        contentHeight,
        scrollTop,
        viewportHeight,
    );
    const markerCells = getScrollBarMarkerCells(trackHeight, contentHeight, markers);

    for (let row = 0; row < trackHeight; row++) {
        const onThumb = row >= thumbStart && row < thumbStart + thumbSize;
        const bg = onThumb ? thumbBg : trackBg;
        const marker = markerCells[row];
        if (marker === undefined) {
            context.setCell(x, row, { char: " ", bg });
            continue;
        }
        // The translucent thumb lies over a full mark, as in VS Code's overview ruler.
        const fill = compositeOver(marker.color, colors.background);
        paintMarkerCell(context, x, row, marker, bg, onThumb ? compositeOver(colors.thumb, fill) : fill);
    }
}

/** Markers in a column of their own beside the bar: no thumb to share the cells with. */
export function renderScrollBarMarkerColumn(
    context: RenderContext,
    x: number,
    trackHeight: number,
    contentHeight: number,
    background: number,
    markers: readonly IScrollBarMarker[],
): void {
    const markerCells = getScrollBarMarkerCells(trackHeight, contentHeight, markers);
    for (let row = 0; row < trackHeight; row++) {
        const marker = markerCells[row];
        if (marker === undefined) {
            context.setCell(x, row, { char: " ", bg: background });
            continue;
        }
        paintMarkerCell(context, x, row, marker, background, compositeOver(marker.color, background));
    }
}

/**
 * Horizontal bar on its own row. Uses "▄" (LOWER half block) so the bar sits on
 * the bottom edge of the row, hugging the widget's frame rather than floating a
 * half-cell above it.
 */
export function renderHorizontalScrollBar(
    context: RenderContext,
    y: number,
    trackWidth: number,
    contentWidth: number,
    scrollLeft: number,
    viewportWidth: number,
    colors: ScrollBarColors,
): void {
    if (contentWidth <= viewportWidth) {
        // Content fits — only reachable under policy "always"; the thumb spans the track.
        for (let col = 0; col < trackWidth; col++) {
            context.setCell(col, y, { char: "▄", fg: colors.thumb, bg: colors.background });
        }
        return;
    }

    const thumbSize = Math.max(1, Math.round((viewportWidth / contentWidth) * trackWidth));
    const maxScroll = contentWidth - viewportWidth;
    const scrollFraction = Math.min(1, Math.max(0, scrollLeft / maxScroll));
    const thumbStart = Math.round(scrollFraction * (trackWidth - thumbSize));
    const thumbEnd = thumbStart + thumbSize;

    for (let col = 0; col < trackWidth; col++) {
        const inThumb = col >= thumbStart && col < thumbEnd;
        context.setCell(col, y, { char: "▄", fg: inThumb ? colors.thumb : colors.track, bg: colors.background });
    }
}
