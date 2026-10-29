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

// --- Vereine, Beitraege, Feed ------------------------------------------------

export const ORG_CATEGORIES = ["Sport", "Kultur", "Feuerwehr", "Umwelt", "Soziales", "Bildung", "Sonstiges"] as const;

export const createOrgSchema = z.object({
  name: z.string().trim().min(3).max(80),
  category: z.enum(ORG_CATEGORIES),
  city: z.string().trim().min(2).max(60),
  about: z.string().trim().max(600).default(""),
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const ORG_ROLES = ["admin", "treasurer", "moderator", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export type OrgSummary = {
  slug: string;
  name: string;
  category: string;
  city: string;
  about: string;
  followers: number;
  members: number;
};
export type OrgDetail = OrgSummary & {
  viewer: { following: boolean; membership: "none" | "pending" | "active"; role: OrgRole | null };
};

export const POST_KINDS = ["update", "event", "donation"] as const;
export const createPostSchema = z.object({
  body: z.string().trim().min(1).max(1000),
  orgSlug: z.string().trim().min(1).max(100).optional(),
  kind: z.enum(POST_KINDS).default("update"),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const createCommentSchema = z.object({ body: z.string().trim().min(1).max(500) });
export const reportSchema = z.object({
  reason: z.enum(["spam", "hate", "illegal", "other"]),
  note: z.string().trim().max(300).optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

export type FeedPost = {
  id: string;
  body: string;
  kind: (typeof POST_KINDS)[number];
  createdAt: string;
  author: { id: string; name: string };
  org: { slug: string; name: string } | null;
  likes: number;
  comments: number;
  likedByMe: boolean;
  canDelete: boolean;
  reason: string;
};
export type FeedResponse = { mode: "ranked" | "chrono"; personalized: boolean; posts: FeedPost[] };
export type CommentItem = { id: string; body: string; createdAt: string; author: { id: string; name: string } };

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
