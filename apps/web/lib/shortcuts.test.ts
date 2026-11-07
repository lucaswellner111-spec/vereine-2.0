import { describe, expect, it, vi } from "vitest";
import { createShortcutHandler, isTypingTarget, setShortcutsEnabled, SHORTCUTS_STORAGE_KEY, shortcutsBlocked, shortcutsEnabled } from "./shortcuts";

const body = document.body;
const make = () => {
  let t = 1000;
  const actions = { navigate: vi.fn(), help: vi.fn(), newPost: vi.fn(() => true) };
  const handle = createShortcutHandler(actions, () => t);
  return { actions, handle, advance: (ms: number) => (t += ms) };
};

describe("Tastaturkuerzel", () => {
  it("g dann f/c/k springt, nur innerhalb von 1,5 s", () => {
    const { actions, handle, advance } = make();
    expect(handle({ key: "g", target: body })).toBe(true);
    handle({ key: "c", target: body });
    expect(actions.navigate).toHaveBeenCalledWith("/chat");
    handle({ key: "g", target: body });
    advance(2000);
    handle({ key: "k", target: body });
    expect(actions.navigate).toHaveBeenCalledTimes(1);
    handle({ key: "g", target: body });
    handle({ key: "k", target: body });
    expect(actions.navigate).toHaveBeenLastCalledWith("/kalender");
  });

  it("? zeigt die Uebersicht, n startet einen Beitrag", () => {
    const { actions, handle } = make();
    handle({ key: "?", target: body });
    handle({ key: "n", target: body });
    expect(actions.help).toHaveBeenCalled();
    expect(actions.newPost).toHaveBeenCalled();
  });

  it("nie in Eingabefeldern und nicht mit Strg/Cmd/Alt", () => {
    const { actions, handle } = make();
    const input = document.createElement("textarea");
    expect(handle({ key: "?", target: input })).toBe(false);
    expect(handle({ key: "n", target: body, ctrlKey: true })).toBe(false);
    expect(actions.help).not.toHaveBeenCalled();
    expect(actions.newPost).not.toHaveBeenCalled();
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(body)).toBe(false);
  });
});

describe("Kuerzel abschalten und in Dialogen sperren", () => {
  it("Standard an, abschaltbar per localStorage, Fehler im Speicher brechen nichts", () => {
    localStorage.clear();
    expect(shortcutsEnabled()).toBe(true);
    setShortcutsEnabled(false);
    expect(localStorage.getItem(SHORTCUTS_STORAGE_KEY)).toBe("off");
    expect(shortcutsBlocked(false)).toBe(true);
    setShortcutsEnabled(true);
    expect(shortcutsBlocked(false)).toBe(false);
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blockiert");
    });
    expect(shortcutsEnabled()).toBe(true);
    spy.mockRestore();
  });

  it("gesperrt bei offener Escape-Ebene oder aria-modal", () => {
    localStorage.clear();
    expect(shortcutsBlocked(true)).toBe(true);
    const d = document.createElement("div");
    d.setAttribute("aria-modal", "true");
    document.body.appendChild(d);
    expect(shortcutsBlocked(false)).toBe(true);
    d.remove();
    expect(shortcutsBlocked(false)).toBe(false);
  });
});
