import { describe, expect, it } from "vitest";

import { NodeTerminalBackend } from "./nodeTerminalBackend.ts";

const KITTY_PUSH = "\x1b[>15u";
const KITTY_POP = "\x1b[<u";
const MODIFY_OTHER_KEYS_ENABLE = "\x1b[>4;2m";
const MODIFY_OTHER_KEYS_DISABLE = "\x1b[>4;0m";

/** Двойники stdin/stdout: stdout копит записи, stdin умеет ровно то, что трогает setup/teardown. */
function createBackend(): { backend: NodeTerminalBackend; output: () => string } {
    const writes: string[] = [];
    const noop = (): void => {
        /* no-op */
    };
    const stdout = {
        columns: 80,
        rows: 24,
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
    return { backend: new NodeTerminalBackend(stdin, stdout), output: () => writes.join("") };
}

describe("NodeTerminalBackend — порядок клавиатурных режимов", () => {
    it("setup шлёт modifyOtherKeys ДО kitty-push: iTerm2 сбрасывает kitty-стек на любой CSI > 4 ; n m", () => {
        const { backend, output } = createBackend();
        backend.setup();
        backend.teardown();

        const setupOut = output().slice(0, output().indexOf(KITTY_POP));
        expect(setupOut.indexOf(MODIFY_OTHER_KEYS_ENABLE)).toBeGreaterThanOrEqual(0);
        expect(setupOut.indexOf(MODIFY_OTHER_KEYS_ENABLE)).toBeLessThan(setupOut.indexOf(KITTY_PUSH));
        // После kitty-push больше ни одного CSI > 4 ; … m — иначе iTerm2 откатит push.
        expect(setupOut.slice(setupOut.indexOf(KITTY_PUSH))).not.toMatch(/\x1b\[>4;\d*m/);
    });

    it("teardown снимает режимы в обратном порядке: kitty-pop, затем сброс modifyOtherKeys", () => {
        const { backend, output } = createBackend();
        backend.setup();
        const setupLength = output().length;
        backend.teardown();

        const teardownOut = output().slice(setupLength);
        expect(teardownOut.indexOf(KITTY_POP)).toBeGreaterThanOrEqual(0);
        expect(teardownOut.indexOf(KITTY_POP)).toBeLessThan(teardownOut.indexOf(MODIFY_OTHER_KEYS_DISABLE));
    });
});
