/**
 * Rueckkehrziel nach Login/Registrierung (?next=...). Nur interne Pfade sind erlaubt, damit der Link
 * nicht fuer Weiterleitungen auf fremde Seiten (Open Redirect) missbraucht werden kann.
 */
export function safeNext(search: string, fallback = "/feed"): string {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

export const withNext = (path: string, next: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path);

const NEXT_KEY = "klubnest.nachBestaetigung";

/** Rueckkehrziel ueber die Bestaetigungs-Mail hinweg merken (nur dieses Geraet, nur interne Pfade). */
export function rememberNext(next: string): void {
  try {
    if (next) localStorage.setItem(NEXT_KEY, next);
    else localStorage.removeItem(NEXT_KEY);
  } catch {
    /* Speicher gesperrt: dann eben zum Feed */
  }
}

/** Gemerktes Ziel einmalig abholen (geprueft wie ?next=). */
export function takeRememberedNext(fallback = "/feed"): string {
  try {
    const v = localStorage.getItem(NEXT_KEY);
    localStorage.removeItem(NEXT_KEY);
    return v ? safeNext(`?next=${encodeURIComponent(v)}`, fallback) : fallback;
  } catch {
    return fallback;
  }
}

/** Token aus dem Fragment eines Mail-Links (#t=…); das Fragment wird danach aus der Adresszeile entfernt. */
export function takeHashToken(): string {
  const t = new URLSearchParams(window.location.hash.slice(1)).get("t") ?? "";
  if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
  return t;
}
