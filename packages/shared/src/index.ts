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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});
export type SessionInfo = { id: string; current: boolean; device: string; createdAt: string; expiresAt: string };

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
  isPlatformAdmin: z.boolean().optional(),
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
export const createPostSchema = z
  .object({
    body: z.string().trim().max(1000).default(""),
    orgSlug: z.string().trim().min(1).max(100).optional(),
    kind: z.enum(POST_KINDS).default("update"),
    mediaIds: z.array(z.string().uuid()).max(4).default([]),
  })
  .refine((p) => p.body.length > 0 || p.mediaIds.length > 0, { message: "Text oder Bild erforderlich.", path: ["body"] });
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const createCommentSchema = z.object({ body: z.string().trim().min(1).max(500) });
export const reportSchema = z.object({
  reason: z.enum(["spam", "hate", "illegal", "other"]),
  note: z.string().trim().max(300).optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

export type MediaRef = { id: string; width: number; height: number };

export type FeedPost = {
  id: string;
  body: string;
  kind: (typeof POST_KINDS)[number];
  createdAt: string;
  author: { id: string; name: string; handle: string | null; avatarId: string | null };
  org: { slug: string; name: string } | null;
  media: MediaRef[];
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
    /** Serie: der Termin wird mehrfach angelegt (woechentlich, 14-taegig, monatlich). */
    repeat: z.object({ freq: z.enum(["weekly", "biweekly", "monthly"]), count: z.number().int().min(2).max(52) }).optional(),
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
  /** Gemeinsame Kennung der Termine einer Serie (sonst null). */
  seriesId: string | null;
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
    | "event_canceled"
    | "new_follower"
    | "follow_request"
    | "follow_accepted"
    | "invoice_new"
    | "invoice_overdue";
  data: Record<string, string>;
  readAt: string | null;
  createdAt: string;
};
export type NotificationsResponse = { unread: number; items: NotificationItem[] };
export type CommentItem = { id: string; body: string; createdAt: string; author: { id: string; name: string; handle?: string | null } };

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

// --- Plattform-Moderation ----------------------------------------------------

export const resolveChatReportSchema = z.object({
  action: z.enum(["dismiss", "delete"]),
  note: z.string().trim().max(500).optional(),
});
export type ChatReportItem = {
  id: string;
  reason: string;
  note: string | null;
  createdAt: string;
  reporterName: string;
  senderName: string;
  conversationKind: "direct" | "group";
  /** Nur die gemeldete Nachricht, null wenn bereits geloescht. */
  text: string | null;
};

// --- Profile ----------------------------------------------------------------

export const PROFILE_VISIBILITY = ["public", "private"] as const;
export const RESERVED_HANDLES = ["admin", "api", "ws", "me", "root", "system", "support", "klubnest", "plattform", "vereine", "chat", "feed", "kalender"];
export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,30}$/, "3–30 Zeichen: Buchstaben, Ziffern, Unterstrich")
  .refine((h) => !RESERVED_HANDLES.includes(h), "Dieser Name ist reserviert.");

export const updateProfileSchema = z.object({
  handle: handleSchema.optional(),
  displayName: z.string().trim().min(2).max(50).optional(),
  bio: z.string().trim().max(300).optional(),
  location: z.string().trim().max(60).optional(),
  visibility: z.enum(PROFILE_VISIBILITY).optional(),
  showClubs: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export type FollowState = "none" | "requested" | "following";
export type ProfileView = {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  location: string;
  avatarId: string | null;
  visibility: (typeof PROFILE_VISIBILITY)[number];
  showClubs: boolean;
  counts: { posts: number; followers: number; following: number };
  clubs: { slug: string; name: string }[] | null;
  viewer: { isMe: boolean; follow: FollowState; canView: boolean };
};
export type PersonItem = { userId: string; handle: string; displayName: string; avatarId: string | null; follow: FollowState };
export type FollowRequest = { userId: string; handle: string; displayName: string; avatarId: string | null; at: string };

export const followDecisionSchema = z.object({ decision: z.enum(["approve", "reject"]) });
export const feedbackSchema = z.object({ kind: z.enum(["hide", "mute_author", "mute_org"]) });
export type MutedItem = { kind: "post" | "user" | "org"; id: string; label: string };

// --- Rechnungen (Verein -> Mitglied) -----------------------------------------

export const INVOICE_STATUS = ["draft", "open", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];
export const VAT_RATES = [0, 7, 19] as const;

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(2).max(200),
  quantity: z.number().int().min(1).max(10_000),
  /** Einzelpreis netto in Cent. */
  unitCents: z.number().int().min(0).max(100_000_000),
  vatRate: z.number().int().refine((v) => (VAT_RATES as readonly number[]).includes(v), "USt-Satz: 0, 7 oder 19"),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

export const createInvoiceSchema = z.object({
  recipientUserId: z.string().uuid(),
  /** Optionale Anschrift des Empfaengers (wird als Kopie in der Rechnung gespeichert). */
  recipientAddress: z.string().trim().max(300).default(""),
  /** Faelligkeit als Datum (JJJJ-MM-TT). */
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT"),
  note: z.string().trim().max(500).default(""),
  items: z.array(invoiceItemSchema).min(1).max(30),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const voidInvoiceSchema = z.object({ reason: z.string().trim().min(5).max(300) });

export type InvoiceItemView = { description: string; quantity: number; unitCents: number; vatRate: number };
export type InvoiceSummary = {
  id: string;
  orgSlug: string;
  orgName: string;
  /** Null solange die Rechnung ein Entwurf ist. */
  number: string | null;
  status: InvoiceStatus;
  /** Anzeigestatus: offene Rechnungen nach Faelligkeit sind "overdue". */
  displayStatus: InvoiceStatus | "overdue";
  recipientName: string;
  recipientUserId: string | null;
  issueDate: string | null;
  dueDate: string;
  totalCents: number;
  paidAt: string | null;
};
export type InvoiceDetail = InvoiceSummary & {
  recipientAddress: string;
  issuerName: string;
  issuerCity: string;
  issuerAddress: string;
  issuerIban: string;
  issuerTaxInfo: string;
  note: string;
  vatNote: string;
  netCents: number;
  vatCents: number;
  items: InvoiceItemView[];
  voidReason: string | null;
};
export type InvoiceRecipient = { userId: string; name: string };

// --- Vereinsstammdaten (Rechnungen) und Einladungslinks ------------------------

/** IBAN-Pruefsumme (ISO 13616, mod 97). */
export function isValidIban(value: string): boolean {
  const iban = value.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of rearranged) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

export const orgBillingProfileSchema = z.object({
  address: z.string().trim().max(300).default(""),
  iban: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, "").toUpperCase())
    .refine((v) => v === "" || isValidIban(v), "Ungültige IBAN")
    .default(""),
  taxInfo: z.string().trim().max(300).default(""),
});
export type OrgBillingProfileInput = z.infer<typeof orgBillingProfileSchema>;
export type OrgBillingProfile = { address: string; iban: string; taxInfo: string };

export const createInviteSchema = z.object({
  maxUses: z.number().int().min(1).max(500).default(50),
  expiresInDays: z.number().int().min(1).max(90).default(14),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type InviteItem = {
  id: string;
  maxUses: number;
  uses: number;
  expiresAt: string;
  createdAt: string;
  status: "active" | "expired" | "used_up" | "revoked";
};
/** Der Klartext-Token wird nur einmal bei der Erstellung geliefert. */
export type CreatedInvite = InviteItem & { token: string };
export type InviteInfo = { orgName: string; orgSlug: string; alreadyMember: boolean };

export const cancelEventSchema = z.object({ scope: z.enum(["single", "series"]).default("single") });
export type CalendarFeedStatus = { enabled: boolean; createdAt: string | null };
/** Der Klartext-Token wird nur einmal geliefert. */
export type CalendarFeedCreated = { token: string; createdAt: string };

// --- Zwei-Faktor-Anmeldung (TOTP) ------------------------------------------------

const twoFactorCode = z.string().trim().min(6).max(20);
export const twoFactorCodeSchema = z.object({ code: twoFactorCode });
export const twoFactorLoginSchema = z.object({ challenge: z.string().min(10).max(500), code: twoFactorCode });
export const twoFactorConfirmSchema = z.object({ password: z.string().min(1).max(128), code: twoFactorCode });
export type TwoFactorStatus = { enabled: boolean; recoveryCodesLeft: number };
export type TwoFactorSetup = { secret: string; otpauthUrl: string; qrSvg: string };
/** Antwort auf /auth/login: Nutzer (angemeldet) oder Herausforderung fuer den zweiten Faktor. */
export type LoginResult = PublicUser | { twoFactorRequired: true; challenge: string };

// --- Web-Push ----------------------------------------------------------------------

const pushEndpoint = z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Nur https-Endpunkte");
export const pushSubscribeSchema = z.object({
  endpoint: pushEndpoint,
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});
export const pushUnsubscribeSchema = z.object({ endpoint: pushEndpoint });
export type PrivatePushState = { publicKey: string | null; devices: number };

// --- Mitgliederverwaltung (Stammdaten, Beitragsklassen) -------------------------------

export const FEE_INTERVALS = ["monthly", "quarterly", "halfyearly", "yearly"] as const;
export type FeeInterval = (typeof FEE_INTERVALS)[number];

export const feeClassSchema = z.object({
  name: z.string().trim().min(2).max(60),
  /** Beitrag in Cent je Intervall. */
  amountCents: z.number().int().min(0).max(10_000_000),
  interval: z.enum(FEE_INTERVALS),
  description: z.string().trim().max(200).default(""),
});
export type FeeClassInput = z.infer<typeof feeClassSchema>;
export type FeeClassItem = FeeClassInput & { id: string; members: number };

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT")
  .refine((d) => !Number.isNaN(Date.parse(d)), "Ungültiges Datum");
const birthDate = isoDate.refine((d) => d >= "1900-01-01" && d <= new Date().toISOString().slice(0, 10), "Geburtsdatum nicht plausibel");

/** Angaben, die ein Mitglied selbst pflegt. */
export const selfMemberProfileSchema = z.object({
  street: z.string().trim().max(120).default(""),
  zip: z.string().trim().max(10).default(""),
  city: z.string().trim().max(60).default(""),
  phone: z.string().trim().max(30).default(""),
  birthDate: z.union([birthDate, z.literal("")]).default(""),
  guardianName: z.string().trim().max(100).default(""),
  guardianEmail: z.union([z.string().trim().toLowerCase().email().max(254), z.literal("")]).default(""),
});
export type SelfMemberProfileInput = z.infer<typeof selfMemberProfileSchema>;

/** Zusaetzlich vom Vorstand pflegbar. */
export const adminMemberProfileSchema = selfMemberProfileSchema.extend({
  feeClassId: z.string().uuid().nullable().default(null),
  joinedOn: isoDate,
  notes: z.string().trim().max(500).default(""),
});
export type AdminMemberProfileInput = z.infer<typeof adminMemberProfileSchema>;

export type MemberRegistryItem = {
  userId: string;
  name: string;
  memberNo: number;
  role: OrgRole;
  joinedOn: string;
  feeClassId: string | null;
  feeClassName: string | null;
  city: string;
  /** Null, solange kein Geburtsdatum hinterlegt ist. */
  minor: boolean | null;
};
export type MemberRegistryPage = { total: number; items: MemberRegistryItem[] };
export type MemberRecord = Required<SelfMemberProfileInput> & {
  userId: string;
  name: string;
  memberNo: number;
  role: OrgRole;
  joinedOn: string;
  feeClassId: string | null;
  notes: string;
  minor: boolean | null;
};
export type MyMembership = { orgSlug: string; orgName: string; memberNo: number; profile: Required<SelfMemberProfileInput>; joinedOn: string; feeClassName: string | null };

export type OrgDashboard = {
  members: number;
  pendingRequests: number;
  newMembers30d: number;
  minors: number | null;
  invoices: { open: number; overdue: number; openCents: number; paidThisYearCents: number } | null;
  upcomingEvents: { id: string; title: string; startsAt: string; yes: number }[];
  byFeeClass: { name: string; members: number }[];
  joinsByMonth: { month: string; joins: number }[];
};
