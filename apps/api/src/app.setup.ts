import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";
import fastifyRateLimit from "@fastify/rate-limit";
import { HttpException } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type Redis from "ioredis";
import { REDIS } from "./cache/cache.module";
import { AppErrorFilter } from "./common/error.filter";
import { loggerOptions } from "./common/log-redact";
import { recordRequest } from "./metrics/http-metrics";

/**
 * Strenges Limit (10/min je IP) nur fuer Anmeldung und sicherheitskritische Aktionen. Verglichen wird das
 * Routenmuster (req.routeOptions.url), nicht die rohe URL - sonst umgeht z. B. "/auth/%6Cogin" das Limit.
 */
const STRICT_ROUTES = new Set([
  "POST /auth/login",
  "POST /auth/login/2fa",
  "POST /auth/register",
  "POST /auth/email/confirm",
  "POST /auth/email/resend",
  "POST /auth/email/change",
  "POST /auth/password/forgot",
  "POST /auth/password/reset",
  "PUT /auth/password",
  "POST /auth/2fa/enable",
  "POST /auth/2fa/disable",
  "POST /auth/2fa/recovery-codes",
  "DELETE /privacy/account",
]);
export const isStrictRoute = (req: { method: string; routeOptions?: { url?: string } }) =>
  STRICT_ROUTES.has(`${req.method} ${req.routeOptions?.url ?? ""}`);

const DEFAULT_TRUST_PROXY = "loopback,linklocal,uniquelocal";
const TRUST_TOKEN = /^(loopback|linklocal|uniquelocal|[0-9a-f.:]+(\/\d{1,3})?)$/i;

/**
 * Welche Proxys duerfen X-Forwarded-For setzen? Standard: nur private Netze (Caddy im Docker-Netz). "true"/"*" oder
 * unbekannte Werte werden NICHT uebernommen (sonst koennte jeder seine IP faelschen und Limits umgehen).
 */
export function trustProxySetting(raw = process.env.TRUST_PROXY): string {
  if (!raw?.trim()) return DEFAULT_TRUST_PROXY;
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 || !parts.every((p) => TRUST_TOKEN.test(p))) {
    console.warn("TRUST_PROXY ungueltig (erlaubt: loopback, linklocal, uniquelocal, IP/CIDR) - Standard wird verwendet.");
    return DEFAULT_TRUST_PROXY;
  }
  return parts.join(",");
}

/** Gemeinsame Fastify-Optionen fuer API, Chat-Gateway und lokalen PGlite-Server. */
export function fastifyOptions(opts: { logger?: boolean } = {}) {
  return { trustProxy: trustProxySetting(), logger: opts.logger === false ? false : loggerOptions };
}

/**
 * IPs ohne Rate-Limit (`RATE_LIMIT_ALLOWLIST`, kommagetrennt). NUR fuer den Lastgenerator in der Staging-Umgebung
 * (docs/BETRIEB.md, infra/loadtest): In Produktion bleibt die Variable leer. Es zaehlt die Client-IP, die Fastify aus dem
 * vertrauenswuerdigen Proxy-Header ableitet (nicht faelschbar, siehe trustProxySetting).
 */
export function rateLimitAllowList(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.RATE_LIMIT_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export async function configureApp(
  app: NestFastifyApplication,
  opts: { rateLimit?: boolean } = {},
) {
  const fastify = app.getHttpAdapter().getInstance();
  // Datenbank-/Fastify-Fehler als 4xx, unbekannte Fehler bereinigt loggen (keine SQL-Parameter).
  app.useGlobalFilters(new AppErrorFilter(app.getHttpAdapter()));

  await fastify.register(fastifyCookie);
  // Uploads: nur 1 Datei je Anfrage, max. 8 MB (die eigentliche Pruefung macht MediaService am Inhalt).
  await fastify.register(fastifyMultipart, { limits: { files: 1, fileSize: 8 * 1024 * 1024, fields: 2, parts: 3 } });

  if (opts.rateLimit !== false) {
    // Mit Redis teilen sich alle App-Server dieselben Zaehler; ohne Redis zaehlt jeder Prozess einzeln.
    const redis = app.get<Redis | null>(REDIS, { strict: false }) ?? undefined;
    await fastify.register(fastifyRateLimit, {
      redis,
      nameSpace: "rl:",
      skipOnError: true, // Redis-Ausfall darf die API nicht lahmlegen (Fail-open)
      allowList: rateLimitAllowList(),
      max: (req) => (isStrictRoute(req) ? 10 : 200),
      timeWindow: "1 minute",
      // HttpException statt Roh-Fehler: sauberes 429 ohne Fehler-Log-Flut.
      errorResponseBuilder: (_req, ctx) =>
        new HttpException({ message: `Zu viele Anfragen. Bitte warte ${Math.ceil(ctx.ttl / 1000)} Sekunden.`, statusCode: 429 }, 429),
      keyGenerator: (req) => `${req.ip}:${isStrictRoute(req) ? "auth" : "gen"}`,
    });
  }

  // Messwerte (Anzahl und Dauer je Statusklasse), siehe /metrics
  fastify.addHook("onResponse", async (req, reply) => {
    recordRequest(req.method, reply.statusCode, reply.elapsedTime / 1000);
  });

  // CSRF-Schutz zusaetzlich zu SameSite=Lax: Origin eines schreibenden Requests muss passen.
  const allowedOrigin = process.env.WEB_ORIGIN;
  fastify.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    const safe = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
    if (!safe && allowedOrigin && origin && origin !== allowedOrigin) {
      return reply.status(403).send({ message: "Origin nicht erlaubt" });
    }
  });
}
