import { BoxConstraints, Offset, Point, Rect, Size } from "@tuidom/core/common/geometryPromitives";
import { StyleFlags } from "@tuidom/core/common/styleFlags";
import { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";
import { TUIContextMenuEvent, TUIMouseEvent } from "@tuidom/core/dom/events/tuiMouseEvent";
import { ROOT_STYLE_CONTEXT } from "@tuidom/core/dom/styles/tuiStyle";
import { RenderContext } from "@tuidom/core/dom/tuiElement";
import { TerminalScreen } from "@tuidom/core/rendering/terminalScreen";
import { describe, expect, it, vi } from "vitest";

import type { ITreeDataProvider, ITreeItem } from "./iTreeDataProvider.ts";
import { TreeViewElement } from "./treeViewElement.ts";

interface TestNode {
    id: string;
    segments?: string[];
    label: string;
    children?: TestNode[];
}

function createProvider(roots: TestNode[]): ITreeDataProvider<TestNode> {
    return {
        getTreeItem(element: TestNode): ITreeItem {
            return {
                label: element.label,
                labelSegments: element.segments,
                collapsible: (element.children?.length ?? 0) > 0,
            };
        },
        getChildren(element?: TestNode): TestNode[] {
            return element ? (element.children ?? []) : roots;
        },
        getKey(element: TestNode): string {
            return element.id;
        },
    };
}

// Строка «src/main/java» (колонки меток: src 2–4, main 6–9, java 11–14) и файл под ней.
function compactRoots(): TestNode[] {
    return [
        {
            id: "src",
            label: "src/main/java",
            segments: ["src", "main", "java"],
            children: [{ id: "App.java", label: "App.java" }],
        },
        { id: "README.md", label: "README.md" },
    ];
}

async function createTree(roots: TestNode[] = compactRoots()) {
    const tree = new TreeViewElement(createProvider(roots));
    const size = new Size(30, 5);
    tree.localPosition = new Offset(0, 0);
    tree.layout(BoxConstraints.tight(size));
    await tree.refresh();
    return { tree, roots };
}

function render(tree: TreeViewElement<TestNode>): TerminalScreen {
    const size = new Size(30, 5);
    const screen = new TerminalScreen(size);
    tree.performStyleResolution(ROOT_STYLE_CONTEXT);
    tree.render(new RenderContext(screen, new Offset(0, 0), new Rect(new Point(0, 0), size)));
    return screen;
}

/** Строка экрана, где подчёркнутые колонки заменены на `_`. */
function underlineMask(screen: TerminalScreen, y: number): string {
    let mask = "";
    for (let x = 0; x < screen.width; x++) {
        const cell = screen.getCell(new Point(x, y));
        mask += (cell.style & StyleFlags.Underline) !== 0 ? "_" : cell.char;
    }
    return mask.trimEnd();
}

function key(tree: TreeViewElement<TestNode>, name: string): void {
    tree.dispatchEvent(new TUIKeyboardEvent("keypress", { key: name }));
}

describe("TreeViewElement - compact row segments", () => {
    it("renders segments joined by '/' and underlines the last one on the cursor row", async () => {
        const { tree } = await createTree();
        const screen = render(tree);
        expect(underlineMask(screen, 0)).toBe(" src/main/____");
        // Строка без курсора не подчёркивается.
        expect(underlineMask(screen, 1)).toBe("  README.md");
    });

    it("Left/Right walk segments, then fall back to collapse/expand at the chain edges", async () => {
        const { tree, roots } = await createTree();
        const changed = vi.fn();
        tree.onSegmentChanged = changed;

        key(tree, "ArrowLeft");
        expect(tree.getSegmentIndex(roots[0])).toBe(1);
        expect(changed).toHaveBeenLastCalledWith(roots[0], 1);
        key(tree, "ArrowLeft");
        expect(tree.getSegmentIndex(roots[0])).toBe(0);
        expect(underlineMask(render(tree), 0)).toBe(" ___/main/java");

        key(tree, "ArrowRight");
        key(tree, "ArrowRight");
        expect(tree.getSegmentIndex(roots[0])).toBe(2);
        expect(tree.contentHeight).toBe(2);
        // На последнем сегменте Right — обычное раскрытие.
        key(tree, "ArrowRight");
        await vi.waitFor(() => {
            expect(tree.contentHeight).toBe(3);
        });
        expect(tree.getSegmentIndex(roots[0])).toBe(2);
    });

    it("first/last segment API reports whether it moved", async () => {
        const { tree, roots } = await createTree();
        expect(tree.focusLastSegment()).toBe(false);
        expect(tree.focusFirstSegment()).toBe(true);
        expect(tree.getSegmentIndex(roots[0])).toBe(0);
        expect(tree.focusPreviousSegment()).toBe(false);
        expect(tree.focusNextSegment()).toBe(true);
        expect(tree.getSegmentIndex(roots[0])).toBe(1);
    });

    it("click on a segment makes it current; click on the chevron keeps it", async () => {
        const { tree, roots } = await createTree();
        tree.dispatchEvent(
            new TUIMouseEvent("click", { button: "left", screenX: 7, screenY: 0, localX: 7, localY: 0 }),
        );
        expect(tree.getSegmentIndex(roots[0])).toBe(1);
        tree.dispatchEvent(
            new TUIMouseEvent("click", { button: "left", screenX: 0, screenY: 0, localX: 0, localY: 0 }),
        );
        expect(tree.getSegmentIndex(roots[0])).toBe(1);
    });

    it("right-click picks the segment under the mouse, or the last one off the segments", async () => {
        const { tree, roots } = await createTree();
        const onContextMenu = vi.fn();
        tree.onContextMenu = onContextMenu;
        const contextMenu = (x: number) =>
            new TUIContextMenuEvent({
                trigger: "mouse",
                button: "right",
                screenX: x,
                screenY: 0,
                localX: x,
                localY: 0,
            });

        tree.dispatchEvent(contextMenu(3));
        expect(tree.getSegmentIndex(roots[0])).toBe(0);
        expect(onContextMenu).toHaveBeenLastCalledWith(roots[0], 3, 0);
        tree.dispatchEvent(contextMenu(25));
        expect(tree.getSegmentIndex(roots[0])).toBe(2);
    });

    it("keyboard context menu anchors at the current segment", async () => {
        const { tree } = await createTree();
        key(tree, "ArrowLeft");
        expect(tree.getSelectedRowGlobalPosition()).toEqual(new Point(6, 0));
    });

    it("keeps the segment across collapse/refresh, resets it when the chain changes", async () => {
        const { tree, roots } = await createTree();
        tree.setSegmentIndex(roots[0], 0);
        await tree.toggleExpand(roots[0]);
        await tree.toggleExpand(roots[0]);
        await tree.refresh();
        expect(tree.getSegmentIndex(roots[0])).toBe(0);

        roots[0].segments = ["src", "main", "java", "com"];
        roots[0].label = "src/main/java/com";
        await tree.refresh();
        expect(tree.getSegmentIndex(roots[0])).toBe(3);
    });

    it("plain rows have no segments", async () => {
        const { tree, roots } = await createTree();
        expect(tree.getSegmentIndex(roots[1])).toBe(0);
        tree.setSegmentIndex(roots[1], 0);
        key(tree, "ArrowDown");
        expect(tree.focusPreviousSegment()).toBe(false);
    });
});
