"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Reagiert auf eine CSS-Media-Query. Startet mit false (gleich auf Server und beim ersten Rendern,
 * kein Hydrations-Unterschied) und uebernimmt nach dem Mount den echten Wert.
 * Ohne matchMedia (alte Browser, jsdom) bleibt der Wert false.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    if (!mql) return;
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
