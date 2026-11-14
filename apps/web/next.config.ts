import type { NextConfig } from "next";

// Die CSP (mit Nonce je Anfrage) setzt middleware.ts, Aufbau in lib/csp.ts.

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Dev-Knopf unten links verdeckt sonst die Tab-Leiste am Handy (Fehler-Overlay bleibt)
  devIndicators: false,
  // Eigener Build-Ordner (z. B. ".next-2"), wenn zwei Next-Server parallel im selben Ordner laufen
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  // Nur fuer lokale Entwicklung: /api -> NestJS. In Produktion routet Caddy /api direkt zur API.
  async rewrites() {
    const target = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${target}/:path*` }];
  },
  async headers() {
    return [
      // Der Service Worker darf nie veraltet aus dem Cache kommen (sonst bleiben Updates haengen).
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0" }, { key: "Service-Worker-Allowed", value: "/" }, { key: "Content-Security-Policy", value: "default-src 'self'; connect-src 'self'" }] },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
