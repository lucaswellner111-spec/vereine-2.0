import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "./lib/csp";

/**
 * Content-Security-Policy mit Nonce je Anfrage (statt 'unsafe-inline' fuer Skripte). Next.js liest den Nonce aus dem
 * Request-Header und versieht seine eigenen Inline-Skripte damit; das Layout setzt ihn auf das Theme-Skript (x-nonce).
 * Nur im Produktions-Build (im Entwicklungsmodus braucht Next eval und Inline-Code).
 */
export function middleware(req: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();
  const nonce = newNonce();
  const csp = buildCsp(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // Nur Seiten (HTML): nicht die API, statische Dateien, Bilder, Service Worker, Manifest, Prefetch-Anfragen
  matcher: [
    {
      source: "/((?!api/|_next/static|_next/image|icons/|icon.svg|sw.js|manifest.webmanifest|offline.html).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
