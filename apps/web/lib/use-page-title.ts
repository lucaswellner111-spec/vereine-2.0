"use client";

import { useEffect } from "react";

export const TITLE_SUFFIX = "Klubnest";

/**
 * Titel fuer dynamische Client-Seiten (Profil, Verein, Termin, Beitrag). null = noch nicht geladen, nichts tun.
 * Next setzt den statischen Titel aus layout.tsx (metadata) teils erst nach unserem Effekt (Streaming,
 * Client-Navigation). Deshalb beobachtet der Hook <head> und setzt den Titel erneut, solange die Seite offen ist.
 * Beim Verlassen wird nicht zurueckgesetzt: Next setzt beim naechsten Seitenwechsel den Titel selbst.
 */
export function usePageTitle(name: string | null | undefined) {
  useEffect(() => {
    if (!name) return;
    const wanted = `${name} · ${TITLE_SUFFIX}`;
    const apply = () => {
      if (document.title !== wanted) document.title = wanted; // nur bei Abweichung: keine Endlosschleife
    };
    apply();
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [name]);
}
