import { packRgb } from "@tuidom/core/common/colorUtils";
import { BoxConstraints, Offset, Point, Rect, Size } from "@tuidom/core/common/geometryPromitives";
import { StyleFlags } from "@tuidom/core/common/styleFlags";
import { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";
import { ROOT_STYLE_CONTEXT } from "@tuidom/core/dom/styles/tuiStyle";
import { RenderContext } from "@tuidom/core/dom/tuiElement";
import { TerminalScreen } from "@tuidom/core/rendering/terminalScreen";
import { describe, expect, it } from "vitest";

import type { ITreeDataProvider, ITreeItem } from "./iTreeDataProvider.ts";
import { TreeViewElement } from "./treeViewElement.ts";

interface TestNode {
    id: string;
    label: string;
    description?: string;
    segments?: string[];
    badge?: string;
    symlink?: boolean;
    labelColor?: number;
    italic?: boolean;
    children?: TestNode[];
}

function createProvider(roots: TestNode[]): ITreeDataProvider<TestNode> {
    return {
        getTreeItem(element: TestNode): ITreeItem {
            return {
                label: element.label,
                description: element.description,
                labelSegments: element.segments,
                badge: element.badge,
                symlink: element.symlink,
                labelColor: element.labelColor,
                italic: element.italic,
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

const FG = packRgb(204, 204, 204);
const DESCRIPTION_FG = packRgb(171, 171, 171);
const SELECTION_FG = packRgb(255, 255, 255);
const LABEL_COLOR = packRgb(115, 201, 145);

async function createTree(roots: TestNode[], width = 30): Promise<TreeViewElement<TestNode>> {
    const tree = new TreeViewElement(createProvider(roots));
    tree.setStyleVars({
        descriptionForeground: DESCRIPTION_FG,
        "list.inactiveSelectionForeground": SELECTION_FG,
    });
    tree.style = { fg: FG };
    tree.localPosition = new Offset(0, 0);
    tree.layout(BoxConstraints.tight(new Size(width, 4)));
    await tree.refresh();
    return tree;
}

function render(tree: TreeViewElement<TestNode>): TerminalScreen {
    const size = tree.layoutSize;
    const screen = new TerminalScreen(size);
    tree.performStyleResolution(ROOT_STYLE_CONTEXT);
    tree.render(new RenderContext(screen, new Offset(0, 0), new Rect(new Point(0, 0), size)));
    return screen;
}

function row(screen: TerminalScreen, y: number): string {
    let text = "";
    for (let x = 0; x < screen.width; x++) text += screen.getCell(new Point(x, y)).char;
    return text.trimEnd();
}

function fgAt(screen: TerminalScreen, x: number, y: number): number {
    return screen.getCell(new Point(x, y)).fg;
}

// Две строки: курсор на первой, описание проверяем на второй (вне выделения).
const ROWS: TestNode[] = [
    { id: "top", label: "top" },
    { id: "aws", label: "aws", description: "5.31.0" },
];

describe("TreeViewElement - description", () => {
    it("renders the description after the label with a space, in descriptionForeground", async () => {
        const screen = render(await createTree(ROWS));
        expect(row(screen, 1)).toBe("  aws 5.31.0");
        // Метка — цветом строки, описание (колонки 6–11) — приглушённым.
        expect(fgAt(screen, 2, 1)).toBe(FG);
        expect(fgAt(screen, 4, 1)).toBe(FG);
        expect(fgAt(screen, 6, 1)).toBe(DESCRIPTION_FG);
        expect(fgAt(screen, 11, 1)).toBe(DESCRIPTION_FG);
    });

    it("leaves a row without or with an empty description unchanged", async () => {
        const plain = await createTree([{ id: "a", label: "Alpha" }]);
        const empty = await createTree([{ id: "a", label: "Alpha", description: "" }]);
        expect(row(render(empty), 0)).toBe(row(render(plain), 0));
        expect(row(render(empty), 0)).toBe("  Alpha");
        expect(empty.contentWidth).toBe(plain.contentWidth);
    });

    it("counts the description in contentWidth, measuring wide characters by columns", async () => {
        const tree = await createTree([{ id: "a", label: "Alpha", description: "版本" }]);
        // "  Alpha" = 7, пробел, «版本» — 4 колонки.
        expect(tree.contentWidth).toBe(12);
        const screen = render(tree);
        expect(screen.getCell(new Point(8, 0)).char).toBe("版");
        expect(screen.getCell(new Point(10, 0)).char).toBe("本");
        expect(fgAt(screen, 10, 0)).toBe(SELECTION_FG);
    });

    it("clips the description first, then the label, at a narrow width", async () => {
        const roots: TestNode[] = [{ id: "a", label: "Alpha", description: "1.2.3" }];
        expect(row(render(await createTree(roots, 10)), 0)).toBe("  Alpha 1.");
        expect(row(render(await createTree(roots, 5)), 0)).toBe("  Alp");
    });

    it("takes the selection foreground on the cursor row", async () => {
        const screen = render(await createTree([{ id: "a", label: "Alpha", description: "v1" }]));
        expect(fgAt(screen, 8, 0)).toBe(SELECTION_FG);
    });

    it("keeps labelColor on the label only, not on the description", async () => {
        const screen = render(
            await createTree([ROWS[0], { id: "m", label: "main.go", description: "M", labelColor: LABEL_COLOR }]),
        );
        expect(fgAt(screen, 2, 1)).toBe(LABEL_COLOR);
        expect(fgAt(screen, 8, 1)).toBe(LABEL_COLOR);
        expect(fgAt(screen, 10, 1)).toBe(DESCRIPTION_FG);
    });

    it("italic sets the italic flag on the label only, not on the icon gap or the description", async () => {
        const screen = render(await createTree([{ id: "a", label: "ab", description: "src", italic: true }]));
        const styleAt = (x: number): number => screen.getCell(new Point(x, 0)).style;
        // "  ab src": the label is columns 2..3.
        expect([1, 2, 3, 4, 5].map(styleAt)).toEqual([
            StyleFlags.None,
            StyleFlags.Italic,
            StyleFlags.Italic,
            StyleFlags.None,
            StyleFlags.None,
        ]);
        const plain = render(await createTree([{ id: "a", label: "ab" }]));
        expect(plain.getCell(new Point(2, 0)).style).toBe(StyleFlags.None);
    });

    it("draws the badge at the right edge over a long description", async () => {
        const screen = render(
            await createTree([{ id: "a", label: "Alpha", description: "0123456789", badge: "M" }], 14),
        );
        expect(row(screen, 0)).toBe("  Alpha 01234M");
    });

    it("reserves room for the badge in contentWidth, so the text end scrolls clear of it", async () => {
        const described = await createTree([{ id: "a", label: "Alpha", description: "0123456789", badge: "M" }], 14);
        // "  Alpha 0123456789" = 18, пробел и бейдж — ещё 2.
        expect(described.contentWidth).toBe(20);
        described.scrollTo(1000, 0);
        expect(row(render(described), 0)).toBe("a 0123456789 M");

        const labelOnly = await createTree([{ id: "a", label: "Alpha-0123456789", badge: "MU" }], 14);
        labelOnly.scrollTo(1000, 0);
        expect(row(render(labelOnly), 0)).toBe("-0123456789 MU");

        // Стрелка симлинка — тоже колонка резерва; без бейджей резерва нет.
        const symlink = await createTree([{ id: "a", label: "Alpha", symlink: true }]);
        expect(symlink.contentWidth).toBe(9);
        expect((await createTree([{ id: "a", label: "Alpha" }])).contentWidth).toBe(7);
    });

    it("puts the description after the last segment of a compact row", async () => {
        const screen = render(
            await createTree([
                ROWS[0],
                { id: "src", label: "src/main", segments: ["src", "main"], description: "pkg" },
            ]),
        );
        expect(row(screen, 1)).toBe("  src/main pkg");
        expect(fgAt(screen, 11, 1)).toBe(DESCRIPTION_FG);
    });

    it("matches type-ahead against the label only", async () => {
        const tree = await createTree([
            { id: "a", label: "alpha", description: "zeta" },
            { id: "z", label: "zulu" },
        ]);
        const selected: string[] = [];
        tree.onSelect = (node) => selected.push(node.id);
        tree.dispatchEvent(new TUIKeyboardEvent("keypress", { key: "z" }));
        expect(selected).toEqual(["z"]);
    });
});
