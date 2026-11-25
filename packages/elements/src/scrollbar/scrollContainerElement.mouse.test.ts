import { BoxConstraints, Offset, Point, Size } from "@tuidom/core/common/geometryPromitives";
import { MouseEventDispatcher } from "@tuidom/core/dom/events/mouseEventDispatcher";
import { ROOT_STYLE_CONTEXT } from "@tuidom/core/dom/styles/tuiStyle";
import { RenderContext, TUIElement } from "@tuidom/core/dom/tuiElement";
import type { MouseToken } from "@tuidom/core/input/rawTerminalToken";
import { TerminalScreen } from "@tuidom/core/rendering/terminalScreen";
import { MockTerminalBackend } from "@tuidom/testing/mockTerminalBackend";
import { describe, expect, it } from "vitest";

import { ScrollableElement } from "./scrollableElement.ts";
import { ScrollBarDecorator } from "./scrollContainerElement.ts";

/** Content of a given size that scrolls itself and records the presses it receives. */
class Content extends ScrollableElement {
    public presses = 0;

    private readonly height: number;
    private readonly width: number;

    public constructor(height: number, width: number) {
        super();
        this.height = height;
        this.width = width;
        this.addEventListener("mousedown", () => this.presses++);
    }

    public get contentHeight(): number {
        return this.height;
    }

    public get contentWidth(): number {
        return this.width;
    }

    protected renderViewport(): void {
        // Nothing to draw: the tests look at the scroll offsets.
    }
}

/** A scrollable without `scrollTo`: the decorator can show its bar but not drive it. */
class ReadOnlyScrollable extends TUIElement {
    public readonly scrollTop = 0;
    public readonly scrollLeft = 0;
    public readonly contentHeight = 100;
    public readonly contentWidth = 5;
}

function token(action: MouseToken["action"], x: number, y: number, button: MouseToken["button"] = "left"): MouseToken {
    // Terminal coordinates are 1-based.
    return {
        kind: "mouse",
        action,
        button,
        x: x + 1,
        y: y + 1,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        raw: "",
    };
}

/**
 * A 10×10 decorator over content 100 rows high (and `width` columns wide): the vertical bar is
 * column 9 with a one-cell thumb travelling rows 0..9 (horizontal bar: row 9, when it shows).
 */
function scene(width = 5): {
    decorator: ScrollBarDecorator;
    content: Content;
    press: (...a: Parameters<typeof token>) => void;
} {
    const content = new Content(100, width);
    const decorator = new ScrollBarDecorator(content);
    decorator.setAsRoot();
    decorator.localPosition = new Offset(0, 0);
    decorator.layout(BoxConstraints.tight(new Size(10, 10)));
    const dispatcher = new MouseEventDispatcher();
    return {
        decorator,
        content,
        press: (...args) => {
            dispatcher.handleMouseToken(token(...args), decorator);
        },
    };
}

describe("ScrollBarDecorator mouse", () => {
    it("jumps the thumb's middle to a press on the vertical track", () => {
        const { content, press } = scene();
        // 100 rows in a 10-row view: a one-cell thumb over 9 cells of travel, 90 rows of scroll.
        press("press", 9, 9);
        expect(content.scrollTop).toBe(90);
        press("release", 9, 9);

        press("press", 9, 3);
        expect(content.scrollTop).toBe(30);
    });

    it("drags the thumb by the cell it was grabbed at, also off the bar", () => {
        const { content, press } = scene();
        press("press", 9, 0); // the thumb at rest
        expect(content.scrollTop).toBe(0);
        press("move", 9, 4);
        expect(content.scrollTop).toBe(40);
        // Captured: the pointer wanders over the content, the drag goes on.
        press("move", 2, 6);
        expect(content.scrollTop).toBe(60);
        press("move", 2, 50);
        expect(content.scrollTop).toBe(90);
        press("release", 2, 50);

        press("move", 9, 1);
        expect(content.scrollTop).toBe(90);
    });

    it("keeps dragging from a track press", () => {
        const { content, press } = scene();
        press("press", 9, 5);
        press("move", 9, 2);
        expect(content.scrollTop).toBe(20);
    });

    it("drags the horizontal thumb", () => {
        // 100 columns in a 9-column view: a one-cell thumb over 8 cells of travel, 91 columns of scroll.
        const { content, press } = scene(100);
        press("press", 8, 9);
        expect(content.scrollLeft).toBe(91);
        expect(content.scrollTop).toBe(0);
        press("move", 4, 9);
        expect(content.scrollLeft).toBe(Math.round((4 * 91) / 8));
    });

    it("keeps content that fits in place under an always-shown bar", () => {
        const { decorator, content, press } = scene();
        decorator.horizontalScrollBar = "always";
        decorator.layout(BoxConstraints.tight(new Size(10, 10)));
        press("press", 4, 9);
        press("move", 8, 9);
        expect(content.scrollLeft).toBe(0);
    });

    it("leaves the corner where the bars meet alone", () => {
        const { content, press } = scene(100);
        press("press", 9, 9);
        press("move", 0, 0);
        expect(content.scrollTop).toBe(0);
        expect(content.scrollLeft).toBe(0);
    });

    it("leaves presses on the content and non-left presses to others", () => {
        const { content, press } = scene();
        press("press", 2, 2);
        press("move", 2, 8);
        expect(content.presses).toBe(1);
        expect(content.scrollTop).toBe(0);
        press("release", 2, 8);

        press("press", 9, 9, "right");
        expect(content.scrollTop).toBe(0);
    });

    it("does nothing for a child that cannot scroll itself", () => {
        const child = new ReadOnlyScrollable();
        const decorator = new ScrollBarDecorator(child);
        decorator.setAsRoot();
        decorator.layout(BoxConstraints.tight(new Size(10, 10)));
        const dispatcher = new MouseEventDispatcher();
        expect(() => {
            dispatcher.handleMouseToken(token("press", 9, 9), decorator);
            dispatcher.handleMouseToken(token("move", 9, 3), decorator);
        }).not.toThrow();
        expect(child.scrollTop).toBe(0);
    });

    it("redraws the thumb where the press put it", () => {
        const { decorator, press } = scene();
        press("press", 9, 6);
        const size = new Size(10, 10);
        const termScreen = new TerminalScreen(size);
        const backend = new MockTerminalBackend(size);
        decorator.performStyleResolution(ROOT_STYLE_CONTEXT);
        decorator.render(new RenderContext(termScreen));
        termScreen.flush(backend);
        const column = Array.from({ length: 10 }, (_, row) => backend.getTextAt(new Point(9, row), 1));
        expect(column.indexOf("█")).toBe(6);
    });
});
