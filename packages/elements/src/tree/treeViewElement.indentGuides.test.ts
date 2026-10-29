import { packRgb } from "@tuidom/core/common/colorUtils";
import { BoxConstraints, Offset, Point, Size } from "@tuidom/core/common/geometryPromitives";
import { TUIKeyboardEvent } from "@tuidom/core/dom/events/tuiKeyboardEvent";
import { TUIMouseEvent, type TUIMouseEventType } from "@tuidom/core/dom/events/tuiMouseEvent";
import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it } from "vitest";

import type { ITreeDataProvider, ITreeItem } from "./iTreeDataProvider.ts";
import { type TreeIndentGuides, TreeViewElement } from "./treeViewElement.ts";

interface TestNode {
    id: string;
    children?: TestNode[];
}

function createProvider(roots: TestNode[]): ITreeDataProvider<TestNode> {
    return {
        getTreeItem(element: TestNode): ITreeItem {
            return { label: element.id, collapsible: (element.children?.length ?? 0) > 0 };
        },
        getChildren(element?: TestNode): TestNode[] {
            return element ? (element.children ?? []) : roots;
        },
        getKey(element: TestNode): string {
            return element.id;
        },
    };
}

const C: TestNode = { id: "c" };
const D: TestNode = { id: "d" };
const B: TestNode = { id: "b", children: [C, D] };
const E: TestNode = { id: "e" };
const A: TestNode = { id: "a", children: [B, E] };
const F: TestNode = { id: "f" };
// row 0: a (0), row 1: b (1), row 2: c (2), row 3: d (2), row 4: e (1), row 5: f (0)
const ROOTS: TestNode[] = [A, F];

const STROKE = packRgb(0x58, 0x58, 0x58);
const INACTIVE_STROKE = packRgb(0x22, 0x22, 0x22);
const ACTIVE_SELECTION_BG = packRgb(4, 57, 94);
const HOVER_BG = packRgb(42, 45, 46);
const CUT_FG = packRgb(150, 150, 150);
const GUIDE = "│";

async function createTree(
    mode: TreeIndentGuides | (() => TreeIndentGuides),
    options: { leftPadding?: number; size?: Size; expand?: TestNode[] } = {},
): Promise<{ tree: TreeViewElement<TestNode>; app: TestApp }> {
    const size = options.size ?? new Size(20, 8);
    const tree = new TreeViewElement(createProvider(ROOTS), {
        leftPadding: options.leftPadding ?? 1,
        renderIndentGuides: mode,
    });
    tree.setStyleVars({
        "tree.indentGuidesStroke": STROKE,
        "tree.inactiveIndentGuidesStroke": INACTIVE_STROKE,
        "list.activeSelectionBackground": ACTIVE_SELECTION_BG,
        "list.hoverBackground": HOVER_BG,
        "list.deemphasizedForeground": CUT_FG,
    });
    const app = TestApp.createWithContent(tree, size);
    tree.localPosition = new Offset(0, 0);
    tree.layout(BoxConstraints.tight(size));
    tree.focus();
    await tree.refresh();
    await tree.expandElements(options.expand ?? [A, B]);
    return { tree, app };
}

function mouse(type: TUIMouseEventType, localX: number, localY: number): TUIMouseEvent {
    return new TUIMouseEvent(type, { button: "left", screenX: localX, screenY: localY, localX, localY });
}

function key(name: string, shiftKey = false): TUIKeyboardEvent {
    return new TUIKeyboardEvent("keypress", { key: name, shiftKey });
}

/** Columns of the guides on screen row `y` with their foreground colours. */
function guidesAt(app: TestApp, y: number, width = 20): Record<number, number> {
    app.render();
    const guides: Record<number, number> = {};
    for (let x = 0; x < width; x++) {
        const position = new Point(x, y);
        if (app.backend.getTextAt(position, 1) === GUIDE) guides[x] = app.backend.getFgAt(position);
    }
    return guides;
}

describe("TreeViewElement indent guides", () => {
    it("draws no guides by default", async () => {
        const tree = new TreeViewElement(createProvider(ROOTS));
        expect(tree.renderIndentGuides).toBe("none");
        const app = TestApp.createWithContent(tree, new Size(20, 8));
        tree.layout(BoxConstraints.tight(new Size(20, 8)));
        await tree.refresh();
        await tree.expandElements([A, B]);
        for (let y = 0; y < 6; y++) expect(guidesAt(app, y)).toEqual({});
    });

    it("mode none keeps the rows free of guides", async () => {
        const { tree, app } = await createTree("none");
        await tree.reveal([A, B, C]);
        tree.dispatchEvent(mouse("mousemove", 5, 2));
        for (let y = 0; y < 6; y++) expect(guidesAt(app, y)).toEqual({});
    });

    it("always: every ancestor gets a guide in its twistie column, the cursor's parent guide is active", async () => {
        const { tree, app } = await createTree("always");
        await tree.reveal([A, B, C]);
        expect(guidesAt(app, 0)).toEqual({});
        expect(guidesAt(app, 1)).toEqual({ 1: INACTIVE_STROKE });
        expect(guidesAt(app, 2)).toEqual({ 1: INACTIVE_STROKE, 3: STROKE });
        expect(guidesAt(app, 3)).toEqual({ 1: INACTIVE_STROKE, 3: STROKE });
        expect(guidesAt(app, 4)).toEqual({ 1: INACTIVE_STROKE });
        expect(guidesAt(app, 5)).toEqual({});
        // Guides take only indent spaces: the label stays intact.
        expect(app.backend.getTextAt(new Point(1, 2), 7)).toBe(`${GUIDE} ${GUIDE}   c`);
    });

    it("an expanded folder under the cursor activates its own guide", async () => {
        const { tree, app } = await createTree("always");
        await tree.reveal([A, B]);
        expect(guidesAt(app, 2)).toEqual({ 1: INACTIVE_STROKE, 3: STROKE });
        expect(guidesAt(app, 4)).toEqual({ 1: INACTIVE_STROKE });

        tree.focusFirst();
        expect(guidesAt(app, 1)).toEqual({ 1: STROKE });
        expect(guidesAt(app, 2)).toEqual({ 1: STROKE, 3: INACTIVE_STROKE });
    });

    it("a leaf at the top level activates nothing", async () => {
        const { tree, app } = await createTree("always");
        tree.focusLast();
        expect(guidesAt(app, 2)).toEqual({ 1: INACTIVE_STROKE, 3: INACTIVE_STROKE });
    });

    it("a leaf's sibling folder owns no active guide: the leaf activates its parent", async () => {
        const { tree, app } = await createTree("always");
        await tree.reveal([A, E]);
        expect(guidesAt(app, 2)).toEqual({ 1: STROKE, 3: INACTIVE_STROKE });
        expect(guidesAt(app, 4)).toEqual({ 1: STROKE });
    });

    it("the active guide follows the keyboard cursor at once", async () => {
        const { tree, app } = await createTree("onHover");
        await tree.reveal([A, B, D]);
        expect(guidesAt(app, 3)).toEqual({ 3: STROKE });

        tree.dispatchEvent(key("ArrowDown"));
        expect(guidesAt(app, 3)).toEqual({ 1: STROKE });
        expect(guidesAt(app, 4)).toEqual({ 1: STROKE });
    });

    it("every selected row activates its guide", async () => {
        const { tree, app } = await createTree("onHover");
        await tree.reveal([A, B, D]);
        tree.dispatchEvent(key("ArrowDown", true));
        // d activates b's guide, e activates a's guide.
        expect(guidesAt(app, 3)).toEqual({ 1: STROKE, 3: STROKE });
    });

    it("onHover: inactive guides appear while the pointer is inside the tree and fade on mouseleave", async () => {
        const { tree, app } = await createTree("onHover");
        await tree.reveal([A, B, C]);
        expect(guidesAt(app, 2)).toEqual({ 3: STROKE });
        expect(guidesAt(app, 4)).toEqual({});

        // Over the empty area below the rows.
        tree.dispatchEvent(mouse("mousemove", 2, 7));
        expect(guidesAt(app, 2)).toEqual({ 1: INACTIVE_STROKE, 3: STROKE });
        expect(guidesAt(app, 4)).toEqual({ 1: INACTIVE_STROKE });

        tree.dispatchEvent(mouse("mouseleave", 2, 7));
        expect(guidesAt(app, 2)).toEqual({ 3: STROKE });
        expect(guidesAt(app, 4)).toEqual({});
    });

    it("onHover keeps the active guide without focus", async () => {
        const { tree, app } = await createTree("onHover");
        await tree.reveal([A, B, C]);
        tree.blur();
        expect(guidesAt(app, 2)).toEqual({ 3: STROKE });
    });

    it("reads a function option on every render", async () => {
        let mode: TreeIndentGuides = "none";
        const { tree, app } = await createTree(() => mode);
        await tree.reveal([A, B, C]);
        expect(guidesAt(app, 2)).toEqual({});

        mode = "always";
        tree.markDirty();
        expect(guidesAt(app, 2)).toEqual({ 1: INACTIVE_STROKE, 3: STROKE });
    });

    it("a property change applies after markDirty", async () => {
        const { tree, app } = await createTree("none");
        await tree.reveal([A, B, C]);
        tree.renderIndentGuides = "always";
        tree.markDirty();
        expect(guidesAt(app, 4)).toEqual({ 1: INACTIVE_STROKE });
    });

    it("a collapsed folder has no guide", async () => {
        const { app } = await createTree("always", { expand: [] });
        for (let y = 0; y < 2; y++) expect(guidesAt(app, y)).toEqual({});
    });

    it("leftPadding 0 puts the top-level guide into column 0", async () => {
        const { tree, app } = await createTree("always", { leftPadding: 0 });
        await tree.reveal([A, B, C]);
        expect(guidesAt(app, 2)).toEqual({ 0: INACTIVE_STROKE, 2: STROKE });
    });

    it("guides scroll horizontally with the content", async () => {
        const { tree, app } = await createTree("always", { size: new Size(4, 8) });
        await tree.reveal([A, B, C]);
        tree.scrollTo(2, 0);
        expect(guidesAt(app, 2, 4)).toEqual({ 1: STROKE });
    });

    it("an ancestor scrolled above the viewport keeps its guide on visible descendants", async () => {
        const { tree, app } = await createTree("always", { size: new Size(20, 2) });
        await tree.reveal([A, B, D]);
        expect(tree.scrollTop).toBe(2);
        expect(guidesAt(app, 0)).toEqual({ 1: INACTIVE_STROKE, 3: STROKE });
        expect(guidesAt(app, 1)).toEqual({ 1: INACTIVE_STROKE, 3: STROKE });
    });

    it("the guide cell takes the background of its row", async () => {
        const { tree, app } = await createTree("always");
        await tree.reveal([A, B, C]);
        tree.dispatchEvent(mouse("mousemove", 8, 3));
        app.render();
        expect(app.backend.getBgAt(new Point(3, 2))).toBe(ACTIVE_SELECTION_BG);
        expect(app.backend.getBgAt(new Point(3, 3))).toBe(HOVER_BG);
    });

    it("a cut row keeps the regular guide colour", async () => {
        const { tree, app } = await createTree("always");
        await tree.reveal([A, B, C]);
        tree.setCutKeys(new Set(["d"]));
        expect(guidesAt(app, 3)).toEqual({ 1: INACTIVE_STROKE, 3: STROKE });
    });
});
