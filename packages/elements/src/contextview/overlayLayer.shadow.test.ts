import { compositeOver, packRgb } from "@tuidom/core/common/colorUtils";
import { Point, Size } from "@tuidom/core/common/geometryPromitives";
import { STYLE_TOKEN_DEFAULTS } from "@tuidom/core/dom/styles/styleTokens";
import { TestApp } from "@tuidom/testing/TestApp";
import { describe, expect, it } from "vitest";

import { BoxElement } from "../layout/boxElement.ts";
import { TextLabelElement } from "../text/textLabelElement.ts";

const CONTENT_BG = packRgb(30, 30, 46);
const CONTENT_FG = packRgb(205, 214, 244);
const SHADOW = STYLE_TOKEN_DEFAULTS["widget.shadow"];

function createApp(): TestApp {
    // Контент красит весь экран: под тенью должны лежать непрозрачные ячейки.
    const content = new BoxElement();
    content.style = { fg: CONTENT_FG, bg: CONTENT_BG };
    return TestApp.createWithContent(content, new Size(30, 12));
}

/** Попап 5×1 (по тексту): в (4,2) — правая колонка x=9, нижняя строка y=3. */
function createPopup(): TextLabelElement {
    const popup = new TextLabelElement("popup");
    popup.style = { fg: CONTENT_FG, bg: CONTENT_BG };
    return popup;
}

describe("OverlayLayer — тень сессии", () => {
    it("shadow: true затемняет колонку справа и строку снизу от попапа", () => {
        const app = createApp();
        const popup = createPopup();
        app.root.overlayLayer.createSession(popup, new Point(4, 2), {
            visible: true,
            shadow: true,
            pointerPolicy: "passthrough",
        });
        app.render();

        expect(popup.shadow).toBe(true);
        expect(popup.layoutSize).toEqual(new Size(5, 1));
        const shadedBg = compositeOver(SHADOW, CONTENT_BG);
        const shadedFg = compositeOver(SHADOW, CONTENT_FG);
        expect(app.backend.getBgAt(new Point(9, 3))).toBe(shadedBg); // правая колонка (угол)
        expect(app.backend.getBgAt(new Point(5, 3))).toBe(shadedBg); // нижняя строка
        expect(app.backend.getFgAt(new Point(5, 3))).toBe(shadedFg); // глиф под тенью затемнён
        expect(app.backend.getBgAt(new Point(4, 3))).toBe(CONTENT_BG); // левый нижний угол — вне тени
        expect(app.backend.getBgAt(new Point(9, 2))).toBe(CONTENT_BG); // правый верхний угол — вне тени
        expect(app.backend.getBgAt(new Point(6, 2))).toBe(CONTENT_BG); // сам попап
    });

    it("по умолчанию тени нет", () => {
        const app = createApp();
        const popup = createPopup();
        app.root.overlayLayer.createSession(popup, new Point(4, 2), { visible: true, pointerPolicy: "passthrough" });
        app.render();

        expect(popup.shadow).toBe(false);
        expect(app.backend.getBgAt(new Point(5, 3))).toBe(CONTENT_BG);
        expect(app.backend.getBgAt(new Point(9, 3))).toBe(CONTENT_BG);
    });

    it("shadow не задан в опциях — остаётся выставленный владельцем element.shadow", () => {
        const app = createApp();
        const popup = createPopup();
        popup.shadow = true;
        app.root.overlayLayer.createSession(popup, new Point(4, 2), { visible: true, pointerPolicy: "passthrough" });
        app.render();

        expect(popup.shadow).toBe(true);
        expect(app.backend.getBgAt(new Point(5, 3))).toBe(compositeOver(SHADOW, CONTENT_BG));
    });

    it("перерисовка виджета под полосой тени не пробивает в ней дыру", () => {
        const app = createApp();
        // Нижний оверлей лежит ровно под будущей тенью попапа: (5,3) 5×1.
        const under = new TextLabelElement("under");
        under.style = { fg: CONTENT_FG, bg: CONTENT_BG };
        app.root.overlayLayer.createSession(under, new Point(5, 3), { visible: true, pointerPolicy: "passthrough" });
        const popup = createPopup();
        app.root.overlayLayer.createSession(popup, new Point(4, 2), {
            visible: true,
            shadow: true,
            pointerPolicy: "passthrough",
        });
        app.render();
        const shadedBg = compositeOver(SHADOW, CONTENT_BG);
        expect(app.backend.getBgAt(new Point(6, 3))).toBe(shadedBg);

        // Damage только от нижнего: rect (5,3) 5×1 не пересекает попап (4,2) 5×1.
        under.markDirty();
        app.render();

        expect(app.backend.getBgAt(new Point(6, 3))).toBe(shadedBg);
        expect(app.backend.getBgAt(new Point(9, 3))).toBe(shadedBg); // угол
    });

    it("после закрытия сессии тень стирается вместе с попапом", () => {
        const app = createApp();
        const popup = createPopup();
        const session = app.root.overlayLayer.createSession(popup, new Point(4, 2), {
            visible: true,
            shadow: true,
            pointerPolicy: "passthrough",
        });
        app.render();
        expect(app.backend.getBgAt(new Point(5, 3))).not.toBe(CONTENT_BG);

        session.close();
        app.render();

        expect(app.backend.getBgAt(new Point(5, 3))).toBe(CONTENT_BG);
        expect(app.backend.getBgAt(new Point(9, 3))).toBe(CONTENT_BG);
    });
});
