import { BadRequestException } from "@nestjs/common";
import type { z } from "zod";

/** Validiert Eingaben mit einem Zod-Schema aus @vereine/shared und liefert den geparsten Typ. */
export function parse<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(result.error.flatten().fieldErrors);
  return result.data;
}
