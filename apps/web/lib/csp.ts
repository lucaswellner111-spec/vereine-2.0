/**
 * Strenge CSP: nur eigene Quellen, keine Drittanbieter (DSGVO).
 * - Skripte: nur mit Nonce ('strict-dynamic' erlaubt die von Next nachgeladenen Chunks); kein 'unsafe-inline'.
 * - Stile: Stylesheets nur eigene Datei oder mit Nonce; style-Attribute (React `style={...}`) bleiben erlaubt
 *   (style-src-attr), weil Nonces auf Attribute nicht wirken. Das ist ein geringes Restrisiko (kein Skriptzugriff).
 * - connect-src: 'self' und wss: (Chat per WebSocket auf HTTPS; lokal ueber HTTP faellt der Chat auf Polling zurueck).
 */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
  ].join("; ");
}

/** Zufaelliger Nonce (128 Bit, base64) je Anfrage; funktioniert in der Edge-Laufzeit der Middleware. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
