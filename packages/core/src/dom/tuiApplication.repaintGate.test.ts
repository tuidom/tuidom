import { BodyElement } from "@tuidom/elements/body/bodyElement";
import { MockTerminalBackend } from "@tuidom/testing/mockTerminalBackend";
import { describe, expect, it } from "vitest";

import { Point, Size } from "../common/geometryPromitives.ts";

import { TuiApplication } from "./tuiApplication.ts";

// Гейт отложенного кадра: «есть ли что перерисовать» — это paint-грязь
// ({@link TUIElement.needsRepaint}), а НЕ layout-грязь. Layout снимает кто
// угодно: ленивый фоллбэк геттера `layoutSize` зовут хит-тест мыши
// (`elementFromPoint`), инспектор и любой виджет, измеряющий соседа. Пока гейт
// спрашивал `isLayoutDirty`, такой читатель гасил флаг посреди ожидания — и
// уже запланированный кадр не состоялся вовсе. Экран — ретейн-буфер, поэтому
// пропавший кадр оставлял старые ячейки на экране НАВСЕГДА (до следующей
// несвязанной перерисовки).

function nextImmediate(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

describe("TuiApplication — гейт отложенного кадра по paint-грязи", () => {
    it("ленивый layout из чтения layoutSize не отменяет запланированный кадр", async () => {
        const backend = new MockTerminalBackend(new Size(10, 3));
        const app = new TuiApplication(backend);
        const body = new BodyElement();
        body.title = "Hi";
        app.root = body;
        app.run();
        expect(backend.screenToString()).toContain("Hi");

        // Асинхронная смена состояния (ответ субпроцесса, таймер) планирует кадр.
        body.title = "Bye";
        body.markDirty();
        expect(app.isRenderScheduled).toBe(true);

        // ...а до кадра кто-то читает геометрию — ровно это делает хит-тест мыши.
        void body.layoutSize;
        expect(body.isLayoutDirty).toBe(false);

        await nextImmediate();

        expect(backend.screenToString()).toContain("Bye");
    });

    it("хит-тест мыши между markDirty и кадром не съедает кадр", async () => {
        const backend = new MockTerminalBackend(new Size(10, 3));
        const app = new TuiApplication(backend);
        const body = new BodyElement();
        body.title = "Hi";
        app.root = body;
        app.run();

        body.title = "Bye";
        body.markDirty();
        // Хит-тест читает layoutSize каждого элемента по пути — именно так
        // отложенный кадр терялся на паре press/release одного клика.
        body.elementFromPoint(new Point(0, 0));

        await nextImmediate();

        expect(backend.screenToString()).toContain("Bye");
    });

    it("needsRepaint снимается кадром, а не ленивым layout'ом", async () => {
        const backend = new MockTerminalBackend(new Size(10, 3));
        const app = new TuiApplication(backend);
        const body = new BodyElement();
        app.root = body;
        app.run();
        expect(body.needsRepaint).toBe(false);

        body.markDirty();
        expect(body.needsRepaint).toBe(true);

        void body.layoutSize;
        expect(body.isLayoutDirty).toBe(false);
        expect(body.needsRepaint).toBe(true);

        await nextImmediate();
        expect(body.needsRepaint).toBe(false);
    });

    it("синхронный кадр после ввода по-прежнему гасит запланированный (кадров не больше, чем нужно)", async () => {
        const backend = new MockTerminalBackend(new Size(10, 3));
        const app = new TuiApplication(backend);
        const body = new BodyElement();
        app.root = body;
        app.run();

        body.markDirty();
        backend.sendKey("a");
        const afterInput = app.frameCount;

        await nextImmediate();

        expect(app.frameCount).toBe(afterInput);
    });
});
