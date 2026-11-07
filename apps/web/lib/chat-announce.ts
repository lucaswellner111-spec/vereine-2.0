import type { ChatMessage } from "@vereine/shared";

/*
 * Screenreader-Ansagen im Chat: nur wirklich neue, fremde Nachrichten (nicht die eigenen,
 * nicht geloeschte, nicht nachgeladene aeltere). Reine Funktionen, damit sie testbar sind.
 */

export const ANNOUNCE_MAX = 140;

/**
 * Nachrichten, die in next neu hinzugekommen sind (nicht in prev), juenger als die neueste aus prev,
 * nicht von mir und nicht geloescht. prev = null heisst Erstladen (nur Basislinie, nichts ansagen);
 * prev = [] ist eine geladene, leere Unterhaltung (die erste fremde Nachricht wird angesagt).
 */
export function foreignNewMessages(prev: ChatMessage[] | null, next: ChatMessage[]): ChatMessage[] {
  if (prev === null) return [];
  const known = new Set(prev.map((m) => m.id));
  const newest = prev.reduce<string>((max, m) => (m.createdAt > max ? m.createdAt : max), "");
  return next.filter((m) => !known.has(m.id) && m.createdAt > newest && !m.mine && !m.deleted);
}

const shorten = (text: string, max = ANNOUNCE_MAX) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** Ansagetext; leer, wenn nichts anzusagen ist. fallbackName z. B. Titel der Direktnachricht. */
export function announceText(msgs: ChatMessage[], fallbackName: string): string {
  if (msgs.length === 0) return "";
  const last = msgs[msgs.length - 1];
  const name = last.senderName || fallbackName;
  const body = shorten(last.body ?? "");
  if (msgs.length === 1) return `Neue Nachricht von ${name}: ${body}`;
  return `${msgs.length} neue Nachrichten, zuletzt von ${name}: ${body}`;
}
