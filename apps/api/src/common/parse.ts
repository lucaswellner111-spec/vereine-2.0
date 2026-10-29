import { BadRequestException } from "@nestjs/common";
import type { ZodType } from "zod";

/** Validiert Eingaben mit einem Zod-Schema aus @vereine/shared. */
export function parse<T>(schema: ZodType<T, any, any>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(result.error.flatten().fieldErrors);
  return result.data;
}
