import type { NextConfig } from "next";

// Strikte CSP: nur eigene Quellen, keine Drittanbieter (DSGVO). Next.js braucht 'unsafe-inline' fuer Hydration.
// SKALIERUNG/Haertung: spaeter auf Nonces umstellen und 'unsafe-inline' entfernen.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Nur fuer lokale Entwicklung: /api -> NestJS. In Produktion routet Caddy /api direkt zur API.
  async rewrites() {
    const target = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${target}/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: csp }] : []),
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
