"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

type Options = {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** Vorlauf, damit die naechste Seite vor dem Listenende geladen wird. */
  rootMargin?: string;
};

/**
 * Endlos-Liste: liefert eine Ref fuer ein Sentinel-Element am Listenende. Kommt es in den Vorlauf,
 * wird onLoadMore aufgerufen, aber nur bei hasMore && !loading. Nach jedem Ladevorgang wird neu
 * beobachtet, damit kurze Seiten (Sentinel bleibt sichtbar) weiterladen. Ohne IntersectionObserver
 * passiert nichts; der "Mehr laden"-Knopf bleibt der Rueckfall.
 */
export function useInfiniteScroll({ hasMore, loading, onLoadMore, rootMargin = "600px" }: Options) {
  const [el, setEl] = useState<Element | null>(null);
  const state = useRef({ hasMore, loading, onLoadMore });
  state.current = { hasMore, loading, onLoadMore };

  useEffect(() => {
    if (!el || !hasMore || loading || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        const s = state.current;
        if (s.hasMore && !s.loading) s.onLoadMore();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, hasMore, loading, rootMargin]);

  return setEl;
}

/**
 * Sperre nach fehlgeschlagenem Nachladen: sonst bleibt der Sentinel sichtbar und laedt endlos
 * (Anfragen + Toasts). Seiten uebergeben hasMore && !moreFailed; zurueckgesetzt wird per
 * Klick auf "Mehr laden", automatisch, wenn das Geraet wieder online ist, oder bei neuer Liste (resetKey).
 */
export function useMoreFailed(resetKey?: string): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [resetKey]);
  useEffect(() => {
    if (!failed) return;
    const onOnline = () => setFailed(false);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [failed]);
  return [failed, setFailed];
}
