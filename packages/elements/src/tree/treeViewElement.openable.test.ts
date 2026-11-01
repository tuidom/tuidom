import { BoxConstraints, Offset, Size } from "@tuidom/core/common/geometryPromitives";
import { TUIMouseEvent } from "@tuidom/core/dom/events/tuiMouseEvent";
import { describe, expect, it, vi } from "vitest";

import type { ITreeDataProvider, ITreeItem } from "./iTreeDataProvider.ts";
import { TreeViewElement } from "./treeViewElement.ts";

// A collapsible row with `openable`: the mouse opens it like a leaf, the chevron only expands (`TreeItem.command`).

interface TestNode {
    readonly id: string;
    readonly openable: boolean;
}

const OPENABLE: TestNode = { id: "openable", openable: true };
const PLAIN: TestNode = { id: "plain", openable: false };

function createProvider(): ITreeDataProvider<TestNode> {
    return {
        getTreeItem: (element): ITreeItem => ({ label: element.id, collapsible: true, openable: element.openable }),
        getChildren: (element) => (element === undefined ? [OPENABLE, PLAIN] : []),
        getKey: (element) => element.id,
    };
}

async function createTree(openOnSingleClick: boolean): Promise<TreeViewElement<TestNode>> {
    const tree = new TreeViewElement(createProvider(), { openOnSingleClick });
    tree.setAsRoot();
    tree.localPosition = new Offset(0, 0);
    tree.layout(BoxConstraints.tight(new Size(30, 6)));
    await tree.refresh();
    return tree;
}

const LABEL_X = 5;
const TWISTIE_X = 0;

function mouse(
    tree: TreeViewElement<TestNode>,
    type: "click" | "dblclick",
    x: number,
    y: number,
    button = "left",
): void {
    tree.dispatchEvent(
        new TUIMouseEvent(type, {
            button: button as "left",
            screenX: x,
            screenY: y,
            localX: x,
            localY: y,
        }),
    );
}

describe("TreeViewElement — openable rows", () => {
    it("a click opens the row as a preview and doesn't expand it", async () => {
        const tree = await createTree(true);
        const activate = vi.fn();
        const expanded = vi.fn();
        tree.onActivate = activate;
        tree.onExpandedChanged = expanded;

        mouse(tree, "click", LABEL_X, 0);

        expect(activate).toHaveBeenCalledExactlyOnceWith(OPENABLE, { pinned: false, preserveFocus: true });
        expect(expanded).not.toHaveBeenCalled();
    });

    it("a click respects openOnSingleClick: off, only a double click opens", async () => {
        const tree = await createTree(false);
        const activate = vi.fn();
        tree.onActivate = activate;

        mouse(tree, "click", LABEL_X, 0);
        expect(activate).not.toHaveBeenCalled();

        mouse(tree, "dblclick", LABEL_X, 0);
        expect(activate).toHaveBeenCalledExactlyOnceWith(OPENABLE, { pinned: true, preserveFocus: false });
    });

    it("the chevron only expands, on a click and on a double click", async () => {
        const tree = await createTree(true);
        const activate = vi.fn();
        const expanded = vi.fn();
        tree.onActivate = activate;
        tree.onExpandedChanged = expanded;

        mouse(tree, "click", TWISTIE_X, 0);
        mouse(tree, "dblclick", TWISTIE_X, 0);

        await vi.waitFor(() => {
            expect(expanded).toHaveBeenCalled();
        });
        expect(activate).not.toHaveBeenCalled();
    });

    it("a middle click opens it pinned in the background", async () => {
        const tree = await createTree(true);
        const activate = vi.fn();
        tree.onActivate = activate;

        mouse(tree, "click", LABEL_X, 0, "middle");

        expect(activate).toHaveBeenCalledExactlyOnceWith(OPENABLE, { pinned: true, preserveFocus: true });
    });

    it("a collapsible row without it is not opened by the mouse", async () => {
        const tree = await createTree(true);
        const activate = vi.fn();
        tree.onActivate = activate;

        mouse(tree, "click", LABEL_X, 1);
        mouse(tree, "dblclick", LABEL_X, 1);
        mouse(tree, "click", LABEL_X, 1, "middle");

        expect(activate).not.toHaveBeenCalled();
    });
});
