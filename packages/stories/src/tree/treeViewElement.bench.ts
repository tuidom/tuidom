import { Size } from "@tuidom/core/common/geometryPromitives";
import { TreeViewElement } from "@tuidom/elements/tree/treeViewElement";
import {
    buildInMemoryTree,
    collectCollapsibleNodes,
    makeInMemoryTreeProvider,
    type PerfTreeNode,
} from "@tuidom/testing/perfFixtures";
import { TestApp } from "@tuidom/testing/TestApp";
import { bench, describe } from "vitest";

// Бенчмарки flatten/refresh/render виджета дерева на in-memory данных (без fs).
// Запуск: `npm run test:perf`.
//
// Диагностика: refresh() пересобирает плоский список и делает линейные O(N)
// сканы (findElementByKey, restoreSelection); renderViewport аллоцирует
// DisplayLine на каждую видимую строку каждый кадр.
//
// NB: фикстуры строятся на верхнем уровне модуля (top-level await), а не в
// beforeAll — в режиме `vitest bench` тяжёлая инициализация в beforeAll
// отрабатывает некорректно (бенч не набирает сэмплов).

const NODE_COUNT = 2_000;

// ─── Полностью раскрытое дерево: refresh + render ────────────────────────────

const expandedRoots = buildInMemoryTree(NODE_COUNT);
const expandedTree = new TreeViewElement(makeInMemoryTreeProvider(expandedRoots));
const expandedApp = TestApp.createWithContent(expandedTree, new Size(60, 40));
await expandedTree.refresh();
for (const node of collectCollapsibleNodes(expandedRoots)) {
    await expandedTree.toggleExpand(node);
}

describe("TreeViewElement — large expanded tree", () => {
    bench("refresh() over fully-expanded tree", async () => {
        await expandedTree.refresh();
    });

    bench("render viewport (40 rows) on scroll", () => {
        expandedTree.scrollBy(0, 1);
        expandedTree.scrollBy(0, -1);
        expandedApp.render();
    });
});

// ─── Стоимость одного раскрытия (rebuildFlatList) ────────────────────────────

const toggleRoots = buildInMemoryTree(NODE_COUNT);
const toggleTree = new TreeViewElement(makeInMemoryTreeProvider(toggleRoots));
TestApp.createWithContent(toggleTree, new Size(60, 40));
await toggleTree.refresh();
const toggleCollapsible = collectCollapsibleNodes(toggleRoots);
const toggleTarget: PerfTreeNode = toggleCollapsible[0];
// Раскрываем всё, кроме target — его будем дёргать в бенче.
for (const node of toggleCollapsible.slice(1)) {
    await toggleTree.toggleExpand(node);
}

describe("TreeViewElement — toggleExpand rebuild", () => {
    bench("toggleExpand collapse+expand (2 flat-list rebuilds)", async () => {
        await toggleTree.toggleExpand(toggleTarget); // expand
        await toggleTree.toggleExpand(toggleTarget); // collapse
    });
});

// ─── Раскрыть все узлы верхнего уровня (форма вкладки Problems) ─────────────
//
// Файлы × маркеры: на монорепе языковой сервер даёт ~1.7k файлов и ~24k маркеров,
// и вкладка раскрывает каждый файл. Поштучный expand() пересобирал весь плоский
// список на каждый узел — минуты; expandElements() пересобирает один раз.

interface ProblemsNode {
    file: number;
    marker?: number;
}

const PROBLEM_FILES = 1_000;
const MARKERS_PER_FILE = 14;
const problemsProvider = {
    getChildren: (element?: ProblemsNode): ProblemsNode[] =>
        element === undefined
            ? Array.from({ length: PROBLEM_FILES }, (_, file) => ({ file }))
            : element.marker === undefined
              ? Array.from({ length: MARKERS_PER_FILE }, (_, marker) => ({ file: element.file, marker }))
              : [],
    getKey: (element: ProblemsNode): string =>
        element.marker === undefined
            ? `f${String(element.file)}`
            : `m${String(element.file)}:${String(element.marker)}`,
    getTreeItem: (element: ProblemsNode) =>
        element.marker === undefined
            ? { label: `File${String(element.file)}.java  (${String(MARKERS_PER_FILE)})`, collapsible: true }
            : {
                  label: `The import com.example.foo${String(element.marker)} cannot be resolved  [Ln ${String(element.marker)}, Col 1]`,
                  collapsible: false,
                  icon: "",
              },
};

describe("TreeViewElement — expand all top-level nodes (Problems shape)", () => {
    bench(`expandElements(${String(PROBLEM_FILES)} files × ${String(MARKERS_PER_FILE)})`, async () => {
        const tree = new TreeViewElement(problemsProvider);
        await tree.refresh();
        await tree.expandElements(problemsProvider.getChildren());
    });
});
