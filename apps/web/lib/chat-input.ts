"use client";

import { useLayoutEffect, type RefObject } from "react";

export const COARSE_POINTER_QUERY = "(pointer: coarse)";

/**
 * Enter im Chat-Feld: am Desktop sendet Enter, Umschalt+Enter macht eine Zeile.
 * Am Handy (grober Zeiger) gibt Enter immer eine neue Zeile, gesendet wird nur per Knopf.
 * Waehrend einer IME-Eingabe (z. B. Japanisch) nie senden.
 */
export function enterSends(e: { key: string; shiftKey: boolean; isComposing?: boolean }, coarse: boolean): boolean {
  if (e.key !== "Enter" || e.shiftKey || e.isComposing) return false;
  return !coarse;
}

/** Fallback fuer Browser ohne CSS field-sizing: Hoehe des Textfelds an den Inhalt anpassen (bis maxPx). */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, maxPx = 160) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`;
  }, [ref, value, maxPx]);
}

type OutboxLike = { body: string; createdAt: string; skip: string[] };
type MsgLike = { id: string; mine: boolean; body: string | null; createdAt: string };

/**
 * Wartende Nachrichten ausblenden, die schon per Live-Ereignis da sind (bevor die POST-Antwort kam):
 * gleicher Text, eigene Nachricht, Zeitfenster +-1 min. Jede Server-Nachricht passt hoechstens zu
 * einem Eintrag; skip enthaelt eigene gleichlautende Nachrichten, die beim Absenden schon da waren.
 */
export function visibleOutbox<T extends OutboxLike>(outbox: T[], msgs: MsgLike[], windowMs = 60_000): T[] {
  const used = new Set<string>();
  return outbox.filter((o) => {
    const at = Date.parse(o.createdAt);
    const echo = msgs.find(
      (m) => m.mine && m.body === o.body && !used.has(m.id) && !o.skip.includes(m.id) && Math.abs(Date.parse(m.createdAt) - at) <= windowMs,
    );
    if (!echo) return true;
    used.add(echo.id);
    return false;
  });
}
