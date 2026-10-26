import type { CursorStyle } from "@tuidom/core/common/cursorStyle";
import { Point, Size } from "@tuidom/core/common/geometryPromitives";
import { Grid } from "@tuidom/core/rendering/grid";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NodeTerminalBackend } from "./nodeTerminalBackend.ts";

const BAR_BLINK: CursorStyle = { shape: "bar", blinking: true };
const BAR_STEADY: CursorStyle = { shape: "bar", blinking: false };
const RESET = "\x1b[0 q";

/** stdin/stdout doubles: stdout collects writes, stdin does just what setup/teardown touch. */
function createBackend(): { backend: NodeTerminalBackend; output: () => string; clear: () => void } {
    const writes: string[] = [];
    const noop = (): void => {
        /* no-op */
    };
    const stdout = {
        columns: 10,
        rows: 3,
        write(data: string): boolean {
            writes.push(data);
            return true;
        },
        on: noop,
        removeListener: noop,
    } as unknown as NodeJS.WriteStream;
    const stdin = {
        setRawMode: noop,
        setEncoding: noop,
        resume: noop,
        on: noop,
        removeListener: noop,
    } as unknown as NodeJS.ReadStream;
    return {
        backend: new NodeTerminalBackend(stdin, stdout),
        output: () => writes.join(""),
        clear: () => {
            writes.length = 0;
        },
    };
}

/** Every DECSCUSR in the byte stream, in order. */
function decscusr(output: string): string[] {
    return output.match(/\x1b\[\d q/g) ?? [];
}

describe("NodeTerminalBackend — cursor shape (DECSCUSR)", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it.each<[CursorStyle, string]>([
        [{ shape: "block", blinking: true }, "\x1b[1 q"],
        [{ shape: "block", blinking: false }, "\x1b[2 q"],
        [{ shape: "underline", blinking: true }, "\x1b[3 q"],
        [{ shape: "underline", blinking: false }, "\x1b[4 q"],
        [BAR_BLINK, "\x1b[5 q"],
        [BAR_STEADY, "\x1b[6 q"],
    ])("writes %o as %j", (style, sequence) => {
        const { backend, output } = createBackend();
        backend.renderFrame(new Grid(new Size(10, 3)), new Point(1, 1), style);

        expect(decscusr(output())).toEqual([sequence]);
    });

    it("the shape goes before the cursor is shown, inside the synchronized frame", () => {
        const { backend, output } = createBackend();
        backend.renderFrame(new Grid(new Size(10, 3)), new Point(1, 1), BAR_BLINK);

        expect(output()).toMatch(/\x1b\[5 q\x1b\[2;2H\x1b\[\?25h\x1b\[\?2026l$/);
    });

    it("a run that never sets a shape writes no DECSCUSR — not in frames, not in teardown", () => {
        const { backend, output } = createBackend();
        const grid = new Grid(new Size(10, 3));
        backend.renderFrame(grid, new Point(1, 1));
        backend.renderFrame(grid, new Point(2, 1), null);
        backend.renderFrame(grid, null);
        backend.teardown();

        expect(decscusr(output())).toEqual([]);
    });

    it("an unchanged shape is written once, repeats and repaints write nothing", () => {
        const { backend, output, clear } = createBackend();
        const grid = new Grid(new Size(10, 3));
        backend.renderFrame(grid, new Point(1, 1), BAR_BLINK);
        clear();

        backend.renderFrame(grid, new Point(1, 1), { shape: "bar", blinking: true });
        expect(output()).toBe("");

        grid.setCell(new Point(5, 2), "X");
        backend.renderFrame(grid, new Point(3, 1), BAR_BLINK);
        expect(output()).not.toBe("");
        expect(decscusr(output())).toEqual([]);
    });

    it("a shape change alone, with the same cells and position, still reaches the terminal", () => {
        const { backend, output, clear } = createBackend();
        const grid = new Grid(new Size(10, 3));
        backend.renderFrame(grid, new Point(1, 1), BAR_BLINK);
        clear();

        backend.renderFrame(grid, new Point(1, 1), BAR_STEADY);
        expect(decscusr(output())).toEqual(["\x1b[6 q"]);
        clear();

        backend.renderFrame(grid, new Point(1, 1), null);
        expect(decscusr(output())).toEqual([RESET]);
    });

    it("a hidden cursor keeps the shape: no write while hidden, none when the same shape shows again", () => {
        const { backend, output, clear } = createBackend();
        const grid = new Grid(new Size(10, 3));
        backend.renderFrame(grid, new Point(1, 1), BAR_BLINK);
        clear();

        backend.renderFrame(grid, null, null);
        backend.renderFrame(grid, new Point(1, 1), BAR_BLINK);

        expect(decscusr(output())).toEqual([]);
    });

    it("teardown resets the shape once a frame changed it, even if it came back to the default", () => {
        const { backend, output, clear } = createBackend();
        const grid = new Grid(new Size(10, 3));
        backend.renderFrame(grid, new Point(1, 1), BAR_BLINK);
        backend.renderFrame(grid, new Point(1, 1), null);
        clear();

        backend.teardown();
        expect(decscusr(output())).toEqual([RESET]);
        clear();

        backend.teardown();
        expect(decscusr(output())).toEqual([]);
    });

    it("inside tmux the shape goes directly, without passthrough", () => {
        vi.stubEnv("TMUX", "/tmp/tmux-1000/default,1,0");
        const { backend, output } = createBackend();
        backend.renderFrame(new Grid(new Size(10, 3)), new Point(1, 1), BAR_BLINK);
        backend.teardown();

        expect(decscusr(output())).toEqual(["\x1b[5 q", RESET]);
        expect(output()).not.toContain("\x1bPtmux;\x1b\x1b[5 q");
    });
});
