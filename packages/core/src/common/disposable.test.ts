import { describe, expect, it } from "vitest";

import { Disposable, type IDisposable } from "./disposable.ts";

class Owner extends Disposable {
    public own<T extends IDisposable>(disposable: T): T {
        return this.register(disposable);
    }
}

describe("Disposable", () => {
    it("register отдаёт то же, что принял, а dispose снимает в обратном порядке", () => {
        const order: string[] = [];
        const owner = new Owner();
        const first = { dispose: () => order.push("first") };
        expect(owner.own(first)).toBe(first);
        owner.own({ dispose: () => order.push("second") });

        owner.dispose();

        expect(order).toEqual(["second", "first"]);
    });

    it("повторный dispose ничего не снимает второй раз", () => {
        let calls = 0;
        const owner = new Owner();
        owner.own({ dispose: () => calls++ });
        owner.dispose();
        owner.dispose();
        expect(calls).toBe(1);
    });
});
