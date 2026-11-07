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
  setData: Dispatch<SetStateAction<T | null>>;
};

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/**
 * Laedt GET /api{path}. path null => nichts laden. Pfadwechsel bricht die laufende Anfrage ab;
 * veraltete Antworten werden verworfen, Abbrueche nie als Fehler gezeigt.
 * reload() laedt erneut, ohne die vorhandenen Daten zu leeren.
 */
export function useApi<T>(path: string | null, opts: { debounceMs?: number; keepPrevious?: boolean } = {}): ApiState<T> {
  const { debounceMs = 0, keepPrevious = false } = opts;
  const [data, setData] = useState<T | null>(null);
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
      if (!keepRef.current) setData(null);
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
          setData(d);
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

  return { data, error, errorStatus, loading, reload, setData };
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
