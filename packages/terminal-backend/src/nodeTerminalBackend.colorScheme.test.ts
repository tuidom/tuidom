import { describe, expect, it, vi } from "vitest";

import { NodeTerminalBackend } from "./nodeTerminalBackend.ts";

/** Бэкенд на двойниках, ещё без setup: stdout копит записи, stdin отдаёт «ответы терминала» через reply(). */
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

const ENABLE_AND_QUERY = "\x1b[?2031h\x1b[?996n";

describe("NodeTerminalBackend.onColorSchemeChange (режим 2031)", () => {
    it("без подписчиков режим не включается и teardown его не сбрасывает", () => {
        const { backend, writes } = createBackend();
        backend.setup();
        backend.teardown();
        expect(writes.join("")).not.toContain("2031");
        expect(writes.join("")).not.toContain("996");
    });

    it("подписка после setup включает режим и спрашивает схему; ответы — dark/light, не ввод", () => {
        const { backend, writes, reply } = createBackend();
        backend.setup();
        writes.length = 0;
        const onScheme = vi.fn();
        const onInput = vi.fn();
        backend.onInput(onInput);

        backend.onColorSchemeChange(onScheme);
        expect(writes.join("")).toBe(ENABLE_AND_QUERY);

        reply("\x1b[?997;1n");
        expect(onScheme).toHaveBeenLastCalledWith("dark");
        // Смена темы ОС: терминал шлёт отчёт сам, без запроса.
        reply("\x1b[?997;2n");
        expect(onScheme).toHaveBeenLastCalledWith("light");
        expect(onScheme).toHaveBeenCalledTimes(2);
        expect(onInput).not.toHaveBeenCalled();
        backend.teardown();
    });

    it("подписка до setup ждёт raw-режима: в cooked-режиме ответ эхом лёг бы на экран", () => {
        const { backend, writes } = createBackend();
        backend.onColorSchemeChange(vi.fn());
        expect(writes.join("")).toBe("");

        backend.setup();
        expect(writes.join("")).toContain(ENABLE_AND_QUERY);
        backend.teardown();
    });

    it("второй подписчик не шлёт режим повторно, оба получают отчёт", () => {
        const { backend, writes, reply } = createBackend();
        backend.setup();
        const first = vi.fn();
        const second = vi.fn();
        backend.onColorSchemeChange(first);
        writes.length = 0;
        backend.onColorSchemeChange(second);
        expect(writes.join("")).toBe("");

        reply("\x1b[?997;2n");
        expect(first).toHaveBeenCalledExactlyOnceWith("light");
        expect(second).toHaveBeenCalledExactlyOnceWith("light");
        backend.teardown();
    });

    it("неизвестное значение отчёта проглатывается без колбэка и без ввода", () => {
        const { backend, reply } = createBackend();
        backend.setup();
        const onScheme = vi.fn();
        const onInput = vi.fn();
        backend.onInput(onInput);
        backend.onColorSchemeChange(onScheme);

        reply("\x1b[?997;3n");
        expect(onScheme).not.toHaveBeenCalled();
        expect(onInput).not.toHaveBeenCalled();
        backend.teardown();
    });

    it("teardown сбрасывает режим, повторный setup включает его снова", () => {
        const { backend, writes } = createBackend();
        backend.setup();
        backend.onColorSchemeChange(vi.fn());
        writes.length = 0;

        backend.teardown();
        expect(writes.join("")).toContain("\x1b[?2031l");

        writes.length = 0;
        backend.teardown();
        expect(writes.join("")).not.toContain("2031");

        backend.setup();
        expect(writes.join("")).toContain(ENABLE_AND_QUERY);
        backend.teardown();
    });
});
