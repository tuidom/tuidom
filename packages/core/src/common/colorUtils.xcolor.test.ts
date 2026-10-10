import { describe, expect, it } from "vitest";

import { packRgb, parseXColor } from "./colorUtils.ts";

describe("parseXColor — цвет X11 из ответа терминала на OSC 4/10/11", () => {
    it("rgb: с 4 цифрами на канал (xterm, VTE, kitty) — старший байт", () => {
        expect(parseXColor("rgb:ffff/8080/0000")).toBe(packRgb(255, 128, 0));
        expect(parseXColor("rgb:1e1e/1e1e/1e1e")).toBe(packRgb(30, 30, 30));
    });

    it("rgb: с 2 цифрами (Konsole) и регистр любой", () => {
        expect(parseXColor("rgb:CD/31/31")).toBe(packRgb(0xcd, 0x31, 0x31));
    });

    it("rgb: с 1 и 3 цифрами масштабируется по своей разрядности", () => {
        expect(parseXColor("rgb:f/8/0")).toBe(packRgb(255, 136, 0));
        expect(parseXColor("rgb:fff/800/000")).toBe(packRgb(255, 128, 0));
    });

    it("каналы разной разрядности допустимы", () => {
        expect(parseXColor("rgb:ff/f/ffff")).toBe(packRgb(255, 255, 255));
    });

    it("устаревший #-формат: 3, 6, 9 и 12 цифр", () => {
        expect(parseXColor("#f80")).toBe(packRgb(255, 136, 0));
        expect(parseXColor("#ff8000")).toBe(packRgb(255, 128, 0));
        expect(parseXColor("#fff800000")).toBe(packRgb(255, 128, 0));
        expect(parseXColor("#ffff80000000")).toBe(packRgb(255, 128, 0));
    });

    it("непонятное — undefined, без исключения", () => {
        for (const spec of [
            "",
            "rgb:",
            "rgb:ff/ff",
            "rgb:fffff/0/0",
            "rgb:gg/00/00",
            "rgba:ff/ff/ff/ff",
            "#ff",
            "#ffff",
            "red",
            " rgb:ff/ff/ff",
        ]) {
            expect(parseXColor(spec), spec).toBeUndefined();
        }
    });
});
