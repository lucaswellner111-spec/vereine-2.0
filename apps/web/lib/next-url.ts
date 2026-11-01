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
