"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Reagiert auf eine CSS-Media-Query. Startet mit false (gleich auf Server und beim ersten Rendern,
 * kein Hydrations-Unterschied) und uebernimmt nach dem Mount den echten Wert.
 * Ohne matchMedia (alte Browser, jsdom) bleibt der Wert false.
 */
export function useMediaQuery(query: string): boolean {
  return useMediaQueryState(query) ?? false;
}

/**
 * Wie useMediaQuery, aber null, solange der Wert noch nicht bekannt ist (Server, erstes Rendern).
 * Fuer Seiten, die am Desktop sofort weiterleiten: bis zur Entscheidung nichts Falsches zeigen.
 */
export function useMediaQueryState(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setMatches(false);
      return;
    }
    const mql = window.matchMedia(query);
    if (!mql) {
      setMatches(false);
      return;
    }
    const update = () => setMatches(mql.matches);
    update();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", update);
      return () => mql.removeEventListener("change", update);
    }
    // aeltere Safari-Versionen
    mql.addListener?.(update);
    return () => mql.removeListener?.(update);
  }, [query]);
  return matches;
}

/** Ab Tablet-Breite (Tailwind md). */
export const DESKTOP_QUERY = "(min-width: 768px)";

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}

/** null = noch unbekannt, sonst true ab Tablet-Breite. */
export function useIsDesktopState(): boolean | null {
  return useMediaQueryState(DESKTOP_QUERY);
}

/**
 * Ersatz fuer autoFocus: fokussiert nur bei feinem Zeiger (Maus/Trackpad). Am Handy wuerde autoFocus
 * sofort die Bildschirmtastatur oeffnen und die halbe Seite verdecken.
 */
export function useDesktopAutoFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(pointer: fine)").matches) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
