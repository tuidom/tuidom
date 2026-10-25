import { Point, Size } from "@tuidom/core/common/geometryPromitives";
import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it } from "vitest";

import type { ITreeDataProvider } from "./iTreeDataProvider.ts";
import { TreeViewElement } from "./treeViewElement.ts";

interface TestNode {
    readonly id: string;
    readonly children?: readonly TestNode[];
}

const ROOTS: readonly TestNode[] = [
    { id: "open", children: [{ id: "leaf" }] },
    { id: "closed", children: [{ id: "x" }] },
];

const provider: ITreeDataProvider<TestNode> = {
    getTreeItem: (element) => ({ label: element.id, collapsible: element.children !== undefined }),
    getChildren: (element) => [...(element?.children ?? ROOTS)],
    getKey: (element) => element.id,
};

async function makeTree(): Promise<{ app: TestApp; chevrons: () => string[] }> {
    const tree = new TreeViewElement(provider);
    await tree.refresh();
    await tree.expand(ROOTS[0]);
    const app = TestApp.createWithContent(tree, new Size(20, 4));
    // Строки: open (раскрыт), leaf, closed (свёрнут); шеврон — в колонке отступа.
    const chevrons = (): string[] => [
        app.backend.getTextAt(new Point(0, 0), 1),
        app.backend.getTextAt(new Point(0, 2), 1),
    ];
    return { app, chevrons };
}

describe("TreeViewElement glyphs", () => {
    it("draws the Nerd Font chevrons by default", async () => {
        const { chevrons } = await makeTree();
        expect(chevrons()).toEqual(["\uF107", "\uF105"]);
    });

    it("draws the chevrons of the host table and follows its change", async () => {
        const { app, chevrons } = await makeTree();
        app.root.setGlyphs({ "tree.expanded": "▾", "tree.collapsed": "▸" });
        app.render();
        expect(chevrons()).toEqual(["▾", "▸"]);

        app.root.setGlyphs(null);
        app.render();
        expect(chevrons()).toEqual(["\uF107", "\uF105"]);
    });
});
