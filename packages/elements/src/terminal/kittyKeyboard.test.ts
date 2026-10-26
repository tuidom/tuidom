import { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";
import { describe, expect, it } from "vitest";

import { encodeKittyKey, type KittyKeyboardEventType as EventType, KittyKeyboardEventType } from "./kittyKeyboard.ts";

// Таблица «клавиша × модификаторы × флаги → байты» сверена с xterm.js `KittyKeyboard.evaluate`
// (@xterm/xterm 6.1.0-beta.285) прогоном обеих реализаций на одной матрице событий.

interface Mods {
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    code?: string;
}

const PRESS = KittyKeyboardEventType.Press;
const REPEAT = KittyKeyboardEventType.Repeat;
const RELEASE = KittyKeyboardEventType.Release;

const NONE: Mods = {};
const SHIFT: Mods = { shiftKey: true };
const ALT: Mods = { altKey: true };
const CTRL: Mods = { ctrlKey: true };
const META: Mods = { metaKey: true };
const CTRL_SHIFT: Mods = { ctrlKey: true, shiftKey: true };
const ALL: Mods = { shiftKey: true, altKey: true, ctrlKey: true, metaKey: true };

const DISAMBIGUATE = 1;
const EVENT_TYPES = 2;
const ALTERNATE = 4;
const ALL_KEYS = 8;
const TEXT = 16;

function encode(key: string, mods: Mods, flags: number, eventType: EventType = PRESS): string {
    return encodeKittyKey(new TUIKeyboardEvent("keydown", { key, ...mods }), flags, eventType);
}

describe("encodeKittyKey", () => {
    describe("flag 1 — disambiguate", () => {
        it.each([
            ["Enter", SHIFT, "\x1b[13;2u"],
            ["i", { ...CTRL, code: "KeyI" }, "\x1b[105;5u"],
            ["Escape", NONE, "\x1b[27u"],
            ["Escape", SHIFT, "\x1b[27;2u"],
            ["Tab", SHIFT, "\x1b[9;2u"],
            ["Backspace", CTRL, "\x1b[127;5u"],
            ["Enter", ALT, "\x1b[13;3u"],
            ["Enter", CTRL, "\x1b[13;5u"],
            ["c", CTRL, "\x1b[99;5u"],
            ["C", { ...CTRL_SHIFT, code: "KeyC" }, "\x1b[99;6u"],
            ["E", { ...CTRL_SHIFT, code: "KeyE" }, "\x1b[101;6u"],
            ["!", { ...CTRL_SHIFT, code: "Digit1" }, "\x1b[49;6u"],
            ["a", ALT, "\x1b[97;3u"],
            ["a", META, "\x1b[97;9u"],
            ["a", ALL, "\x1b[97;16u"],
            ["A", { ...ALT, shiftKey: true }, "\x1b[97;4u"], // без `code` база — строчная буква
            [" ", CTRL, "\x1b[32;5u"],
            ["ф", CTRL, "\x1b[1092;5u"],
            ["F13", NONE, "\x1b[57376u"],
            ["F25", NONE, "\x1b[57388u"],
            ["PrintScreen", NONE, "\x1b[57361u"],
            ["Pause", NONE, "\x1b[57362u"],
            ["ContextMenu", NONE, "\x1b[57363u"],
            ["MediaPlayPause", NONE, "\x1b[57430u"],
            ["MediaStop", NONE, "\x1b[57432u"],
            ["MediaTrackNext", NONE, "\x1b[57435u"],
            ["MediaTrackPrevious", NONE, "\x1b[57436u"],
            ["AudioVolumeDown", NONE, "\x1b[57438u"],
            ["AudioVolumeUp", NONE, "\x1b[57439u"],
            ["AudioVolumeMute", NONE, "\x1b[57440u"],
        ])("%j %o → %j", (key, mods, expected) => {
            expect(encode(key, mods, DISAMBIGUATE)).toBe(expected);
        });

        it.each([
            ["Enter", "\r"],
            ["Tab", "\t"],
            ["Backspace", "\x7f"],
            ["a", "a"],
            ["Z", "Z"],
            [" ", " "],
            ["ф", "ф"],
        ])("%j without modifiers keeps its legacy bytes", (key, expected) => {
            expect(encode(key, NONE, DISAMBIGUATE)).toBe(expected);
        });

        it.each([
            ["A", "A"],
            ["!", "!"],
        ])("Shift+%j is text: legacy bytes", (key, expected) => {
            expect(encode(key, SHIFT, DISAMBIGUATE)).toBe(expected);
        });

        it.each([
            ["ArrowUp", NONE, "\x1b[A"],
            ["ArrowDown", SHIFT, "\x1b[1;2B"],
            ["ArrowRight", CTRL, "\x1b[1;5C"],
            ["ArrowLeft", ALT, "\x1b[1;3D"],
            ["Home", NONE, "\x1b[H"],
            ["End", META, "\x1b[1;9F"],
            ["F1", NONE, "\x1bOP"],
            ["F2", SHIFT, "\x1b[1;2Q"],
            ["F3", NONE, "\x1bOR"],
            ["F4", CTRL, "\x1b[1;5S"],
            ["Insert", NONE, "\x1b[2~"],
            ["Delete", SHIFT, "\x1b[3;2~"],
            ["PageUp", NONE, "\x1b[5~"],
            ["PageDown", CTRL, "\x1b[6;5~"],
            ["F5", NONE, "\x1b[15~"],
            ["F6", NONE, "\x1b[17~"],
            ["F7", NONE, "\x1b[18~"],
            ["F8", NONE, "\x1b[19~"],
            ["F9", NONE, "\x1b[20~"],
            ["F10", NONE, "\x1b[21~"],
            ["F11", NONE, "\x1b[23~"],
            ["F12", ALT, "\x1b[24;3~"],
        ])("%j %o keeps the legacy CSI/SS3 form → %j", (key, mods, expected) => {
            expect(encode(key, mods, DISAMBIGUATE)).toBe(expected);
        });

        it.each([
            ["0", "Numpad0", "\x1b[57399u"],
            ["9", "Numpad9", "\x1b[57408u"],
            [".", "NumpadDecimal", "\x1b[57409u"],
            ["/", "NumpadDivide", "\x1b[57410u"],
            ["*", "NumpadMultiply", "\x1b[57411u"],
            ["-", "NumpadSubtract", "\x1b[57412u"],
            ["+", "NumpadAdd", "\x1b[57413u"],
            ["Enter", "NumpadEnter", "\x1b[57414u"],
            ["=", "NumpadEqual", "\x1b[57415u"],
        ])("keypad %j (%s) → %j", (key, code, expected) => {
            expect(encode(key, { code }, DISAMBIGUATE)).toBe(expected);
        });

        it.each([
            [",", "NumpadComma", ","], // нет в таблице эталона — обычный текст
            ["5", "NumpadX", "5"],
            ["4", "Numpad44", "4"],
        ])("an unknown keypad code %s is plain text", (key, code, expected) => {
            expect(encode(key, { code }, DISAMBIGUATE)).toBe(expected);
        });

        it.each([
            ["Shift", "ShiftLeft"],
            ["Control", "ControlRight"],
            ["Alt", "AltLeft"],
            ["Meta", "MetaRight"],
            ["CapsLock", "CapsLock"],
            ["NumLock", "NumLock"],
            ["ScrollLock", "ScrollLock"],
        ])("does not report the %s press", (key, code) => {
            expect(encode(key, { code, shiftKey: key === "Shift" }, DISAMBIGUATE)).toBe("");
        });

        it.each(["Unidentified", "Hyper"])("an unknown key %j → nothing", (key) => {
            expect(encode(key, NONE, DISAMBIGUATE)).toBe("");
        });
    });

    describe("flag 8 — all keys as escape codes", () => {
        it.each([
            ["a", NONE, "\x1b[97u"],
            ["A", { ...SHIFT, code: "KeyA" }, "\x1b[97;2u"],
            ["1", NONE, "\x1b[49u"],
            ["@", { ...SHIFT, code: "Digit2" }, "\x1b[50;2u"],
            [" ", NONE, "\x1b[32u"],
            ["ф", NONE, "\x1b[1092u"],
            ["Enter", NONE, "\x1b[13u"],
            ["Tab", NONE, "\x1b[9u"],
            ["Backspace", NONE, "\x1b[127u"],
            ["ArrowUp", NONE, "\x1b[A"],
        ])("%j %o → %j", (key, mods, expected) => {
            expect(encode(key, mods, ALL_KEYS)).toBe(expected);
        });

        it.each([
            ["Shift", { shiftKey: true, code: "ShiftLeft" }, "\x1b[57441;2u"],
            ["Shift", { shiftKey: true, code: "ShiftRight" }, "\x1b[57447;2u"],
            ["Control", { ctrlKey: true, code: "ControlLeft" }, "\x1b[57442;5u"],
            ["Control", { ctrlKey: true, code: "ControlRight" }, "\x1b[57448;5u"],
            ["Alt", { altKey: true, code: "AltLeft" }, "\x1b[57443;3u"],
            ["Alt", { altKey: true, code: "AltRight" }, "\x1b[57449;3u"],
            ["Meta", { metaKey: true, code: "MetaLeft" }, "\x1b[57444;9u"],
            ["Meta", { metaKey: true, code: "MetaRight" }, "\x1b[57450;9u"],
            ["CapsLock", NONE, "\x1b[57358u"],
            ["ScrollLock", NONE, "\x1b[57359u"],
            ["NumLock", NONE, "\x1b[57360u"],
        ])("reports the modifier key %s %o → %j", (key, mods, expected) => {
            expect(encode(key, mods, ALL_KEYS)).toBe(expected);
        });

        it.each([
            ["Enter", "\x1b[13;1:3u"],
            ["Tab", "\x1b[9;1:3u"],
            ["Backspace", "\x1b[127;1:3u"],
        ])("with flag 2 reports the %s release too", (key, expected) => {
            expect(encode(key, NONE, ALL_KEYS | EVENT_TYPES, RELEASE)).toBe(expected);
        });
    });

    describe("flag 2 — event types", () => {
        it.each([
            ["a", NONE, RELEASE, "\x1b[97;1:3u"],
            ["a", NONE, REPEAT, "a"], // повтор печатного символа без флага 8 — просто текст
            ["a", NONE, PRESS, "a"],
            ["a", CTRL, RELEASE, "\x1b[97;5:3u"],
            ["a", CTRL, REPEAT, "\x1b[97;5:2u"],
            ["Escape", NONE, RELEASE, "\x1b[27;1:3u"],
            ["Escape", NONE, REPEAT, "\x1b[27;1:2u"],
            ["Escape", NONE, PRESS, "\x1b[27u"],
            ["ArrowUp", NONE, RELEASE, "\x1b[1;1:3A"],
            ["ArrowUp", SHIFT, REPEAT, "\x1b[1;2:2A"],
            ["ArrowUp", NONE, PRESS, "\x1b[A"],
            ["F1", NONE, RELEASE, "\x1b[1;1:3P"],
            ["F1", CTRL, REPEAT, "\x1b[1;5:2P"],
            ["F1", NONE, PRESS, "\x1bOP"],
            ["Delete", NONE, RELEASE, "\x1b[3;1:3~"],
            ["Delete", ALT, REPEAT, "\x1b[3;3:2~"],
            ["Delete", NONE, PRESS, "\x1b[3~"],
            ["Enter", SHIFT, PRESS, "\x1b[13;2u"],
            ["Enter", SHIFT, REPEAT, "\x1b[13;2:2u"],
        ])("%j %o event %i → %j", (key, mods, eventType, expected) => {
            expect(encode(key, mods, EVENT_TYPES, eventType)).toBe(expected);
        });

        it.each(["Enter", "Tab", "Backspace"])("does not report the %s release without flag 8", (key) => {
            expect(encode(key, NONE, EVENT_TYPES, RELEASE)).toBe("");
        });

        it.each([
            ["a", DISAMBIGUATE],
            ["ArrowUp", DISAMBIGUATE],
            ["Escape", ALL_KEYS],
        ])("without flag 2 a %j release → nothing (flags %i)", (key, flags) => {
            expect(encode(key, NONE, flags, RELEASE)).toBe("");
        });
    });

    describe("flag 4 — alternate keys", () => {
        it.each([
            ["A", { ...SHIFT, code: "KeyA" }, ALL_KEYS | ALTERNATE, "\x1b[97:65;2u"],
            ["!", { ...CTRL_SHIFT, code: "Digit1" }, DISAMBIGUATE | ALTERNATE, "\x1b[49:33;6u"],
            ["A", { ...ALT, shiftKey: true, code: "KeyA" }, DISAMBIGUATE | ALTERNATE, "\x1b[97:65;4u"],
            ["a", ALT, DISAMBIGUATE | ALTERNATE, "\x1b[97;3u"], // без Shift альтернативы нет
            ["Escape", SHIFT, DISAMBIGUATE | ALTERNATE, "\x1b[27;2u"], // у функциональных — тоже
        ])("%j %o (flags %i) → %j", (key, mods, flags, expected) => {
            expect(encode(key, mods, flags)).toBe(expected);
        });

        it("does not add an alternate key to a modifier key", () => {
            expect(encode("Shift", { shiftKey: true, code: "ShiftLeft" }, ALL_KEYS | ALTERNATE)).toBe("\x1b[57441;2u");
        });
    });

    describe("flag 16 — associated text", () => {
        it.each([
            ["a", NONE, ALL_KEYS | TEXT, PRESS, "\x1b[97;;97u"],
            ["A", { ...SHIFT, code: "KeyA" }, ALL_KEYS | TEXT, PRESS, "\x1b[97;2;65u"],
            ["a", NONE, ALL_KEYS | TEXT | EVENT_TYPES, REPEAT, "\x1b[97;;97u"],
            ["a", NONE, ALL_KEYS | TEXT | EVENT_TYPES, RELEASE, "\x1b[97;1:3u"],
            ["a", CTRL, ALL_KEYS | TEXT, PRESS, "\x1b[97;5u"], // Ctrl текста не даёт
            ["Enter", NONE, ALL_KEYS | TEXT, PRESS, "\x1b[13u"],
            ["Shift", { shiftKey: true, code: "ShiftLeft" }, ALL_KEYS | TEXT, PRESS, "\x1b[57441;2u"],
            ["a", ALT, DISAMBIGUATE | TEXT, PRESS, "\x1b[97;3;97u"],
            ["a", NONE, DISAMBIGUATE | TEXT, PRESS, "a"],
        ])("%j %o (flags %i, event %i) → %j", (key, mods, flags, eventType, expected) => {
            expect(encode(key, mods, flags, eventType)).toBe(expected);
        });
    });

    describe("without flags 1, 2 and 8", () => {
        it.each([
            ["Escape", NONE, ""], // эталон молчит: функциональным клавишам нужен флаг 1
            ["Enter", SHIFT, "\r"],
            ["a", CTRL, ""],
            ["a", NONE, "a"],
            ["ArrowUp", CTRL, "\x1b[1;5A"],
        ])("%j %o (flag 4) → %j", (key, mods, expected) => {
            expect(encode(key, mods, ALTERNATE)).toBe(expected);
        });
    });

    it("defaults to a press", () => {
        expect(encodeKittyKey(new TUIKeyboardEvent("keydown", { key: "Escape" }), EVENT_TYPES)).toBe("\x1b[27u");
    });
});
