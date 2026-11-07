"use client";

import { useEffect } from "react";

export const TITLE_SUFFIX = "Klubnest";

/**
 * Titel fuer dynamische Client-Seiten (Profil, Verein, Termin). null = noch nicht geladen, nichts tun.
 * Beim Verlassen wird nicht zurueckgesetzt: Next setzt beim naechsten Seitenwechsel den Titel selbst.
 */
export function usePageTitle(name: string | null | undefined) {
  useEffect(() => {
    if (!name) return;
    document.title = `${name} · ${TITLE_SUFFIX}`;
  }, [name]);
}
