import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";

/** Prueft `Authorization: Bearer <METRICS_TOKEN>` zeitkonstant. Ohne gesetzten Token immer false. */
export function hasMetricsToken(req: FastifyRequest): boolean {
  const token = process.env.METRICS_TOKEN;
  if (!token) return false;
  const given = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
