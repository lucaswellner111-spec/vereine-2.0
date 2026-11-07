"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "@/components/ui-hosts";
import { api, ApiError, describeError } from "./api";

export type ApiState<T> = {
  data: T | null;
  error: string | null;
  errorStatus: number | null;
  loading: boolean;
  reload: () => void;
  /** Still neu laden: ohne loading/Skeleton, Fehler werden verschluckt (Polling, Rueckkehr zum Tab). */
  refresh: () => void;
  setData: Dispatch<SetStateAction<T | null>>;
};

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Mindestabstand zwischen zwei Neuladen bei Rueckkehr (refreshOnFocus). */
export const FOCUS_REFRESH_MS = 30_000;

type UseApiOptions<T> = {
  debounceMs?: number;
  keepPrevious?: boolean;
  /** Bei Rueckkehr zum Tab (visibilitychange) und wieder online still neu laden, hoechstens alle 30 s, nur mit Daten. */
  refreshOnFocus?: boolean;
  /** Wie eine stille Aktualisierung mit vorhandenen Daten zusammengefuehrt wird (z. B. nachgeladene Seiten behalten). */
  merge?: (prev: T, next: T) => T;
};

/**
 * Laedt GET /api{path}. path null => nichts laden. Pfadwechsel bricht die laufende Anfrage ab;
 * veraltete Antworten werden verworfen, Abbrueche nie als Fehler gezeigt.
 * reload() laedt erneut, ohne die vorhandenen Daten zu leeren.
 */
export function useApi<T>(path: string | null, opts: UseApiOptions<T> = {}): ApiState<T> {
  const { debounceMs = 0, keepPrevious = false, refreshOnFocus = false } = opts;
  const mergeRef = useRef(opts.merge);
  mergeRef.current = opts.merge;
  const pathRef = useRef(path);
  pathRef.current = path;
  const lastLoad = useRef(0);
  const refreshing = useRef(false);
  const [data, setDataState] = useState<T | null>(null);
  // Zaehler lokaler Aenderungen (optimistische Updates); refresh() verwirft Antworten, wenn er sich waehrenddessen aendert
  const mutations = useRef(0);
  const setData = useCallback<Dispatch<SetStateAction<T | null>>>((v) => {
    mutations.current += 1;
    setDataState(v);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [nonce, setNonce] = useState(0);
  const lastPath = useRef<string | null>(null);
  const keepRef = useRef(keepPrevious);
  keepRef.current = keepPrevious;
  const hasData = useRef(false);
  hasData.current = data !== null;

  useEffect(() => {
    const pathChanged = lastPath.current !== path;
    lastPath.current = path;
    if (pathChanged) {
      setError(null);
      setErrorStatus(null);
      if (!keepRef.current) setDataState(null);
    }
    if (path === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    // Debounce nur bei Pfadwechsel, reload() laedt sofort
    const delay = pathChanged ? debounceMs : 0;
    let settled = false;
    const timer = setTimeout(() => {
      api<T>(path, { signal: ctrl.signal })
        .then((d) => {
          if (ctrl.signal.aborted) return;
          settled = true;
          lastLoad.current = Date.now();
          setDataState(d);
          setError(null);
          setErrorStatus(null);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted || isAbort(e)) return;
          settled = true;
          // Nachladen mit vorhandenen Daten: Seiten zeigen ErrorState nur ohne Daten, daher hier ein Hinweis
          if (hasData.current) toast.error(describeError(e));
          setError(describeError(e));
          setErrorStatus(e instanceof ApiError ? e.status : null);
          setLoading(false);
        });
    }, delay);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
      // Abgebrochener Erstlauf (StrictMode, reload waehrend Debounce): naechster Lauf gilt wieder als Pfadwechsel
      if (pathChanged && !settled) lastPath.current = null;
    };
  }, [path, nonce, debounceMs]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const refresh = useCallback(() => {
    const p = pathRef.current;
    if (p === null || refreshing.current) return;
    refreshing.current = true;
    lastLoad.current = Date.now();
    const startedAt = mutations.current;
    api<T>(p)
      .then((d) => {
        if (pathRef.current !== p) return; // inzwischen anderer Pfad
        // lokal geaendert (z. B. optimistisch gelesen markiert): Antwort ist veraltet, verwerfen
        if (mutations.current !== startedAt) return;
        const merge = mergeRef.current;
        setDataState((prev) => (prev !== null && merge ? merge(prev, d) : d));
        setError(null);
        setErrorStatus(null);
      })
      .catch(() => undefined)
      .finally(() => {
        refreshing.current = false;
      });
  }, []);

  useEffect(() => {
    if (!refreshOnFocus) return;
    const onReturn = () => {
      if (document.visibilityState !== "visible" || !hasData.current) return;
      if (Date.now() - lastLoad.current < FOCUS_REFRESH_MS) return;
      refresh();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("online", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("online", onReturn);
    };
  }, [refreshOnFocus, refresh]);

  return { data, error, errorStatus, loading, reload, refresh, setData };
}

/** Sperre gegen Doppelklicks: run(fn) fuehrt fn nur aus, wenn gerade nichts laeuft. */
export function useBusy(): [boolean, <R>(fn: () => Promise<R>) => Promise<R | undefined>] {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const run = useCallback(async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, run];
}
