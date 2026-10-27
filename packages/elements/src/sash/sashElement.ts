import type { RenderContext } from "@tuidom/core/dom/tuiElement";
import { TUIElement } from "@tuidom/core/dom/tuiElement";

/**
 * Orientation of a {@link SashElement}: a `"vertical"` sash is a column that
 * resizes horizontally (reports screenX); a `"horizontal"` sash is a row that
 * resizes vertically (reports screenY).
 */
export type SashOrientation = "vertical" | "horizontal";

/**
 * Draggable divider (a "sash") used to resize a neighbouring panel.
 *
 * It opts into pointer capture so that once the user presses the left button on it,
 * every subsequent move/release is delivered here even while the cursor is over the
 * neighbour. While dragging it reports the absolute boundary coordinate to its owner
 * via {@link onDrag} — screenX for a vertical sash, screenY for a horizontal one; the
 * owner clamps and applies the new size.
 *
 * It is invisible at rest unless {@link restColorVar} names a color: then the line is always
 * drawn in that color (a visible separator, like vscode's `separatorBorder`). On hover — after {@link hoverDelay} so a passing cursor does
 * not flash it — it paints a thin line along the boundary so the user can tell it is
 * draggable. The line also stays lit for the duration of a drag. The mouse pointer turns
 * into a resize arrow ({@link pointerShape}) over it and for the whole drag.
 */
export class SashElement extends TUIElement {
    public onDrag?: (boundaryScreen: number) => void;
    /**
     * How long (ms) the cursor must linger on the sash before the hover line lights up;
     * `0` lights it in the same frame as the `mouseenter`. A change applies from the next
     * `mouseenter` — a show already pending keeps its delay, like vscode's sash.
     */
    public hoverDelay = 300;

    private readonly orientation: SashOrientation;
    private dragging = false;
    private restColorVarValue: string | null = null;
    private hoverTimer: ReturnType<typeof setTimeout> | null = null;

    public constructor(orientation: SashOrientation = "vertical") {
        super();
        this.orientation = orientation;
        this.capturesPointer = true;
        // vscode's sash.css: ew-resize/ns-resize (col-/row-resize only on macOS — not in kitty's
        // list of names). A hidden sash takes no hits, so it gives no shape either.
        this.pointerShape = orientation === "vertical" ? "ew-resize" : "ns-resize";
        // Keep focusable = false so mousedown does not steal focus from the file tree.

        this.addEventListener("mousedown", (event) => {
            if (event.button !== "left") return;
            // Dragging lights the line immediately; no point waiting on the hover delay.
            this.clearHoverTimer();
            this.dragging = true;
        });
        this.addEventListener("mousemove", (event) => {
            if (!this.dragging) return;
            this.onDrag?.(this.orientation === "vertical" ? event.screenX : event.screenY);
        });
        this.addEventListener("mouseup", () => {
            this.dragging = false;
        });
        // Ядерное hover-состояние мгновенно, а сашу нужна задержка (мелькание
        // при пролёте курсора) — таймер остаётся, но результат выражается
        // кастомным состоянием "lit".
        this.addEventListener("mouseenter", () => {
            this.clearHoverTimer();
            if (this.hoverDelay <= 0) {
                this.setStyleState("lit", true);
                return;
            }
            this.hoverTimer = setTimeout(() => {
                this.hoverTimer = null;
                this.setStyleState("lit", true);
            }, this.hoverDelay);
        });
        this.addEventListener("mouseleave", () => {
            this.clearHoverTimer();
            this.setStyleState("lit", false);
        });
    }

    /**
     * Style variable of the line drawn at rest, or `null` (the default) for an invisible sash.
     * Hover and drag still paint `sash.hoverBorder` over it, with the same glyph.
     */
    public get restColorVar(): string | null {
        return this.restColorVarValue;
    }

    public set restColorVar(value: string | null) {
        if (this.restColorVarValue === value) return;
        this.restColorVarValue = value;
        this.markDirty();
    }

    private clearHoverTimer(): void {
        if (this.hoverTimer !== null) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }
    }

    public override render(context: RenderContext): void {
        const lit = this.hasStyleState("lit") || this.dragging;
        const colorVar = lit ? "sash.hoverBorder" : this.restColorVarValue;
        if (colorVar === null) return;
        const color = this.styleVar(colorVar);
        if (this.orientation === "vertical") {
            for (let y = 0; y < this.layoutSize.height; y++) {
                context.setCell(0, y, { char: "│", fg: color });
            }
        } else {
            for (let x = 0; x < this.layoutSize.width; x++) {
                context.setCell(x, 0, { char: "─", fg: color });
            }
        }
    }
}
