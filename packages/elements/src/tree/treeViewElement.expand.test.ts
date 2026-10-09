import { Size } from "@tuidom/core/common/geometryPromitives";
import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it, vi } from "vitest";

import type { ITreeDataProvider, ITreeItem } from "./iTreeDataProvider.ts";
import { TreeViewElement } from "./treeViewElement.ts";

interface TestNode {
    id: string;
    label: string;
    children?: TestNode[];
}

function createProvider(roots: TestNode[]): ITreeDataProvider<TestNode> & { roots: TestNode[] } {
    const provider = {
        roots,
        getTreeItem(element: TestNode): ITreeItem {
            return { label: element.label, collapsible: (element.children?.length ?? 0) > 0 };
        },
        getChildren(element?: TestNode): TestNode[] {
            if (!element) return provider.roots;
            return element.children ?? [];
        },
        getKey(element: TestNode): string {
            return element.id;
        },
    };
    return provider;
}

/** Файлы с маркерами — форма вкладки Problems, ради которой пакетное раскрытие и заведено. */
function filesWithMarkers(files: number, markers: number): TestNode[] {
    return Array.from({ length: files }, (_, f) => ({
        id: `f${String(f)}`,
        label: `file${String(f)}.ts`,
        children: Array.from({ length: markers }, (_, m) => ({
            id: `f${String(f)}:m${String(m)}`,
            label: `marker ${String(f)}.${String(m)}`,
        })),
    }));
}

function createTree(roots: TestNode[], viewportSize: Size = new Size(40, 20)) {
    const provider = createProvider(roots);
    const tree = new TreeViewElement(provider);
    const app = TestApp.createWithContent(tree, viewportSize);
    return { tree, app, provider };
}

describe("TreeViewElement — expandElements", () => {
    it("раскрывает все переданные узлы: их дети видны под своими родителями", async () => {
        const roots = filesWithMarkers(3, 2);
        const { tree, app } = createTree(roots);
        await tree.refresh();

        await tree.expandElements(roots);
        app.render();

        expect(tree.contentHeight).toBe(9);
        const lines = app.backend.screenToString().split("\n");
        expect(lines[0]).toContain("file0.ts");
        expect(lines[1]).toContain("marker 0.0");
        expect(lines[2]).toContain("marker 0.1");
        expect(lines[3]).toContain("file1.ts");
        expect(lines[8]).toContain("marker 2.1");
    });

    it("перестраивает плоский список один раз на всю пачку, а не на каждый узел", async () => {
        const roots = filesWithMarkers(50, 3);
        const { tree, provider } = createTree(roots);
        await tree.refresh();
        const getTreeItem = vi.spyOn(provider, "getTreeItem");

        await tree.expandElements(roots);

        // Одна пересборка — по вызову на строку итогового списка (50 файлов + 150 маркеров).
        expect(getTreeItem).toHaveBeenCalledTimes(200);
    });

    it("уже раскрытые узлы пропускает; если раскрывать нечего — список не пересобирается", async () => {
        const roots = filesWithMarkers(2, 1);
        const { tree, provider } = createTree(roots);
        await tree.refresh();
        await tree.expandElements(roots);
        const getChildren = vi.spyOn(provider, "getChildren");
        const getTreeItem = vi.spyOn(provider, "getTreeItem");
        const onExpanded = vi.fn();
        tree.onExpandedChanged = onExpanded;

        await tree.expandElements(roots);

        expect(getChildren).not.toHaveBeenCalled();
        expect(getTreeItem).not.toHaveBeenCalled();
        expect(onExpanded).not.toHaveBeenCalled();
        expect(tree.contentHeight).toBe(4);
    });

    it("onExpandedChanged — по разу на каждый вновь раскрытый узел", async () => {
        const roots = filesWithMarkers(3, 1);
        const { tree } = createTree(roots);
        await tree.refresh();
        await tree.expand(roots[0]);
        const onExpanded = vi.fn();
        tree.onExpandedChanged = onExpanded;

        await tree.expandElements(roots);

        expect(onExpanded.mock.calls).toEqual([
            [roots[1], true],
            [roots[2], true],
        ]);
    });

    it("пустая пачка — no-op", async () => {
        const roots = filesWithMarkers(2, 1);
        const { tree, provider } = createTree(roots);
        await tree.refresh();
        const getTreeItem = vi.spyOn(provider, "getTreeItem");

        await tree.expandElements([]);

        expect(getTreeItem).not.toHaveBeenCalled();
        expect(tree.contentHeight).toBe(2);
    });
});

describe("TreeViewElement — refresh() поверх раскрытого дерева", () => {
    it("перечитывает детей раскрытых узлов на любой глубине", async () => {
        const roots: TestNode[] = [
            {
                id: "src",
                label: "src",
                children: [{ id: "src/lib", label: "lib", children: [{ id: "src/lib/a.ts", label: "a.ts" }] }],
            },
        ];
        const { tree, app } = createTree(roots);
        await tree.refresh();
        await tree.expand(roots[0]);
        await tree.expand(roots[0].children![0]);

        roots[0].children![0].children!.push({ id: "src/lib/b.ts", label: "b.ts" });
        await tree.refresh();
        app.render();

        expect(tree.contentHeight).toBe(4);
        expect(app.backend.screenToString()).toContain("b.ts");
    });

    it("раскрытый узел под свёрнутым предком не перечитывается — он не виден", async () => {
        const lib: TestNode = { id: "src/lib", label: "lib", children: [{ id: "src/lib/a.ts", label: "a.ts" }] };
        const roots: TestNode[] = [{ id: "src", label: "src", children: [lib] }];
        const { tree, provider } = createTree(roots);
        await tree.refresh();
        await tree.expand(roots[0]);
        await tree.expand(lib);
        await tree.toggleExpand(roots[0]); // свернули предка; lib остаётся «раскрытым»
        const getChildren = vi.spyOn(provider, "getChildren");

        await tree.refresh();

        expect(getChildren.mock.calls).toEqual([[]]);
        expect(tree.contentHeight).toBe(1);
    });

    it("раскрытый узел, пропавший из данных, обход не ищет и детей у него не просит", async () => {
        const roots = filesWithMarkers(2, 1);
        const { tree, provider } = createTree(roots);
        await tree.refresh();
        await tree.expandElements(roots);
        provider.roots = [roots[0]];
        const getChildren = vi.spyOn(provider, "getChildren");

        await tree.refresh();

        expect(getChildren.mock.calls).toEqual([[], [roots[0]]]);
        expect(tree.contentHeight).toBe(2);
    });
});

describe("TreeViewElement — ширина контента после пересборок", () => {
    it("метка сменилась при том же ключе — ширина считается по новому тексту", async () => {
        const node: TestNode = { id: "x", label: "short" };
        const { tree } = createTree([node]);
        await tree.refresh();
        const before = tree.contentWidth;

        node.label = "a considerably longer label";
        await tree.refresh();

        expect(tree.contentWidth).toBe(before + "a considerably longer label".length - "short".length);
    });

    it("широкие символы метки учитываются и при повторной пересборке (из кэша)", async () => {
        const roots: TestNode[] = [{ id: "w", label: "日本語" }];
        const { tree } = createTree(roots);
        await tree.refresh();
        const first = tree.contentWidth;

        await tree.refresh();

        // expandIcon + пробел + 3 широких символа по 2 колонки.
        expect(first).toBe(2 + 6);
        expect(tree.contentWidth).toBe(first);
    });

    it("ширина пересчитывается вниз, когда самая длинная строка ушла", async () => {
        const roots: TestNode[] = [
            { id: "a", label: "a" },
            { id: "long", label: "the longest label here" },
        ];
        const { tree, provider } = createTree(roots);
        await tree.refresh();
        provider.roots = [roots[0]];

        await tree.refresh();

        expect(tree.contentWidth).toBe(2 + 1);
    });
});
