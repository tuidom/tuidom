import { describe, expect, it } from "vitest";

import { KeyInputParser } from "./keyInputParser.ts";
import { parseInput } from "./parseInput.ts";
import { tokenize } from "./tokenize.ts";

const REPLY = "\x1bP>|iTerm2 3.5.0\x1b\\";

describe("tokenize — ответ XTVERSION (DCS > | … ST)", () => {
    it("разбирает ответ как device-report xtversion с именем и версией", () => {
        expect(tokenize(REPLY)).toEqual([
            { kind: "device-report", report: "xtversion", params: "iTerm2 3.5.0", raw: REPLY },
        ]);
    });

    it("пустой ответ — пустой params", () => {
        expect(tokenize("\x1bP>|\x1b\\")).toMatchObject([{ kind: "device-report", report: "xtversion", params: "" }]);
    });

    it("ответ посреди ввода не съедает соседние клавиши", () => {
        const tokens = tokenize("a" + REPLY + "\x1b[?62;1;6c" + "b");
        expect(tokens.map((t) => t.kind)).toEqual(["char", "device-report", "device-report", "char"]);
    });

    it("голое ESC P — по-прежнему Alt+Shift+P legacy-терминала, а не DCS", () => {
        expect(tokenize("\x1bP")).toMatchObject([{ kind: "esc-char", char: "P" }]);
        expect(tokenize("\x1bPx")).toMatchObject([
            { kind: "esc-char", char: "P" },
            { kind: "char", char: "x" },
        ]);
    });

    it("ответ без ST (обрезан насовсем) падает в прежний разбор ESC+символ", () => {
        expect(tokenize("\x1bP>|kitty")[0]).toMatchObject({ kind: "esc-char", char: "P" });
    });

    it("parseInput не превращает ответ в клавиши", () => {
        expect(parseInput(REPLY)).toEqual([]);
    });
});

describe("KeyInputParser — ответ XTVERSION, разрезанный между чтениями stdin", () => {
    // Все точки разреза, включая «внутри ST» (последний ESC — от терминатора).
    for (let cut = 1; cut < REPLY.length; cut++) {
        it(`разрез на ${cut.toString()}: один device-report, ни одной клавиши`, () => {
            const parser = new KeyInputParser();
            const first = parser.parseWithMouse(REPLY.slice(0, cut));
            expect(first.keys).toEqual([]);
            expect(first.deviceReports).toEqual([]);
            expect(parser.hasPending()).toBe(true);

            const second = parser.parseWithMouse(REPLY.slice(cut) + "a");
            expect(second.deviceReports).toMatchObject([{ report: "xtversion", params: "iTerm2 3.5.0" }]);
            expect(second.keys.map((e) => e.key)).toEqual(["a", "a"]);
            expect(parser.hasPending()).toBe(false);
        });
    }

    it("одинокое ESC P ждёт продолжения, а flush отдаёт его как Alt+P", () => {
        const parser = new KeyInputParser();
        expect(parser.parseWithMouse("\x1bP").keys).toEqual([]);
        expect(parser.hasPending()).toBe(true);
        expect(parser.flush().keys[0]).toMatchObject({ key: "P", altKey: true });
    });

    it("ESC P, разошедшийся с префиксом ответа, — сразу Alt+P и символ", () => {
        const parser = new KeyInputParser();
        const result = parser.parseWithMouse("\x1bPx");
        expect(result.keys.filter((e) => e.type === "keydown").map((e) => e.key)).toEqual(["P", "x"]);
        expect(parser.hasPending()).toBe(false);
    });
});
