import { describe, expect, it } from "vitest";

import { parseInput } from "./parseInput.ts";

/** Ряды ЙЦУКЕН и латинские буквы под ними на US-клавиатуре. */
const russianRows: readonly (readonly [string, string])[] = [
    ["йцукенгшщз", "QWERTYUIOP"],
    ["фывапролд", "ASDFGHJKL"],
    ["ячсмить", "ZXCVBNM"],
];

function only(data: string) {
    const events = parseInput(data);
    expect(events).toHaveLength(1);
    return events[0];
}

describe("parseInput — физическая клавиша под кириллицей (легаси-ввод без kitty)", () => {
    it.each(
        russianRows.flatMap(([cyr, lat]) =>
            Array.from({ length: cyr.length }, (_, i) => [cyr[i], `Key${lat[i]}`] as const),
        ),
    )("%s → %s", (ch, code) => {
        expect(only(ch).code).toBe(code);
        expect(only(ch.toUpperCase()).code).toBe(code);
    });

    it("буквы на местах пунктуации — code пунктуационной клавиши", () => {
        expect(["х", "ъ", "ж", "э", "б", "ю", "ё"].map((ch) => only(ch).code)).toEqual([
            "BracketLeft",
            "BracketRight",
            "Semicolon",
            "Quote",
            "Comma",
            "Period",
            "Backquote",
        ]);
    });

    it("украинские і/ї/є/ґ и белорусская ў", () => {
        expect(["і", "ї", "є", "ґ", "ў"].map((ch) => only(ch).code)).toEqual([
            "KeyS",
            "BracketRight",
            "Quote",
            "Backslash",
            "KeyO",
        ]);
        expect(only("Ґ").code).toBe("Backslash");
    });

    it("Alt+а через ESC-префикс (tmux): key остаётся символом, code — KeyF", () => {
        expect(only("\x1bа")).toMatchObject({ key: "а", code: "KeyF", altKey: true });
        expect(only("\x1bА")).toMatchObject({ key: "А", code: "KeyF", altKey: true });
    });

    it("CSI u без base-layout key (терминал не шлёт alternate keys) — code из символа", () => {
        // 1072 = «а», модификатор 3 = Alt
        expect(only("\x1b[1072;3u")).toMatchObject({ key: "а", code: "KeyF", altKey: true });
    });

    it("CSI u с base-layout key — code из него, а не из таблицы", () => {
        // «а» с base-layout key «f» (102)
        expect(only("\x1b[1072::102;3u")).toMatchObject({ key: "а", code: "KeyF", altKey: true });
        // base-layout key важнее таблицы: «а» на клавише J (вымышленная раскладка)
        expect(only("\x1b[1072::106;3u").code).toBe("KeyJ");
    });

    it("прочие не-латинские символы как были — code равен символу", () => {
        expect(only("ü").code).toBe("ü");
        expect(only("€").code).toBe("€");
    });
});
