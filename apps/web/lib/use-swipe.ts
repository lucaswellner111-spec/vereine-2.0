"use client";

import { useRef, useState, type PointerEvent } from "react";

export type SwipeDir = "left" | "right" | "up" | "down";

/** Richtung einer Wischbewegung, wenn sie auf der Achse die Schwelle erreicht und ueberwiegend auf dieser Achse lief. */
export function swipeDirection(dx: number, dy: number, threshold: number, axis: "x" | "y"): SwipeDir | null {
  if (axis === "x") {
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return null;
    return dx < 0 ? "left" : "right";
  }
  if (Math.abs(dy) < threshold || Math.abs(dy) < Math.abs(dx)) return null;
  return dy < 0 ? "up" : "down";
}

const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Wischgesten per Pointer-Events (Touch, Stift, Maus). offset = aktuelle Verschiebung auf der Achse
 * (zum Mitziehen); bei prefers-reduced-motion bleibt offset 0 und nur das Ergebnis zaehlt.
 * moved() sagt nach dem Loslassen, ob gewischt wurde (um einen folgenden Klick zu ignorieren).
 */
export function useSwipe({ axis, threshold = 80, onSwipe, enabled = true }: { axis: "x" | "y"; threshold?: number; onSwipe: (dir: SwipeDir) => void; enabled?: boolean }) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const didMove = useRef(false);
  const [offset, setOffset] = useState(0);
  const reset = () => {
    start.current = null;
    setOffset(0);
  };
  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      didMove.current = false;
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const d = axis === "x" ? e.clientX - s.x : e.clientY - s.y;
      if (Math.abs(d) > 8) didMove.current = true;
      if (!reducedMotion()) setOffset(axis === "y" ? Math.max(0, d) : d); // Sheet nur nach unten mitziehen
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const dir = swipeDirection(e.clientX - s.x, e.clientY - s.y, threshold, axis);
      reset();
      if (dir) onSwipe(dir);
    },
    onPointerCancel: reset,
  };
  return { handlers, offset, moved: () => didMove.current };
}
