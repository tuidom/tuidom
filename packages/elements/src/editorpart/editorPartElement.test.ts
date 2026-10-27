import { BoxConstraints, Offset, Point, Size } from "@tuidom/core/common/geometryPromitives";
import { TUIMouseEvent } from "@tuidom/core/dom/events/tuiMouseEvent";
import { TUIElement } from "@tuidom/core/dom/tuiElement";
import { describe, expect, it } from "vitest";

import { SashElement } from "../sash/sashElement.ts";

import { EditorPartElement, MIN_GROUP_MAIN_COLS, MIN_GROUP_MAIN_ROWS } from "./editorPartElement.ts";

function panels(count: number): TUIElement[] {
    return Array.from({ length: count }, () => new TUIElement());
}

function layoutAt(part: EditorPartElement, width: number, height: number): void {
    part.localPosition = new Offset(0, 0);
    part.layout(BoxConstraints.tight(new Size(width, height)));
}

describe("EditorPartElement", () => {
    it("одна группа занимает всю полосу", () => {
        const part = new EditorPartElement();
        const [a] = panels(1);
        part.setViews([a]);
        layoutAt(part, 100, 30);

        expect(a.layoutSize).toEqual(new Size(100, 30));
        expect(a.localPosition).toEqual(new Offset(0, 0));
    });

    it("две группы делятся по весам, сумма размеров равна полосе", () => {
        const part = new EditorPartElement();
        const [a, b] = panels(2);
        part.setViews([a, b], [2, 1]);
        layoutAt(part, 90, 30);

        expect(a.layoutSize.width).toBe(60);
        expect(b.layoutSize.width).toBe(30);
        expect(b.localPosition).toEqual(new Offset(60, 0));
    });

    it("нечётная ширина раздаётся по наибольшим дробным остаткам без дыр", () => {
        const part = new EditorPartElement();
        const [a, b, c] = panels(3);
        part.setViews([a, b, c]);
        layoutAt(part, 100, 30);

        const widths = [a, b, c].map((p) => p.layoutSize.width);
        expect(widths.reduce((s, w) => s + w, 0)).toBe(100);
        expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
        expect(c.localPosition.dx).toBe(widths[0] + widths[1]);
    });

    it("min-кламп: узкая доля добирается до минимума за счёт широкой", () => {
        const part = new EditorPartElement();
        const [a, b] = panels(2);
        part.setViews([a, b], [99, 1]);
        layoutAt(part, 100, 30);

        expect(b.layoutSize.width).toBe(MIN_GROUP_MAIN_COLS);
        expect(a.layoutSize.width).toBe(100 - MIN_GROUP_MAIN_COLS);
    });

    it("полоса уже N×минимума — display-only равное деление, веса не мутируются", () => {
        const part = new EditorPartElement();
        const [a, b] = panels(2);
        part.setViews([a, b], [3, 1]);
        layoutAt(part, 30, 20);

        expect(a.layoutSize.width + b.layoutSize.width).toBe(30);
        // Веса пережили деградацию: широкая полоса вернёт пропорцию 3:1.
        layoutAt(part, 120, 20);
        expect(a.layoutSize.width).toBe(90);
        expect(b.layoutSize.width).toBe(30);
    });

    it("ряды: группы делят высоту, саш — поверх последней строки верхней", () => {
        const part = new EditorPartElement();
        const [a, b] = panels(2);
        part.setViews([a, b]);
        part.orientation = "rows";
        layoutAt(part, 80, 30);

        expect(a.layoutSize).toEqual(new Size(80, 15));
        expect(b.layoutSize).toEqual(new Size(80, 15));
        expect(b.localPosition).toEqual(new Offset(0, 15));
        // Саш лежит на последней строке ВЕРХНЕЙ группы, не на первой нижней —
        // та занята табами, и наложение отняло бы у них мышь.
        const sash = part.getChildren().find((c) => c.constructor.name === "SashElement")!;
        expect(sash.localPosition).toEqual(new Offset(0, 14));
    });

    it("саш лежит на границе групп и укладывается при каждом layout", () => {
        const part = new EditorPartElement();
        const [a, b] = panels(2);
        part.setViews([a, b]);
        layoutAt(part, 80, 30);

        const sash = part.getChildren().find((c) => c.constructor.name === "SashElement");
        expect(sash).toBeDefined();
        expect(sash!.localPosition).toEqual(new Offset(40, 0));
        expect(sash!.layoutSize).toEqual(new Size(1, 30));

        // Ресайз двигает границу — и саш обязан переехать (stale layoutSize ломает hit-test).
        layoutAt(part, 60, 30);
        expect(sash!.localPosition).toEqual(new Offset(30, 0));
    });

    it("вырожденная нулевая высота в rows — саш клампится в строку 0", () => {
        const part = new EditorPartElement();
        const [a, b] = panels(2);
        part.setViews([a, b]);
        part.orientation = "rows";
        layoutAt(part, 80, 0);

        const sash = part.getChildren().find((c) => c.constructor.name === "SashElement")!;
        expect(sash.localPosition).toEqual(new Offset(0, 0));
    });

    it("drag горизонтального саша в rows: курсор на строке Y — верхняя группа Y+1 строк", () => {
        const part = new EditorPartElement();
        const [a, b, c] = panels(3);
        part.setViews([a, b, c]);
        part.orientation = "rows";
        layoutAt(part, 80, 30);
        expect([a, b, c].map((v) => v.layoutSize.height)).toEqual([10, 10, 10]);

        const lower = part.getChildren().filter((ch) => ch.constructor.name === "SashElement")[1];
        expect(lower.localPosition).toEqual(new Offset(0, 19));
        lower.dispatchEvent(
            new TUIMouseEvent("mousedown", { button: "left", screenX: 5, screenY: 19, localX: 5, localY: 0 }),
        );
        lower.dispatchEvent(
            new TUIMouseEvent("mousemove", { button: "left", screenX: 5, screenY: 24, localX: 5, localY: 0 }),
        );
        lower.dispatchEvent(
            new TUIMouseEvent("mouseup", { button: "left", screenX: 5, screenY: 24, localX: 5, localY: 0 }),
        );

        layoutAt(part, 80, 30);
        expect(b.layoutSize.height).toBe(15);
        expect(c.layoutSize.height).toBe(5);
    });

    it("drag саша перераспределяет веса пары и зовёт onDidChangeWeights", () => {
        const part = new EditorPartElement();
        const [a, b] = panels(2);
        part.setViews([a, b]);
        layoutAt(part, 100, 30);
        let fired = 0;
        part.onDidChangeWeights = () => fired++;

        const sash = part.getChildren().find((c) => c.constructor.name === "SashElement")!;
        sash.dispatchEvent(
            new TUIMouseEvent("mousedown", { button: "left", screenX: 50, screenY: 5, localX: 0, localY: 5 }),
        );
        sash.dispatchEvent(
            new TUIMouseEvent("mousemove", { button: "left", screenX: 70, screenY: 5, localX: 0, localY: 5 }),
        );
        sash.dispatchEvent(
            new TUIMouseEvent("mouseup", { button: "left", screenX: 70, screenY: 5, localX: 0, localY: 5 }),
        );

        expect(fired).toBeGreaterThan(0);
        layoutAt(part, 100, 30);
        expect(a.layoutSize.width).toBe(70);
        expect(b.layoutSize.width).toBe(30);
    });

    it("drag саша упирается в минимум соседа", () => {
        const part = new EditorPartElement();
        const [a, b] = panels(2);
        part.setViews([a, b]);
        layoutAt(part, 100, 30);

        const sash = part.getChildren().find((c) => c.constructor.name === "SashElement")!;
        sash.dispatchEvent(
            new TUIMouseEvent("mousedown", { button: "left", screenX: 50, screenY: 5, localX: 0, localY: 5 }),
        );
        sash.dispatchEvent(
            new TUIMouseEvent("mousemove", { button: "left", screenX: 99, screenY: 5, localX: 0, localY: 5 }),
        );

        layoutAt(part, 100, 30);
        expect(b.layoutSize.width).toBe(MIN_GROUP_MAIN_COLS);
    });

    it("nudgeWeight растит группу за счёт соседа с клампом", () => {
        const part = new EditorPartElement();
        const [a, b] = panels(2);
        part.setViews([a, b]);
        layoutAt(part, 100, 30);

        part.nudgeWeight(0, 10);
        layoutAt(part, 100, 30);
        expect(a.layoutSize.width).toBe(60);
        expect(b.layoutSize.width).toBe(40);

        // Последняя группа растёт за счёт соседа слева.
        part.nudgeWeight(1, 5);
        layoutAt(part, 100, 30);
        expect(b.layoutSize.width).toBe(45);
    });

    it("evenWeights выравнивает доли", () => {
        const part = new EditorPartElement();
        const [a, b] = panels(2);
        part.setViews([a, b], [7, 1]);
        part.evenWeights();
        layoutAt(part, 100, 30);

        expect(a.layoutSize.width).toBe(50);
        expect(b.layoutSize.width).toBe(50);
    });

    it("максимизация: группа занимает всю полосу, остальные и саши скрыты", () => {
        const part = new EditorPartElement();
        const [a, b, c] = panels(3);
        part.setViews([a, b, c]);
        layoutAt(part, 90, 30);

        part.maximizedIndex = 1;
        layoutAt(part, 90, 30);

        expect(b.layoutSize).toEqual(new Size(90, 30));
        expect(b.localPosition).toEqual(new Offset(0, 0));
        expect(a.hidden).toBe(true);
        expect(c.hidden).toBe(true);
        expect(
            part
                .getChildren()
                .filter((ch) => ch.constructor.name === "SashElement")
                .every((s) => s.hidden),
        ).toBe(true);

        // Повторный тумблер возвращает полосу в прежних пропорциях.
        part.maximizedIndex = null;
        layoutAt(part, 90, 30);
        expect(a.hidden).toBe(false);
        expect(a.layoutSize.width).toBe(30);
    });

    it("canFit считает по текущему основному размеру", () => {
        const part = new EditorPartElement();
        const [a] = panels(1);
        part.setViews([a]);
        layoutAt(part, 45, 30);

        expect(part.canFit(2)).toBe(true); // 2×20 = 40 ≤ 45
        expect(part.canFit(3)).toBe(false); // 3×20 = 60 > 45
    });

    it("смена оси сохраняет веса", () => {
        const part = new EditorPartElement();
        const [a, b] = panels(2);
        part.setViews([a, b], [2, 1]);
        layoutAt(part, 90, 30);
        expect(a.layoutSize.width).toBe(60);

        part.orientation = "rows";
        layoutAt(part, 90, 30);
        expect(a.layoutSize).toEqual(new Size(90, 20));
        expect(b.layoutSize).toEqual(new Size(90, 10));
    });

    it("невалидный maximizedIndex клампится в null, повтор того же значения — no-op", () => {
        const part = new EditorPartElement();
        const [a, b] = panels(2);
        part.setViews([a, b]);

        // Вне диапазона и отрицательный — клампятся в null; полоса уже в null —
        // ранний выход без каких-либо перестроек детей.
        part.maximizedIndex = 5;
        expect(part.maximizedIndex).toBe(null);
        part.maximizedIndex = -1;
        expect(part.maximizedIndex).toBe(null);

        part.maximizedIndex = 1;
        expect(part.maximizedIndex).toBe(1);
        // Повторная установка того же индекса — no-op (ранний return).
        part.maximizedIndex = 1;
        expect(part.maximizedIndex).toBe(1);
        expect(a.hidden).toBe(true);
    });

    it("evenWeights на пустой полосе — no-op без события", () => {
        const part = new EditorPartElement();
        let fired = 0;
        part.onDidChangeWeights = () => fired++;

        part.evenWeights();

        expect(fired).toBe(0);
        expect(part.weights).toEqual([]);
    });

    it("nudgeWeight: одна группа, кривой индекс и вызов до layout — no-op", () => {
        const part = new EditorPartElement();
        let fired = 0;
        part.onDidChangeWeights = () => fired++;

        // Одна группа: соседа нет, двигать нечего.
        const [single] = panels(1);
        part.setViews([single]);
        part.nudgeWeight(0, 5);
        expect(fired).toBe(0);

        const [a, b] = panels(2);
        part.setViews([a, b]);
        // Индекс вне диапазона.
        part.nudgeWeight(-1, 5);
        part.nudgeWeight(2, 5);
        // До первого layout размеров нет — двигать не от чего.
        part.nudgeWeight(0, 5);
        expect(fired).toBe(0);
        expect(part.weights).toEqual([0.5, 0.5]);
    });

    it("canFit при вырожденном нулевом основном размере не отказывает — рестор решает сам", () => {
        const part = new EditorPartElement();
        part.setViews(panels(2));
        layoutAt(part, 0, 20);

        expect(part.canFit(100)).toBe(true);
    });

    it("setViews([]) опустошает полосу, layout пустой полосы — no-op", () => {
        const part = new EditorPartElement();
        part.setViews(panels(2));
        layoutAt(part, 80, 30);

        part.setViews([]);
        expect(part.weights).toEqual([]);

        // Пустая полоса укладывается без детей и не падает.
        layoutAt(part, 80, 30);
        expect(part.getChildren()).toEqual([]);
    });

    it("drag саша до первого layout — no-op без события", () => {
        const part = new EditorPartElement();
        part.setViews(panels(2));
        let fired = 0;
        part.onDidChangeWeights = () => fired++;

        const sash = part.getChildren().find((c) => c.constructor.name === "SashElement")!;
        sash.dispatchEvent(
            new TUIMouseEvent("mousedown", { button: "left", screenX: 40, screenY: 5, localX: 0, localY: 5 }),
        );
        sash.dispatchEvent(
            new TUIMouseEvent("mousemove", { button: "left", screenX: 50, screenY: 5, localX: 0, localY: 5 }),
        );
        sash.dispatchEvent(
            new TUIMouseEvent("mouseup", { button: "left", screenX: 50, screenY: 5, localX: 0, localY: 5 }),
        );

        expect(fired).toBe(0);
        expect(part.weights).toEqual([0.5, 0.5]);
    });

    it("в тесноте нечётный остаток достаётся первым группам", () => {
        const part = new EditorPartElement();
        const [a, b] = panels(2);
        part.setViews([a, b]);
        // 31 < 2×20 — display-only равное деление, остаток 1 уходит первой группе.
        layoutAt(part, 31, 20);

        expect(a.layoutSize.width).toBe(16);
        expect(b.layoutSize.width).toBe(15);
    });

    it("inspectState отдаёт ось, веса и максимизацию", () => {
        const part = new EditorPartElement();
        const [a, b] = panels(2);
        part.setViews([a, b], [1, 3]);

        expect(part.inspectState()).toEqual({
            orientation: "columns",
            weights: [0.25, 0.75],
            maximizedIndex: null,
            groupCount: 2,
        });
    });

    describe("видимый разделитель (separatorColorVar)", () => {
        function separated(count: number, weights?: number[]): { part: EditorPartElement; views: TUIElement[] } {
            const part = new EditorPartElement();
            part.separatorColorVar = "test.separator";
            const views = panels(count);
            part.setViews(views, weights);
            return { part, views };
        }

        function sashesOf(part: EditorPartElement): SashElement[] {
            return part.getChildren().filter((ch): ch is SashElement => ch instanceof SashElement);
        }

        function drag(sash: SashElement, from: Point, to: Point): void {
            const at = (type: "mousedown" | "mousemove" | "mouseup", p: Point) =>
                new TUIMouseEvent(type, { button: "left", screenX: p.x, screenY: p.y, localX: 0, localY: 0 });
            sash.dispatchEvent(at("mousedown", from));
            sash.dispatchEvent(at("mousemove", to));
            sash.dispatchEvent(at("mouseup", to));
        }

        it("по умолчанию выключен, повтор того же значения — no-op", () => {
            const part = new EditorPartElement();
            expect(part.separatorColorVar).toBeNull();
            part.setViews(panels(2));
            part.separatorColorVar = "test.separator";
            part.separatorColorVar = "test.separator";
            expect(part.separatorColorVar).toBe("test.separator");
            expect(sashesOf(part).map((s) => s.restColorVar)).toEqual(["test.separator"]);
            part.separatorColorVar = null;
            expect(sashesOf(part).map((s) => s.restColorVar)).toEqual([null]);
        });

        it("columns: колонка разделителя между группами, саш на ней, сумма — ширина полосы", () => {
            const { part, views } = separated(2);
            layoutAt(part, 101, 30);
            const [a, b] = views;

            expect(a.layoutSize).toEqual(new Size(50, 30));
            expect(b.layoutSize).toEqual(new Size(50, 30));
            expect(b.localPosition).toEqual(new Offset(51, 0));
            const [sash] = sashesOf(part);
            expect(sash.localPosition).toEqual(new Offset(50, 0));
            expect(sash.layoutSize).toEqual(new Size(1, 30));
            expect(sash.restColorVar).toBe("test.separator");
        });

        it("columns: N групп — N ширин плюс N−1 разделителей, без перекрытий", () => {
            const { part, views } = separated(3);
            layoutAt(part, 92, 10);

            expect(views.map((v) => v.layoutSize.width)).toEqual([30, 30, 30]);
            expect(views.map((v) => v.localPosition.dx)).toEqual([0, 31, 62]);
            expect(sashesOf(part).map((s) => s.localPosition.dx)).toEqual([30, 61]);
        });

        it("rows: строка разделителя не съедает строк соседних групп", () => {
            const { part, views } = separated(2);
            part.orientation = "rows";
            layoutAt(part, 80, 31);
            const [a, b] = views;

            expect(a.layoutSize).toEqual(new Size(80, 15));
            expect(b.layoutSize).toEqual(new Size(80, 15));
            expect(b.localPosition).toEqual(new Offset(0, 16));
            const [sash] = sashesOf(part);
            expect(sash.localPosition).toEqual(new Offset(0, 15));
            expect(sash.layoutSize).toEqual(new Size(80, 1));
        });

        it("смена оси пересоздаёт саши с тем же цветом разделителя", () => {
            const { part } = separated(2);
            part.orientation = "rows";
            expect(sashesOf(part).map((s) => s.restColorVar)).toEqual(["test.separator"]);
        });

        it("drag в columns ставит разделитель под курсор", () => {
            const { part, views } = separated(2);
            layoutAt(part, 101, 30);
            let fired = 0;
            part.onDidChangeWeights = () => fired++;

            drag(sashesOf(part)[0], new Point(50, 5), new Point(70, 5));

            expect(fired).toBe(1);
            layoutAt(part, 101, 30);
            expect(views[0].layoutSize.width).toBe(70);
            expect(views[1].layoutSize.width).toBe(30);
            expect(sashesOf(part)[0].localPosition.dx).toBe(70);
        });

        it("drag второго саша учитывает разделители левее", () => {
            const { part, views } = separated(3);
            layoutAt(part, 92, 10);

            drag(sashesOf(part)[1], new Point(61, 5), new Point(66, 5));

            layoutAt(part, 92, 10);
            expect(views.map((v) => v.layoutSize.width)).toEqual([30, 35, 25]);
            expect(sashesOf(part)[1].localPosition.dx).toBe(66);
        });

        it("drag в rows ставит разделитель на строку курсора", () => {
            const { part, views } = separated(3);
            part.orientation = "rows";
            layoutAt(part, 80, 32);
            expect(views.map((v) => v.layoutSize.height)).toEqual([10, 10, 10]);
            expect(sashesOf(part).map((s) => s.localPosition.dy)).toEqual([10, 21]);

            drag(sashesOf(part)[1], new Point(5, 21), new Point(5, 26));

            layoutAt(part, 80, 32);
            expect(views.map((v) => v.layoutSize.height)).toEqual([10, 15, 5]);
            expect(sashesOf(part)[1].localPosition.dy).toBe(26);
        });

        it("drag упирается в минимум соседа", () => {
            const { part, views } = separated(2);
            layoutAt(part, 101, 30);

            drag(sashesOf(part)[0], new Point(50, 5), new Point(100, 5));

            layoutAt(part, 101, 30);
            expect(views[1].layoutSize.width).toBe(MIN_GROUP_MAIN_COLS);
            expect(views[0].layoutSize.width).toBe(100 - MIN_GROUP_MAIN_COLS);
        });

        it("nudgeWeight клампится по минимуму без клеток разделителя", () => {
            const { part, views } = separated(2);
            part.orientation = "rows";
            layoutAt(part, 80, 21);

            part.nudgeWeight(0, 100);

            layoutAt(part, 80, 21);
            expect(views[1].layoutSize.height).toBe(MIN_GROUP_MAIN_ROWS);
            expect(views[0].layoutSize.height).toBe(20 - MIN_GROUP_MAIN_ROWS);
        });

        it("canFit учитывает разделители: count×min + (count−1) ≤ main", () => {
            const { part } = separated(1);
            layoutAt(part, 41, 30);
            expect(part.canFit(2)).toBe(true); // 2×20 + 1 = 41
            layoutAt(part, 40, 30);
            expect(part.canFit(2)).toBe(false); // 41 > 40

            part.orientation = "rows";
            layoutAt(part, 40, 11);
            expect(part.canFit(2)).toBe(true); // 2×5 + 1 = 11
            expect(part.canFit(3)).toBe(false); // 3×5 + 2 = 17
        });

        it("одна группа — без разделителя, на всю полосу", () => {
            const { part, views } = separated(1);
            layoutAt(part, 80, 30);
            expect(views[0].layoutSize).toEqual(new Size(80, 30));
            expect(sashesOf(part)).toEqual([]);
        });

        it("максимизация — группа на всю полосу без разделителей, восстановление их возвращает", () => {
            const { part, views } = separated(2);
            layoutAt(part, 101, 30);

            part.maximizedIndex = 1;
            layoutAt(part, 101, 30);
            expect(views[1].layoutSize).toEqual(new Size(101, 30));
            expect(sashesOf(part).every((s) => s.hidden)).toBe(true);

            part.maximizedIndex = null;
            layoutAt(part, 101, 30);
            expect(views[0].layoutSize.width).toBe(50);
            expect(sashesOf(part)[0].hidden).toBe(false);
            expect(sashesOf(part)[0].localPosition.dx).toBe(50);
        });

        it("веса — доли групп без клеток разделителей и переживают ресайз", () => {
            const { part, views } = separated(2, [3, 1]);
            layoutAt(part, 81, 30);
            expect(views.map((v) => v.layoutSize.width)).toEqual([60, 20]);
            expect(part.weights).toEqual([0.75, 0.25]);

            layoutAt(part, 161, 30);
            expect(views.map((v) => v.layoutSize.width)).toEqual([120, 40]);
        });

        it("узкая полоса: разделители по одной клетке, сжимаются группы", () => {
            const { part, views } = separated(3);
            layoutAt(part, 32, 10);

            expect(views.map((v) => v.layoutSize.width)).toEqual([10, 10, 10]);
            expect(sashesOf(part).map((s) => s.localPosition.dx)).toEqual([10, 21]);
        });
    });
});
