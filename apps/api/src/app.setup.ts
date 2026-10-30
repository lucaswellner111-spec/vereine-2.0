import fastifyCookie from "@fastify/cookie";
import fastifyRateLimit from "@fastify/rate-limit";
import { HttpException } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type Redis from "ioredis";
import { REDIS } from "./cache/cache.module";

const isAuthRoute = (url: string) => url.startsWith("/auth/");

export async function configureApp(
  app: NestFastifyApplication,
  opts: { rateLimit?: boolean } = {},
) {
  const fastify = app.getHttpAdapter().getInstance();

  await fastify.register(fastifyCookie);

  if (opts.rateLimit !== false) {
    // Mit Redis teilen sich alle App-Server dieselben Zaehler; ohne Redis zaehlt jeder Prozess einzeln.
    const redis = app.get<Redis | null>(REDIS, { strict: false }) ?? undefined;
    await fastify.register(fastifyRateLimit, {
      redis,
      nameSpace: "rl:",
      skipOnError: true, // Redis-Ausfall darf die API nicht lahmlegen (Fail-open)
      max: (req) => (isAuthRoute(req.url) ? 10 : 200),
      timeWindow: "1 minute",
      // HttpException statt Roh-Fehler: sauberes 429 ohne Fehler-Log-Flut.
      errorResponseBuilder: (_req, ctx) =>
        new HttpException({ message: `Zu viele Anfragen. Bitte warte ${Math.ceil(ctx.ttl / 1000)} Sekunden.`, statusCode: 429 }, 429),
      keyGenerator: (req) => `${req.ip}:${isAuthRoute(req.url) ? "auth" : "gen"}`,
    });
  }

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
