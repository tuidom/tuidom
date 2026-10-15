import { BodyElement } from "@tuidom/elements/body/bodyElement";
import { MockTerminalBackend } from "@tuidom/testing/mockTerminalBackend";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type BoxConstraints, type Point, Size } from "../common/geometryPromitives.ts";
import type { Grid } from "../rendering/grid.ts";

import { type IFrameTimings, TuiApplication } from "./tuiApplication.ts";
import { type RenderContext, TUIElement } from "./tuiElement.ts";

// Каждая фаза кадра «стоит» своё число мс на подменённых часах: layout — 3,
// отрисовка — 5, flush в бэкенд — 2. Стили и damage-обход часы не двигают.
class SlowLeaf extends TUIElement {
    public mark = "A";

    protected override performLayout(constraints: BoxConstraints): Size {
        vi.advanceTimersByTime(3);
        return super.performLayout(constraints);
    }

    public override render(context: RenderContext): void {
        vi.advanceTimersByTime(5);
        context.setCell(0, 0, { char: this.mark });
    }
}

class SlowBackend extends MockTerminalBackend {
    public override renderFrame(grid: Grid, cursorPosition: Point): void {
        vi.advanceTimersByTime(2);
        super.renderFrame(grid, cursorPosition);
    }
}

function createApp(): { app: TuiApplication; leaf: SlowLeaf; backend: SlowBackend } {
    const backend = new SlowBackend(new Size(5, 2));
    const app = new TuiApplication(backend);
    const body = new BodyElement();
    const leaf = new SlowLeaf();
    body.setContent(leaf);
    app.root = body;
    return { app, leaf, backend };
}

describe("TuiApplication.onFrameTimings — фазы кадра", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["performance"] });
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("после каждого кадра отдаёт номер, начало и время каждой фазы", async () => {
        const { app, leaf } = createApp();
        const timings: IFrameTimings[] = [];
        app.onFrameTimings = (t) => timings.push(t);
        const startedAt = performance.now();

        app.run();
        leaf.mark = "B";
        leaf.markDirty();
        app.scheduleRender();
        await new Promise((resolve) => setImmediate(resolve));

        expect(timings).toEqual([
            { frame: 1, start: startedAt, layout: 3, style: 0, damage: 0, paint: 5, flush: 2 },
            expect.objectContaining({ frame: 2, start: startedAt + 10, paint: 5, flush: 2 }),
        ]);
        expect(app.frameCount).toBe(2);
    });

    it("без наблюдателя кадр часы не читает", () => {
        const { app } = createApp();
        const now = vi.spyOn(performance, "now");

        app.run();

        expect(now).not.toHaveBeenCalled();
        expect(app.frameCount).toBe(1);
    });
});
