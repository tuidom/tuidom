import { describe, expect, it } from "vitest";

import {
    blendRgb,
    compositeOver,
    DEFAULT_COLOR,
    formatHexColor,
    isColorValue,
    isTranslucent,
    packRgb,
    packRgba,
    parseHexColor,
    TRANSPARENT_COLOR,
    unpackA,
    unpackB,
    unpackG,
    unpackR,
} from "./colorUtils.ts";

// Модель цвета с альфой: непрозрачный цвет — прежнее 24-битное число (весь
// существующий код с литералами 0xRRGGBB валиден), полупрозрачный — 0xAARRGGBB
// беззнаково (> 0xFFFFFF), полностью прозрачный — сентинел TRANSPARENT_COLOR.

describe("packRgba / unpackA", () => {
    it("альфа 255 — обычное 24-битное число, неотличимое от packRgb", () => {
        expect(packRgba(1, 2, 3, 255)).toBe(packRgb(1, 2, 3));
        expect(isTranslucent(packRgba(1, 2, 3, 255))).toBe(false);
        expect(unpackA(packRgb(1, 2, 3))).toBe(255);
    });

    it("альфа 0 — TRANSPARENT_COLOR, RGB отбрасывается", () => {
        expect(packRgba(200, 100, 50, 0)).toBe(TRANSPARENT_COLOR);
        expect(unpackA(TRANSPARENT_COLOR)).toBe(0);
        expect(isTranslucent(TRANSPARENT_COLOR)).toBe(false);
    });

    it("промежуточная альфа — в старшем байте, каналы читаются штатными unpack*", () => {
        const color = packRgba(0xcd, 0xd6, 0xf4, 0x12);
        expect(color).toBe(0x12cdd6f4);
        expect(color).toBeGreaterThan(0xffffff);
        expect(isTranslucent(color)).toBe(true);
        expect(unpackA(color)).toBe(0x12);
        expect(unpackR(color)).toBe(0xcd);
        expect(unpackG(color)).toBe(0xd6);
        expect(unpackB(color)).toBe(0xf4);
    });

    it("старшая альфа 254 не уходит в отрицательные (беззнаковая упаковка)", () => {
        const color = packRgba(255, 255, 255, 254);
        expect(color).toBe(0xfeffffff);
        expect(color).toBeGreaterThan(0);
        expect(unpackA(color)).toBe(254);
        expect(unpackR(color)).toBe(255);
        expect(unpackB(color)).toBe(255);
    });

    it("сентинелы непрозрачны для unpackA", () => {
        expect(unpackA(DEFAULT_COLOR)).toBe(255);
    });
});

describe("isColorValue", () => {
    it("принимает RGB, RGBA, DEFAULT_COLOR и TRANSPARENT_COLOR", () => {
        expect(isColorValue(0)).toBe(true);
        expect(isColorValue(0xffffff)).toBe(true);
        expect(isColorValue(packRgba(1, 2, 3, 0x80))).toBe(true);
        expect(isColorValue(0xfeffffff)).toBe(true);
        expect(isColorValue(DEFAULT_COLOR)).toBe(true);
        expect(isColorValue(TRANSPARENT_COLOR)).toBe(true);
    });

    it("отвергает сентинелы каскада, дробные и выход за диапазон", () => {
        expect(isColorValue(-100)).toBe(false);
        expect(isColorValue(-101)).toBe(false);
        expect(isColorValue(1.5)).toBe(false);
        expect(isColorValue(0xffffffff)).toBe(false);
        expect(isColorValue(NaN)).toBe(false);
    });
});

describe("compositeOver", () => {
    const under = packRgb(0x1e, 0x1e, 0x2e);

    it("непрозрачный цвет и DEFAULT_COLOR проходят как есть", () => {
        expect(compositeOver(0xabcdef, under)).toBe(0xabcdef);
        expect(compositeOver(0, under)).toBe(0);
        expect(compositeOver(DEFAULT_COLOR, under)).toBe(DEFAULT_COLOR);
    });

    it("TRANSPARENT_COLOR оставляет подложку", () => {
        expect(compositeOver(TRANSPARENT_COLOR, under)).toBe(under);
        expect(compositeOver(TRANSPARENT_COLOR, DEFAULT_COLOR)).toBe(DEFAULT_COLOR);
    });

    it("полупрозрачный цвет смешивается с подложкой по альфе (source-over)", () => {
        const color = packRgba(0xcd, 0xd6, 0xf4, 0x12);
        expect(compositeOver(color, under)).toBe(blendRgb(packRgb(0xcd, 0xd6, 0xf4), under, 0x12 / 0xff));
        expect(compositeOver(packRgba(255, 255, 255, 0x80), 0)).toBe(packRgb(128, 128, 128));
    });

    it("результат всегда непрозрачный", () => {
        expect(isTranslucent(compositeOver(packRgba(1, 2, 3, 0x40), under))).toBe(false);
    });

    it("над DEFAULT_COLOR смешивать не с чем — альфа отбрасывается", () => {
        expect(compositeOver(packRgba(0xcd, 0xd6, 0xf4, 0x12), DEFAULT_COLOR)).toBe(packRgb(0xcd, 0xd6, 0xf4));
    });

    it("альфа 254 — почти цвет, а не мусор от знакового сдвига", () => {
        expect(compositeOver(packRgba(255, 255, 255, 254), 0)).toBe(packRgb(254, 254, 254));
    });
});

describe("parseHexColor", () => {
    it("#RRGGBB и без решётки — непрозрачный 24-битный", () => {
        expect(parseHexColor("#1e1e2e")).toBe(0x1e1e2e);
        expect(parseHexColor("1E1E2E")).toBe(0x1e1e2e);
    });

    it("#RRGGBBAA — с альфой; ff — непрозрачный; 00 — TRANSPARENT_COLOR", () => {
        expect(parseHexColor("#cdd6f412")).toBe(packRgba(0xcd, 0xd6, 0xf4, 0x12));
        expect(parseHexColor("#9399b240")).toBe(0x409399b2);
        expect(parseHexColor("#cdd6f4ff")).toBe(0xcdd6f4);
        expect(parseHexColor("#00000000")).toBe(TRANSPARENT_COLOR);
        expect(parseHexColor("#ff000000")).toBe(TRANSPARENT_COLOR);
    });

    it("короткие формы #RGB / #RGBA удваивают цифры", () => {
        expect(parseHexColor("#fff")).toBe(0xffffff);
        expect(parseHexColor("#abc")).toBe(0xaabbcc);
        expect(parseHexColor("#abc8")).toBe(packRgba(0xaa, 0xbb, 0xcc, 0x88));
        expect(parseHexColor("#0000")).toBe(TRANSPARENT_COLOR);
    });

    it("некорректная строка — throw, а не чёрный цвет", () => {
        expect(() => parseHexColor("#12345")).toThrow(/некорректный hex/);
        expect(() => parseHexColor("#gggggg")).toThrow(/некорректный hex/);
        expect(() => parseHexColor("")).toThrow(/некорректный hex/);
        expect(() => parseHexColor("red")).toThrow(/некорректный hex/);
    });
});

describe("formatHexColor", () => {
    it("обратен parseHexColor", () => {
        expect(formatHexColor(0x1e1e2e)).toBe("#1e1e2e");
        expect(formatHexColor(packRgba(0xcd, 0xd6, 0xf4, 0x12))).toBe("#cdd6f412");
        expect(formatHexColor(TRANSPARENT_COLOR)).toBe("#00000000");
        expect(formatHexColor(0x000001)).toBe("#000001");
        for (const hex of ["#000000", "#abcdef", "#abcdef01", "#fffffffe"]) {
            expect(formatHexColor(parseHexColor(hex))).toBe(hex);
        }
    });

    it("DEFAULT_COLOR hex не имеет", () => {
        expect(() => formatHexColor(DEFAULT_COLOR)).toThrow(/DEFAULT_COLOR/);
    });
});
