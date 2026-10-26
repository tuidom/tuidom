import { afterEach, describe, expect, it, vi } from "vitest";

import { NodeTerminalBackend } from "./nodeTerminalBackend.ts";

const EW_RESIZE = "\x1b]22;ew-resize\x1b\\";
const DEFAULT = "\x1b]22;default\x1b\\";

/** stdin/stdout doubles: stdout collects writes, stdin does just what setup/teardown touch. */
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

describe("NodeTerminalBackend.setPointerShape", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    function plainTerminal(): void {
        vi.stubEnv("TMUX", "");
        vi.stubEnv("STY", "");
    }

    it("writes OSC 22 once per change, repeats write nothing", () => {
        plainTerminal();
        const { backend, output } = createBackend();
        backend.setPointerShape("ew-resize");
        backend.setPointerShape("ew-resize");
        backend.setPointerShape("default");
        backend.setPointerShape("default");

        expect(output()).toBe(EW_RESIZE + DEFAULT);
    });

    it("default before any other shape writes nothing", () => {
        plainTerminal();
        const { backend, output } = createBackend();
        backend.setPointerShape("default");

        expect(output()).toBe("");
    });

    it("inside tmux goes through DCS passthrough: tmux does not know OSC 22", () => {
        vi.stubEnv("TMUX", "/tmp/tmux-1000/default,1,0");
        const { backend, output } = createBackend();
        backend.setPointerShape("ew-resize");

        expect(output()).toBe("\x1bPtmux;\x1b\x1b]22;ew-resize\x1b\x1b\\\x1b\\");
    });

    it("inside GNU Screen writes nothing", () => {
        vi.stubEnv("TMUX", "");
        vi.stubEnv("STY", "1234.pts-0.host");
        const { backend, output } = createBackend();
        backend.setPointerShape("ew-resize");
        backend.teardown();

        expect(output()).not.toContain("\x1b]22;");
    });

    it("teardown brings back the default pointer after a change", () => {
        plainTerminal();
        const { backend, output } = createBackend();
        backend.setup();
        backend.setPointerShape("ew-resize");
        const beforeTeardown = output().length;
        backend.teardown();
        backend.teardown();

        expect(output().slice(beforeTeardown).split(DEFAULT)).toHaveLength(2);
    });

    it("teardown writes no pointer reset when the shape is already default", () => {
        plainTerminal();
        const { backend, output } = createBackend();
        backend.setup();
        backend.setPointerShape("ew-resize");
        backend.setPointerShape("default");
        const beforeTeardown = output().length;
        backend.teardown();

        expect(output().slice(beforeTeardown)).not.toContain("\x1b]22;");
    });

    it("teardown without any change writes no pointer reset", () => {
        plainTerminal();
        const { backend, output } = createBackend();
        backend.setup();
        backend.teardown();

        expect(output()).not.toContain("\x1b]22;");
    });
});
