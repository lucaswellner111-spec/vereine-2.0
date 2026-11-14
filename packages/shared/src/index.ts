import { z } from "zod";
import { MAX_ORG_TAGS, MAX_POST_TAGS, TAG_IDS } from "./tags";
export * from "./tags";
export * from "./avv";

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
export const LEGAL_VERSION = "2026-11-14";

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
  /** false = Adresse noch nicht bestaetigt (Banner; Verein gruenden und Einladungen gesperrt). */
  emailVerified: z.boolean().optional(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

// --- E-Mail-Ablaeufe (Bestaetigung, Passwort vergessen, Adresse aendern) ------------------------

/** Meldung, wenn eine Aktion eine bestaetigte Adresse verlangt (Verein gruenden, Einladungen). */
export const EMAIL_NOT_VERIFIED = "Bitte bestätige zuerst deine E-Mail-Adresse.";
/** Einheitliche Antwort der Registrierung und von "Passwort vergessen" (verraet nicht, ob ein Konto existiert). */
export const CHECK_INBOX_MESSAGE = "Prüfe dein Postfach.";

const emailField = z.string().trim().toLowerCase().email().max(254);
const tokenField = z.string().trim().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/);

export const emailTokenSchema = z.object({ token: tokenField });
export const forgotPasswordSchema = z.object({ email: emailField });
export const resetPasswordSchema = z.object({ token: tokenField, newPassword: z.string().min(12).max(128) });
export const changeEmailSchema = z.object({ newEmail: emailField, password: z.string().min(1).max(128) });
export const unsubscribeSchema = z.object({ token: z.string().min(10).max(400) });
export const inviteMailSchema = z.object({ email: emailField });
export const emailPrefsSchema = z.object({ digest: z.boolean() });

export type CheckInboxResponse = { message: string };
export type ConfirmEmailResult = { user: PublicUser; loggedIn: boolean; changed: boolean };
/** Sammelmail fuer Benachrichtigungen (Opt-in). `available` = Adresse bestaetigt (sonst kann nichts verschickt werden). */
export type EmailPrefs = { digest: boolean; since: string | null; available: boolean };
export type MailQuota = {
  driver: "log" | "smtp" | "memory";
  day: { used: number; limit: number; percent: number };
  month: { used: number; limit: number; percent: number };
  percent: number;
  warning: boolean;
};

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

/** Tags aus dem festen Katalog (src/tags.ts), ohne Duplikate. */
const tagList = (max: number) =>
  z
    .array(z.enum(TAG_IDS))
    .max(max, `Höchstens ${max} Tags`)
    .transform((tags) => [...new Set(tags)]);
export const orgTagsSchema = z.object({ tags: tagList(MAX_ORG_TAGS) });

export const createOrgSchema = z.object({
  name: z.string().trim().min(3).max(80),
  tags: tagList(MAX_ORG_TAGS).default([]),
  category: z.enum(ORG_CATEGORIES),
  city: z.string().trim().min(2).max(60),
  about: z.string().trim().max(600).default(""),
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
/** Vereinsprofil bearbeiten (nur Vorstand); die Adresse (Slug) bleibt fest. */
export const updateOrgSchema = z.object({
  name: z.string().trim().min(3).max(80),
  category: z.enum(ORG_CATEGORIES),
  city: z.string().trim().min(2).max(60),
  about: z.string().trim().max(600).default(""),
});
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
/** Vereins-Adressen, die mit festen Routen (/orgs/mine, /orgs/managed, /vereine/neu) kollidieren wuerden. */
export const RESERVED_ORG_SLUGS = ["mine", "managed", "neu"];
/** Namensliste aktiver Mitglieder (fuer Vorstand/Moderation, z. B. Gruppen-Chat anlegen) - ohne Rollen und E-Mails. */
export type OrgMemberName = { userId: string; name: string };

export const ORG_ROLES = ["admin", "treasurer", "moderator", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export type OrgSummary = {
  slug: string;
  name: string;
  category: string;
  tags: string[];
  city: string;
  about: string;
  followers: number;
  members: number;
  /** Vereinslogo (Medien-ID, Varianten logo/logo-sm) oder null. */
  logoId: string | null;
};
export type OrgDetail = OrgSummary & {
  /** Banner (Varianten banner/banner-sm) oder null. */
  bannerId: string | null;
  /** Oeffentliche Vereinsseite /verein/<slug> ohne Login freigeschaltet (nur der Vorstand schaltet um). */
  publicPage: boolean;
  viewer: { following: boolean; membership: "none" | "pending" | "active"; role: OrgRole | null };
};

export const POST_KINDS = ["update", "event", "donation"] as const;

// --- Umfragen an Beitraegen (Einfachwahl, anonym) ---
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;
export const POLL_MAX_DAYS = 90;
export const pollInputSchema = z
  .object({
    question: z.string().trim().min(3).max(200),
    options: z.array(z.string().trim().min(1).max(80)).min(POLL_MIN_OPTIONS).max(POLL_MAX_OPTIONS),
    /** Ende der Abstimmung; ohne Angabe offen. Hoechstens 90 Tage in der Zukunft. */
    closesAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((p) => new Set(p.options.map((o) => o.toLocaleLowerCase("de"))).size === p.options.length, {
    message: "Antworten dürfen sich nicht wiederholen.",
    path: ["options"],
  })
  .refine((p) => !p.closesAt || new Date(p.closesAt).getTime() > Date.now(), { message: "Das Ende muss in der Zukunft liegen.", path: ["closesAt"] })
  .refine((p) => !p.closesAt || new Date(p.closesAt).getTime() <= Date.now() + POLL_MAX_DAYS * 86400_000, {
    message: `Höchstens ${POLL_MAX_DAYS} Tage Laufzeit.`,
    path: ["closesAt"],
  });
export type PollInput = z.infer<typeof pollInputSchema>;
export const pollVoteSchema = z.object({ optionId: z.string().uuid() });
/** Ergebnis einer Umfrage: nur Zahlen und die eigene Wahl, nie Namen. */
export type PollView = {
  question: string;
  options: { id: string; label: string; votes: number }[];
  total: number;
  myOptionId: string | null;
  closesAt: string | null;
  closed: boolean;
};

export const createPostSchema = z
  .object({
    body: z.string().trim().max(1000).default(""),
    orgSlug: z.string().trim().min(1).max(100).optional(),
    kind: z.enum(POST_KINDS).default("update"),
    mediaIds: z.array(z.string().uuid()).max(4).default([]),
    /** Leer + Vereinsbeitrag: Tags des Vereins werden uebernommen. */
    tags: tagList(MAX_POST_TAGS).default([]),
    poll: pollInputSchema.optional(),
  })
  .refine((p) => p.body.length > 0 || p.mediaIds.length > 0 || !!p.poll, { message: "Text oder Bild erforderlich.", path: ["body"] });
export type CreatePostInput = z.infer<typeof createPostSchema>;
/** Beitrag bearbeiten: nur Text und Tags (Bilder bleiben). Leerer Text nur, wenn der Beitrag Bilder hat (prueft die API). */
export const updatePostSchema = z.object({
  body: z.string().trim().max(1000),
  tags: tagList(MAX_POST_TAGS).default([]),
});
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

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
  tags: string[];
  createdAt: string;
  author: { id: string; name: string; handle: string | null; avatarId: string | null };
  org: { slug: string; name: string; logoId: string | null } | null;
  media: MediaRef[];
  likes: number;
  comments: number;
  likedByMe: boolean;
  canDelete: boolean;
  /** Autor darf Text/Tags aendern (bei Vereinsbeitraegen nur mit Vorstand-/Moderationsrolle). */
  canEdit: boolean;
  /** Zeitpunkt der letzten Bearbeitung oder null. */
  editedAt: string | null;
  /** Umfrage am Beitrag oder null. */
  poll: PollView | null;
  reason: string;
};
export type FeedResponse = {
  mode: "ranked" | "chrono";
  personalized: boolean;
  posts: FeedPost[];
  /** Opaker Cursor fuer die naechste Seite; null = Ende. */
  nextCursor: string | null;
};
/** Profil-Fotos: persoenliche Beitraege mit Bildern (Keyset-Paging, max. 30 je Seite). */
export const PROFILE_MEDIA_PAGE = 30;
export const profileMediaQuerySchema = z.object({ cursor: z.string().max(500).optional() });
export type ProfileMediaPage = { posts: FeedPost[]; nextCursor: string | null; locked: boolean };

// --- Mitgliederverwaltung ----------------------------------------------------

export const decisionSchema = z.object({ decision: z.enum(["approve", "reject"]) });
export const setRoleSchema = z.object({ role: z.enum(ORG_ROLES) });

export type MemberItem = {
  userId: string;
  name: string;
  /** Fuer den Profil-Link; null bei geloeschtem Konto. */
  handle: string | null;
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
  post: { id: string; body: string; authorName: string; authorHandle: string | null; hidden: boolean };
  /** gesetzt = Meldung eines Kommentars unter diesem Beitrag */
  comment: { id: string; body: string; authorName: string; authorHandle: string | null } | null;
};

// --- Termine & Teams ---------------------------------------------------------

export const createTeamSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).default(""),
});
export type TeamItem = { id: string; name: string; description: string; members: number; isMember: boolean };
export type TeamMemberItem = { userId: string; name: string; handle: string | null };

export const EVENT_VISIBILITY = ["members", "public"] as const;
/** Art des Termins (Anzeige, Filter, Anwesenheitsquote). */
export const EVENT_KINDS = ["training", "match", "meeting", "party", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
/** Teilnehmerlimit: leer = unbegrenzt. */
const eventCapacity = z.number().int().min(1).max(10000);
export const createEventSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).default(""),
    location: z.string().trim().max(120).default(""),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }).optional(),
    teamId: z.string().uuid().optional(),
    visibility: z.enum(EVENT_VISIBILITY).default("members"),
    kind: z.enum(EVENT_KINDS).default("other"),
    capacity: eventCapacity.optional(),
    /** Serie: der Termin wird mehrfach angelegt (woechentlich, 14-taegig, monatlich). */
    repeat: z.object({ freq: z.enum(["weekly", "biweekly", "monthly"]), count: z.number().int().min(2).max(52) }).optional(),
  })
  .refine((e) => !e.endsAt || new Date(e.endsAt) > new Date(e.startsAt), {
    message: "Das Ende muss nach dem Beginn liegen.",
    path: ["endsAt"],
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

/**
 * Termin bearbeiten (alle Felder optional). scope "series": dieser und alle spaeteren Termine der Serie, aber
 * Datum/Uhrzeit aendern sich immer nur bei diesem Termin. Das Team bleibt fest.
 */
export const updateEventSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    location: z.string().trim().max(120).optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
    visibility: z.enum(EVENT_VISIBILITY).optional(),
    kind: z.enum(EVENT_KINDS).optional(),
    capacity: eventCapacity.nullable().optional(),
    scope: z.enum(["single", "series"]).default("single"),
  })
  .refine((e) => !e.endsAt || !e.startsAt || new Date(e.endsAt) > new Date(e.startsAt), {
    message: "Das Ende muss nach dem Beginn liegen.",
    path: ["endsAt"],
  });
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const RSVP_STATUS = ["yes", "maybe", "no"] as const;
/** Antwort, die man selbst geben kann. */
export type RsvpStatus = (typeof RSVP_STATUS)[number];
/** Gespeicherter Stand: bei vollem Limit wird aus einer Zusage "waitlist". */
export type RsvpState = RsvpStatus | "waitlist";
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
  kind: EventKind;
  /** Teilnehmerlimit, null = unbegrenzt. */
  capacity: number | null;
  counts: { yes: number; maybe: number; no: number; waitlist: number };
  myStatus: RsvpState | null;
  /** Eigener Platz auf der Warteliste (1 = als Naechstes), sonst null. */
  waitlistPosition: number | null;
  canManage: boolean;
};
export type RsvpItem = { userId: string; name: string; handle: string | null; status: RsvpState };

// --- Helferlisten (Dienste an einem Termin) ---
const shiftTime = z.string().datetime({ offset: true }).nullable().optional();
export const createShiftSchema = z
  .object({
    title: z.string().trim().min(2).max(80),
    startsAt: shiftTime,
    endsAt: shiftTime,
    slots: z.number().int().min(1).max(100),
  })
  .refine((s) => !s.endsAt || !s.startsAt || new Date(s.endsAt) > new Date(s.startsAt), { message: "Das Ende muss nach dem Beginn liegen.", path: ["endsAt"] });
export const updateShiftSchema = z
  .object({
    title: z.string().trim().min(2).max(80).optional(),
    startsAt: shiftTime,
    endsAt: shiftTime,
    slots: z.number().int().min(1).max(100).optional(),
  })
  .refine((s) => !s.endsAt || !s.startsAt || new Date(s.endsAt) > new Date(s.startsAt), { message: "Das Ende muss nach dem Beginn liegen.", path: ["endsAt"] });
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type ShiftPerson = { userId: string; name: string; handle: string | null; avatarId: string | null };
export type ShiftItem = {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  slots: number;
  taken: number;
  mine: boolean;
  /** Nur fuer aktive Vereinsmitglieder (sonst fehlt das Feld). */
  people?: ShiftPerson[];
};

// --- Anwesenheit (nur Vorstand/Moderation) ---
export const ATTENDANCE_STATUS = ["present", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];
export const saveAttendanceSchema = z.object({
  entries: z
    .array(z.object({ userId: z.string().uuid(), status: z.enum(ATTENDANCE_STATUS).nullable() }))
    .min(1)
    .max(500)
    .refine((list) => new Set(list.map((e) => e.userId)).size === list.length, { message: "Jede Person nur einmal." }),
});
export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;
export type AttendanceEntry = { userId: string; name: string; status: AttendanceStatus | null; rsvp: RsvpState | null };
export type AttendanceList = { entries: AttendanceEntry[] };
/**
 * Zusagen fuer alle, die den Termin sehen: bei internen/Team-Terminen sehen Vereinsmitglieder Anzeigename
 * und Avatar der Zusagen; bei oeffentlichen Terminen nur die Anzahl (visible = false).
 */
export type EventAttendee = { userId: string; name: string; handle: string | null; avatarId: string | null };
export type EventAttendees = { visible: boolean; total: number; people: EventAttendee[] };

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
    | "event_updated"
    | "event_waitlist_promoted"
    | "new_follower"
    | "follow_request"
    | "follow_accepted"
    | "invoice_new"
    | "invoice_overdue"
    | "fee_run_done";
  data: Record<string, string>;
  readAt: string | null;
  createdAt: string;
};
export type NotificationsResponse = {
  unread: number;
  items: NotificationItem[];
  /** Opaker Cursor fuer aeltere Eintraege; null = Ende. */
  nextCursor: string | null;
};
export const notificationsQuerySchema = z.object({
  limit: z.string().max(5).optional(),
  cursor: z.string().max(500).optional(),
});
export const markNotificationsReadSchema = z.object({ ids: z.array(z.string().uuid()).max(100).optional() });
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
export type ConversationMember = { userId: string; name: string; handle: string | null; role: "owner" | "member"; avatarId: string | null };
export type ConversationSummary = {
  id: string;
  kind: "direct" | "group";
  title: string;
  /** Direktchat: Avatar der anderen Person (auch bei privatem Profil); Gruppe: null. */
  avatarId: string | null;
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
/** Aktive Vereinsmitglieder, die noch nicht in der Gruppe sind (nur fuer Besitzer). */
export type ChatCandidate = { userId: string; name: string; avatarId: string | null };
/** Hoechstens so viele Treffer je Abfrage; Suche nach Namen serverseitig (?q=). */
export const CHAT_CANDIDATES_LIMIT = 50;
export const chatCandidatesQuerySchema = z.object({ q: z.string().trim().max(80).optional().default("") });

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
  reporterHandle: string | null;
  senderName: string;
  senderHandle: string | null;
  /** null = Unterhaltung existiert nicht mehr (die Beweiskopie der Meldung bleibt trotzdem lesbar). */
  conversationKind: "direct" | "group" | null;
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
  viewer: { isMe: boolean; follow: FollowState; canView: boolean; canMessage: boolean };
};
/** isPrivate: privates Profil (Folgen braucht Freigabe), fuer den optimistischen Zustand "Angefragt". */
export type PersonItem = { userId: string; handle: string; displayName: string; avatarId: string | null; follow: FollowState; isPrivate: boolean };
export type FollowRequest = { userId: string; handle: string; displayName: string; avatarId: string | null; at: string };

export const followDecisionSchema = z.object({ decision: z.enum(["approve", "reject"]) });
export const feedbackSchema = z.object({ kind: z.enum(["hide", "mute_author", "mute_org"]) });
export type MutedItem = { kind: "post" | "user" | "org"; id: string; label: string };

/** Kalenderdatum JJJJ-MM-TT; prueft auch, ob es den Tag gibt (2026-02-31 ist ungueltig). */
const isoDate = z.iso.date({ error: "Ungültiges Datum (JJJJ-MM-TT)" });
const birthDate = isoDate.refine((d) => d >= "1900-01-01" && d <= new Date().toISOString().slice(0, 10), "Geburtsdatum nicht plausibel");

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
  dueDate: isoDate,
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
  /** Waehrung der Rechnung (bisher immer EUR). */
  currency: string;
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
  /** Widerrufene erscheinen nicht mehr in der Liste. */
  status: "active" | "expired" | "used_up" | "revoked";
};
/** Der Klartext-Token wird bei der Erstellung geliefert und kann danach nur vom Vorstand erneut abgerufen werden (protokolliert). */
export type CreatedInvite = InviteItem & { token: string };
export type InviteLink = { token: string };
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

/** Bekannte Push-Dienste der Browserhersteller (Chrome/Edge, Firefox, Safari, Windows). */
export const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
export const PUSH_HOST_SUFFIXES = [".notify.windows.com", ".push.apple.com"];
export const PUSH_HOST_ERROR = "Dieser Push-Dienst wird nicht unterstützt.";

/** Nur https, Standardport, keine Zugangsdaten in der URL und ein bekannter Push-Dienst (kein SSRF auf beliebige Hosts). */
export function isAllowedPushEndpoint(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || (u.port !== "" && u.port !== "443") || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
}

export const pushSubscribeSchema = z.object({
  endpoint: pushEndpoint.refine(isAllowedPushEndpoint, PUSH_HOST_ERROR),
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

// --- Beitragslauf (erzeugt nur Rechnungsentwuerfe) --------------------------------------

export const feeRunSchema = z.object({
  /** Zeitraum, z. B. "2027" oder "1. Halbjahr 2027"; je Verein eindeutig. */
  periodLabel: z.string().trim().min(1).max(40),
  dueDate: isoDate,
  feeClassIds: z.array(z.string().uuid()).min(1).max(30).refine((a) => new Set(a).size === a.length, "Beitragsklassen doppelt gewählt"),
});
export type FeeRunInput = z.infer<typeof feeRunSchema>;
export type FeeRunPreview = {
  count: number;
  totalCents: number;
  byClass: { feeClassId: string; name: string; amountCents: number; members: number; totalCents: number }[];
  /** Aktive Mitglieder ohne Beitragsklasse (bekommen keine Rechnung). */
  withoutClass: number;
  /** Fuer diesen Zeitraum gibt es schon einen Lauf (Anlegen ergaebe 409). */
  periodTaken: boolean;
};
export const FEE_RUN_STATUS = ["queued", "running", "done", "failed"] as const;
export type FeeRunStatus = (typeof FEE_RUN_STATUS)[number];
export type FeeRunItem = {
  id: string;
  periodLabel: string;
  dueDate: string;
  feeClassIds: string[];
  status: FeeRunStatus;
  createdCount: number;
  skippedCount: number;
  /** Ausfuehrungsversuche (ab 5 keine automatische Wiederholung). */
  attempts: number;
  createdAt: string;
  finishedAt: string | null;
};

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
  handle: string | null;
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

// --- Mitglieder-Import (CSV, Vorschau + Bestaetigung) -------------------------------------

export const MEMBER_IMPORT_LIMITS = { maxRows: 500, maxBytes: 1_000_000, inviteValidDays: 30, maxPendingPerOrg: 2000 } as const;
/** Beginnt eine Tabellenzelle so, kann Excel/LibreOffice sie als Formel ausfuehren (CSV-Injection). */
export const FORMULA_START = /^[=+\-@\t\r]/;
const importName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} fehlt.`)
    .max(60, `${label} ist zu lang (höchstens 60 Zeichen).`)
    .refine((v) => !FORMULA_START.test(v), `${label} darf nicht mit = + - oder @ beginnen.`)
    // eslint-disable-next-line no-control-regex
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), `${label} enthält Steuerzeichen.`);

/** Eine Zeile nach dem Parsen (Datum schon als JJJJ-MM-TT, Zahlen als Zahl). */
export const memberImportRowSchema = z.object({
  firstName: importName("Vorname"),
  lastName: importName("Nachname"),
  email: z.string().trim().toLowerCase().min(1, "E-Mail fehlt – ohne Adresse kann keine Einladung verschickt werden.").email("E-Mail-Adresse ist ungültig.").max(254, "E-Mail-Adresse ist zu lang."),
  memberNo: z.number({ error: "Mitgliedsnummer muss eine ganze Zahl sein." }).int("Mitgliedsnummer muss eine ganze Zahl sein.").min(1, "Mitgliedsnummer muss größer als 0 sein.").max(99_999_999, "Mitgliedsnummer ist zu groß.").nullable(),
  joinedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Eintrittsdatum ist ungültig (TT.MM.JJJJ).").nullable(),
  feeClassName: z.string().trim().max(60, "Beitragsklasse ist zu lang.").nullable(),
});
export type MemberImportRowInput = z.infer<typeof memberImportRowSchema>;

export type MemberImportField = "firstName" | "lastName" | "email" | "memberNo" | "joinedOn" | "feeClass";
export type MemberImportRow = {
  /** Zeilennummer in der Datei (Kopfzeile = 1). */
  line: number;
  firstName: string;
  lastName: string;
  email: string;
  memberNo: number | null;
  joinedOn: string | null;
  feeClassName: string | null;
  status: "ok" | "error" | "duplicate";
  problems: string[];
};
export type MemberImportPreview = {
  delimiter: ";" | "," | "\t";
  columns: { field: MemberImportField; header: string }[];
  /** Spalten, die nicht uebernommen werden (Datenminimierung). */
  ignoredColumns: string[];
  total: number;
  valid: number;
  errors: number;
  duplicates: number;
  rows: MemberImportRow[];
  /** Einladungen: heute moeglich / folgen an den naechsten Tagen (Kostenbremse). */
  mail: { today: number; later: number };
};
export type MemberImportResult = { imported: number; skipped: number; mailToday: number; mailLater: number };
export type PendingMemberItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  memberNo: number | null;
  joinedOn: string | null;
  feeClassName: string | null;
  status: "queued" | "sent" | "expired";
  sentAt: string | null;
  createdAt: string;
};
export type PendingMemberPage = { total: number; items: PendingMemberItem[] };

export type OrgDashboard = {
  members: number;
  pendingRequests: number;
  newMembers30d: number;
  minors: number | null;
  invoices: { open: number; overdue: number; openCents: number; paidThisYearCents: number } | null;
  upcomingEvents: { id: string; title: string; startsAt: string; yes: number }[];
  /** Anwesenheit der letzten 90 Tage: Anteil "da" an allen Eintraegen (null = keine Eintraege), Zahl der erfassten Termine. */
  attendance: { rate: number | null; events: number };
  byFeeClass: { name: string; members: number }[];
  joinsByMonth: { month: string; joins: number }[];
};

// --- Moderations-Werkzeug (Vereinsebene) ----------------------------------------------

export const moderatePostSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("hide"), reason: z.string().trim().min(10).max(500) }),
  z.object({ action: z.literal("unhide") }),
]);
export type ModeratePostInput = z.infer<typeof moderatePostSchema>;
export const deleteCommentSchema = z.object({ reason: z.string().trim().max(300).default("") });

export type ModerationPostItem = {
  id: string;
  body: string;
  authorName: string;
  authorHandle: string | null;
  createdAt: string;
  tags: string[];
  hidden: boolean;
  hiddenReason: string | null;
  comments: number;
  openReports: number;
};
export type ModerationCommentItem = { id: string; body: string; authorName: string; authorHandle: string | null; createdAt: string; postId: string; postExcerpt: string };

// --- Oeffentliche Vereinsseite (ohne Login) -------------------------------------------
// Bewusst ohne Personendaten: keine Namen, keine Autoren, keine Beitragsbilder, nur oeffentliche Termine.

export const setPublicPageSchema = z.object({ enabled: z.boolean() });
export const PUBLIC_PAGE_SIZE = 30;
export const publicOrgQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  city: z.string().trim().max(60).optional(),
  tag: z.string().trim().max(40).optional(),
  category: z.enum(ORG_CATEGORIES).optional(),
  offset: z.coerce.number().int().min(0).max(3000).default(0),
});
export type PublicOrgQuery = z.infer<typeof publicOrgQuerySchema>;
export type PublicOrgSummary = { slug: string; name: string; category: string; city: string; tags: string[]; logoId: string | null; members: number };
export type PublicEvent = { title: string; kind: EventKind; startsAt: string; endsAt: string | null; location: string };
export type PublicPost = { body: string; createdAt: string; tags: string[] };
export type PublicOrg = PublicOrgSummary & {
  about: string;
  bannerId: string | null;
  events: PublicEvent[];
  posts: PublicPost[];
};

// --- Warteliste (Vorab-Anmeldung ohne Login, Double-Opt-in) ------------------------------------
// Eigener Bereich `waitlist`. Antwort auf die Anmeldung ist immer gleich (keine Enumeration).

/** Version des Einwilligungstexts unter dem Formular; bei Textaenderung hochzaehlen (wird je Eintrag gespeichert). */
export const WAITLIST_CONSENT_VERSION = "2026-11-13";
export const WAITLIST_CONSENT_TEXT =
  "Ich bin einverstanden, dass Klubnest meine E-Mail-Adresse und meine Angaben speichert, um mich per E-Mail über den Start und Neuigkeiten von Klubnest zu informieren. Ich kann das jederzeit mit einem Klick über den Link in jeder Mail widerrufen.";
/** Segmente (Tags) laut Marketing: wer bekommt welche Mails. "sonstiges" kommt nur noch in alten Eintraegen vor. */
export const WAITLIST_ROLES = ["vorstand", "kasse", "trainer", "mitglied", "fan", "multiplikator"] as const;
export type WaitlistRole = (typeof WAITLIST_ROLES)[number] | "sonstiges";
export const WAITLIST_ROLE_LABELS: Record<WaitlistRole, string> = {
  vorstand: "Vorstand",
  kasse: "Kasse",
  trainer: "Trainer:in / Übungsleitung",
  mitglied: "Mitglied",
  fan: "Fan",
  multiplikator: "Verband / Multiplikator:in",
  sonstiges: "Sonstiges",
};
export const WAITLIST_REGIONS = ["lk-leipzig", "leipzig", "andere"] as const;
export type WaitlistRegion = (typeof WAITLIST_REGIONS)[number];
export const WAITLIST_REGION_LABELS: Record<WaitlistRegion, string> = { "lk-leipzig": "Landkreis Leipzig", leipzig: "Stadt Leipzig", andere: "Andere Region" };
/** Festes Vokabular fuer `?q=` (Flyer, QR-Code, Link in Bio …); alles andere wird verworfen. */
export const WAITLIST_SOURCES = ["startseite", "warteliste", "flyer", "bio", "infoabend", "gespraech", "kreissportbund"] as const;
export type WaitlistSource = (typeof WAITLIST_SOURCES)[number];
/** Quelle aus `?q=…` pruefen: nur Werte aus dem Vokabular. */
export function parseWaitlistSource(q: unknown): WaitlistSource | undefined {
  const v = typeof q === "string" ? q.trim().toLowerCase() : "";
  return (WAITLIST_SOURCES as readonly string[]).includes(v) ? (v as WaitlistSource) : undefined;
}
/** Mindestzeit zwischen Anzeige des Formulars und Absenden (Bot-Schutz ohne Drittanbieter). */
export const WAITLIST_MIN_FILL_MS = 2000;
/** Einheitliche Antwort (auch bei bekannter Adresse, Limit oder Bot-Verdacht). */
export const WAITLIST_CHECK_INBOX = "Fast geschafft – schau in dein Postfach und bestätige deine Anmeldung.";

// eslint-disable-next-line no-control-regex
const plainText = (max: number) => z.string().trim().max(max).refine((v) => !/[\u0000-\u001f\u007f]/.test(v), "Bitte keine Steuerzeichen.");

export const waitlistSignupSchema = z.object({
  email: emailField,
  /** Optional (Fans und Mitglieder haben oft keinen "eigenen" Verein). */
  orgName: plainText(120).optional().default(""),
  city: plainText(80).optional().default(""),
  orgType: plainText(60).optional().default(""),
  role: z.enum(WAITLIST_ROLES).optional(),
  region: z.enum(WAITLIST_REGIONS).optional(),
  /** Unbekannte Werte werden verworfen statt abzulehnen (Quelle ist nur Statistik). */
  source: z.enum(WAITLIST_SOURCES).optional().catch(undefined),
  consent: z.literal(true, { error: "Bitte bestätige die Einwilligung." }),
  /** Honeypot: fuer Menschen unsichtbar, muss leer bleiben. */
  website: z.string().max(200).optional(),
  /** Zeitpruefung: Millisekunden seit Anzeige des Formulars (fehlt oder zu klein = Bot-Verdacht, still verworfen). */
  elapsedMs: z.number().int().min(0).max(7 * 24 * 3600_000).optional(),
});
export type WaitlistSignupInput = z.infer<typeof waitlistSignupSchema>;
export const waitlistTokenSchema = z.object({ token: z.string().trim().min(20).max(300).regex(/^[A-Za-z0-9_.-]+$/) });

export type WaitlistEntry = {
  id: string;
  email: string;
  orgName: string;
  city: string;
  orgType: string;
  role: WaitlistRole | null;
  region: WaitlistRegion | null;
  source: WaitlistSource | null;
  confirmedAt: string;
  consentVersion: string;
};
/** Zaehlung nach Merkmal (nur bestaetigte Eintraege); Schluessel "-" = keine Angabe. */
export type WaitlistCounts = Record<string, number>;
export type WaitlistOverview = {
  confirmed: number;
  pending: number;
  byRole: WaitlistCounts;
  byRegion: WaitlistCounts;
  bySource: WaitlistCounts;
  entries: WaitlistEntry[];
};
