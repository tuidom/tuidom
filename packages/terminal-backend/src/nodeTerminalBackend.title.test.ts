import { afterEach, describe, expect, it, vi } from "vitest";

import { NodeTerminalBackend, windowTitleSequence } from "./nodeTerminalBackend.ts";

const TITLE_PUSH = "\x1b[22;0t";
const TITLE_POP = "\x1b[23;0t";

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

describe("windowTitleSequence", () => {
    it("OSC 0 с BEL-терминатором", () => {
        expect(windowTitleSequence("app - Diode")).toBe("\x1b]0;app - Diode\x07");
    });

    it("управляющие символы заменяются пробелом — иначе оборвали бы последовательность", () => {
        expect(windowTitleSequence("a\x07b\x1bc\nd\x7f\x00")).toBe("\x1b]0;a b c d  \x07");
    });
});

describe("NodeTerminalBackend.setWindowTitle", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("первый заголовок сохраняет прежний (push), следующие — без push", () => {
        vi.stubEnv("TMUX", "");
        const { backend, output } = createBackend();
        backend.setWindowTitle("one");
        backend.setWindowTitle("two");

        expect(output()).toBe(`${TITLE_PUSH}\x1b]0;one\x07\x1b]0;two\x07`);
    });

    it("внутри tmux — прямой OSC без DCS passthrough: tmux сам ставит заголовок панели", () => {
        vi.stubEnv("TMUX", "/tmp/tmux-1000/default,1,0");
        const { backend, output } = createBackend();
        backend.setWindowTitle("proj - Diode");

        expect(output()).toBe(`${TITLE_PUSH}\x1b]0;proj - Diode\x07`);
        expect(output()).not.toContain("\x1bPtmux;");
    });

    it("teardown восстанавливает сохранённый заголовок (pop) ровно один раз", () => {
        const { backend, output } = createBackend();
        backend.setup();
        backend.setWindowTitle("x");
        const beforeTeardown = output().length;
        backend.teardown();
        backend.teardown();

        const teardownOut = output().slice(beforeTeardown);
        expect(teardownOut.split(TITLE_POP)).toHaveLength(2);
        // pop — после выхода из альтернативного экрана, последним из восстановлений.
        expect(teardownOut.indexOf(TITLE_POP)).toBeGreaterThan(teardownOut.indexOf("\x1b[?1049l"));
    });

    it("без заголовка teardown стек заголовков не трогает", () => {
        const { backend, output } = createBackend();
        backend.setup();
        backend.teardown();

        expect(output()).not.toContain(TITLE_PUSH);
        expect(output()).not.toContain(TITLE_POP);
    });

    it("после teardown новый заголовок снова делает push", () => {
        const { backend, output } = createBackend();
        backend.setWindowTitle("a");
        backend.teardown();
        const afterTeardown = output().length;
        backend.setWindowTitle("b");

        expect(output().slice(afterTeardown)).toBe(`${TITLE_PUSH}\x1b]0;b\x07`);
    });
});
