import { Point } from "@tuidom/core/common/geometryPromitives";
import type { MockTerminalBackend } from "@tuidom/testing/mockTerminalBackend";
import { renderElement } from "@tuidom/testing/renderElement";
import { describe, expect, it } from "vitest";

import { InputElement } from "./inputElement.ts";
import { InputState } from "./inputState.ts";

function renderInput(input: InputElement, width: number): MockTerminalBackend {
    return renderElement(input, width, 1, { resolveStyles: true });
}

describe("InputElement — маска (поле пароля)", () => {
    it("рисует по символу маски на символ значения, самого текста на экране нет", () => {
        const input = new InputElement();
        input.maskChar = "•";
        input.inputState.value = "hunter2";
        const row = renderInput(input, 20).getTextAt(new Point(0, 0), 20);
        expect(row.trimEnd()).toBe("•".repeat(7));
        expect(row).not.toContain("hunter");
    });

    it("без маски рисует сам текст", () => {
        const input = new InputElement();
        input.inputState.value = "hunter2";
        const row = renderInput(input, 20).getTextAt(new Point(0, 0), 20);
        expect(row.trimEnd()).toBe("hunter2");
    });

    it("маска считает графемы, а не code units: суррогатная пара — один символ маски", () => {
        const input = new InputElement();
        input.maskChar = "*";
        // «😀a» — эмодзи это одна графема из двух code units.
        input.inputState.value = "\u{1F600}a";
        const row = renderInput(input, 20).getTextAt(new Point(0, 0), 20);
        expect(row.trimEnd()).toBe("**");
    });

    it("пустое значение под маской показывает плейсхолдер, а не маску", () => {
        const input = new InputElement();
        input.maskChar = "•";
        input.placeholder = "пароль";
        const row = renderInput(input, 20).getTextAt(new Point(0, 0), 20);
        expect(row).toContain("пароль");
        expect(row).not.toContain("•");
    });

    it("выделение под маской красится по маске и секрет не проступает", () => {
        const state = new InputState();
        state.value = "secret";
        state.selectAll();
        const input = new InputElement(state);
        input.maskChar = "•";
        const row = renderInput(input, 20).getTextAt(new Point(0, 0), 20);
        expect(row.trimEnd()).toBe("•".repeat(6));
        expect(row).not.toContain("secret");
    });

    it("частичное выделение под маской не сдвигает хвост", () => {
        const state = new InputState();
        state.value = "abcdef";
        state.moveCursorToStart();
        state.selectRight();
        state.selectRight();
        const input = new InputElement(state);
        input.maskChar = "#";
        const row = renderInput(input, 20).getTextAt(new Point(0, 0), 20);
        expect(row.trimEnd()).toBe("######");
    });

    it("горизонтальный скролл под маской ведёт курсор: видно хвост маски, а не голову", () => {
        const state = new InputState();
        state.value = "ABCDEFGHIJ"; // курсор в конце
        const input = new InputElement(state);
        input.maskChar = "•";
        // Ширина 4 при 10 символах маски — скролл обязан уехать к курсору:
        // видно три последних символа маски, четвёртая колонка под курсором.
        const row = renderInput(input, 4).getTextAt(new Point(0, 0), 4);
        expect(row).toBe("••• ");
        expect(row).not.toContain("A");
    });

    it("многокодовая маска (эмодзи) не путает смещения выделения", () => {
        const state = new InputState();
        state.value = "ab";
        state.selectAll();
        const input = new InputElement(state);
        input.maskChar = "\u{1F512}"; // 🔒 — два code unit'а
        expect(() => renderInput(input, 20)).not.toThrow();
        expect(input.inspectState()).toMatchObject({
            value: "\u{1F512}\u{1F512}",
            // Курсор за второй графемой — это 4 code unit'а маски.
            cursorOffset: 4,
        });
    });
});

describe("InputElement.inspectState — под маской", () => {
    it("отдаёт маску вместо секрета и смещение курсора в ней", () => {
        const input = new InputElement();
        input.maskChar = "•";
        input.inputState.value = "hunter2";
        expect(input.inspectState()).toEqual({
            value: "•••••••",
            cursorOffset: 7,
            hasSelection: false,
            showsPlaceholder: false,
        });
    });

    it("без маски отдаёт настоящее значение", () => {
        const input = new InputElement();
        input.inputState.value = "hunter2";
        expect(input.inspectState()).toMatchObject({ value: "hunter2", cursorOffset: 7 });
    });

    it("маска не трогает модель: onChange и inputState видят настоящий текст", () => {
        const seen: string[] = [];
        const input = new InputElement();
        input.maskChar = "•";
        input.onChange = (value) => seen.push(value);
        input.inputState.insert("hi");
        input.onChange("hi");
        expect(seen).toEqual(["hi"]);
        expect(input.inputState.value).toBe("hi");
    });
});
