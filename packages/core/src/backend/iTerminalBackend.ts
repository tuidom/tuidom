import type { CursorStyle } from "../common/cursorStyle.ts";
import type { Point, Size } from "../common/geometryPromitives.ts";
import type { KeyPressEvent } from "../input/keyEvent.ts";
import type { MouseToken } from "../input/rawTerminalToken.ts";
import type { Grid } from "../rendering/grid.ts";

/** Colors the host terminal reported ({@link ITerminalBackend.probeHostColors}); packed RGB. */
export interface HostTerminalColors {
    readonly foreground: number | undefined;
    readonly background: number | undefined;
    /** ANSI palette 0..15 (always 16 entries); `undefined` — this entry wasn't reported. */
    readonly ansi: readonly (number | undefined)[];
}

/** The terminal reported none of its colors — the answer of a backend without a terminal. */
export const NO_HOST_COLORS: HostTerminalColors = Object.freeze({
    foreground: undefined,
    background: undefined,
    ansi: Object.freeze(new Array<undefined>(16).fill(undefined)),
});

/** The color scheme the host terminal reported ({@link ITerminalBackend.onColorSchemeChange}). */
export type HostColorScheme = "dark" | "light";

/**
 * Unified abstraction over terminal I/O.
 *
 * Two implementations:
 * - `NodeTerminalBackend` — real process.stdin/stdout
 * - `MockTerminalBackend` — in-memory for tests
 */
export interface ITerminalBackend {
    /** Subscribe to parsed keyboard input */
    onInput(callback: (event: KeyPressEvent) => void): void;

    /** Subscribe to raw mouse events */
    onMouse(callback: (event: MouseToken) => void): void;

    /** Subscribe to bracketed-paste text blocks (whole paste delivered as one string) */
    onPaste(callback: (text: string) => void): void;

    /** Subscribe to terminal resize events */
    onResize(callback: (size: Size) => void): void;

    /** Subscribe to OSC response sequences from the terminal (e.g. OSC 52 clipboard replies) */
    onOscResponse(callback: (code: number, data: string) => void): void;

    /**
     * Asynchronously probe whether the terminal supports the Kitty keyboard protocol.
     * The request/response escape-sequence dance is fully encapsulated by the backend;
     * `onResult` fires exactly once with the answer (or `false` if the terminal doesn't
     * reply within the probe window). Fire-and-forget — callers must not block on it.
     */
    probeKeyboardProtocol(onResult: (supported: boolean) => void): void;

    /**
     * Asynchronously ask the terminal for its name and version (XTVERSION: `CSI > 0 q`
     * → `DCS > | <name(version)> ST`). `onResult` fires exactly once with the reported
     * string as-is (e.g. `"iTerm2 3.5.0"`, `"kitty(0.35.2)"`, `"WezTerm 20240203…"`), or
     * `undefined` if the terminal doesn't answer within the probe window. The reply is
     * consumed by the backend and never reaches `onInput`. Inside tmux the query goes
     * to tmux itself (like the other probes), so the answer is tmux's own (`"tmux 3.4"`).
     * Fire-and-forget — callers must not block on it.
     */
    probeTerminalVersion(onResult: (nameAndVersion: string | undefined) => void): void;

    /**
     * Asynchronously ask the terminal for its own colors: the default foreground and
     * background (OSC 10/11) and the 16 ANSI palette entries (OSC 4, indices 0..15).
     * `onResult` fires exactly once; every color the terminal didn't report (no OSC
     * support, GNU Screen, timeout) is `undefined`, so callers fall back per entry.
     * Replies are consumed by the backend: they still reach `onOscResponse`, never
     * `onInput`. Inside tmux the queries go to tmux itself, which answers from the
     * outer terminal (tmux ≥ 3.4 for fg/bg, ≥ 3.6 for the palette). Fire-and-forget.
     */
    probeHostColors(onResult: (colors: HostTerminalColors) => void): void;

    /**
     * Subscribe to the terminal's color-scheme reports (DEC private mode 2031, the
     * Contour protocol: Ghostty, kitty, Contour, tmux ≥ 3.6). The first subscription
     * turns the mode on and asks for the current scheme (`CSI ? 996 n`); the terminal
     * answers `CSI ? 997 ; 1 n` (dark) or `CSI ? 997 ; 2 n` (light), and repeats the
     * report unasked whenever its scheme flips — e.g. when the OS switches appearance.
     * `callback` fires for every report, the answer to the query included. A terminal
     * without the protocol stays silent, so the callback never fires. Reports are
     * consumed by the backend and never reach `onInput`.
     */
    onColorSchemeChange(callback: (scheme: HostColorScheme) => void): void;

    /**
     * Render a frame: receive the current grid, cursor position and cursor shape
     * (`null` — the terminal's default shape; meaningless while the position is `null`).
     * The backend decides how to output it (ANSI diffing, simple copy, etc.).
     */
    renderFrame(grid: Grid, cursorPosition: Point | null, cursorStyle?: CursorStyle | null): void;

    /**
     * Set the mouse pointer shape — a CSS cursor name (`"default"`, `"ew-resize"`,
     * `"ns-resize"`, …; OSC 22, kitty's pointer-shapes protocol). The application calls it
     * after every mouse event with the shape resolved for the element under the pointer;
     * the backend writes only changes and {@link teardown} brings back `"default"`.
     * Terminals without OSC 22 ignore it. Leaving the window delivers no events, so the
     * last shape stays until the pointer comes back.
     */
    setPointerShape(shape: string): void;

    /** Current terminal dimensions */
    getSize(): Size;

    /** Initialize terminal: alternate screen, raw mode, hide cursor, etc. */
    setup(): void;

    /** Restore terminal state: show cursor, normal screen, etc. */
    teardown(): void;
}
