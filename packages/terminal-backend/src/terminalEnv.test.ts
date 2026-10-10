import { describe, expect, it } from "vitest";

import { isInsideGnuScreen, isInsideTmux, isSsh } from "./terminalEnv.ts";

describe("TerminalEnv — isInsideGnuScreen", () => {
    it("STY без tmux — GNU Screen", () => {
        expect(isInsideGnuScreen({ STY: "1234.pts-0.host" })).toBe(true);
    });

    it("tmux внутри screen: ближайший мультиплексор — tmux", () => {
        expect(isInsideGnuScreen({ STY: "1234.pts-0.host", TMUX: "/tmp/tmux-1000/default,1,0" })).toBe(false);
    });

    it("без STY или с пустым STY — не screen", () => {
        expect(isInsideGnuScreen({})).toBe(false);
        expect(isInsideGnuScreen({ STY: "" })).toBe(false);
    });
});

describe("TerminalEnv — isInsideTmux", () => {
    it("returns true when TMUX is set and non-empty", () => {
        expect(isInsideTmux({ TMUX: "/tmp/tmux-1000/default,123,0" })).toBe(true);
    });

    it("returns false when TMUX is absent", () => {
        expect(isInsideTmux({})).toBe(false);
    });

    it("returns false when TMUX is empty string", () => {
        expect(isInsideTmux({ TMUX: "" })).toBe(false);
    });
});

describe("TerminalEnv — isSsh", () => {
    it("returns true via SSH_CONNECTION branch", () => {
        expect(isSsh({ SSH_CONNECTION: "10.0.0.1 222 10.0.0.2 22" })).toBe(true);
    });

    it("returns true via SSH_TTY branch when SSH_CONNECTION is absent", () => {
        // SSH_CONNECTION missing → first clause false → falls through to SSH_TTY.
        expect(isSsh({ SSH_TTY: "/dev/pts/0" })).toBe(true);
    });

    it("returns false when neither SSH var is set", () => {
        expect(isSsh({})).toBe(false);
    });

    it("returns false when both SSH vars are empty strings", () => {
        expect(isSsh({ SSH_CONNECTION: "", SSH_TTY: "" })).toBe(false);
    });
});
