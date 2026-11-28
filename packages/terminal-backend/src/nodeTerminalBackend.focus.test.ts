import { describe, expect, it, vi } from "vitest";

import { NodeTerminalBackend } from "./nodeTerminalBackend.ts";

/** Backend over doubles: stdout collects writes, stdin delivers "terminal input" through reply(). */
function createBackend(): { backend: NodeTerminalBackend; writes: string[]; reply: (data: string) => void } {
    const writes: string[] = [];
    let onData: ((chunk: string) => void) | null = null;
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
        on(event: string, handler: (chunk: string) => void) {
            if (event === "data") onData = handler;
        },
        removeListener: noop,
    } as unknown as NodeJS.ReadStream;
    return {
        backend: new NodeTerminalBackend(stdin, stdout),
        writes,
        reply: (data) => {
            onData?.(data);
        },
    };
}

const FOCUS_ENABLE = "\x1b[?1004h";
const FOCUS_DISABLE = "\x1b[?1004l";

describe("NodeTerminalBackend.onFocusChange (mode 1004)", () => {
    it("setup turns focus reports on, teardown turns them off", () => {
        const { backend, writes } = createBackend();
        backend.setup();
        const setupOut = writes.join("");
        expect(setupOut).toContain(FOCUS_ENABLE);
        expect(setupOut).not.toContain(FOCUS_DISABLE);
        backend.teardown();
        expect(writes.join("").slice(setupOut.length)).toContain(FOCUS_DISABLE);
    });

    it("CSI O / CSI I reach every subscriber in order and never become keys", () => {
        const { backend, reply } = createBackend();
        const first = vi.fn();
        const second = vi.fn();
        const keys: string[] = [];
        backend.onFocusChange(first);
        backend.onFocusChange(second);
        backend.onInput((event) => keys.push(`${event.type}:${event.key}`));
        backend.setup();
        reply("\x1b[O");
        reply("a\x1b[Ib");
        backend.teardown();

        expect(first.mock.calls).toEqual([[false], [true]]);
        expect(second.mock.calls).toEqual([[false], [true]]);
        expect(keys).toEqual(["keydown:a", "keypress:a", "keydown:b", "keypress:b"]);
    });

    it("a report cut between reads is reassembled", () => {
        const { backend, reply } = createBackend();
        const focus = vi.fn();
        const keys = vi.fn();
        backend.onFocusChange(focus);
        backend.onInput(keys);
        backend.setup();
        reply("\x1b[");
        reply("I");
        backend.teardown();

        expect(focus).toHaveBeenCalledExactlyOnceWith(true);
        expect(keys).not.toHaveBeenCalled();
    });
});
