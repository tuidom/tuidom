import { afterEach, describe, expect, it, vi } from "vitest";

import { segmentGraphemes } from "./segmentGraphemes.ts";

const icu = new Intl.Segmenter("en", { granularity: "grapheme" });

function ours(raw: string): [string, number][] {
    return Array.from(segmentGraphemes(raw), ({ segment, index }) => [segment, index]);
}

function reference(raw: string): [string, number][] {
    return Array.from(icu.segment(raw), ({ segment, index }) => [segment, index]);
}

describe("segmentGraphemes", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("совпадает с ICU на каждом коде BMP рядом с ASCII и рядом с собой", () => {
        // Склеить два кода может только правило, у которого с одной стороны
        // Extend/ZWJ/SpacingMark (ловит "a"+c), Prepend (ловит c+"a") или
        // L/V/T/RI (ловит c+c). Совпадение обеих проб по всей BMP значит, что
        // код, который фастпас режет сам, — Other или Control, а между такими
        // граница всегда (UAX #29: GB4/GB5/GB999).
        const mismatches: string[] = [];
        for (let c = 0; c <= 0xffff; c++) {
            if (c >= 0xd800 && c <= 0xdfff) continue;
            const ch = String.fromCharCode(c);
            for (const probe of [`a${ch}a`, ch + ch]) {
                if (JSON.stringify(ours(probe)) !== JSON.stringify(reference(probe))) {
                    mismatches.push(`U+${c.toString(16).padStart(4, "0")}`);
                }
            }
        }

        expect(mismatches).toEqual([]);
    });

    it("совпадает с ICU на случайных смесях простого и сложного текста", () => {
        const pieces = [
            "a",
            "Z",
            " ",
            "\t",
            "\r",
            "\n",
            "\r\n",
            "é",
            "ж",
            "─",
            "\u{e0b0}",
            "€",
            "é",
            "́",
            "‍",
            "️",
            "👍",
            "👍🏽",
            "👨‍👩‍👧",
            "🇷🇺",
            "🇷",
            "한",
            "가",
            "ᆨ",
            "中",
            "क्ष",
            "؀",
            "ः",
        ];
        let seed = 1;
        const random = (n: number): number => {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return seed % n;
        };
        for (let run = 0; run < 3000; run++) {
            let raw = "";
            const count = 1 + random(12);
            for (let k = 0; k < count; k++) raw += pieces[random(pieces.length)];

            expect(ours(raw), JSON.stringify(raw)).toEqual(reference(raw));
        }
    });

    it("простой текст не трогает ICU", () => {
        const spy = vi.spyOn(Intl.Segmenter.prototype, "segment");

        const segments = ours("File  Edit\t─ ж é \u{e0b0}");

        expect(spy).not.toHaveBeenCalled();
        expect(segments.map(([segment]) => segment).join("")).toBe("File  Edit\t─ ж é \u{e0b0}");
    });

    it("хвост со сложным символом уходит в ICU с последней верной границы, офсеты — от начала строки", () => {
        const spy = vi.spyOn(Intl.Segmenter.prototype, "segment");

        expect(ours("ab éx")).toEqual([
            ["a", 0],
            ["b", 1],
            [" ", 2],
            ["é", 3],
            ["x", 5],
        ]);
        expect(spy).toHaveBeenCalledWith("éx");
    });

    it("сложный первый символ — вся строка в ICU без копии", () => {
        const spy = vi.spyOn(Intl.Segmenter.prototype, "segment");
        const raw = "́ab";

        expect(ours(raw)).toEqual(reference(raw));
        expect(spy).toHaveBeenCalledWith(raw);
    });

    it("CR LF — одна графема", () => {
        expect(ours("a\r\nb")).toEqual([
            ["a", 0],
            ["\r\n", 1],
            ["b", 3],
        ]);
    });

    it("пустая строка — без сегментов", () => {
        expect(ours("")).toEqual([]);
    });

    it("ленив: остановка на префиксе не разбирает хвост", () => {
        const spy = vi.spyOn(Intl.Segmenter.prototype, "segment");
        const iterator = segmentGraphemes("ab" + "é".repeat(10))[Symbol.iterator]();

        expect(iterator.next().value).toEqual({ segment: "a", index: 0 });
        expect(spy).not.toHaveBeenCalled();
    });
});
