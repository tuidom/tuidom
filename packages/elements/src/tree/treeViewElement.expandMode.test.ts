import { BoxConstraints, Offset, Size } from "@tuidom/core/common/geometryPromitives";
import { MouseEventDispatcher } from "@tuidom/core/dom/events/mouseEventDispatcher";
import { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";
import { TUIMouseEvent } from "@tuidom/core/dom/events/tuiMouseEvent";
import type { MouseToken } from "@tuidom/core/input/rawTerminalToken";
import { describe, expect, it, vi } from "vitest";

import type { ITreeDataProvider, ITreeItem } from "./iTreeDataProvider.ts";
import { TreeViewElement } from "./treeViewElement.ts";

// Раскрытие узла жестами по строке — `expandOnlyOnTwistieClick` (эталон:
// `workbench.tree.expandMode`, `list.select`, `MouseController.onViewPointer`).

interface TestNode {
    id: string;
    label: string;
    segments?: string[];
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

// Строки: 0 — «src» (папка, шеврон в колонке 0, имя с колонки 2), 1 — README.md.
function roots(): TestNode[] {
    return [
        { id: "src", label: "src", children: [{ id: "src/main.ts", label: "main.ts" }] },
        { id: "README.md", label: "README.md" },
    ];
}

const SIZE = new Size(30, 6);

async function createTree(
    expandOnlyOnTwistieClick?: boolean | ((element: TestNode) => boolean),
    nodes: TestNode[] = roots(),
): Promise<TreeViewElement<TestNode>> {
    const tree = new TreeViewElement(createProvider(nodes), { expandOnlyOnTwistieClick });
    tree.setAsRoot();
    tree.localPosition = new Offset(0, 0);
    tree.layout(BoxConstraints.tight(SIZE));
    await tree.refresh();
    return tree;
}

/** Даёт отработать асинхронному toggleExpand (провайдер синхронный). */
async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

function click(tree: TreeViewElement<TestNode>, x: number, y: number, mods: { ctrlKey?: boolean } = {}): void {
    tree.dispatchEvent(
        new TUIMouseEvent("click", { button: "left", screenX: x, screenY: y, localX: x, localY: y, ...mods }),
    );
}

function enter(tree: TreeViewElement<TestNode>): void {
    tree.dispatchEvent(new TUIKeyboardEvent("keypress", { key: "Enter" }));
}

function mouseToken(action: MouseToken["action"], x: number, y: number): MouseToken {
    // Токены терминала 1-based.
    return {
        kind: "mouse",
        button: "left",
        action,
        x: x + 1,
        y: y + 1,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        raw: "",
    };
}

/** Настоящий двойной клик через диспетчер движка: click, click, dblclick. */
async function doubleClick(tree: TreeViewElement<TestNode>, x: number, y: number): Promise<void> {
    const dispatcher = new MouseEventDispatcher(() => 1000);
    for (let i = 0; i < 2; i++) {
        dispatcher.handleMouseToken(mouseToken("press", x, y), tree);
        dispatcher.handleMouseToken(mouseToken("release", x, y), tree);
        await settle();
    }
}

describe("TreeViewElement — expandOnlyOnTwistieClick", () => {
    describe("true (default, expandMode doubleClick)", () => {
        it("click on the name only selects; Enter opens the row without expanding it", async () => {
            const tree = await createTree();
            const onActivate = vi.fn();
            tree.onActivate = onActivate;

            click(tree, 3, 0);
            await settle();
            expect(tree.contentHeight).toBe(2);

            enter(tree);
            await settle();
            expect(tree.contentHeight).toBe(2);
            expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "src" }), {
                pinned: true,
                preserveFocus: false,
            });
        });

        it("double click on the name toggles the folder once", async () => {
            const tree = await createTree();
            await doubleClick(tree, 3, 0);
            expect(tree.contentHeight).toBe(3);
            await doubleClick(tree, 3, 0);
            expect(tree.contentHeight).toBe(2);
        });

        it("double click on the chevron toggles twice (each click), dblclick adds nothing", async () => {
            const tree = await createTree();
            await doubleClick(tree, 0, 0);
            expect(tree.contentHeight).toBe(2);
        });
    });

    describe("false (expandMode singleClick)", () => {
        it("each click on the folder name toggles it", async () => {
            const tree = await createTree(false);
            const onActivate = vi.fn();
            tree.onActivate = onActivate;

            click(tree, 3, 0);
            await settle();
            expect(tree.contentHeight).toBe(3);
            click(tree, 3, 0);
            await settle();
            expect(tree.contentHeight).toBe(2);
            // Клик открывает строку только по openMode — его здесь нет.
            expect(onActivate).not.toHaveBeenCalled();
        });

        it("Enter toggles the folder and still reports activation", async () => {
            const tree = await createTree(false);
            const onActivate = vi.fn();
            tree.onActivate = onActivate;

            enter(tree);
            await settle();
            expect(tree.contentHeight).toBe(3);
            expect(onActivate).toHaveBeenCalledOnce();
            enter(tree);
            await settle();
            expect(tree.contentHeight).toBe(2);
        });

        it("Enter on a leaf only activates it", async () => {
            const tree = await createTree(false);
            const onActivate = vi.fn();
            tree.onActivate = onActivate;
            tree.focusLast();

            enter(tree);
            await settle();
            expect(tree.contentHeight).toBe(2);
            expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "README.md" }), {
                pinned: true,
                preserveFocus: false,
            });
        });

        it("double click on the name expands and collapses back, like the reference", async () => {
            const tree = await createTree(false);
            await doubleClick(tree, 3, 0);
            expect(tree.contentHeight).toBe(2);
        });

        it("double click on a leaf still activates it", async () => {
            const tree = await createTree(false);
            const onActivate = vi.fn();
            tree.onActivate = onActivate;
            await doubleClick(tree, 3, 1);
            expect(onActivate).toHaveBeenCalledOnce();
            expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "README.md" }), {
                pinned: true,
                preserveFocus: false,
            });
        });

        it("click on the chevron toggles once, not twice", async () => {
            const tree = await createTree(false);
            click(tree, 0, 0);
            await settle();
            expect(tree.contentHeight).toBe(3);
        });

        it("Ctrl+click only changes the selection", async () => {
            const tree = await createTree(false);
            click(tree, 3, 0, { ctrlKey: true });
            await settle();
            expect(tree.contentHeight).toBe(2);
        });

        it("click on a compact row segment makes it current and toggles the row", async () => {
            const nodes: TestNode[] = [
                {
                    id: "src",
                    label: "src/main",
                    segments: ["src", "main"],
                    children: [{ id: "App.java", label: "App.java" }],
                },
            ];
            const tree = await createTree(false, nodes);
            const onSegmentChanged = vi.fn();
            tree.onSegmentChanged = onSegmentChanged;

            // «src» — колонки 2–4.
            click(tree, 3, 0);
            await settle();
            expect(tree.getSegmentIndex(nodes[0])).toBe(0);
            expect(onSegmentChanged).toHaveBeenCalledWith(nodes[0], 0);
            expect(tree.contentHeight).toBe(2);
        });
    });

    describe("predicate", () => {
        it("decides per node and is read on every gesture", async () => {
            const nodes: TestNode[] = [
                { id: "a", label: "a", children: [{ id: "a/x", label: "x" }] },
                { id: "b", label: "b", children: [{ id: "b/y", label: "y" }] },
            ];
            const tree = await createTree((node) => node.id === "b", nodes);

            click(tree, 2, 1); // b — только шевроном
            await settle();
            expect(tree.contentHeight).toBe(2);
            click(tree, 2, 0); // a — кликом
            await settle();
            expect(tree.contentHeight).toBe(3);

            // Смена на лету: дальше и a — только шевроном.
            tree.expandOnlyOnTwistieClick = true;
            click(tree, 2, 0);
            await settle();
            expect(tree.contentHeight).toBe(3);
        });
    });
});
