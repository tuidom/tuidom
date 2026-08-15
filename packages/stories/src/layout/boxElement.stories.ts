import { BoxElement } from "@tuidom/elements/layout/boxElement";
import type { StoryContext, StoryMeta } from "@tuidom/testing/storyTypes";

export const meta: StoryMeta = {
    title: "BoxElement",
};

export function simpleBox(ctx: StoryContext): void {
    const box = new BoxElement();
    ctx.body.setContent(box);
}
