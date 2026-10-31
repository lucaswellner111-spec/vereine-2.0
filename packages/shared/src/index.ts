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
export type FeedResponse = {
  mode: "ranked" | "chrono";
  personalized: boolean;
  posts: FeedPost[];
  /** Opaker Cursor fuer die naechste Seite; null = Ende. */
  nextCursor: string | null;
};

// --- Mitgliederverwaltung ----------------------------------------------------

export const decisionSchema = z.object({ decision: z.enum(["approve", "reject"]) });
export const setRoleSchema = z.object({ role: z.enum(ORG_ROLES) });

export type MemberItem = {
  userId: string;
  name: string;
  role: OrgRole;
  status: "pending" | "active";
  since: string;
};

// --- Moderation (DSA: Meldeverfahren, Begruendung) ---------------------------

export const resolveReportSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss") }),
  z.object({ action: z.literal("hide"), reason: z.string().trim().min(10).max(500) }),
]);
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;

export type ReportItem = {
  id: string;
  reason: string;
  note: string | null;
  createdAt: string;
  post: { id: string; body: string; authorName: string; hidden: boolean };
};

// --- Termine & Teams ---------------------------------------------------------

export const createTeamSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).default(""),
});
export type TeamItem = { id: string; name: string; description: string; members: number; isMember: boolean };
export type TeamMemberItem = { userId: string; name: string };

export const EVENT_VISIBILITY = ["members", "public"] as const;
export const createEventSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).default(""),
    location: z.string().trim().max(120).default(""),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }).optional(),
    teamId: z.string().uuid().optional(),
    visibility: z.enum(EVENT_VISIBILITY).default("members"),
  })
  .refine((e) => !e.endsAt || new Date(e.endsAt) > new Date(e.startsAt), {
    message: "Das Ende muss nach dem Beginn liegen.",
    path: ["endsAt"],
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const RSVP_STATUS = ["yes", "maybe", "no"] as const;
export type RsvpStatus = (typeof RSVP_STATUS)[number];
export const rsvpSchema = z.object({ status: z.enum(RSVP_STATUS) });

export type EventItem = {
  id: string;
  orgSlug: string;
  orgName: string;
  teamId: string | null;
  teamName: string | null;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  visibility: (typeof EVENT_VISIBILITY)[number];
  canceled: boolean;
  counts: { yes: number; maybe: number; no: number };
  myStatus: RsvpStatus | null;
  canManage: boolean;
};
export type RsvpItem = { userId: string; name: string; status: RsvpStatus };

// --- Benachrichtigungen ------------------------------------------------------

export type NotificationItem = {
  id: string;
  type:
    | "comment"
    | "membership_request"
    | "membership_decision"
    | "post_hidden"
    | "event_created"
    | "event_reminder"
    | "event_canceled";
  data: Record<string, string>;
  readAt: string | null;
  createdAt: string;
};
export type NotificationsResponse = { unread: number; items: NotificationItem[] };
export type CommentItem = { id: string; body: string; createdAt: string; author: { id: string; name: string } };

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// --- Chat --------------------------------------------------------------------

export const CHAT_MAX_BODY = 2000;
export const sendMessageSchema = z.object({ body: z.string().trim().min(1).max(CHAT_MAX_BODY) });

export const createConversationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("direct"), userId: z.string().uuid() }),
  z.object({
    kind: z.literal("group"),
    orgSlug: z.string().trim().min(1).max(100),
    title: z.string().trim().min(2).max(80),
    memberIds: z.array(z.string().uuid()).max(500).default([]),
  }),
]);
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const setRetentionSchema = z.object({ days: z.number().int().min(1).max(3650).nullable() });
export const reportMessageSchema = z.object({
  reason: z.enum(["spam", "hate", "illegal", "other"]),
  note: z.string().trim().max(300).optional(),
});
export const addMembersSchema = z.object({ userIds: z.array(z.string().uuid()).min(1).max(100) });

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string | null; // null = geloescht
  deleted: boolean;
  createdAt: string;
  mine: boolean;
};
export type ConversationMember = { userId: string; name: string; role: "owner" | "member" };
export type ConversationSummary = {
  id: string;
  kind: "direct" | "group";
  title: string;
  orgSlug: string | null;
  unread: number;
  lastMessage: { preview: string; createdAt: string; mine: boolean } | null;
  lastActivityAt: string;
};
export type ConversationDetail = ConversationSummary & {
  members: ConversationMember[];
  retentionDays: number | null;
  effectiveRetentionDays: number;
  iAmOwner: boolean;
  blocked: boolean;
};
export type MessagePage = { messages: ChatMessage[]; nextCursor: string | null };
export type ChatContact = { userId: string; name: string; context: string };

/** Ereignis ueber den WebSocket: enthaelt nur IDs, keine Nachrichteninhalte. */
export type ChatEvent =
  | { type: "message"; conversationId: string; messageId: string }
  | { type: "conversation"; conversationId: string }
  | { type: "read"; conversationId: string };
