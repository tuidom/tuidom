import { reject } from "@tuidom/core/common/typingUtils";
import { ScrollBarDecorator } from "@tuidom/elements/scrollbar/scrollContainerElement";
import type { StoryContext, StoryMeta } from "@tuidom/testing/storyTypes";

import { WASDScrollableElement } from "../WASDScrollableElement.ts";

export const meta: StoryMeta = {
    title: "ScrollableElement",
};

export function wasdGrid(ctx: StoryContext): void {
    const widget = new WASDScrollableElement(220, 90);
    const container = new ScrollBarDecorator(widget);
    ctx.body.setContent(container);

    ctx.afterRun(() => {
        (ctx.app.focusManager ?? reject()).setFocus(widget);
    });
}
