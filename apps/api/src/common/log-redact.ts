/**
 * URLs fuer Logs bereinigen: geheime Pfad-Token (Kalender-Abo, Einladungslinks) und alle Query-Werte
 * (Suche, Cursor, ...) werden durch "…" ersetzt. Parameternamen bleiben zur Fehlersuche erhalten.
 */
export function redactUrl(url: string | undefined): string {
  if (!url) return "";
  const q = url.indexOf("?");
  const path = (q === -1 ? url : url.slice(0, q))
    .replace(/\/calendar\/[^/]+/g, "/calendar/…")
    .replace(/\/invites\/[^/]+/g, "/invites/…");
  if (q === -1) return path;
  const query = url
    .slice(q + 1)
    .split("&")
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      return eq === -1 ? part : `${part.slice(0, eq)}=…`;
    })
    .join("&");
  return `${path}?${query}`;
}

/** Fastify-Logger: Anfragen nur mit Methode und bereinigter URL (keine IP, keine Header, keine Cookies). */
export const loggerOptions = {
  serializers: {
    req: (req: { method?: string; url?: string }) => ({ method: req.method, url: redactUrl(req.url) }),
  },
};

/**
 * Fehler fuer Logs ohne Meldungstext: DB-Fehler (DrizzleQueryError) enthalten SQL samt Parametern, fremde Bibliotheken
 * teils Nutzerdaten. Geloggt werden Fehlername, pg-Code und die ersten Stack-Rahmen.
 */
export function describeError(err: unknown, frames = 3): string {
  const e = err as { name?: string; stack?: string; code?: unknown; cause?: { code?: unknown } } | null;
  const name = e?.name ?? typeof err;
  const code = typeof e?.code === "string" ? e.code : typeof e?.cause?.code === "string" ? e.cause.code : undefined;
  const isDb = name === "DrizzleQueryError" || /^[0-9A-Z]{5}$/.test(code ?? "") || (e != null && typeof e === "object" && "query" in e);
  if (isDb) return `${name}${code ? ` (pg ${code})` : ""}`;
  const at = (e?.stack ?? "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("at ")).slice(0, frames);
  return `${name}${code ? ` (${code})` : ""}${at.length ? ` ${at.join(" | ")}` : ""}`;
}
