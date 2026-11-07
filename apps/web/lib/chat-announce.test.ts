import type { ChatMessage } from "@vereine/shared";
import { describe, expect, it } from "vitest";
import { ANNOUNCE_MAX, announceText, foreignNewMessages } from "./chat-announce";

const msg = (id: string, minute: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  senderId: "u2",
  senderName: "Mia",
  body: `Text ${id}`,
  deleted: false,
  createdAt: `2026-11-07T10:${String(minute).padStart(2, "0")}:00.000Z`,
  mine: false,
  ...extra,
});

describe("foreignNewMessages", () => {
  it("Erstladen (prev null): nichts", () => {
    expect(foreignNewMessages(null, [msg("a", 1), msg("b", 2)])).toEqual([]);
  });

  it("leere, bereits geladene Unterhaltung: erste fremde Nachricht wird angesagt", () => {
    expect(foreignNewMessages([], [msg("a", 1), msg("b", 2, { mine: true })]).map((m) => m.id)).toEqual(["a"]);
  });

  it("nur neue fremde Nachrichten", () => {
    const prev = [msg("a", 1)];
    const next = [...prev, msg("b", 2), msg("c", 3, { mine: true }), msg("d", 4, { deleted: true, body: null })];
    expect(foreignNewMessages(prev, next).map((m) => m.id)).toEqual(["b"]);
  });

  it("aeltere (nachgeladene) Nachrichten werden nicht angesagt", () => {
    const prev = [msg("m", 30)];
    const next = [msg("x", 5), msg("y", 6), ...prev];
    expect(foreignNewMessages(prev, next)).toEqual([]);
  });

  it("bekannte Nachrichten (z. B. geaendert) nicht erneut", () => {
    const prev = [msg("a", 1), msg("b", 2)];
    expect(foreignNewMessages(prev, [msg("a", 1), msg("b", 2, { deleted: true, body: null })])).toEqual([]);
  });
});

describe("announceText", () => {
  it("leer ohne Nachrichten", () => {
    expect(announceText([], "Mia")).toBe("");
  });

  it("eine Nachricht", () => {
    expect(announceText([msg("a", 1, { body: "Hallo" })], "X")).toBe("Neue Nachricht von Mia: Hallo");
  });

  it("Plural mit letzter Absenderin", () => {
    expect(announceText([msg("a", 1), msg("b", 2, { senderName: "Tom", body: "Bis gleich" })], "X")).toBe(
      "2 neue Nachrichten, zuletzt von Tom: Bis gleich",
    );
  });

  it("Fallback-Name ohne senderName", () => {
    expect(announceText([msg("a", 1, { senderName: "", body: "Hi" })], "Vorstand")).toBe("Neue Nachricht von Vorstand: Hi");
  });

  it("kuerzt auf 140 Zeichen", () => {
    const long = "a".repeat(300);
    const text = announceText([msg("a", 1, { body: long })], "X");
    const body = text.replace("Neue Nachricht von Mia: ", "");
    expect(body.length).toBe(ANNOUNCE_MAX);
    expect(body.endsWith("…")).toBe(true);
  });
});
