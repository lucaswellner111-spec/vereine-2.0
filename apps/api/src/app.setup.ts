import fastifyCookie from "@fastify/cookie";
import fastifyRateLimit from "@fastify/rate-limit";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

const isAuthRoute = (url: string) => url.startsWith("/auth/");

export async function configureApp(
  app: NestFastifyApplication,
  opts: { rateLimit?: boolean } = {},
) {
  const fastify = app.getHttpAdapter().getInstance();

  await fastify.register(fastifyCookie);

  if (opts.rateLimit !== false) {
    await fastify.register(fastifyRateLimit, {
      max: (req) => (isAuthRoute(req.url) ? 10 : 200),
      timeWindow: "1 minute",
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
