import { BoxConstraints, Offset, Point, Rect, Size } from "@tuidom/core/common/geometryPromitives";
import { MouseEventDispatcher } from "@tuidom/core/dom/events/mouseEventDispatcher";
import { RenderContext, TUIElement } from "@tuidom/core/dom/tuiElement";
import type { MouseToken } from "@tuidom/core/input/rawTerminalToken";
import { TerminalScreen } from "@tuidom/core/rendering/terminalScreen";
import { MockTerminalBackend } from "@tuidom/testing/mockTerminalBackend";
import { describe, expect, it } from "vitest";

import { SashElement } from "./sashElement.ts";

class ContainerElement extends TUIElement {
    public addChild(child: TUIElement): void {
        this.appendChild(child);
    }
}

function press(x: number): MouseToken {
    return {
        kind: "mouse",
        action: "press",
        button: "left",
        x: x + 1,
        y: 1,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        raw: "",
    };
}

function move(x: number): MouseToken {
    return { ...press(x), action: "move" };
}

/** A two-cell vertical sash over screen columns 29 and 30 — the last column of one frame and the first of the next. */
function buildTwoCellScene(): { root: ContainerElement; sash: SashElement; drags: number[] } {
    const root = new ContainerElement();
    root.setAsRoot();
    root.localPosition = new Offset(0, 0);
    root.layout(BoxConstraints.tight(new Size(80, 24)));

    const sash = new SashElement();
    sash.anchor = 1;
    sash.localPosition = new Offset(29, 0);
    sash.layout(BoxConstraints.tight(new Size(2, 24)));
    root.addChild(sash);

    const drags: number[] = [];
    sash.onDrag = (x) => drags.push(x);
    return { root, sash, drags };
}

function renderCells(sash: SashElement): string {
    const size = new Size(2, 1);
    const backend = new MockTerminalBackend(size);
    const screen = new TerminalScreen(size);
    sash.render(new RenderContext(screen, new Offset(0, 0), new Rect(new Point(0, 0), size)));
    screen.flush(backend);
    return backend.getTextAt(new Point(0, 0), 2);
}

describe("SashElement.anchor", () => {
    it("reports the anchor cell's boundary whichever cell was grabbed", () => {
        const fromLeft = buildTwoCellScene();
        const dispatcher = new MouseEventDispatcher();
        dispatcher.handleMouseToken(press(29), fromLeft.root);
        dispatcher.handleMouseToken(move(35), fromLeft.root);

        const fromRight = buildTwoCellScene();
        dispatcher.handleMouseToken(press(30), fromRight.root);
        dispatcher.handleMouseToken(move(36), fromRight.root);

        // Both drags moved the boundary by six cells: from 30 to 36.
        expect(fromLeft.drags).toEqual([36]);
        expect(fromRight.drags).toEqual([36]);
    });

    it("keeps a one-cell sash reporting the cursor's own coordinate", () => {
        const root = new ContainerElement();
        root.setAsRoot();
        root.layout(BoxConstraints.tight(new Size(80, 24)));
        const sash = new SashElement();
        sash.localPosition = new Offset(30, 0);
        sash.layout(BoxConstraints.tight(new Size(1, 24)));
        root.addChild(sash);
        const drags: number[] = [];
        sash.onDrag = (x) => drags.push(x);

        const dispatcher = new MouseEventDispatcher();
        dispatcher.handleMouseToken(press(30), root);
        dispatcher.handleMouseToken(move(41), root);

        expect(drags).toEqual([41]);
    });
});

describe("SashElement.hoverColorVar", () => {
    it("paints no line during a drag when it is null", () => {
        const { root, sash } = buildTwoCellScene();
        sash.hoverColorVar = null;
        new MouseEventDispatcher().handleMouseToken(press(29), root);

        expect(renderCells(sash)).toBe("  ");
    });

    it("paints the line during a drag by default", () => {
        const { root, sash } = buildTwoCellScene();
        new MouseEventDispatcher().handleMouseToken(press(29), root);

        expect(renderCells(sash)).toBe("│ ");
    });
});
