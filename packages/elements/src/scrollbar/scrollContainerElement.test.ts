import { compositeOver, packRgb, packRgba } from "@tuidom/core/common/colorUtils";
import { BoxConstraints, Offset, Point, Size } from "@tuidom/core/common/geometryPromitives";
import { STYLE_TOKEN_DEFAULTS } from "@tuidom/core/dom/styles/styleTokens";
import { ROOT_STYLE_CONTEXT } from "@tuidom/core/dom/styles/tuiStyle";
import { RenderContext } from "@tuidom/core/dom/tuiElement";
import { TerminalScreen } from "@tuidom/core/rendering/terminalScreen";
import { expectScreen, screen } from "@tuidom/testing/expectScreen";
import { MockTerminalBackend } from "@tuidom/testing/mockTerminalBackend";
import { describe, expect, it } from "vitest";

import { TextBlockElement } from "../text/textBlockElement.ts";

import type { IScrollBarMarker } from "./iScrollable.ts";
import { ScrollableElement, type ScrollViewportInfo } from "./scrollableElement.ts";
import { getFlatTrackColor } from "./scrollBarRenderer.ts";
import { ScrollBarDecorator } from "./scrollContainerElement.ts";
import { ScrollViewport } from "./scrollViewport.ts";

function createScrollContainer(
    screenWidth: number,
    screenHeight: number,
    contentLineCount: number,
): {
    container: ScrollBarDecorator;
    viewport: ScrollViewport;
    child: TextBlockElement;
    backend: MockTerminalBackend;
    termScreen: TerminalScreen;
} {
    const size = new Size(screenWidth, screenHeight);
    const backend = new MockTerminalBackend(size);
    const termScreen = new TerminalScreen(size);
    const child = new TextBlockElement(contentLineCount);
    const viewport = new ScrollViewport(child);
    const container = new ScrollBarDecorator(viewport);
    return { container, viewport, child, backend, termScreen };
}

function renderContainer(
    container: ScrollBarDecorator,
    termScreen: TerminalScreen,
    backend: MockTerminalBackend,
): MockTerminalBackend {
    container.layout(BoxConstraints.tight(termScreen.size));
    container.performStyleResolution(ROOT_STYLE_CONTEXT);
    container.render(new RenderContext(termScreen));
    termScreen.flush(backend);
    return backend;
}

describe("ScrollBarDecorator", () => {
    it("allocates child width as container width minus 1 when content overflows", () => {
        const { container, child } = createScrollContainer(12, 5, 20);
        container.layout(BoxConstraints.tight(new Size(12, 5)));
        expect(child.layoutSize.width).toBe(11);
        expect(child.layoutSize.height).toBe(5);
    });

    it("allocates full width when content fits viewport", () => {
        const { container, child } = createScrollContainer(12, 5, 3);
        container.layout(BoxConstraints.tight(new Size(12, 5)));
        expect(child.layoutSize.width).toBe(12);
        expect(child.layoutSize.height).toBe(5);
    });

    it("renders content with scrollbar in last column at top", () => {
        const { container, backend, termScreen } = createScrollContainer(12, 5, 50);
        renderContainer(container, termScreen, backend);

        expectScreen(
            backend,
            screen`
                Line 001   █
                Line 002   ░
                Line 003   ░
                Line 004   ░
                Line 005   ░
            `,
        );
    });

    it("renders scrollbar at bottom when fully scrolled", () => {
        const { container, viewport, backend, termScreen } = createScrollContainer(12, 5, 50);
        viewport.scrollTop = 45; // scroll to bottom (50 - 5 = 45)
        renderContainer(container, termScreen, backend);

        expectScreen(
            backend,
            screen`
                Line 046   ░
                Line 047   ░
                Line 048   ░
                Line 049   ░
                Line 050   █
            `,
        );
    });

    it("hides scrollbar when content fits viewport (auto)", () => {
        const { container, backend, termScreen } = createScrollContainer(12, 5, 5);
        renderContainer(container, termScreen, backend);

        expectScreen(
            backend,
            screen`
                Line 001
                Line 002
                Line 003
                Line 004
                Line 005
            `,
        );
    });

    it("hides scrollbar when content smaller than viewport (auto)", () => {
        const { container, backend, termScreen } = createScrollContainer(12, 5, 3);
        renderContainer(container, termScreen, backend);

        expectScreen(
            backend,
            screen`
                Line 001
                Line 002
                Line 003
            `,
        );
    });

    it("shows thumb in middle when scrolled halfway", () => {
        const { container, viewport, backend, termScreen } = createScrollContainer(12, 10, 100);
        viewport.scrollTop = 45; // scroll to ~50%
        renderContainer(container, termScreen, backend);

        // With halves: 10 track height = 20 halves
        // thumbSize = max(2, round(10/100 * 20)) = 2 halves = 1 cell
        // maxScroll = 90, scrollFraction = 45/90 = 0.5
        // thumbStart = round(0.5 * (20 - 2)) = 9 halves
        // thumb at halves 9-10, i.e. bottom of cell 4 + top of cell 5
        const lines = backend.screenToString().split("\n");
        const lastCol = lines.map((l) => l[11]);
        // Track cells before and after thumb
        expect(lastCol[0]).toBe("░");
        expect(lastCol[9]).toBe("░");
        // Thumb should be around row 4-5
        expect(lastCol[4]).toBe("▄"); // bottom half
        expect(lastCol[5]).toBe("▀"); // top half
    });

    it("renders half-block characters for non-aligned thumb positions", () => {
        // 5 track height, 50 content, viewport 5 → 10 halves
        // thumbSize = max(2, round(5/50 * 10)) = 2 halves
        // scrollTop = 5: scrollFraction = 5/45 ≈ 0.111
        // thumbStart = round(0.111 * (10 - 2)) = round(0.888) = 1 half
        // → row 0: top half out, bottom half in → ▄
        // → row 1: top half in (half 2), bottom half out (half 3 >= 3) → ▀
        const { container, viewport, backend, termScreen } = createScrollContainer(12, 5, 50);
        viewport.scrollTop = 5;
        renderContainer(container, termScreen, backend);

        const lines = backend.screenToString().split("\n");
        const lastCol = lines.map((l) => l[11]);
        // Should contain half-block elements
        expect(lastCol.some((c) => "▀▄".includes(c))).toBe(true);
    });

    it("sets child localPosition to (0, 0)", () => {
        const { container, child } = createScrollContainer(12, 5, 50);

        container.layout(BoxConstraints.tight(new Size(12, 5)));

        expect(child.localPosition).toEqual(new Offset(0, 0));
    });

    it("sets child globalPosition based on container globalPosition", () => {
        const { container, child } = createScrollContainer(12, 5, 50);

        // Set container global position to (10, 20)
        container.localPosition = new Offset(10, 20);
        container.layout(BoxConstraints.tight(new Size(12, 5)));

        // Child should be at (10, 20)
        expect(child.globalPosition).toEqual(new Point(10, 20));
    });

    it("child markDirty propagates to container", () => {
        const { container, child } = createScrollContainer(12, 5, 50);

        container.layout(BoxConstraints.tight(new Size(12, 5)));
        expect(container.isLayoutDirty).toBe(false);

        child.markDirty();

        expect(container.isLayoutDirty).toBe(true);
    });

    it("child inherits container as parent after construction", () => {
        const { container, child } = createScrollContainer(12, 5, 50);

        // Verify by checking that child's markDirty affects container
        container.layout(BoxConstraints.tight(new Size(12, 5)));
        child.markDirty();

        expect(container.isLayoutDirty).toBe(true);
    });

    it("allocates child width as container width minus 1 while updating coordinates", () => {
        const { container, child } = createScrollContainer(12, 5, 50);
        container.layout(BoxConstraints.tight(new Size(12, 5)));

        // Child should have width=11 (12-1 for scrollbar) and height=5
        expect(child.layoutSize.width).toBe(11);
        expect(child.layoutSize.height).toBe(5);
        // And should have proper coordinates
        expect(child.localPosition).toEqual(new Offset(0, 0));
    });
});

class WideContentWidget extends ScrollableElement {
    private gridWidth: number;
    private gridHeight: number;

    public constructor(gridWidth: number, gridHeight: number) {
        super();
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;
    }

    public get contentHeight(): number {
        return this.gridHeight;
    }

    public get contentWidth(): number {
        return this.gridWidth;
    }

    protected renderViewport(context: RenderContext, viewport: ScrollViewportInfo): void {
        for (let screenY = 0; screenY < viewport.viewportHeight; screenY++) {
            const contentY = viewport.scrollTop + screenY;
            if (contentY >= this.gridHeight) break;

            for (let screenX = 0; screenX < viewport.viewportWidth; screenX++) {
                const contentX = viewport.scrollLeft + screenX;
                if (contentX >= this.gridWidth) break;

                context.setCell(screenX, screenY, { char: String((contentX + contentY) % 10) });
            }
        }
    }
}

describe("ScrollBarDecorator vertical policy", () => {
    it("always: shows scrollbar even when content fits", () => {
        const size = new Size(12, 5);
        const backend = new MockTerminalBackend(size);
        const termScreen = new TerminalScreen(size);
        const child = new TextBlockElement(3);
        const viewport = new ScrollViewport(child);
        const container = new ScrollBarDecorator(viewport);
        container.verticalScrollBar = "always";

        container.layout(BoxConstraints.tight(size));
        container.render(new RenderContext(termScreen));
        termScreen.flush(backend);

        expectScreen(
            backend,
            screen`
                Line 001   █
                Line 002   █
                Line 003   █
                           █
                           █
            `,
        );
    });

    it("never: hides scrollbar even when content overflows", () => {
        const size = new Size(12, 5);
        const backend = new MockTerminalBackend(size);
        const termScreen = new TerminalScreen(size);
        const child = new TextBlockElement(50);
        const viewport = new ScrollViewport(child);
        const container = new ScrollBarDecorator(viewport);
        container.verticalScrollBar = "never";

        container.layout(BoxConstraints.tight(size));
        container.render(new RenderContext(termScreen));
        termScreen.flush(backend);

        // Child gets full width (12), no scrollbar column
        expectScreen(
            backend,
            screen`
                Line 001
                Line 002
                Line 003
                Line 004
                Line 005
            `,
        );
    });

    it("never: child gets full container width", () => {
        const size = new Size(12, 5);
        const child = new TextBlockElement(50);
        const viewport = new ScrollViewport(child);
        const container = new ScrollBarDecorator(viewport);
        container.verticalScrollBar = "never";

        container.layout(BoxConstraints.tight(size));

        expect(child.layoutSize.width).toBe(12);
    });
});

describe("ScrollBarDecorator horizontal scrollbar", () => {
    it("shows horizontal scrollbar when content is wider than viewport", () => {
        const size = new Size(10, 5);
        const backend = new MockTerminalBackend(size);
        const termScreen = new TerminalScreen(size);
        const widget = new WideContentWidget(30, 3);
        const container = new ScrollBarDecorator(widget);
        container.verticalScrollBar = "never";

        container.layout(BoxConstraints.tight(size));
        container.render(new RenderContext(termScreen));
        termScreen.flush(backend);

        // Last row should be horizontal scrollbar
        const lines = backend.screenToString().split("\n");
        expect(lines.length).toBe(5);
        // Content takes 4 rows (height - 1 for h-scrollbar), scrollbar on row 4.
        // "▄" (lower half block) keeps the bar on the widget's bottom edge.
        expect(lines[4]).toContain("▄");
    });

    it("hides horizontal scrollbar when content fits", () => {
        const size = new Size(10, 5);
        const backend = new MockTerminalBackend(size);
        const termScreen = new TerminalScreen(size);
        const widget = new WideContentWidget(5, 3);
        const container = new ScrollBarDecorator(widget);
        container.verticalScrollBar = "never";

        container.layout(BoxConstraints.tight(size));
        container.render(new RenderContext(termScreen));
        termScreen.flush(backend);

        // Child gets full height (5), no scrollbar row
        expect(widget.layoutSize.height).toBe(5);
    });

    it("horizontal never: child gets full height", () => {
        const size = new Size(10, 5);
        const widget = new WideContentWidget(30, 3);
        const container = new ScrollBarDecorator(widget);
        container.verticalScrollBar = "never";
        container.horizontalScrollBar = "never";

        container.layout(BoxConstraints.tight(size));

        expect(widget.layoutSize.height).toBe(5);
        expect(widget.layoutSize.width).toBe(10);
    });

    it("horizontal always: shows scrollbar even when content fits", () => {
        const size = new Size(10, 5);
        const widget = new WideContentWidget(5, 3);
        const container = new ScrollBarDecorator(widget);
        container.verticalScrollBar = "never";
        container.horizontalScrollBar = "always";

        container.layout(BoxConstraints.tight(size));

        expect(widget.layoutSize.height).toBe(4);
    });

    it("both scrollbars: child gets reduced size in both dimensions", () => {
        const size = new Size(10, 5);
        const widget = new WideContentWidget(30, 20);
        const container = new ScrollBarDecorator(widget);

        container.layout(BoxConstraints.tight(size));

        // auto: both overflows → both scrollbars visible
        // width - 1 for vertical scrollbar, height - 1 for horizontal scrollbar
        expect(widget.layoutSize.width).toBe(9);
        expect(widget.layoutSize.height).toBe(4);
    });
});

describe("ScrollBarDecorator — цвета из токенов и каскада", () => {
    it("токены темы + фон колонки от собственного каскада", () => {
        const { container, termScreen, backend } = createScrollContainer(12, 5, 20);
        container.setStyleVars({
            "scrollbarSlider.background": packRgb(1, 2, 3),
            "scrollbar.background": packRgb(4, 5, 6),
        });
        container.style = { bg: packRgb(7, 8, 9) };

        renderContainer(container, termScreen, backend);

        // scrollTop = 0: thumb hugs the top of the track, the bottom row is track.
        expect(backend.getFgAt(new Point(11, 0))).toBe(packRgb(1, 2, 3));
        expect(backend.getFgAt(new Point(11, 4))).toBe(packRgb(4, 5, 6));
        expect(backend.getBgAt(new Point(11, 4))).toBe(packRgb(7, 8, 9));
    });

    it("без хостовой таблицы — дефолты токенов tuidom", () => {
        const { container, termScreen, backend } = createScrollContainer(12, 5, 20);

        renderContainer(container, termScreen, backend);

        expect(backend.getFgAt(new Point(11, 0))).toBe(STYLE_TOKEN_DEFAULTS["scrollbarSlider.background"]);
        expect(backend.getFgAt(new Point(11, 4))).toBe(STYLE_TOKEN_DEFAULTS["scrollbar.background"]);
    });
});

class MarkedViewport extends ScrollViewport {
    public markers: IScrollBarMarker[] = [];

    public getScrollBarMarkers(): readonly IScrollBarMarker[] {
        return this.markers;
    }
}

describe("ScrollBarDecorator — markers", () => {
    const thumb = packRgb(10, 10, 10);
    const track = packRgb(20, 20, 20);
    const background = packRgb(30, 30, 30);
    const red = packRgb(200, 0, 0);
    const blue = packRgb(0, 0, 200);

    function renderMarked(markers: IScrollBarMarker[]): MockTerminalBackend {
        const size = new Size(12, 5);
        const backend = new MockTerminalBackend(size);
        const termScreen = new TerminalScreen(size);
        const viewport = new MarkedViewport(new TextBlockElement(50));
        viewport.markers = markers;
        const container = new ScrollBarDecorator(viewport);
        container.setStyleVars({ "scrollbarSlider.background": thumb, "scrollbar.background": track });
        container.style = { bg: background };
        return renderContainer(container, termScreen, backend);
    }

    it("draws density glyphs over the track and the thumb", () => {
        // 50 rows over 5 cells → 10 rows per cell; the thumb is the top cell.
        const backend = renderMarked([
            { start: 0, end: 1, color: red, priority: 1 },
            { start: 20, end: 21, color: blue, priority: 1 },
            { start: 22, end: 23, color: blue, priority: 1 },
            { start: 40, end: 41, color: red, priority: 1 },
            { start: 42, end: 43, color: red, priority: 1 },
            { start: 44, end: 45, color: red, priority: 1 },
        ]);

        expectScreen(
            backend,
            screen`
                Line 001   ─
                Line 002
                Line 003   ═
                Line 004
                Line 005   ≡
            `,
        );
        // Over the thumb the marker keeps its colour and the thumb becomes the cell background.
        expect(backend.getFgAt(new Point(11, 0))).toBe(red);
        expect(backend.getBgAt(new Point(11, 0))).toBe(thumb);
        // The track is flat with markers: no ░ shade, the same colour under a mark and without one.
        const flatTrack = getFlatTrackColor(track, background);
        expect(backend.getFgAt(new Point(11, 2))).toBe(blue);
        expect(backend.getBgAt(new Point(11, 2))).toBe(flatTrack);
        expect(backend.getBgAt(new Point(11, 1))).toBe(flatTrack);
    });

    it("fills a block of marked rows solid, the thumb tinting it", () => {
        // Rows 0..29 marked: cells 0..2 solid, cell 0 under the thumb.
        const translucentThumb = packRgba(255, 255, 255, 128);
        const size = new Size(12, 5);
        const backend = new MockTerminalBackend(size);
        const termScreen = new TerminalScreen(size);
        const viewport = new MarkedViewport(new TextBlockElement(50));
        viewport.markers = [{ start: 0, end: 30, color: red, priority: 1 }];
        const container = new ScrollBarDecorator(viewport);
        container.setStyleVars({ "scrollbarSlider.background": translucentThumb, "scrollbar.background": track });
        container.style = { bg: background };
        renderContainer(container, termScreen, backend);

        expect(backend.getTextAt(new Point(11, 1), 1)).toBe(" ");
        expect(backend.getBgAt(new Point(11, 1))).toBe(red);
        expect(backend.getBgAt(new Point(11, 2))).toBe(red);
        expect(backend.getBgAt(new Point(11, 0))).toBe(compositeOver(translucentThumb, red));
        expect(backend.getBgAt(new Point(11, 3))).toBe(getFlatTrackColor(track, background));
    });

    it("draws the ends of a run as half blocks", () => {
        // Rows 15..34 over 10-row cells: bottom half of cell 1, cell 2 whole, top half of cell 3.
        const backend = renderMarked([{ start: 15, end: 35, color: red, priority: 1 }]);
        expect(backend.getTextAt(new Point(11, 1), 1)).toBe("▄");
        expect(backend.getFgAt(new Point(11, 1))).toBe(red);
        expect(backend.getBgAt(new Point(11, 1))).toBe(getFlatTrackColor(track, background));
        expect(backend.getBgAt(new Point(11, 2))).toBe(red);
        expect(backend.getTextAt(new Point(11, 3), 1)).toBe("▀");
    });

    it("keeps the classic ░ track for a child without markers", () => {
        const { container, backend, termScreen } = createScrollContainer(12, 5, 50);
        renderContainer(container, termScreen, backend);
        expect(backend.getTextAt(new Point(11, 3), 1)).toBe("░");
    });

    it("paints a shared cell with the highest-priority colour", () => {
        const backend = renderMarked([
            { start: 20, end: 21, color: blue, priority: 1 },
            { start: 21, end: 22, color: red, priority: 7 },
        ]);
        expect(backend.getFgAt(new Point(11, 2))).toBe(red);
    });

    it("composites a translucent thumb over the column background", () => {
        const size = new Size(12, 5);
        const backend = new MockTerminalBackend(size);
        const termScreen = new TerminalScreen(size);
        const viewport = new MarkedViewport(new TextBlockElement(50));
        viewport.markers = [{ start: 0, end: 1, color: red, priority: 1 }];
        const container = new ScrollBarDecorator(viewport);
        const translucentThumb = packRgba(255, 255, 255, 128);
        container.setStyleVars({ "scrollbarSlider.background": translucentThumb, "scrollbar.background": track });
        container.style = { bg: background };
        renderContainer(container, termScreen, backend);

        expect(backend.getBgAt(new Point(11, 0))).toBe(compositeOver(translucentThumb, background));
    });
});

describe("ScrollBarDecorator — marker placement", () => {
    const thumb = packRgb(10, 10, 10);
    const track = packRgb(20, 20, 20);
    const background = packRgb(30, 30, 30);
    const red = packRgb(200, 0, 0);

    function setup(
        width: number,
        placement: ScrollBarDecorator["markerPlacement"],
        markers: IScrollBarMarker[],
        lineCount = 50,
    ): { container: ScrollBarDecorator; viewport: MarkedViewport; backend: MockTerminalBackend } {
        const size = new Size(width, 5);
        const backend = new MockTerminalBackend(size);
        const termScreen = new TerminalScreen(size);
        const viewport = new MarkedViewport(new TextBlockElement(lineCount));
        viewport.markers = markers;
        const container = new ScrollBarDecorator(viewport);
        container.markerPlacement = placement;
        container.markerColumnMinWidth = 20;
        container.setStyleVars({ "scrollbarSlider.background": thumb, "scrollbar.background": track });
        container.style = { bg: background };
        renderContainer(container, termScreen, backend);
        return { container, viewport, backend };
    }

    const mark: IScrollBarMarker = { start: 20, end: 21, color: red, priority: 1 };

    it("outside: a marker column left of an untouched bar, the child one column narrower", () => {
        const { viewport, backend } = setup(12, "outside", [mark]);
        expect(viewport.layoutSize.width).toBe(10);
        expect(backend.getTextAt(new Point(10, 2), 1)).toBe("─");
        expect(backend.getFgAt(new Point(10, 2))).toBe(red);
        expect(backend.getBgAt(new Point(10, 2))).toBe(background);
        // The bar keeps its classic glyphs.
        expect(backend.getTextAt(new Point(11, 0), 1)).toBe("█");
        expect(backend.getTextAt(new Point(11, 2), 1)).toBe("░");
    });

    it("inside: the thumb moves in whole cells even with no markers at all", () => {
        // 50 rows, viewport 5, scrollTop 7: the classic thumb would end on a half cell.
        const { container, viewport, backend } = setup(12, "inside", []);
        viewport.scrollTop = 7;
        const termScreen = new TerminalScreen(new Size(12, 5));
        renderContainer(container, termScreen, backend);
        const column = [0, 1, 2, 3, 4].map((y) => backend.getTextAt(new Point(11, y), 1));
        expect(column.every((char) => char === " ")).toBe(true);
        // One-cell thumb at round(7 / 45 * 4) = 1, drawn as the cell background.
        expect([0, 1, 2].map((y) => backend.getBgAt(new Point(11, y)))).toEqual([
            getFlatTrackColor(track, background),
            thumb,
            getFlatTrackColor(track, background),
        ]);
    });

    it("auto: outside from markerColumnMinWidth up, inside below it", () => {
        expect(setup(20, "auto", [mark]).viewport.layoutSize.width).toBe(18);
        expect(setup(19, "auto", [mark]).viewport.layoutSize.width).toBe(18);
        const narrow = setup(19, "auto", [mark]);
        expect(narrow.backend.getTextAt(new Point(18, 2), 1)).toBe("─");
    });

    it("none: markers are ignored and the bar stays classic", () => {
        const { viewport, backend } = setup(12, "none", [mark]);
        expect(viewport.layoutSize.width).toBe(11);
        expect(backend.getTextAt(new Point(11, 2), 1)).toBe("░");
    });

    it("no vertical bar, no marker column", () => {
        const { viewport } = setup(12, "outside", [mark], 3);
        expect(viewport.layoutSize.width).toBe(12);
    });

    it("a child without markers keeps the classic bar under any placement", () => {
        const { container, backend, termScreen, viewport } = createScrollContainer(12, 5, 50);
        container.markerPlacement = "outside";
        renderContainer(container, termScreen, backend);
        expect(viewport.layoutSize.width).toBe(11);
        expect(backend.getTextAt(new Point(11, 3), 1)).toBe("░");
    });
});
