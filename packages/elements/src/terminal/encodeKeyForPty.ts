// Кодирование нажатия клавиши в байты, которые ждёт обычный PTY (xterm-совместимый).
//
// Пробрасывать `event.raw` напрямую нельзя: хост (NodeTerminalBackend) включает Kitty
// keyboard protocol, и raw приходит в виде CSI-u последовательностей, а шелл ждёт
// «легаси»-кодировку. Поэтому кодируем сами из логического `key` + модификаторов.
//
// Эталон — xterm.js `evaluateKeyboardEvent` (src/common/input/Keyboard.ts, @xterm/xterm
// 6.1.0-beta.285, им кодирует клавиши VS Code без kitty-протокола; MIT). Модификатор в
// CSI-последовательностях — `1 + (shift 1 | alt 2 | ctrl 4 | meta 8)`. Отступления:
// - ветвимся по `key`, а не по `keyCode` — у TUIKeyboardEvent его нет;
// - ветки только для браузера (iPad `UIKeyInput*`, Safari Ctrl+C через keyCode 13,
//   mac-специфика `isMac`/`macOptionIsMeta`) не переносим: Option на маке приходит от
//   внешнего терминала уже как Alt или Meta;
// - поэтому Meta+печатный символ, как и Alt, уходит с ESC-префиксом (у эталона Meta без
//   Alt не кодируется).
// Клавиша, которую эталон не кодирует, → "": виджет не трогает событие, и оно всплывает
// к хосту.
//
// Программа включила kitty keyboard protocol (флаги поверхности > 0) — кодирует
// `encodeKittyKey`, как xterm.js при `KittyKeyboard.shouldUseProtocol`. Отпускание
// (`keyup`) имеет смысл только там, с флагом 2; в легаси оно → "".

import type { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";

import { encodeKittyKey, KittyKeyboardEventType } from "./kittyKeyboard.ts";

export interface EncodeKeyOptions {
    /**
     * Программа включила application cursor keys (DECCKM, `CSI ? 1 h`): стрелки и
     * Home/End без модификаторов уходят как SS3 (`ESC O A`), а не CSI (`ESC [ A`).
     */
    readonly applicationCursorKeys?: boolean;
    /**
     * Флаги kitty keyboard protocol, которые включила программа (`CSI > flags u`); `0` —
     * протокол выключен, легаси-кодировка.
     */
    readonly kittyKeyboardFlags?: number;
}

const ESC = "\x1b";

// Стрелки и Home/End: финальный байт CSI/SS3-последовательности.
const CURSOR_FINAL: Record<string, string | undefined> = {
    ArrowUp: "A",
    ArrowDown: "B",
    ArrowRight: "C",
    ArrowLeft: "D",
    Home: "H",
    End: "F",
};

// F1–F4: SS3 `ESC O P`…`S`, с модификаторами — `ESC [1;<mod>P`…`S`.
const F1_F4_FINAL: Record<string, string | undefined> = { F1: "P", F2: "Q", F3: "R", F4: "S" };

// F5–F12 и Delete: `ESC [<code>~`, с модификаторами — `ESC [<code>;<mod>~`.
const TILDE_CODE: Record<string, number | undefined> = {
    Delete: 3,
    F5: 15,
    F6: 17,
    F7: 18,
    F8: 19,
    F9: 20,
    F10: 21,
    F11: 23,
    F12: 24,
};

// Ctrl+символ (без Shift/Alt/Meta) → управляющий байт, как xterm.js по keyCode:
// Ctrl+3…7 — ESC, FS, GS, RS, US; Ctrl+8 — DEL.
const CTRL_SYMBOL: Record<string, string | undefined> = {
    " ": "\x00",
    "3": "\x1b",
    "4": "\x1c",
    "5": "\x1d",
    "6": "\x1e",
    "7": "\x1f",
    "8": "\x7f",
    "/": "\x1f",
    "[": "\x1b",
    "\\": "\x1c",
    "]": "\x1d",
};

// Ctrl+Shift+символ — по физической клавише, как у эталона (`ev.code`).
const CTRL_SHIFT_CODE: Record<string, string | undefined> = {
    Minus: "\x1f", // ^_
    Digit2: "\x00", // ^@
    Digit6: "\x1e", // ^^
};

function modifierParam(event: TUIKeyboardEvent): number {
    return 1 + ((event.shiftKey ? 1 : 0) | (event.altKey ? 2 : 0) | (event.ctrlKey ? 4 : 0) | (event.metaKey ? 8 : 0));
}

function hasModifiers(event: TUIKeyboardEvent): boolean {
    return event.shiftKey || event.altKey || event.ctrlKey || event.metaKey;
}

/** Ctrl+латинская буква → 0x01..0x1a, иначе `undefined`. */
function ctrlLetter(key: string): string | undefined {
    const lower = key.toLowerCase();
    return key.length === 1 && lower >= "a" && lower <= "z" ? String.fromCharCode(lower.charCodeAt(0) - 96) : undefined;
}

/** Вернуть байты для PTY, либо "" если клавишу не транслируем. */
export function encodeKeyForPty(event: TUIKeyboardEvent, options: EncodeKeyOptions = {}): string {
    const kittyKeyboardFlags = options.kittyKeyboardFlags ?? 0;
    if (kittyKeyboardFlags > 0) {
        const eventType = event.type === "keyup" ? KittyKeyboardEventType.Release : KittyKeyboardEventType.Press;
        return encodeKittyKey(event, kittyKeyboardFlags, eventType);
    }
    if (event.type === "keyup") return "";

    const { key } = event;
    const applicationCursorKeys = options.applicationCursorKeys ?? false;

    const cursorFinal = CURSOR_FINAL[key];
    if (cursorFinal !== undefined) {
        const isArrow = key.startsWith("Arrow");
        // Meta+стрелка эталон не кодирует — сочетание остаётся хосту.
        if (isArrow && event.metaKey) return "";
        if (hasModifiers(event)) return `${ESC}[1;${modifierParam(event)}${cursorFinal}`;
        return applicationCursorKeys ? `${ESC}O${cursorFinal}` : `${ESC}[${cursorFinal}`;
    }

    const f1f4Final = F1_F4_FINAL[key];
    if (f1f4Final !== undefined) {
        return hasModifiers(event) ? `${ESC}[1;${modifierParam(event)}${f1f4Final}` : `${ESC}O${f1f4Final}`;
    }

    const tildeCode = TILDE_CODE[key];
    if (tildeCode !== undefined) {
        return hasModifiers(event) ? `${ESC}[${tildeCode};${modifierParam(event)}~` : `${ESC}[${tildeCode}~`;
    }

    switch (key) {
        case "Tab":
            return event.shiftKey ? `${ESC}[Z` : "\t";
        case "Enter":
            return event.altKey ? `${ESC}\r` : "\r";
        case "Escape":
            return event.altKey ? ESC + ESC : ESC;
        case "Backspace": {
            const bytes = event.ctrlKey ? "\b" : "\x7f";
            return event.altKey ? ESC + bytes : bytes;
        }
        // Shift+PageUp/PageDown эталон отдаёт скролбэку; у нас их забирает виджет раньше.
        // Alt кодировку не меняет, Ctrl — добавляет параметр модификатора.
        case "PageUp":
            return event.ctrlKey ? `${ESC}[5;${modifierParam(event)}~` : `${ESC}[5~`;
        case "PageDown":
            return event.ctrlKey ? `${ESC}[6;${modifierParam(event)}~` : `${ESC}[6~`;
        // Shift/Ctrl+Insert — копирование и вставка на некоторых системах, остаются хосту.
        case "Insert":
            return event.shiftKey || event.ctrlKey ? "" : `${ESC}[2~`;
    }

    if (key.length !== 1) return "";

    // Ctrl+Shift+буква не транслируем (#819): сочетание остаётся хосту — Ctrl+Shift+E/F/G/P.
    if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
        return ctrlLetter(key) ?? CTRL_SYMBOL[key] ?? "";
    }

    // Alt → ESC-префикс (meta-байт); Ctrl+Alt+буква/пробел — ESC + управляющий байт.
    if (event.altKey && !event.metaKey) {
        if (event.ctrlKey) {
            if (key === " ") return ESC + "\x00";
            const letter = ctrlLetter(key);
            if (letter !== undefined) return ESC + letter;
        }
        return ESC + key;
    }

    if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey) {
        return CTRL_SHIFT_CODE[event.code] ?? "";
    }

    if (event.ctrlKey || event.altKey) return "";

    // Печатный символ; Meta — тоже ESC-префикс (см. шапку).
    return event.metaKey ? ESC + key : key;
}
