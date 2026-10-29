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

export const CONSENT_PURPOSES = [
  "terms",
  "privacy",
  "personalized_feed",
  "analytics",
  "marketing_email",
] as const;
export const consentPurposeSchema = z.enum(CONSENT_PURPOSES);
export type ConsentPurpose = z.infer<typeof consentPurposeSchema>;

/** Aktuelle Version der Rechtstexte; bei Aenderung muss neu zugestimmt werden. */
export const LEGAL_VERSION = "2026-10-29";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(2).max(50),
  // Mindestalter 16 (Art. 8 DSGVO / DE): nur Bestaetigung, kein Geburtsdatum gespeichert.
  confirmAge16: z.literal(true),
  acceptTerms: z.literal(true),
  acceptPrivacy: z.literal(true),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const publicUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  createdAt: z.string(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

/** Zwecke, die Nutzer selbst ein-/ausschalten duerfen (terms/privacy sind Vertragsgrundlage). */
export const OPTIONAL_CONSENTS = ["personalized_feed", "analytics", "marketing_email"] as const;
export const setConsentSchema = z.object({
  purpose: z.enum(OPTIONAL_CONSENTS),
  granted: z.boolean(),
});
export type SetConsentInput = z.infer<typeof setConsentSchema>;

export const consentStateSchema = z.object({
  purpose: consentPurposeSchema,
  granted: z.boolean(),
  version: z.string(),
  updatedAt: z.string(),
});
export type ConsentState = z.infer<typeof consentStateSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
