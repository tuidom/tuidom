import { segmentGraphemes } from "./segmentGraphemes.ts";
import { getCharDisplayWidth, getGraphemeDisplayWidth } from "./unicodeWidth.ts";

const DEFAULT_TAB_SIZE = 4;

/**
 * Display width of `raw` in terminal columns.
 *
 * Returns **exactly** the same number as
 * `new DisplayLine(raw, tabSize, stopAfter).displayWidth`, but without
 * allocating the per-grapheme slot array or the offset→column `Int32Array`.
 * Used by the horizontal-scrollbar width cache ({@link LineWidthCache}), where
 * only the width matters and building a full `DisplayLine` per document line is
 * what freezes the editor on long lines.
 *
 * `stopAfter` bounds the scan: any grapheme whose start offset is at or past it
 * is ignored (segmentation is lazy, so the tail is never touched). An extreme
 * line therefore costs O(stopAfter), not O(length) — mirroring VS Code's
 * `stopRenderingLineAfter`.
 *
 * The per-grapheme width rules are kept in lock-step with `DisplayLine`'s
 * constructor: tab expands to the next tab stop, `\r` is zero-width, single
 * code units go through {@link getCharDisplayWidth}, multi-code-unit clusters
 * through {@link getGraphemeDisplayWidth}.
 *
 * A prefix of printable ASCII and tabs is counted without segmentation: each
 * such code unit is a grapheme of its own (see `isStandalone` in
 * `segmentGraphemes`) one column wide, or a tab stop. Program text is mostly
 * that, and the per-grapheme generator was the whole cost of measuring a
 * 200k-line file. The last code unit of the prefix is handed back to the
 * generic path, since what follows may join it into one cluster (a combining
 * mark, a ZWJ, a variation selector).
 */
export function measureTextWidth(raw: string, tabSize: number = DEFAULT_TAB_SIZE, stopAfter = Infinity): number {
    const end = Math.min(raw.length, stopAfter);
    let column = 0;
    let columnBefore = 0;
    let i = 0;
    for (; i < end; i++) {
        const c = raw.charCodeAt(i);
        if (c === 0x09) {
            columnBefore = column;
            column += tabSize - (column % tabSize);
        } else if (c >= 0x20 && c <= 0x7e) {
            columnBefore = column;
            column++;
        } else {
            break;
        }
    }
    // The whole string is such a prefix: nothing after it can join its last code unit.
    if (i >= raw.length) return column;

    // Resume one code unit back, where the break is certain, from the column before it.
    const start = Math.max(0, i - 1);
    if (start < i) column = columnBefore;
    const tail = start === 0 ? raw : raw.slice(start);
    for (const { segment, index } of segmentGraphemes(tail)) {
        if (start + index >= stopAfter) break;

        if (segment === "\t") {
            column += tabSize - (column % tabSize);
        } else if (segment === "\r") {
            // zero width
        } else if (segment.length === 1) {
            column += getCharDisplayWidth(segment.charCodeAt(0));
        } else {
            column += getGraphemeDisplayWidth(segment);
        }
    }

    return column;
}
