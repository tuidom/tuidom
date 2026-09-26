import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NodeTerminalBackend } from "./nodeTerminalBackend.ts";

/** Бэкенд на двойниках: stdout копит записи, stdin отдаёт «ответы терминала» через reply(). */
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
    const backend = new NodeTerminalBackend(stdin, stdout);
    backend.setup();
    writes.length = 0;
    return {
        backend,
        writes,
        reply: (data) => {
            onData?.(data);
        },
    };
}

const DA1_REPLY = "\x1b[?62;1;6c";

describe("NodeTerminalBackend.probeTerminalVersion (XTVERSION)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("шлёт CSI > 0 q + DA1 и отдаёт имя(версию) из DCS-ответа; ответ не становится вводом", () => {
        const { backend, writes, reply } = createBackend();
        const onResult = vi.fn();
        const onInput = vi.fn();
        backend.onInput(onInput);

        backend.probeTerminalVersion(onResult);
        expect(writes.join("")).toBe("\x1b[>0q\x1b[c");

        reply("\x1bP>|iTerm2 3.5.0\x1b\\" + DA1_REPLY);
        expect(onResult).toHaveBeenCalledExactlyOnceWith("iTerm2 3.5.0");
        expect(onInput).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1000);
        expect(onResult).toHaveBeenCalledOnce();
        backend.teardown();
    });

    it("терминал без XTVERSION отвечает только DA1 → undefined", () => {
        const { backend, reply } = createBackend();
        const onResult = vi.fn();
        backend.probeTerminalVersion(onResult);
        reply(DA1_REPLY);
        expect(onResult).toHaveBeenCalledExactlyOnceWith(undefined);
        backend.teardown();
    });

    it("нет ответа вовсе → undefined по таймауту", () => {
        const { backend } = createBackend();
        const onResult = vi.fn();
        backend.probeTerminalVersion(onResult);
        expect(onResult).not.toHaveBeenCalled();
        vi.advanceTimersByTime(200);
        expect(onResult).toHaveBeenCalledExactlyOnceWith(undefined);
        backend.teardown();
    });

    it("две пробы разом: DA1 первой не закрывает вторую раньше её ответа", () => {
        const { backend, reply } = createBackend();
        const onKeyboard = vi.fn();
        const onVersion = vi.fn();
        backend.probeKeyboardProtocol(onKeyboard);
        backend.probeTerminalVersion(onVersion);

        // Ответы приходят в порядке запросов: kitty-флаги, DA1 (#1), XTVERSION, DA1 (#2).
        reply("\x1b[?15u" + DA1_REPLY);
        expect(onKeyboard).toHaveBeenCalledExactlyOnceWith(true);
        expect(onVersion).not.toHaveBeenCalled();

        reply("\x1bP>|kitty(0.35.2)\x1b\\" + DA1_REPLY);
        expect(onVersion).toHaveBeenCalledExactlyOnceWith("kitty(0.35.2)");
        backend.teardown();
    });

    it("и наоборот: проба клавиатуры после версии ждёт свой DA1", () => {
        const { backend, reply } = createBackend();
        const onKeyboard = vi.fn();
        const onVersion = vi.fn();
        backend.probeTerminalVersion(onVersion);
        backend.probeKeyboardProtocol(onKeyboard);

        reply("\x1bP>|WezTerm 20240203\x1b\\" + DA1_REPLY);
        expect(onVersion).toHaveBeenCalledExactlyOnceWith("WezTerm 20240203");
        expect(onKeyboard).not.toHaveBeenCalled();

        reply("\x1b[?15u" + DA1_REPLY);
        expect(onKeyboard).toHaveBeenCalledExactlyOnceWith(true);
        backend.teardown();
    });
});
