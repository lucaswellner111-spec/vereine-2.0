import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { enterSends, useAutoGrow, visibleOutbox } from "./chat-input";

describe("enterSends", () => {
  it("Desktop: Enter sendet, Umschalt+Enter nicht", () => {
    expect(enterSends({ key: "Enter", shiftKey: false }, false)).toBe(true);
    expect(enterSends({ key: "Enter", shiftKey: true }, false)).toBe(false);
  });
  it("Handy (grober Zeiger): Enter sendet nie", () => {
    expect(enterSends({ key: "Enter", shiftKey: false }, true)).toBe(false);
  });
  it("andere Tasten und IME-Eingabe senden nicht", () => {
    expect(enterSends({ key: "a", shiftKey: false }, false)).toBe(false);
    expect(enterSends({ key: "Enter", shiftKey: false, isComposing: true }, false)).toBe(false);
  });
});

describe("useAutoGrow", () => {
  it("setzt die Hoehe nach scrollHeight, gedeckelt", () => {
    const el = document.createElement("textarea");
    Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => 300 });
    const ref = { current: el };
    renderHook(() => useAutoGrow(ref, "viel Text", 160));
    expect(el.style.height).toBe("160px");
    Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => 48 });
    renderHook(() => useAutoGrow(ref, "kurz", 160));
    expect(el.style.height).toBe("48px");
  });
});

describe("visibleOutbox", () => {
  const at = "2026-11-07T12:00:00.000Z";
  const msg = (id: string, body: string, createdAt = at, mine = true) => ({ id, body, createdAt, mine });
  const out = (body: string, skip: string[] = []) => ({ tempId: body, body, createdAt: at, skip });
  it("blendet nur passende eigene Nachrichten im Zeitfenster aus, je Nachricht einmal", () => {
    expect(visibleOutbox([out("Hallo")], [msg("1", "Hallo", "2026-11-07T12:00:30.000Z")])).toEqual([]);
    expect(visibleOutbox([out("Hallo")], [msg("1", "Hallo", "2026-11-07T12:02:00.000Z")])).toHaveLength(1); // ausserhalb
    expect(visibleOutbox([out("Hallo")], [msg("1", "Hallo", at, false)])).toHaveLength(1); // fremd
    expect(visibleOutbox([out("Hallo"), out("Hallo")], [msg("1", "Hallo")])).toHaveLength(1);
    expect(visibleOutbox([out("Hallo", ["1"])], [msg("1", "Hallo")])).toHaveLength(1); // war schon vorher da
  });
});
