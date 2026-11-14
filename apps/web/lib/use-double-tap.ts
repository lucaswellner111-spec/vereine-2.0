"use client";

import { useCallback, useEffect, useRef } from "react";

/** Zeitfenster fuer den zweiten Tipp (ms). */
export const DOUBLE_TAP_MS = 280;

/**
 * Einzel- und Doppeltipp auf demselben Element: der einzelne Tipp wird um das Zeitfenster verzoegert, damit ein
 * Doppeltipp ihn ersetzt (z. B. Bild: Tipp = vergroessern, Doppeltipp = Gefaellt mir).
 */
export function useDoubleTap(onSingle: () => void, onDouble: () => void, ms = DOUBLE_TAP_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const single = useRef(onSingle);
  const double = useRef(onDouble);
  single.current = onSingle;
  double.current = onDouble;
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      double.current();
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      single.current();
    }, ms);
  }, [ms]);
}
