/**
 * Shape of the hardware text cursor — what DECSCUSR (`CSI n q`) can express: a block,
 * an underline or a vertical bar, blinking or steady. `null` wherever a style is
 * accepted means "the terminal's own default", whatever the user configured there.
 */
export interface CursorStyle {
    readonly shape: "block" | "underline" | "bar";
    readonly blinking: boolean;
}

/** Same shape and blinking; two `null`s (the terminal default) are equal too. */
export function sameCursorStyle(a: CursorStyle | null, b: CursorStyle | null): boolean {
    if (a === null || b === null) return a === b;
    return a.shape === b.shape && a.blinking === b.blinking;
}
