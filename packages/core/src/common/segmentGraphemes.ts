let segmenter: Intl.Segmenter | null = null;

/**
 * Grapheme segmentation of `raw` (lazy iterator, as `Intl.Segmenter.segment`).
 *
 * The segmenter is created on first call, not at module load: a native `Intl`
 * object held by a module-level binding cannot be serialized into a V8 startup
 * snapshot, and hosts build one from the whole engine graph
 * (`npm run check:snapshot`). The extra cost on the hot path is one null check.
 */
export function segmentGraphemes(raw: string): Intl.Segments {
    segmenter ??= new Intl.Segmenter("en", { granularity: "grapheme" });
    return segmenter.segment(raw);
}
