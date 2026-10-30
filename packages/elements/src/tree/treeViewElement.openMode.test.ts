import { BoxConstraints, Offset, Size } from "@tuidom/core/common/geometryPromitives";
import { MouseEventDispatcher } from "@tuidom/core/dom/events/mouseEventDispatcher";
import { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";
import { TUIMouseEvent } from "@tuidom/core/dom/events/tuiMouseEvent";
import type { MouseToken } from "@tuidom/core/input/rawTerminalToken";
import { describe, expect, it, vi } from "vitest";

import type { ITreeDataProvider, ITreeItem } from "./iTreeDataProvider.ts";
import { TreeViewElement } from "./treeViewElement.ts";

// Открытие строки мышью — `openOnSingleClick` (эталон: `workbench.list.openMode`,
// `ResourceNavigator.onPointer` / `onMouseDblClick`, `list.select`).

interface TestNode {
    id: string;
    label: string;
    children?: TestNode[];
}

function createProvider(roots: TestNode[]): ITreeDataProvider<TestNode> {
    return {
        getTreeItem(element: TestNode): ITreeItem {
            return { label: element.label, collapsible: (element.children?.length ?? 0) > 0 };
        },
        getChildren(element?: TestNode): TestNode[] {
            return element ? (element.children ?? []) : roots;
        },
        getKey(element: TestNode): string {
            return element.id;
        },
    };
}

// Строки: 0 — «src» (папка), 1 — README.md, 2 — LICENSE.
const ROOTS: TestNode[] = [
    { id: "src", label: "src", children: [{ id: "src/main.ts", label: "main.ts" }] },
    { id: "README.md", label: "README.md" },
    { id: "LICENSE", label: "LICENSE" },
];

const PREVIEW = { pinned: false, preserveFocus: true };
const PINNED = { pinned: true, preserveFocus: false };

async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function createTree(openOnSingleClick?: boolean | (() => boolean)): Promise<TreeViewElement<TestNode>> {
    const tree = new TreeViewElement(createProvider(ROOTS), { expandOnlyOnTwistieClick: false, openOnSingleClick });
    tree.setAsRoot();
    tree.localPosition = new Offset(0, 0);
    tree.layout(BoxConstraints.tight(new Size(30, 6)));
    await tree.refresh();
    return tree;
}

function click(
    tree: TreeViewElement<TestNode>,
    y: number,
    init: { button?: "left" | "middle" | "right"; ctrlKey?: boolean; shiftKey?: boolean } = {},
): void {
    tree.dispatchEvent(
        new TUIMouseEvent("click", { button: "left", screenX: 3, screenY: y, localX: 3, localY: y, ...init }),
    );
}

function mouseToken(action: MouseToken["action"], y: number): MouseToken {
    return {
        kind: "mouse",
        button: "left",
        action,
        x: 4,
        y: y + 1,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        raw: "",
    };
}

/** Настоящий двойной клик через диспетчер движка: click, click, dblclick. */
async function doubleClick(tree: TreeViewElement<TestNode>, y: number): Promise<void> {
    const dispatcher = new MouseEventDispatcher(() => 1000);
    for (let i = 0; i < 2; i++) {
        dispatcher.handleMouseToken(mouseToken("press", y), tree);
        dispatcher.handleMouseToken(mouseToken("release", y), tree);
        await settle();
    }
}

function lastOptions(onActivate: ReturnType<typeof vi.fn>): unknown {
    return onActivate.mock.calls.at(-1)?.[1];
}

describe("TreeViewElement — openOnSingleClick", () => {
    describe("true (openMode singleClick)", () => {
        it("a click on a leaf opens it as preview, keeping focus in the tree", async () => {
            const tree = await createTree(true);
            const onActivate = vi.fn();
            tree.onActivate = onActivate;

            click(tree, 1);

            expect(onActivate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "README.md" }), PREVIEW);
            expect(tree.getSelectedNode()?.id).toBe("README.md");
        });

        it("a double click opens preview on each click, then pins on dblclick", async () => {
            const tree = await createTree(true);
            const onActivate = vi.fn();
            tree.onActivate = onActivate;

            await doubleClick(tree, 1);

            expect(onActivate.mock.calls.map((call): unknown => call[1])).toEqual([PREVIEW, PREVIEW, PINNED]);
            expect(onActivate).toHaveBeenLastCalledWith(expect.objectContaining({ id: "README.md" }), PINNED);
        });

        it("a click on a folder only toggles it, no activation", async () => {
            const tree = await createTree(true);
            const onActivate = vi.fn();
            tree.onActivate = onActivate;

            click(tree, 0);
            await settle();

            expect(tree.contentHeight).toBe(4);
            expect(onActivate).not.toHaveBeenCalled();
        });

        it("Ctrl/Shift click only changes the selection", async () => {
            const tree = await createTree(true);
            const onActivate = vi.fn();
            tree.onActivate = onActivate;

            click(tree, 1, { ctrlKey: true });
            click(tree, 2, { shiftKey: true });

            expect(onActivate).not.toHaveBeenCalled();
        });

        it("a middle click opens a leaf pinned, keeping focus in the tree", async () => {
            const tree = await createTree(true);
            const onActivate = vi.fn();
            tree.onActivate = onActivate;

            click(tree, 2, { button: "middle" });

            expect(onActivate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "LICENSE" }), {
                pinned: true,
                preserveFocus: true,
            });
            expect(tree.getSelectedNode()?.id).toBe("LICENSE");
        });

        it("onMiddleClick replaces the default: the row gets the cursor, nothing opens", async () => {
            const tree = await createTree(true);
            const onActivate = vi.fn();
            const onMiddleClick = vi.fn();
            tree.onActivate = onActivate;
            tree.onMiddleClick = onMiddleClick;

            click(tree, 2, { button: "middle" });
            click(tree, 0, { button: "middle" });

            expect(onMiddleClick.mock.calls.map(([node]) => (node as TestNode).id)).toEqual(["LICENSE", "src"]);
            expect(onActivate).not.toHaveBeenCalled();
            expect(tree.getSelectedNode()?.id).toBe("src");
        });

        it("a middle click on a folder does nothing", async () => {
            const tree = await createTree(true);
            const onActivate = vi.fn();
            tree.onActivate = onActivate;

            click(tree, 0, { button: "middle" });
            await settle();

            expect(onActivate).not.toHaveBeenCalled();
            expect(tree.contentHeight).toBe(3);
        });

        it("a right click does not open the row", async () => {
            const tree = await createTree(true);
            const onActivate = vi.fn();
            tree.onActivate = onActivate;

            click(tree, 1, { button: "right" });

            expect(onActivate).not.toHaveBeenCalled();
        });

        it("Enter opens pinned and moves focus", async () => {
            const tree = await createTree(true);
            const onActivate = vi.fn();
            tree.onActivate = onActivate;
            tree.focusLast();

            tree.dispatchEvent(new TUIKeyboardEvent("keypress", { key: "Enter" }));

            expect(onActivate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "LICENSE" }), PINNED);
        });
    });

    describe("false (default, openMode doubleClick)", () => {
        it("a click only selects; a middle click does nothing", async () => {
            const tree = await createTree();
            const onActivate = vi.fn();
            tree.onActivate = onActivate;

            click(tree, 1);
            click(tree, 2, { button: "middle" });

            expect(onActivate).not.toHaveBeenCalled();
            expect(tree.getSelectedNode()?.id).toBe("README.md");
        });

        it("a double click opens pinned once", async () => {
            const tree = await createTree();
            const onActivate = vi.fn();
            tree.onActivate = onActivate;

            await doubleClick(tree, 1);

            expect(onActivate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "README.md" }), PINNED);
        });
    });

    it("a function is read on every gesture", async () => {
        let single = false;
        const tree = await createTree(() => single);
        const onActivate = vi.fn();
        tree.onActivate = onActivate;

        click(tree, 1);
        expect(onActivate).not.toHaveBeenCalled();

        single = true;
        click(tree, 2);
        expect(lastOptions(onActivate)).toEqual(PREVIEW);
    });

    it("can be switched through the property", async () => {
        const tree = await createTree();
        const onActivate = vi.fn();
        tree.onActivate = onActivate;

        tree.openOnSingleClick = true;
        click(tree, 1);

        expect(lastOptions(onActivate)).toEqual(PREVIEW);
    });
});
