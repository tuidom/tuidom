import { type HostTerminalColors, NO_HOST_COLORS } from "@tuidom/core/backend/iTerminalBackend";
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

/** Ответ на OSC-запрос цвета: `ESC ] <body> ST`. */
function osc(body: string, terminator = "\x1b\\"): string {
    return `\x1b]${body}${terminator}`;
}

/** Все 18 ответов хоста: fg, bg и палитра 0..15 (индекс i → rgb:XXXX/0000/0000, XX = i·16). */
function allHostColorReplies(): string {
    let replies = osc("10;rgb:cccc/cccc/cccc") + osc("11;rgb:1e1e/1e1e/1e1e");
    for (let i = 0; i < 16; i++) {
        const hex = (i * 16).toString(16).padStart(2, "0").repeat(2);
        replies += osc(`4;${String(i)};rgb:${hex}/0000/0000`);
    }
    return replies;
}

function firstResult(onResult: ReturnType<typeof vi.fn>): HostTerminalColors {
    return onResult.mock.calls[0][0] as HostTerminalColors;
}

describe("NodeTerminalBackend.probeHostColors (OSC 4/10/11)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubEnv("TMUX", "");
        vi.stubEnv("STY", "");
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    it("шлёт OSC 10/11 и 16 отдельных OSC 4, затем DA1; ответы разобраны, вводом не становятся", () => {
        const { backend, writes, reply } = createBackend();
        const onResult = vi.fn();
        const onInput = vi.fn();
        backend.onInput(onInput);

        backend.probeHostColors(onResult);
        const sent = writes.join("");
        expect(sent.startsWith("\x1b]10;?\x1b\\\x1b]11;?\x1b\\\x1b]4;0;?\x1b\\\x1b]4;1;?\x1b\\")).toBe(true);
        expect(sent.endsWith("\x1b]4;15;?\x1b\\\x1b[c")).toBe(true);
        expect(sent.match(/\x1b\]4;/g)).toHaveLength(16);

        reply(allHostColorReplies());
        expect(onResult).toHaveBeenCalledOnce();
        const colors = firstResult(onResult);
        expect(colors.foreground).toBe(0xcccccc);
        expect(colors.background).toBe(0x1e1e1e);
        expect(colors.ansi).toHaveLength(16);
        expect(colors.ansi[0]).toBe(0x000000);
        expect(colors.ansi[1]).toBe(0x100000);
        expect(colors.ansi[15]).toBe(0xf00000);
        expect(onInput).not.toHaveBeenCalled();

        reply(DA1_REPLY);
        vi.advanceTimersByTime(1000);
        expect(onResult).toHaveBeenCalledOnce();
        backend.teardown();
    });

    it("частичный ответ (BEL-терминатор, без fg) закрывается по DA1; неотвеченное — undefined", () => {
        const { backend, reply } = createBackend();
        const onResult = vi.fn();
        backend.probeHostColors(onResult);

        reply(osc("11;rgb:ff/ff/ff", "\x07") + osc("4;2;rgb:00/80/00", "\x07"));
        expect(onResult).not.toHaveBeenCalled();
        reply(DA1_REPLY);

        const colors = firstResult(onResult);
        expect(colors.foreground).toBeUndefined();
        expect(colors.background).toBe(0xffffff);
        expect(colors.ansi[2]).toBe(0x008000);
        expect(colors.ansi[1]).toBeUndefined();
        backend.teardown();
    });

    it("чужие и битые OSC-ответы не засчитываются: OSC 52, индекс за 15, неразборчивый цвет", () => {
        const { backend, reply } = createBackend();
        const onResult = vi.fn();
        backend.probeHostColors(onResult);

        reply(
            osc("52;c;aGVsbG8=") +
                osc("4;16;rgb:ff/ff/ff") +
                osc("4;3;cmyk:0/0/0/0") +
                osc("10;bogus") +
                osc("4;x;rgb:ff/ff/ff"),
        );
        reply(DA1_REPLY);

        const colors = firstResult(onResult);
        expect(colors.foreground).toBeUndefined();
        expect(colors.ansi.every((color) => color === undefined)).toBe(true);
        backend.teardown();
    });

    it("нет ответа вовсе → всё undefined по таймауту пробы", () => {
        const { backend } = createBackend();
        const onResult = vi.fn();
        backend.probeHostColors(onResult);
        vi.advanceTimersByTime(199);
        expect(onResult).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(onResult).toHaveBeenCalledExactlyOnceWith(NO_HOST_COLORS);
        backend.teardown();
    });

    it("под tmux DA1 пробу не закрывает — ждём пересланные ответы палитры, пока не придут все", () => {
        vi.stubEnv("TMUX", "/tmp/tmux-1000/default,1,0");
        const { backend, writes, reply } = createBackend();
        const onResult = vi.fn();
        backend.probeHostColors(onResult);
        // Прямо в панель, без passthrough: отвечает сам tmux.
        expect(writes.join("")).not.toContain("\x1bPtmux;");

        reply(osc("10;rgb:cccc/cccc/cccc") + osc("11;rgb:1e1e/1e1e/1e1e") + DA1_REPLY);
        vi.advanceTimersByTime(300);
        expect(onResult).not.toHaveBeenCalled();

        reply(allHostColorReplies());
        expect(onResult).toHaveBeenCalledOnce();
        expect(firstResult(onResult).ansi[15]).toBe(0xf00000);
        backend.teardown();
    });

    it("под tmux без ответов палитры — закрывается по своему таймауту с тем, что пришло", () => {
        vi.stubEnv("TMUX", "/tmp/tmux-1000/default,1,0");
        const { backend, reply } = createBackend();
        const onResult = vi.fn();
        backend.probeHostColors(onResult);
        reply(osc("11;rgb:1e1e/1e1e/1e1e") + DA1_REPLY);

        vi.advanceTimersByTime(599);
        expect(onResult).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        const colors = firstResult(onResult);
        expect(colors.background).toBe(0x1e1e1e);
        expect(colors.ansi[0]).toBeUndefined();
        backend.teardown();
    });

    it("под GNU Screen запросы не шлются, ответ сразу пустой", () => {
        vi.stubEnv("STY", "1234.pts-0.host");
        const { backend, writes } = createBackend();
        const onResult = vi.fn();
        backend.probeHostColors(onResult);
        expect(writes).toEqual([]);
        expect(onResult).toHaveBeenCalledExactlyOnceWith(NO_HOST_COLORS);
        backend.teardown();
    });

    it("проба цветов не сбивает счёт DA1 следующей пробе", () => {
        const { backend, reply } = createBackend();
        const onColors = vi.fn();
        const onVersion = vi.fn();
        backend.probeHostColors(onColors);
        backend.probeTerminalVersion(onVersion);

        reply(osc("10;rgb:cccc/cccc/cccc") + DA1_REPLY);
        expect(onColors).toHaveBeenCalledOnce();
        expect(onVersion).not.toHaveBeenCalled();
        reply("\x1bP>|foot(1.18)\x1b\\" + DA1_REPLY);
        expect(onVersion).toHaveBeenCalledExactlyOnceWith("foot(1.18)");
        backend.teardown();
    });
});
