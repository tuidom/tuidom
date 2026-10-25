import { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";
import { describe, expect, it } from "vitest";

import { encodeKeyForPty } from "./encodeKeyForPty.ts";

interface Mods {
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    code?: string;
}

function encode(key: string, mods: Mods = {}, applicationCursorKeys?: boolean): string {
    const event = new TUIKeyboardEvent("keydown", { key, ...mods });
    return applicationCursorKeys === undefined
        ? encodeKeyForPty(event)
        : encodeKeyForPty(event, { applicationCursorKeys });
}

const SHIFT: Mods = { shiftKey: true };
const ALT: Mods = { altKey: true };
const CTRL: Mods = { ctrlKey: true };
const META: Mods = { metaKey: true };
const CTRL_SHIFT: Mods = { ctrlKey: true, shiftKey: true };
const ALL: Mods = { shiftKey: true, altKey: true, ctrlKey: true, metaKey: true };

describe("encodeKeyForPty", () => {
    it.each([
        ["a", "a"],
        ["Z", "Z"],
        ["1", "1"],
        [" ", " "],
        ["ф", "ф"],
    ])("passes printable %j through unchanged", (key, expected) => {
        expect(encode(key)).toBe(expected);
    });

    it.each([
        ["Enter", "\r"],
        ["Backspace", "\x7f"],
        ["Tab", "\t"],
        ["Escape", "\x1b"],
        ["Delete", "\x1b[3~"],
        ["Insert", "\x1b[2~"],
    ])("encodes control key %s", (key, expected) => {
        expect(encode(key)).toBe(expected);
    });

    describe("Tab, Enter, Escape, Backspace", () => {
        it.each([
            ["Tab", SHIFT, "\x1b[Z"],
            ["Tab", CTRL_SHIFT, "\x1b[Z"],
            ["Tab", CTRL, "\t"],
            ["Tab", ALT, "\t"],
            ["Enter", ALT, "\x1b\r"],
            ["Enter", SHIFT, "\r"], // в легаси Shift+Enter неотличим от Enter
            ["Enter", CTRL, "\r"],
            ["Escape", ALT, "\x1b\x1b"],
            ["Escape", SHIFT, "\x1b"],
            ["Backspace", CTRL, "\x08"],
            ["Backspace", ALT, "\x1b\x7f"],
            ["Backspace", { ctrlKey: true, altKey: true }, "\x1b\x08"],
            ["Backspace", SHIFT, "\x7f"],
        ])("encodes %s with %j", (key, mods, expected) => {
            expect(encode(key, mods)).toBe(expected);
        });
    });

    describe("cursor keys", () => {
        it.each([
            ["ArrowUp", "A"],
            ["ArrowDown", "B"],
            ["ArrowRight", "C"],
            ["ArrowLeft", "D"],
            ["Home", "H"],
            ["End", "F"],
        ])("encodes bare %s as CSI normally and as SS3 in application cursor keys mode", (key, final) => {
            expect(encode(key)).toBe(`\x1b[${final}`);
            expect(encode(key, {}, false)).toBe(`\x1b[${final}`);
            expect(encode(key, {}, true)).toBe(`\x1bO${final}`);
        });

        it.each([
            [SHIFT, 2],
            [ALT, 3],
            [{ shiftKey: true, altKey: true }, 4],
            [CTRL, 5],
            [CTRL_SHIFT, 6],
            [{ ctrlKey: true, altKey: true }, 7],
            [{ ctrlKey: true, altKey: true, shiftKey: true }, 8],
        ])("encodes modified arrows and Home/End as CSI 1;mod regardless of DECCKM (%j → %i)", (mods, mod) => {
            for (const applicationCursorKeys of [false, true]) {
                expect(encode("ArrowUp", mods, applicationCursorKeys)).toBe(`\x1b[1;${mod}A`);
                expect(encode("ArrowDown", mods, applicationCursorKeys)).toBe(`\x1b[1;${mod}B`);
                expect(encode("ArrowRight", mods, applicationCursorKeys)).toBe(`\x1b[1;${mod}C`);
                expect(encode("ArrowLeft", mods, applicationCursorKeys)).toBe(`\x1b[1;${mod}D`);
                expect(encode("Home", mods, applicationCursorKeys)).toBe(`\x1b[1;${mod}H`);
                expect(encode("End", mods, applicationCursorKeys)).toBe(`\x1b[1;${mod}F`);
            }
        });

        it.each(["ArrowUp", "ArrowDown", "ArrowRight", "ArrowLeft"])(
            'returns "" for Meta+%s, leaving it to the host like xterm.js',
            (key) => {
                expect(encode(key, META)).toBe("");
                expect(encode(key, ALL, true)).toBe("");
            },
        );

        it("encodes Meta+Home/End with the meta bit", () => {
            expect(encode("Home", META)).toBe("\x1b[1;9H");
            expect(encode("End", ALL)).toBe("\x1b[1;16F");
        });
    });

    describe("Delete, Insert, PageUp, PageDown", () => {
        it.each([
            [SHIFT, "\x1b[3;2~"],
            [CTRL, "\x1b[3;5~"],
            [META, "\x1b[3;9~"],
            [ALL, "\x1b[3;16~"],
        ])("encodes Delete with %j", (mods, expected) => {
            expect(encode("Delete", mods)).toBe(expected);
        });

        it.each([
            [ALT, "\x1b[2~"],
            [META, "\x1b[2~"],
            [SHIFT, ""],
            [CTRL, ""],
        ])("encodes Insert with %j (Shift/Ctrl+Insert stay with the host)", (mods, expected) => {
            expect(encode("Insert", mods)).toBe(expected);
        });

        it.each([
            ["PageUp", {}, "\x1b[5~"],
            ["PageDown", {}, "\x1b[6~"],
            ["PageUp", ALT, "\x1b[5~"],
            ["PageDown", META, "\x1b[6~"],
            ["PageUp", CTRL, "\x1b[5;5~"],
            ["PageDown", CTRL, "\x1b[6;5~"],
            ["PageUp", { ctrlKey: true, altKey: true }, "\x1b[5;7~"],
        ])("encodes %s with %j", (key, mods, expected) => {
            expect(encode(key, mods)).toBe(expected);
        });
    });

    describe("function keys", () => {
        const F_KEYS: [string, string, string][] = [
            ["F1", "\x1bOP", "\x1b[1;$P"],
            ["F2", "\x1bOQ", "\x1b[1;$Q"],
            ["F3", "\x1bOR", "\x1b[1;$R"],
            ["F4", "\x1bOS", "\x1b[1;$S"],
            ["F5", "\x1b[15~", "\x1b[15;$~"],
            ["F6", "\x1b[17~", "\x1b[17;$~"],
            ["F7", "\x1b[18~", "\x1b[18;$~"],
            ["F8", "\x1b[19~", "\x1b[19;$~"],
            ["F9", "\x1b[20~", "\x1b[20;$~"],
            ["F10", "\x1b[21~", "\x1b[21;$~"],
            ["F11", "\x1b[23~", "\x1b[23;$~"],
            ["F12", "\x1b[24~", "\x1b[24;$~"],
        ];

        it.each(F_KEYS)("encodes %s bare and with every modifier", (key, bare, modified) => {
            expect(encode(key)).toBe(bare);
            expect(encode(key, {}, true)).toBe(bare);
            expect(encode(key, SHIFT)).toBe(modified.replace("$", "2"));
            expect(encode(key, ALT)).toBe(modified.replace("$", "3"));
            expect(encode(key, CTRL)).toBe(modified.replace("$", "5"));
            expect(encode(key, META)).toBe(modified.replace("$", "9"));
            expect(encode(key, ALL)).toBe(modified.replace("$", "16"));
        });
    });

    it.each([
        ["a", "\x01"],
        ["A", "\x01"], // uppercase → тот же control-байт
        ["c", "\x03"],
        ["z", "\x1a"],
    ])("encodes Ctrl+%s to a control byte", (key, expected) => {
        expect(encode(key, CTRL)).toBe(expected);
    });

    it.each([
        [" ", "\x00"], // Ctrl+Space → NUL
        ["[", "\x1b"],
        ["\\", "\x1c"],
        ["]", "\x1d"],
        ["/", "\x1f"],
        ["3", "\x1b"],
        ["4", "\x1c"],
        ["5", "\x1d"],
        ["6", "\x1e"],
        ["7", "\x1f"],
        ["8", "\x7f"],
    ])("encodes Ctrl+%j to its control symbol", (key, expected) => {
        expect(encode(key, CTRL)).toBe(expected);
    });

    const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i));

    it.each(LETTERS.map((letter, i) => [letter, String.fromCharCode(i + 1)]))(
        "encodes every Ctrl+%s without Shift to its control byte",
        (letter, expected) => {
            expect(encode(letter, CTRL)).toBe(expected);
            expect(encode(letter.toUpperCase(), CTRL)).toBe(expected);
        },
    );

    it.each(LETTERS)('returns "" for Ctrl+Shift+%s, leaving it to the host like xterm.js', (letter) => {
        expect(encode(letter, { ...CTRL_SHIFT, code: `Key${letter.toUpperCase()}` })).toBe("");
        expect(encode(letter.toUpperCase(), CTRL_SHIFT)).toBe("");
    });

    it.each([
        ["_", "Minus", "\x1f"],
        ["@", "Digit2", "\x00"],
        ["^", "Digit6", "\x1e"],
    ])("encodes Ctrl+Shift+%j by its physical key %s", (key, code, expected) => {
        expect(encode(key, { ...CTRL_SHIFT, code })).toBe(expected);
    });

    it.each([
        ["a", ALT, "\x1ba"],
        ["A", { altKey: true, shiftKey: true }, "\x1bA"],
        ["1", ALT, "\x1b1"],
        [".", ALT, "\x1b."],
        [" ", ALT, "\x1b "],
        ["a", { altKey: true, ctrlKey: true }, "\x1b\x01"],
        ["A", { altKey: true, ctrlKey: true, shiftKey: true }, "\x1b\x01"],
        [" ", { altKey: true, ctrlKey: true }, "\x1b\x00"],
        ["1", { altKey: true, ctrlKey: true }, "\x1b1"],
    ])("prefixes Alt+%j (%j) with ESC (meta byte)", (key, mods, expected) => {
        expect(encode(key, mods)).toBe(expected);
    });

    it("prefixes Meta-modified printables with ESC (meta byte)", () => {
        expect(encode("a", META)).toBe("\x1ba");
        expect(encode("A", { metaKey: true, shiftKey: true })).toBe("\x1bA");
    });

    it.each([
        ["F13", {}],
        ["Unknown", {}],
        ["1", CTRL], // Ctrl+цифра вне 3…8 — не транслируем
        ["2", CTRL],
        ["a", { ctrlKey: true, metaKey: true }],
        ["a", { altKey: true, metaKey: true }],
        ["a", ALL],
    ])('returns "" for unhandled combo %s %j', (key, mods: Mods) => {
        expect(encode(key, mods)).toBe("");
    });
});
