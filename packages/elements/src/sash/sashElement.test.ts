import { packRgb } from "@tuidom/core/common/colorUtils";
import { BoxConstraints, Offset, Point, Rect, Size } from "@tuidom/core/common/geometryPromitives";
import { MouseEventDispatcher } from "@tuidom/core/dom/events/mouseEventDispatcher";
import { STYLE_TOKEN_DEFAULTS } from "@tuidom/core/dom/styles/styleTokens";
import { ROOT_STYLE_CONTEXT } from "@tuidom/core/dom/styles/tuiStyle";
import { RenderContext, TUIElement } from "@tuidom/core/dom/tuiElement";
import type { MouseToken } from "@tuidom/core/input/rawTerminalToken";
import { TerminalScreen } from "@tuidom/core/rendering/terminalScreen";
import { MockTerminalBackend } from "@tuidom/testing/mockTerminalBackend";
import { renderElement } from "@tuidom/testing/renderElement";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SashElement } from "./sashElement.ts";

class ContainerElement extends TUIElement {
    public addChild(child: TUIElement): void {
        this.appendChild(child);
    }
}

function makeToken(overrides: Partial<MouseToken> & { action: MouseToken["action"] }): MouseToken {
    return {
        kind: "mouse",
        button: "left",
        x: 1,
        y: 1,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        raw: "",
        ...overrides,
    };
}

/** A sash at screenX=30 inside an 80-wide root, with a captured onDrag log. */
function buildScene(): { root: ContainerElement; sash: SashElement; drags: number[] } {
    const root = new ContainerElement();
    root.setAsRoot();
    root.localPosition = new Offset(0, 0);
    root.layout(BoxConstraints.tight(new Size(80, 24)));

    const sash = new SashElement();
    sash.localPosition = new Offset(30, 0);
    sash.layout(BoxConstraints.tight(new Size(1, 24)));
    root.addChild(sash);

    const drags: number[] = [];
    sash.onDrag = (x) => drags.push(x);

    return { root, sash, drags };
}

/** Render the sash standalone and return the character drawn in its top cell. */
function renderTopChar(sash: SashElement): string {
    const size = new Size(2, 3);
    const backend = new MockTerminalBackend(size);
    const termScreen = new TerminalScreen(size);
    sash.render(new RenderContext(termScreen, new Offset(0, 0), new Rect(new Point(0, 0), size)));
    termScreen.flush(backend);
    return backend.getTextAt(new Point(0, 0), 1);
}

/** Render the sash standalone and return the glyph and foreground of its top cell. */
function renderTopCell(sash: SashElement): { char: string; fg: number } {
    const size = new Size(2, 3);
    const backend = new MockTerminalBackend(size);
    const termScreen = new TerminalScreen(size);
    sash.render(new RenderContext(termScreen, new Offset(0, 0), new Rect(new Point(0, 0), size)));
    termScreen.flush(backend);
    return { char: backend.getTextAt(new Point(0, 0), 1), fg: backend.getFgAt(new Point(0, 0)) };
}

const REST_COLOR = packRgb(68, 68, 68);

/** {@link buildScene} with a rest color token resolved into the sash's var scope. */
function buildRestScene(): { root: ContainerElement; sash: SashElement } {
    const scene = buildScene();
    scene.root.setStyleVars({ "test.separator": REST_COLOR });
    scene.root.performStyleResolution(ROOT_STYLE_CONTEXT);
    scene.sash.restColorVar = "test.separator";
    return scene;
}

describe("SashElement", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("opts into pointer capture and stays unfocusable", () => {
        const sash = new SashElement();
        expect(sash.capturesPointer).toBe(true);
        expect(sash.focusable).toBe(false);
    });

    it("renders nothing (invisible hit target)", () => {
        const sash = new SashElement();
        const backend = renderElement(sash, 10, 3, { constraints: BoxConstraints.tight(new Size(1, 3)) });

        // Nothing drawn — the boundary stays owned by the surrounding panels.
        expect(backend.getTextAt(new Point(0, 0), 1)).toBe(" ");
    });

    it("reports the absolute boundary column while dragging", () => {
        const { root, drags } = buildScene();
        const dispatcher = new MouseEventDispatcher();

        dispatcher.handleMouseToken(makeToken({ action: "press", x: 31, y: 1 }), root); // screenX 30
        dispatcher.handleMouseToken(makeToken({ action: "move", x: 41, y: 1 }), root); // screenX 40
        dispatcher.handleMouseToken(makeToken({ action: "move", x: 26, y: 1 }), root); // screenX 25
        dispatcher.handleMouseToken(makeToken({ action: "release", x: 26, y: 1 }), root);

        expect(drags).toEqual([40, 25]);
    });

    it("ignores moves that are not part of a left-button drag", () => {
        const { root, drags } = buildScene();
        const dispatcher = new MouseEventDispatcher();

        // A move with no prior mousedown must not trigger onDrag.
        dispatcher.handleMouseToken(makeToken({ action: "move", x: 41, y: 1 }), root);
        // A right-button press does not start a drag.
        dispatcher.handleMouseToken(makeToken({ action: "press", button: "right", x: 31, y: 1 }), root);
        dispatcher.handleMouseToken(makeToken({ action: "move", button: "right", x: 41, y: 1 }), root);

        expect(drags).toEqual([]);
    });

    it("stops reporting after the button is released", () => {
        const { root, sash, drags } = buildScene();
        const dispatcher = new MouseEventDispatcher();

        dispatcher.handleMouseToken(makeToken({ action: "press", x: 31, y: 1 }), root);
        dispatcher.handleMouseToken(makeToken({ action: "release", x: 31, y: 1 }), root);
        // Re-layout the sash to its (unchanged) spot, then move with no button held.
        sash.layout(BoxConstraints.tight(new Size(1, 24)));
        dispatcher.handleMouseToken(makeToken({ action: "move", x: 41, y: 1 }), root);

        expect(drags).toEqual([]);
    });

    it("paints the hover line only after the cursor lingers", () => {
        vi.useFakeTimers();
        const { root, sash } = buildScene();
        const dispatcher = new MouseEventDispatcher();

        // Cursor enters the sash (screenX 30) — line must not appear immediately.
        dispatcher.handleMouseToken(makeToken({ action: "move", x: 31, y: 1 }), root);
        expect(renderTopChar(sash)).toBe(" ");

        // After the hover delay elapses, the thin vertical line lights up.
        vi.advanceTimersByTime(300);
        expect(renderTopChar(sash)).toBe("│");
    });

    it("hides the line when the cursor leaves", () => {
        vi.useFakeTimers();
        const { root, sash } = buildScene();
        const dispatcher = new MouseEventDispatcher();

        dispatcher.handleMouseToken(makeToken({ action: "move", x: 31, y: 1 }), root);
        vi.advanceTimersByTime(300);
        expect(renderTopChar(sash)).toBe("│");

        // Move off the sash — the line goes out.
        dispatcher.handleMouseToken(makeToken({ action: "move", x: 50, y: 1 }), root);
        expect(renderTopChar(sash)).toBe(" ");
    });

    it("paints during a drag without waiting for the hover delay", () => {
        vi.useFakeTimers();
        const { root, sash } = buildScene();
        const dispatcher = new MouseEventDispatcher();

        dispatcher.handleMouseToken(makeToken({ action: "press", x: 31, y: 1 }), root);
        // No timer advance — the line shows immediately while dragging.
        expect(renderTopChar(sash)).toBe("│");

        dispatcher.handleMouseToken(makeToken({ action: "release", x: 31, y: 1 }), root);
        expect(renderTopChar(sash)).toBe(" ");
    });

    it("cancels the pending hover timer when the cursor leaves before the delay", () => {
        vi.useFakeTimers();
        const { root, sash } = buildScene();
        const dispatcher = new MouseEventDispatcher();

        // Enter the sash, then leave again before the hover delay elapses.
        dispatcher.handleMouseToken(makeToken({ action: "move", x: 31, y: 1 }), root);
        dispatcher.handleMouseToken(makeToken({ action: "move", x: 50, y: 1 }), root);

        // The pending timer was cancelled, so the line never lights even after the delay.
        vi.advanceTimersByTime(300);
        expect(renderTopChar(sash)).toBe(" ");
    });

    it("waits 300 ms by default", () => {
        expect(new SashElement().hoverDelay).toBe(300);
    });

    it("lights the line in the same frame as the mouseenter when hoverDelay is 0", () => {
        vi.useFakeTimers();
        const { root, sash } = buildScene();
        sash.hoverDelay = 0;
        const dispatcher = new MouseEventDispatcher();

        dispatcher.handleMouseToken(makeToken({ action: "move", x: 31, y: 1 }), root);
        // No timer advance — the line is up right after the event.
        expect(renderTopChar(sash)).toBe("│");

        dispatcher.handleMouseToken(makeToken({ action: "move", x: 50, y: 1 }), root);
        expect(renderTopChar(sash)).toBe(" ");
    });

    it("waits exactly the configured hoverDelay", () => {
        vi.useFakeTimers();
        const { root, sash } = buildScene();
        sash.hoverDelay = 1000;
        const dispatcher = new MouseEventDispatcher();

        dispatcher.handleMouseToken(makeToken({ action: "move", x: 31, y: 1 }), root);
        vi.advanceTimersByTime(999);
        expect(renderTopChar(sash)).toBe(" ");
        vi.advanceTimersByTime(1);
        expect(renderTopChar(sash)).toBe("│");
    });

    it("applies a changed hoverDelay from the next mouseenter, not to the pending show", () => {
        vi.useFakeTimers();
        const { root, sash } = buildScene();
        const dispatcher = new MouseEventDispatcher();

        dispatcher.handleMouseToken(makeToken({ action: "move", x: 31, y: 1 }), root);
        sash.hoverDelay = 0;
        // The pending show keeps its 300 ms.
        expect(renderTopChar(sash)).toBe(" ");
        vi.advanceTimersByTime(300);
        expect(renderTopChar(sash)).toBe("│");

        // Leave and come back — now the new delay (0) applies.
        dispatcher.handleMouseToken(makeToken({ action: "move", x: 50, y: 1 }), root);
        dispatcher.handleMouseToken(makeToken({ action: "move", x: 31, y: 1 }), root);
        expect(renderTopChar(sash)).toBe("│");
    });

    describe("rest color", () => {
        it("is off by default", () => {
            expect(new SashElement().restColorVar).toBeNull();
        });

        it("draws the line at rest in the rest color", () => {
            const { sash } = buildRestScene();
            expect(renderTopCell(sash)).toEqual({ char: "│", fg: REST_COLOR });
        });

        it("hover repaints the line in sash.hoverBorder and leaving restores the rest color", () => {
            vi.useFakeTimers();
            const { root, sash } = buildRestScene();
            const dispatcher = new MouseEventDispatcher();

            dispatcher.handleMouseToken(makeToken({ action: "move", x: 31, y: 1 }), root);
            expect(renderTopCell(sash).fg).toBe(REST_COLOR);
            vi.advanceTimersByTime(300);
            expect(renderTopCell(sash)).toEqual({ char: "│", fg: STYLE_TOKEN_DEFAULTS["sash.hoverBorder"] });

            dispatcher.handleMouseToken(makeToken({ action: "move", x: 50, y: 1 }), root);
            expect(renderTopCell(sash)).toEqual({ char: "│", fg: REST_COLOR });
        });

        it("drag repaints the line in sash.hoverBorder until release", () => {
            const { root, sash } = buildRestScene();
            const dispatcher = new MouseEventDispatcher();

            dispatcher.handleMouseToken(makeToken({ action: "press", x: 31, y: 1 }), root);
            expect(renderTopCell(sash).fg).toBe(STYLE_TOKEN_DEFAULTS["sash.hoverBorder"]);
            dispatcher.handleMouseToken(makeToken({ action: "release", x: 31, y: 1 }), root);
            expect(renderTopCell(sash).fg).toBe(REST_COLOR);
        });

        it("asks for a repaint on change and ignores a repeated value", () => {
            const { sash } = buildRestScene();
            const repaints = vi.spyOn(sash, "markDirty");
            sash.restColorVar = "test.separator";
            expect(repaints).not.toHaveBeenCalled();
            sash.restColorVar = null;
            expect(repaints).toHaveBeenCalledTimes(1);
            expect(renderTopCell(sash).char).toBe(" ");
        });
    });

    describe("horizontal orientation", () => {
        /** A horizontal sash at screenY=10 spanning an 80-wide root, with a drag log. */
        function buildHScene(): { root: ContainerElement; sash: SashElement; drags: number[] } {
            const root = new ContainerElement();
            root.setAsRoot();
            root.localPosition = new Offset(0, 0);
            root.layout(BoxConstraints.tight(new Size(80, 24)));

            const sash = new SashElement("horizontal");
            sash.localPosition = new Offset(0, 10);
            sash.layout(BoxConstraints.tight(new Size(80, 1)));
            root.addChild(sash);

            const drags: number[] = [];
            sash.onDrag = (y) => drags.push(y);
            return { root, sash, drags };
        }

        it("reports the absolute boundary row while dragging", () => {
            const { root, drags } = buildHScene();
            const dispatcher = new MouseEventDispatcher();

            dispatcher.handleMouseToken(makeToken({ action: "press", x: 5, y: 11 }), root); // screenY 10
            dispatcher.handleMouseToken(makeToken({ action: "move", x: 5, y: 16 }), root); // screenY 15
            dispatcher.handleMouseToken(makeToken({ action: "release", x: 5, y: 16 }), root);

            expect(drags).toEqual([15]);
        });

        it("paints a horizontal hover line", () => {
            vi.useFakeTimers();
            const { root, sash } = buildHScene();
            const dispatcher = new MouseEventDispatcher();

            dispatcher.handleMouseToken(makeToken({ action: "move", x: 5, y: 11 }), root);
            vi.advanceTimersByTime(300);
            expect(renderTopChar(sash)).toBe("─");
        });

        it("draws a horizontal line at rest in the rest color", () => {
            const { root, sash } = buildHScene();
            root.setStyleVars({ "test.separator": REST_COLOR });
            root.performStyleResolution(ROOT_STYLE_CONTEXT);
            sash.restColorVar = "test.separator";
            expect(renderTopCell(sash)).toEqual({ char: "─", fg: REST_COLOR });
        });
    });
});
