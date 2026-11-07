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
