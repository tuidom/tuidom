import { packRgb } from "@tuidom/core/common/colorUtils";
import { BoxConstraints, Offset, Point, Rect, Size } from "@tuidom/core/common/geometryPromitives";
import { StyleFlags } from "@tuidom/core/common/styleFlags";
import { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";
import { TUIMouseEvent, type TUIMouseEventType } from "@tuidom/core/dom/events/tuiMouseEvent";
import { ROOT_STYLE_CONTEXT } from "@tuidom/core/dom/styles/tuiStyle";
import { RenderContext } from "@tuidom/core/dom/tuiElement";
import { TerminalScreen } from "@tuidom/core/rendering/terminalScreen";
import { describe, expect, it, vi } from "vitest";

import type { ITreeDataProvider, ITreeItem, ITreeItemAction } from "./iTreeDataProvider.ts";
import { TreeViewElement } from "./treeViewElement.ts";

interface TestNode {
    id: string;
    label: string;
    segments?: string[];
    actions?: ITreeItemAction[];
    badge?: string;
    symlink?: boolean;
    children?: TestNode[];
}

function createProvider(roots: TestNode[]): ITreeDataProvider<TestNode> {
    return {
        getTreeItem(element: TestNode): ITreeItem {
            return {
                label: element.label,
                labelSegments: element.segments,
                actions: element.actions,
                badge: element.badge,
                symlink: element.symlink,
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

const ROW_BG = packRgb(30, 30, 30);
const SELECTION_BG = packRgb(55, 55, 61);
const HOVER_BG = packRgb(42, 45, 46);
const TOOLBAR_HOVER_BG = packRgb(90, 93, 94);

const EDIT = { label: "Edit", icon: "\uEA73" };
const OPEN = { label: "Open", icon: "\uEB14" };

// Три строки с действиями «Edit», «Open»; курсор на первой.
function envRoots(): TestNode[] {
    return [
        { id: "GOPATH", label: "GOPATH", actions: [EDIT, OPEN] },
        { id: "GOROOT", label: "GOROOT", actions: [EDIT, OPEN] },
        { id: "GOBIN", label: "GOBIN", actions: [EDIT, OPEN] },
    ];
}

async function createTree(roots: TestNode[], width = 20): Promise<TreeViewElement<TestNode>> {
    const tree = new TreeViewElement(createProvider(roots));
    tree.setStyleVars({
        "list.inactiveSelectionBackground": SELECTION_BG,
        "list.hoverBackground": HOVER_BG,
        "toolbar.hoverBackground": TOOLBAR_HOVER_BG,
    });
    tree.style = { bg: ROW_BG };
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

function bgAt(screen: TerminalScreen, x: number, y: number): number {
    return screen.getCell(new Point(x, y)).bg;
}

function mouse(tree: TreeViewElement<TestNode>, type: TUIMouseEventType, x: number, y: number): void {
    tree.dispatchEvent(new TUIMouseEvent(type, { button: "left", screenX: x, screenY: y, localX: x, localY: y }));
}

describe("TreeViewElement - inline actions", () => {
    it("shows the glyphs at the right edge of the cursor row only", async () => {
        const screen = render(await createTree(envRoots()));
        expect(row(screen, 0)).toBe("  GOPATH         \uEA73 \uEB14");
        expect(row(screen, 1)).toBe("  GOROOT");
        expect(row(screen, 2)).toBe("  GOBIN");
    });

    it("shows the glyphs on the hovered row and hides them when the mouse leaves", async () => {
        const tree = await createTree(envRoots());
        mouse(tree, "mousemove", 3, 2);
        expect(row(render(tree), 2)).toBe("  GOBIN          \uEA73 \uEB14");
        mouse(tree, "mouseleave", 0, 0);
        expect(row(render(tree), 2)).toBe("  GOBIN");
    });

    it("shows the glyphs on every selected row", async () => {
        const tree = await createTree(envRoots());
        tree.dispatchEvent(new TUIKeyboardEvent("keypress", { key: "ArrowDown", shiftKey: true }));
        const screen = render(tree);
        // Выбраны GOPATH и GOROOT (курсор), GOBIN — без действий.
        expect(row(screen, 0)).toBe("  GOPATH         \uEA73 \uEB14");
        expect(row(screen, 1)).toBe("  GOROOT         \uEA73 \uEB14");
        expect(row(screen, 2)).toBe("  GOBIN");
    });

    it("draws the idle glyph everywhere but under the mouse, the cursor row included", async () => {
        const CLOSE = { label: "Close", icon: "\u00D7", idleIcon: "\u25CF" };
        const tree = await createTree([
            { id: "a", label: "a.ts", actions: [CLOSE] },
            { id: "b", label: "b.ts", actions: [EDIT, CLOSE] },
            { id: "c", label: "c.ts", actions: [CLOSE] },
        ]);
        let screen = render(tree);
        // The cursor row: the idle glyph too (upstream's `.dirty:not(:hover)`).
        expect(row(screen, 0)).toBe("  a.ts             \u25CF");
        // An action without an idle glyph takes no room: the idle one sits at the edge.
        expect(row(screen, 1)).toBe("  b.ts             \u25CF");
        mouse(tree, "mousemove", 3, 2);
        screen = render(tree);
        expect(row(screen, 1)).toBe("  b.ts             \u25CF");
        expect(row(screen, 2)).toBe("  c.ts             \u00D7");
        // On the cursor row an action without an idle glyph still shows.
        mouse(tree, "mouseleave", 0, 0);
        tree.dispatchEvent(new TUIKeyboardEvent("keypress", { key: "ArrowDown" }));
        expect(row(render(tree), 1)).toBe("  b.ts           \uEA73 \u25CF");
        // Clicking the idle glyph runs the same action.
        const onInlineAction = vi.fn();
        tree.onInlineAction = onInlineAction;
        mouse(tree, "click", 19, 1);
        expect(onInlineAction).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }), 1);
    });

    it("draws the label of an action without an icon", async () => {
        const screen = render(await createTree([{ id: "ws", label: "ws", actions: [{ label: "View" }, OPEN] }]));
        expect(row(screen, 0)).toBe("  ws          View \uEB14");
    });

    it("leaves a row without or with empty actions unchanged", async () => {
        const plain = await createTree([{ id: "a", label: "Alpha" }]);
        const empty = await createTree([{ id: "a", label: "Alpha", actions: [] }]);
        expect(row(render(empty), 0)).toBe(row(render(plain), 0));
    });

    it("sits left of the badge and the symlink arrow with a gap", async () => {
        const screen = render(
            await createTree([{ id: "a", label: "a.go", actions: [EDIT], badge: "M", symlink: true }], 12),
        );
        expect(row(screen, 0)).toBe("  a.go  \uEA73 \u21B5M");
    });

    it("covers the text under it with the row background", async () => {
        const screen = render(await createTree([{ id: "long", label: "averyveryverylongname", actions: [EDIT] }]));
        // Пробел-отступ и глиф стоят поверх подписи, под ними — фон строки.
        expect(row(screen, 0)).toBe("  averyveryverylon \uEA73");
        expect(bgAt(screen, 18, 0)).toBe(SELECTION_BG);
        expect(bgAt(screen, 19, 0)).toBe(SELECTION_BG);
    });

    it("stays at the viewport's right edge under horizontal scroll", async () => {
        const tree = await createTree([{ id: "long", label: "averyveryverylongname-tail", actions: [EDIT] }]);
        tree.scrollTo(8, 0);
        expect(row(render(tree), 0)).toBe("eryverylongname-ta \uEA73");
        // Клик по глифу находит действие и при прокрутке.
        const onInlineAction = vi.fn();
        tree.onInlineAction = onInlineAction;
        mouse(tree, "click", 19, 0);
        expect(onInlineAction).toHaveBeenCalledWith(expect.objectContaining({ id: "long" }), 0);
    });

    it("skips glyphs that do not fit a narrow viewport", async () => {
        const screen = render(
            await createTree([{ id: "a", label: "abcdefgh", actions: [{ label: "Refresh" }, OPEN] }], 8),
        );
        // «Refresh» не влез — не рисуется и не стирает подпись под собой.
        expect(row(screen, 0)).toBe("  abcd \uEB14");
        // \u041D\u043E\u043C\u0435\u0440 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u2014 \u0432 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C \u0441\u043F\u0438\u0441\u043A\u0435, \u0430 \u043D\u0435 \u0441\u0440\u0435\u0434\u0438 \u0432\u043B\u0435\u0437\u0448\u0438\u0445.
        const tree = await createTree([{ id: "a", label: "abcdefgh", actions: [{ label: "Refresh" }, OPEN] }], 8);
        const onInlineAction = vi.fn();
        tree.onInlineAction = onInlineAction;
        mouse(tree, "click", 7, 0);
        expect(onInlineAction).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), 1);
        mouse(tree, "mousemove", 7, 0);
        expect(bgAt(render(tree), 7, 0)).toBe(TOOLBAR_HOVER_BG);
    });

    it("clicking a glyph fires onInlineAction and moves the cursor without toggling or opening", async () => {
        const roots: TestNode[] = [
            { id: "top", label: "top" },
            { id: "dir", label: "dir", actions: [EDIT, OPEN], children: [{ id: "child", label: "child" }] },
        ];
        const tree = new TreeViewElement(createProvider(roots), {
            expandOnlyOnTwistieClick: false,
            openOnSingleClick: true,
        });
        tree.layout(BoxConstraints.tight(new Size(20, 4)));
        await tree.refresh();
        const onInlineAction = vi.fn();
        const onActivate = vi.fn();
        const onExpandedChanged = vi.fn();
        tree.onInlineAction = onInlineAction;
        tree.onActivate = onActivate;
        tree.onExpandedChanged = onExpandedChanged;

        // «Open» — колонка 19, «Edit» — 17 (между ними пробел, 18 — мимо).
        mouse(tree, "click", 19, 1);
        expect(onInlineAction).toHaveBeenCalledWith(roots[1], 1);
        expect(tree.getSelectedNode()).toBe(roots[1]);
        mouse(tree, "click", 17, 1);
        expect(onInlineAction).toHaveBeenLastCalledWith(roots[1], 0);
        mouse(tree, "dblclick", 17, 1);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(onInlineAction).toHaveBeenCalledTimes(2);
        expect(onExpandedChanged).not.toHaveBeenCalled();
        expect(onActivate).not.toHaveBeenCalled();
        expect(tree.contentHeight).toBe(2);

        // Мимо глифов клик — обычный клик по строке.
        mouse(tree, "click", 18, 1);
        expect(onInlineAction).toHaveBeenCalledTimes(2);
        await vi.waitFor(() => {
            expect(onExpandedChanged).toHaveBeenCalledWith(roots[1], true);
        });
    });

    it("double-clicking a glyph of a leaf does not open it", async () => {
        const tree = await createTree(envRoots());
        const onActivate = vi.fn();
        tree.onActivate = onActivate;
        mouse(tree, "dblclick", 19, 0);
        expect(onActivate).not.toHaveBeenCalled();
        mouse(tree, "dblclick", 3, 0);
        expect(onActivate).toHaveBeenCalledTimes(1);
    });

    it("highlights the glyph under the mouse with toolbar.hoverBackground", async () => {
        const tree = await createTree(envRoots());
        mouse(tree, "mousemove", 19, 1);
        let screen = render(tree);
        expect(bgAt(screen, 19, 1)).toBe(TOOLBAR_HOVER_BG);
        expect(bgAt(screen, 17, 1)).toBe(HOVER_BG);
        expect(bgAt(screen, 18, 1)).toBe(HOVER_BG);

        mouse(tree, "mousemove", 17, 1);
        screen = render(tree);
        expect(bgAt(screen, 17, 1)).toBe(TOOLBAR_HOVER_BG);
        expect(bgAt(screen, 19, 1)).toBe(HOVER_BG);

        // Курсорная строка с действиями не подсвечивает глиф, пока мышь не на ней.
        expect(bgAt(screen, 17, 0)).toBe(SELECTION_BG);

        mouse(tree, "mousemove", 3, 1);
        expect(bgAt(render(tree), 17, 1)).toBe(HOVER_BG);
    });

    it("does not underline a compact segment hidden under a glyph", async () => {
        const tree = await createTree(
            [
                { id: "top", label: "top" },
                { id: "src", label: "src/longsegment", segments: ["src", "longsegment"], actions: [EDIT] },
            ],
            12,
        );
        mouse(tree, "mousemove", 11, 1);
        const screen = render(tree);
        expect(screen.getCell(new Point(9, 1)).style & StyleFlags.Underline).toBe(0);
        mouse(tree, "mousemove", 7, 1);
        expect(render(tree).getCell(new Point(7, 1)).style & StyleFlags.Underline).toBe(StyleFlags.Underline);
    });
});
