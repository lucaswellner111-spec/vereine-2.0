import { useEffect } from "react";

type PollOptions = { fastMs?: number; slowMs?: number; slowAfterMs?: number };

/**
 * Laedt per `reload` nach, solange `active` gilt: zuerst alle `fastMs`, nach `slowAfterMs` nur noch alle `slowMs`.
 * Im Hintergrund-Tab (document.hidden) pausiert das Nachladen; beim Zurueckkehren wird sofort geladen.
 */
export function usePollWhile(active: boolean, reload: () => void, { fastMs = 3_000, slowMs = 30_000, slowAfterMs = 10 * 60_000 }: PollOptions = {}) {
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(tick, Date.now() - start >= slowAfterMs ? slowMs : fastMs);
    };
    const tick = () => {
      if (!document.hidden) reload();
      schedule();
    };
    const onVisible = () => {
      if (document.hidden) return;
      clearTimeout(timer);
      reload();
      schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    schedule();
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, reload, fastMs, slowMs, slowAfterMs]);
}
