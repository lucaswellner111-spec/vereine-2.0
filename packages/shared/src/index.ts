import { z } from "zod";

export const ROLES = [
  "platform_admin",
  "org_admin",
  "treasurer",
  "moderator",
  "member",
  "fan",
] as const;

export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
