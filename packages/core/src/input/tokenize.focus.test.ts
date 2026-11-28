import { describe, expect, it } from "vitest";

import { KeyInputParser } from "./keyInputParser.ts";
import { parseInput } from "./parseInput.ts";
import { tokenize } from "./tokenize.ts";

describe("tokenize — focus reports (mode 1004)", () => {
    it("bare CSI I is focus gained, bare CSI O is focus lost", () => {
        expect(tokenize("\x1b[I\x1b[O")).toEqual([
            { kind: "focus", focused: true, raw: "\x1b[I" },
            { kind: "focus", focused: false, raw: "\x1b[O" },
        ]);
    });

    it("CSI 1;5I stays Ctrl+Tab (mintty)", () => {
        expect(tokenize("\x1b[1;5I")).toEqual([
            expect.objectContaining({ kind: "csi-letter", key: "Tab", ctrlKey: true, raw: "\x1b[1;5I" }),
        ]);
    });

    it("a CSI with an intermediate byte before I is not a focus report", () => {
        expect(tokenize("\x1b[ I").map((t) => t.kind)).not.toContain("focus");
        expect(tokenize("\x1b[2O").map((t) => t.kind)).not.toContain("focus");
    });

    it("parseInput yields no key for a focus report", () => {
        expect(parseInput("\x1b[I\x1b[O")).toEqual([]);
    });
});

describe("KeyInputParser — focus reports", () => {
    it("routes reports into the focus stream in order, keys around them stay keys", () => {
        const streams = new KeyInputParser().parseWithMouse("x\x1b[Oy\x1b[I");
        expect(streams.focus).toEqual([false, true]);
        expect(streams.keys.filter((e) => e.type === "keypress").map((e) => e.key)).toEqual(["x", "y"]);
    });

    it("reassembles a report split between reads", () => {
        const parser = new KeyInputParser();
        const head = parser.parseWithMouse("\x1b[");
        expect(head.focus).toEqual([]);
        expect(head.keys).toEqual([]);
        const tail = parser.parseWithMouse("O");
        expect(tail.focus).toEqual([false]);
        expect(tail.keys).toEqual([]);
    });
});
