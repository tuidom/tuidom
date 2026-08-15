import type { TuiApplication } from "@tuidom/core/dom/tuiApplication";
import type { TUIElement } from "@tuidom/core/dom/tuiElement";
import type { BodyElement } from "@tuidom/elements/body/bodyElement";

export interface StoryContext {
    readonly app: TuiApplication;
    readonly body: BodyElement;
    readonly args: string[];
    afterRun(cb: () => void | Promise<void>): void;
}

export type StoryFunction = (ctx: StoryContext) => TUIElement | undefined | Promise<TUIElement | undefined>;

export interface StoryMeta {
    title?: string;
}

export interface StoryModule {
    meta?: StoryMeta;
    [key: string]: StoryFunction | StoryMeta | undefined;
}
