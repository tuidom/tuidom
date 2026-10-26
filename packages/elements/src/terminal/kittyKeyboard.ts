// Кодирование клавиши в PTY по kitty keyboard protocol — когда программа в терминале
// включила его (`CSI > flags u`), и флаги поверхности ненулевые.
// Спецификация: https://sw.kovidgoyal.net/kitty/keyboard-protocol/
//
// Перенос xterm.js `KittyKeyboard.evaluate` (src/common/input/KittyKeyboard.ts, @xterm/xterm
// 6.1.0-beta.285, Copyright (c) 2025 The xterm.js authors, MIT) на `TUIKeyboardEvent`.
// Отступления:
// - `macOptionAsAlt` нет: Option на маке приходит от внешнего терминала уже как Alt или Meta;
// - из таблицы функциональных клавиш убраны записи, которые по `key` никогда не совпадут
//   (`KP_*`, `ShiftLeft`…): кейпад определяется по `code` (`Numpad*`), модификаторы — по `code`;
// - результат — строка, "" вместо `key: undefined`.

import type { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";

/** Флаги прогрессивного улучшения (битовое поле). */
export const KittyKeyboardFlags = {
    /** Однозначные коды вместо неоднозначных легаси-последовательностей. */
    DisambiguateEscapeCodes: 0b00001,
    /** Типы событий: нажатие, повтор, отпускание. */
    ReportEventTypes: 0b00010,
    /** Альтернативные клавиши: символ с Shift. */
    ReportAlternateKeys: 0b00100,
    /** Все клавиши, и печатные тоже, как CSI u. */
    ReportAllKeysAsEscapeCodes: 0b01000,
    /** Связанный текст — кодпоинт текста в последовательности. */
    ReportAssociatedText: 0b10000,
} as const;

export const KittyKeyboardEventType = {
    Press: 1,
    Repeat: 2,
    Release: 3,
} as const;

export type KittyKeyboardEventType = (typeof KittyKeyboardEventType)[keyof typeof KittyKeyboardEventType];

const ESC = "\x1b";

// Биты модификаторов kitty; в последовательность уходит `1 + биты`.
const MOD_SHIFT = 0b0001;
const MOD_ALT = 0b0010;
const MOD_CTRL = 0b0100;
const MOD_SUPER = 0b1000;

// Клавиши без текста — свои кодпоинты протокола.
const FUNCTIONAL_KEY_CODES: Record<string, number | undefined> = {
    Escape: 27,
    Enter: 13,
    Tab: 9,
    Backspace: 127,
    CapsLock: 57358,
    ScrollLock: 57359,
    NumLock: 57360,
    PrintScreen: 57361,
    Pause: 57362,
    ContextMenu: 57363,
    // F13–F25 (F1–F12 — легаси-кодировкой)
    F13: 57376,
    F14: 57377,
    F15: 57378,
    F16: 57379,
    F17: 57380,
    F18: 57381,
    F19: 57382,
    F20: 57383,
    F21: 57384,
    F22: 57385,
    F23: 57386,
    F24: 57387,
    F25: 57388,
    MediaPlayPause: 57430,
    MediaStop: 57432,
    MediaTrackNext: 57435,
    MediaTrackPrevious: 57436,
    AudioVolumeDown: 57438,
    AudioVolumeUp: 57439,
    AudioVolumeMute: 57440,
};

// `CSI <number> [;mod[:event]] ~`
const CSI_TILDE_KEYS: Record<string, number | undefined> = {
    Insert: 2,
    Delete: 3,
    PageUp: 5,
    PageDown: 6,
    F5: 15,
    F6: 17,
    F7: 18,
    F8: 19,
    F9: 20,
    F10: 21,
    F11: 23,
    F12: 24,
};

// `CSI [1;mod[:event]] <letter>` — стрелки, Home, End.
const CSI_LETTER_KEYS: Record<string, string | undefined> = {
    ArrowUp: "A",
    ArrowDown: "B",
    ArrowRight: "C",
    ArrowLeft: "D",
    Home: "H",
    End: "F",
};

// F1–F4: без модификаторов SS3 `ESC O <letter>`, с ними — `CSI 1;mod <letter>`.
const SS3_FUNCTION_KEYS: Record<string, string | undefined> = { F1: "P", F2: "Q", F3: "R", F4: "S" };

const NUMPAD_KEY_CODES: Record<string, number | undefined> = {
    Decimal: 57409,
    Divide: 57410,
    Multiply: 57411,
    Subtract: 57412,
    Add: 57413,
    Enter: 57414,
    Equal: 57415,
};

const MODIFIER_KEY_CODES: Record<string, number | undefined> = {
    ShiftLeft: 57441,
    ShiftRight: 57447,
    ControlLeft: 57442,
    ControlRight: 57448,
    AltLeft: 57443,
    AltRight: 57449,
    MetaLeft: 57444,
    MetaRight: 57450,
};

function numpadKeyCode(event: TUIKeyboardEvent): number | undefined {
    if (!event.code.startsWith("Numpad")) return undefined;
    const suffix = event.code.slice(6);
    if (suffix.length === 1 && suffix >= "0" && suffix <= "9") return 57399 + Number(suffix);
    return NUMPAD_KEY_CODES[suffix];
}

/** `1 + биты`, или 0 без модификаторов. */
function encodeModifiers(event: TUIKeyboardEvent): number {
    let mods = 0;
    if (event.shiftKey) mods |= MOD_SHIFT;
    if (event.altKey) mods |= MOD_ALT;
    if (event.ctrlKey) mods |= MOD_CTRL;
    if (event.metaKey) mods |= MOD_SUPER;
    return mods > 0 ? mods + 1 : 0;
}

/** Кодпоинт клавиши: у букв — строчный, у символа с Shift — базовый по `code`. */
function keyCodeOf(event: TUIKeyboardEvent): number | undefined {
    const numpad = numpadKeyCode(event);
    if (numpad !== undefined) return numpad;
    const modifier = MODIFIER_KEY_CODES[event.code];
    if (modifier !== undefined) return modifier;
    const functional = FUNCTIONAL_KEY_CODES[event.key];
    if (functional !== undefined) return functional;
    if (event.shiftKey) {
        if (/^Digit[0-9]$/.test(event.code)) return event.code.charCodeAt(5);
        if (/^Key.$/.test(event.code)) return event.code.charAt(3).toLowerCase().charCodeAt(0);
    }
    if (event.key.length === 1) {
        const code = event.key.charCodeAt(0);
        return code >= 65 && code <= 90 ? code + 32 : code;
    }
    return undefined;
}

function isModifierKey(event: TUIKeyboardEvent): boolean {
    return event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta";
}

/** Lock-клавиши kitty считает модификаторами: их нажатие без флага 8 не сообщается. */
function isLockKey(event: TUIKeyboardEvent): boolean {
    return event.key === "CapsLock" || event.key === "NumLock" || event.key === "ScrollLock";
}

/** `;mod[:event]` — общий хвост CSI-letter, SS3 и CSI ~, или "" без модификаторов и типа. */
function modifierSuffix(modifiers: number, eventType: KittyKeyboardEventType, reportEventTypes: boolean): string {
    const needsEventType = reportEventTypes && eventType !== KittyKeyboardEventType.Press;
    if (modifiers === 0 && !needsEventType) return "";
    return `;${modifiers > 0 ? modifiers : 1}${needsEventType ? `:${eventType}` : ""}`;
}

/** `CSI keycode[:shifted] [;mod[:event][;text]] u` */
function csiUSequence(
    event: TUIKeyboardEvent,
    keyCode: number,
    modifiers: number,
    eventType: KittyKeyboardEventType,
    flags: number,
    isFunctional: boolean,
): string {
    const reportEventTypes = (flags & KittyKeyboardFlags.ReportEventTypes) !== 0;
    const isText = event.key.length === 1 && !isFunctional && !isModifierKey(event);
    let seq = `${ESC}[${keyCode}`;
    if ((flags & KittyKeyboardFlags.ReportAlternateKeys) !== 0 && event.shiftKey && isText) {
        seq += `:${event.key.charCodeAt(0)}`;
    }
    const textCode =
        (flags & KittyKeyboardFlags.ReportAssociatedText) !== 0 &&
        eventType !== KittyKeyboardEventType.Release &&
        isText &&
        !event.ctrlKey
            ? event.key.charCodeAt(0)
            : undefined;
    const needsEventType =
        reportEventTypes &&
        eventType !== KittyKeyboardEventType.Press &&
        (eventType === KittyKeyboardEventType.Release || textCode === undefined);
    if (modifiers > 0 || needsEventType || textCode !== undefined) {
        seq += ";";
        if (modifiers > 0) seq += String(modifiers);
        else if (needsEventType) seq += "1";
        if (needsEventType) seq += `:${eventType}`;
    }
    if (textCode !== undefined) seq += `;${textCode}`;
    return `${seq}u`;
}

/**
 * Байты клавиши по kitty keyboard protocol при флагах `flags` (> 0), либо "" — клавишу
 * протокол не сообщает (модификатор без флага 8, отпускание без флага 2, неизвестная клавиша).
 */
export function encodeKittyKey(
    event: TUIKeyboardEvent,
    flags: number,
    eventType: KittyKeyboardEventType = KittyKeyboardEventType.Press,
): string {
    const modifiers = encodeModifiers(event);
    const reportEventTypes = (flags & KittyKeyboardFlags.ReportEventTypes) !== 0;
    const reportAllKeys = (flags & KittyKeyboardFlags.ReportAllKeysAsEscapeCodes) !== 0;

    if (!reportEventTypes && eventType === KittyKeyboardEventType.Release) return "";
    // Без флага 8 нажатия модификаторов и lock-клавиш не сообщаются (kitty `is_modifier_key`).
    if ((isModifierKey(event) || isLockKey(event)) && !reportAllKeys) return "";

    const csiLetter = CSI_LETTER_KEYS[event.key];
    if (csiLetter !== undefined) {
        const suffix = modifierSuffix(modifiers, eventType, reportEventTypes);
        return suffix === "" ? `${ESC}[${csiLetter}` : `${ESC}[1${suffix}${csiLetter}`;
    }

    const ss3Letter = SS3_FUNCTION_KEYS[event.key];
    if (ss3Letter !== undefined) {
        const suffix = modifierSuffix(modifiers, eventType, reportEventTypes);
        return suffix === "" ? `${ESC}O${ss3Letter}` : `${ESC}[1${suffix}${ss3Letter}`;
    }

    const tildeCode = CSI_TILDE_KEYS[event.key];
    if (tildeCode !== undefined) {
        return `${ESC}[${tildeCode}${modifierSuffix(modifiers, eventType, reportEventTypes)}~`;
    }

    const keyCode = keyCodeOf(event);
    if (keyCode === undefined) return "";

    // Enter/Tab/Backspace: по спеке те же байты, что в легаси, и без отпускания без флага 8.
    const specialKey = keyCode === 13 || keyCode === 9 || keyCode === 127;
    if (specialKey && eventType === KittyKeyboardEventType.Release && !reportAllKeys) return "";

    const isFunctional = FUNCTIONAL_KEY_CODES[event.key] !== undefined || numpadKeyCode(event) !== undefined;

    const useCsiU =
        reportAllKeys ||
        (reportEventTypes && eventType === KittyKeyboardEventType.Release) ||
        // Флаг 2 без флага 1 смысла не имеет — эталон считает, что он включает и 1
        // (https://github.com/kovidgoyal/kitty/issues/9999).
        (((flags & KittyKeyboardFlags.DisambiguateEscapeCodes) !== 0 || reportEventTypes) &&
            // Enter/Tab/Backspace и пробел — «текстовые»: CSI u только с модификаторами.
            ((isFunctional && !specialKey) || (modifiers > 0 && event.key.length !== 1) || modifiers - 1 > MOD_SHIFT));

    if (useCsiU) return csiUSequence(event, keyCode, modifiers, eventType, flags, isFunctional);

    if (keyCode === 13) return "\r";
    if (keyCode === 9) return "\t";
    if (keyCode === 127) return "\x7f";
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) return event.key;
    return "";
}
