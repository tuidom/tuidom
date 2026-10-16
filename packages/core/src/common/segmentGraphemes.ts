/** One grapheme cluster of a string — the shape of `Intl.SegmentData` callers use. */
export interface GraphemeSegment {
    /** The grapheme cluster. */
    readonly segment: string;
    /** Its start offset in the source string (code units). */
    readonly index: number;
}

let segmenter: Intl.Segmenter | null = null;

/**
 * BMP code points that are always a grapheme of their own next to each other:
 * inclusive `[from, to]`, ascending. Beyond the Latin-1 + Latin Extended
 * prefix checked inline in {@link isStandalone}.
 *
 * Every code point here has the UAX #29 Grapheme_Cluster_Break value `Other`
 * or `Control` (CR and LF excluded). Between two such code points there is
 * always a break: GB4/GB5 for `Control`, GB999 for `Other`, and the rules that
 * could keep two of them together (GB9c, GB11, GB12/13) need an `Extend`,
 * `ZWJ` or regional indicator right before the break. The exhaustive test in
 * `segmentGraphemes.test.ts` checks every code point here against ICU.
 */
const STANDALONE_RANGES: readonly (readonly [from: number, to: number])[] = [
    [0x0370, 0x0482], // Greek, Cyrillic up to the combining titlo
    [0x048a, 0x052f], // Cyrillic, Cyrillic Supplement
    [0x2010, 0x2027], // dashes, quotes, bullets, ellipsis
    [0x2030, 0x205e], // per mille, primes, punctuation
    [0x2070, 0x20cf], // super/subscripts, currency
    [0x2100, 0x23ff], // letterlike, number forms, arrows, math, technical
    [0x2400, 0x27bf], // control pictures, box drawing, blocks, shapes, symbols, dingbats
    [0x27c0, 0x2bff], // math, arrows, braille, symbols
    [0xe000, 0xf8ff], // Private Use Area — icon fonts
];

/**
 * `true` when code unit `c` always forms a grapheme of its own next to another
 * such code unit: everything below U+0300 except CR and LF, plus
 * {@link STANDALONE_RANGES}.
 */
function isStandalone(c: number): boolean {
    if (c < 0x0300) return c !== 0x0a && c !== 0x0d;
    for (const [from, to] of STANDALONE_RANGES) {
        if (c < from) return false;
        if (c <= to) return true;
    }
    return false;
}

function segmentWithIcu(raw: string): Intl.Segments {
    segmenter ??= new Intl.Segmenter("en", { granularity: "grapheme" });
    return segmenter.segment(raw);
}

function* segmentFrom(raw: string): Generator<GraphemeSegment, void, undefined> {
    let i = 0;
    let standalone = raw.length > 0 && isStandalone(raw.charCodeAt(0));
    while (i < raw.length) {
        const nextStandalone = i + 1 >= raw.length || isStandalone(raw.charCodeAt(i + 1));
        // Break before `i` is certain (start of string, or two standalone code
        // units); the cluster at `i` is one code unit only if its right
        // neighbour is standalone too.
        if (!standalone || !nextStandalone) break;
        yield { segment: raw[i], index: i };
        i++;
        standalone = nextStandalone;
    }
    if (i >= raw.length) return;
    // The rest goes to ICU from a certain break: no rule looks back across a
    // break between two standalone code units, so the tail segments as it
    // would inside the whole string.
    const tail = i === 0 ? raw : raw.slice(i);
    for (const { segment, index } of segmentWithIcu(tail)) {
        yield { segment, index: index + i };
    }
}

/**
 * Grapheme segmentation of `raw`, lazy as `Intl.Segmenter.segment`: a caller
 * that stops early never touches the tail.
 *
 * Text where every code unit is a grapheme of its own (ASCII, Latin, Cyrillic,
 * Greek, punctuation, box drawing, symbols, icon PUA) is split by code units
 * without ICU — the same answer, but without loading ICU's break iterator,
 * which costs a first frame ~15 ms. From the first code unit outside that set
 * the rest of the string goes to `Intl.Segmenter`. VS Code does the same with
 * its `isBasicASCII` fast paths and its own grapheme break table.
 *
 * The segmenter is created on first need, not at module load: a native `Intl`
 * object held by a module-level binding cannot be serialized into a V8 startup
 * snapshot, and hosts build one from the whole engine graph
 * (`npm run check:snapshot`).
 */
export function segmentGraphemes(raw: string): Iterable<GraphemeSegment> {
    return segmentFrom(raw);
}
