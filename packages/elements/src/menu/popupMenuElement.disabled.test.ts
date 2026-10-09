import { Point, Size } from "@tuidom/core/common/geometryPromitives";
import { STYLE_TOKEN_DEFAULTS } from "@tuidom/core/dom/styles/styleTokens";
import { TuiApplication } from "@tuidom/core/dom/tuiApplication";
import { TUIElement } from "@tuidom/core/dom/tuiElement";
import { MockTerminalBackend } from "@tuidom/testing/mockTerminalBackend";
import { describe, expect, it, vi } from "vitest";

import { BodyElement } from "../body/bodyElement.ts";
import { VStackElement } from "../layout/vStackElement.ts";

import type { MenuBarItem } from "./menuBarElement.ts";
import { MenuBarElement } from "./menuBarElement.ts";

// Недоступный пункт меню (`disabled`, `precondition` эталона VS Code): цвет
// `disabledForeground`, клавиатура пропускает, клик и ховер ничего не делают.

class FocusableChild extends TUIElement {
    public constructor() {
        super();
        this.focusable = true;
    }

    public render(): void {
        // noop
    }
}

function setup(items: MenuBarItem[]): { backend: MockTerminalBackend } {
    const backend = new MockTerminalBackend(new Size(40, 15));
    const app = new TuiApplication(backend);
    const body = new BodyElement();
    const stack = new VStackElement();
    stack.addChild(new FocusableChild(), { width: "fill", height: 3 });
    body.setMenuBar(new MenuBarElement(items));
    body.setContent(stack);
    app.root = body;
    app.run();
    return { backend };
}

function mouse(backend: MockTerminalBackend, action: "move" | "press" | "release", x: number, y: number): void {
    backend.simulateMouse({
        kind: "mouse",
        button: action === "move" ? "none" : "left",
        action,
        x: x + 1,
        y: y + 1,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        raw: "",
    });
}

const SELECTED = STYLE_TOKEN_DEFAULTS["menu.selectionBackground"];

// Попап под «File»: рамка y=1, пункты с y=2; содержимое с x=3.
describe("PopupMenuElement — недоступный пункт", () => {
    it("рисуется disabledForeground вместе с шорткатом; доступный — обычным цветом", () => {
        const { backend } = setup([
            {
                label: "File",
                entries: [
                    { label: "Run", shortcut: "F5" },
                    { label: "Stop", shortcut: "F6", disabled: true },
                ],
            },
        ]);
        backend.sendKey("Tab");
        backend.sendKey("ArrowDown");
        expect(backend.getFgAt(new Point(4, 3))).toBe(STYLE_TOKEN_DEFAULTS.disabledForeground);
        expect(backend.getFgAt(new Point(11, 3))).toBe(STYLE_TOKEN_DEFAULTS.disabledForeground);
        expect(backend.getFgAt(new Point(4, 2))).not.toBe(STYLE_TOKEN_DEFAULTS.disabledForeground);
    });

    it("выделение при открытии и стрелки пропускают недоступные; Enter запускает доступный", () => {
        const run = vi.fn();
        const { backend } = setup([
            {
                label: "File",
                entries: [
                    { label: "A", disabled: true },
                    { label: "B", onSelect: run },
                    { label: "C", disabled: true },
                ],
            },
        ]);
        backend.sendKey("Tab");
        backend.sendKey("ArrowDown");
        expect(backend.getBgAt(new Point(3, 3))).toBe(SELECTED);
        backend.sendKey("ArrowDown");
        expect(backend.getBgAt(new Point(3, 3))).toBe(SELECTED);
        backend.sendKey("ArrowUp");
        expect(backend.getBgAt(new Point(3, 3))).toBe(SELECTED);
        expect(backend.getBgAt(new Point(3, 2))).not.toBe(SELECTED);
        expect(backend.getBgAt(new Point(3, 4))).not.toBe(SELECTED);
        backend.sendKey("Enter");
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("клик и ховер по недоступному ничего не делают", () => {
        const stop = vi.fn();
        const { backend } = setup([
            {
                label: "File",
                entries: [{ label: "Run" }, { label: "Stop", disabled: true, onSelect: stop }],
            },
        ]);
        backend.sendKey("Tab");
        backend.sendKey("ArrowDown");
        mouse(backend, "move", 4, 3);
        expect(backend.getBgAt(new Point(3, 2))).toBe(SELECTED);
        expect(backend.getBgAt(new Point(3, 3))).not.toBe(SELECTED);
        mouse(backend, "press", 4, 3);
        mouse(backend, "release", 4, 3);
        expect(stop).not.toHaveBeenCalled();
    });

    it("все пункты недоступны — выделения нет, стрелки и Enter — без эффекта", () => {
        const stop = vi.fn();
        const { backend } = setup([{ label: "File", entries: [{ label: "Stop", disabled: true, onSelect: stop }] }]);
        backend.sendKey("Tab");
        backend.sendKey("ArrowDown");
        backend.sendKey("ArrowDown");
        backend.sendKey("Enter");
        expect(backend.getBgAt(new Point(3, 2))).not.toBe(SELECTED);
        expect(stop).not.toHaveBeenCalled();
    });
});
