"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { hasOpenEscapeLayer } from "@/components/ui-client";
import { haptic } from "./haptics";

/** Zugweg (nach Daempfung) in px, ab dem losgelassen neu geladen wird. */
export const PULL_THRESHOLD = 70;
const MAX_PULL = PULL_THRESHOLD * 1.6;
/** Indikator mindestens so lange zeigen, damit das Neuladen sichtbar ist. */
const MIN_SPIN_MS = 600;

/** indicatorRef gehoert an PullIndicator: der Zugweg wird dort direkt gesetzt (kein Re-Render der Seite je Bewegung). */
export type PullState = { refreshing: boolean; indicatorRef: RefObject<HTMLDivElement | null> };

/**
 * Pull-to-Refresh fuer Seiten, die im Fenster scrollen: nur bei Touch, nur wenn ganz oben gescrollt
 * und kein Dialog offen ist. Ueber der Schwelle losgelassen ruft onRefresh (z. B. reload aus useApi).
 * Waehrend der Hook aktiv ist, ist das browsereigene Neuladen per Ziehen (Chrome Android) aus.
 */
export function usePullToRefresh(onRefresh: () => unknown, { enabled = true }: { enabled?: boolean } = {}): PullState {
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    const prevOverscroll = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";
    let startY: number | null = null;
    let dist = 0;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** Zugweg direkt am Indikator setzen (Hoehe, Fortschritt), ohne React-Zustand. */
    const paint = (d: number) => {
      const el = indicatorRef.current;
      if (!el) return;
      if (d === 0) {
        el.style.removeProperty("height");
        el.style.removeProperty("--pull");
        delete el.dataset.pulling;
        delete el.dataset.reached;
        return;
      }
      el.style.height = `${d}px`;
      el.style.setProperty("--pull", String(Math.min(1, d / PULL_THRESHOLD)));
      el.dataset.pulling = "true";
      if (d >= PULL_THRESHOLD) el.dataset.reached = "true";
      else delete el.dataset.reached;
    };
    const reset = () => {
      startY = null;
      if (dist !== 0) paint(0);
      dist = 0;
    };
    const onStart = (e: TouchEvent) => {
      const locked = document.body.style.overflow === "hidden";
      if (busy || locked || e.touches.length !== 1 || window.scrollY > 0 || hasOpenEscapeLayer()) {
        startY = null;
        return;
      }
      startY = e.touches[0].clientY;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        // nach oben gewischt: normales Scrollen, kein Ziehen mehr in dieser Geste
        if (dy < 0) reset();
        else if (dist !== 0) {
          dist = 0;
          paint(0);
        }
        return;
      }
      dist = Math.min(dy * 0.5, MAX_PULL);
      paint(dist);
    };
    const onEnd = () => {
      if (startY === null) return;
      const reached = dist >= PULL_THRESHOLD;
      reset();
      if (!reached) return;
      busy = true;
      setRefreshing(true);
      haptic(10);
      const started = Date.now();
      Promise.resolve()
        .then(() => cb.current())
        .catch(() => undefined)
        .finally(() => {
          timer = setTimeout(() => {
            busy = false;
            setRefreshing(false);
          }, Math.max(0, MIN_SPIN_MS - (Date.now() - started)));
        });
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", reset);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", reset);
      clearTimeout(timer);
      root.style.overscrollBehaviorY = prevOverscroll;
      paint(0);
      setRefreshing(false);
    };
  }, [enabled]);

  return { refreshing, indicatorRef };
}
