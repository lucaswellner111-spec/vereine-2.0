import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Datenbank-Bereiche (siehe docs/ARCHITEKTUR.md). Jeder Bereich hat ein eigenes Schema und kann spaeter
 * auf einen eigenen Server ziehen. Weitere Bereiche: chat, billing.
 * Bekannte Kopplung: social.* hat Fremdschluessel auf identity.users (Kaskade bei Kontoloeschung).
 */
export const identity = pgSchema("identity");
export const social = pgSchema("social");

export const users = identity.table("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  /** Plattform-Rolle (null = normaler Nutzer, "admin" = Plattform-Moderation). Nur per CLI vergeben. */
  platformRole: text("platform_role"),
  /** Zeitpunkt der Bestaetigung der aktuellen Adresse (null = unbestaetigt: Banner, keine Vereinsgruendung/Einladungen). */
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  /**
   * true = per Registrierung angelegt und noch nie bestaetigt. Anmelden geht erst ueber den Link in der Mail
   * (sonst verriete "Registrieren + Anmelden", ob eine Adresse schon ein Konto hat). Alte Konten: false.
   */
  pendingVerification: boolean("pending_verification").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/**
 * Einmal-Links fuer E-Mail-Bestaetigung (24 h), Passwort vergessen (1 h) und E-Mail-Wechsel (24 h, neue Adresse in
 * `new_email`). Gespeichert wird nur der SHA-256-Hash des Tokens; Loeschfrist: 7 Tage nach Ablauf/Nutzung.
 */
export const authTokens = identity.table(
  "auth_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(), // verify | reset | email_change
    newEmail: text("new_email"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_user_purpose_idx").on(t.userId, t.purpose), index("auth_tokens_expires_idx").on(t.expiresAt)],
);

// Session-ID im Cookie ist ein Zufallstoken; gespeichert wird nur der SHA-256-Hash.
export const sessions = identity.table(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Grobe Geraetebeschreibung (z. B. "Chrome auf Windows") fuer die Sitzungsliste; keine IP-Adresse. */
    device: text("device"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// Append-only: jede Erteilung/Widerruf ist ein neuer Eintrag (Nachweispflicht Art. 7 DSGVO).
export const consents = identity.table(
  "consents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    granted: boolean("granted").notNull(),
    version: text("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consents_user_purpose_idx").on(t.userId, t.purpose)],
);

/** Fristen: privacy/retention.service.ts (12 Monate, Moderation 24 Monate, Rechnungsaktionen 10 Jahre). */
export const auditLog = identity.table(
  "audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id"),
    action: text("action").notNull(),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_user_idx").on(t.userId), index("audit_log_created_idx").on(t.createdAt)],
);

/** Zwei-Faktor (TOTP): Geheimnis verschluesselt; enabled_at = null bedeutet Einrichtung noch nicht bestaetigt. */
export const userTotp = identity.table("user_totp", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  secretEnc: text("secret_enc").notNull(),
  enabledAt: timestamp("enabled_at", { withTimezone: true }),
  /** Letzter akzeptierter Zeitschritt (jeder Code gilt nur einmal). */
  lastStep: integer("last_step").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recoveryCodes = identity.table(
  "recovery_codes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("recovery_codes_user_idx").on(t.userId)],
);

// --- Vereine, Beitraege, Feed ------------------------------------------------

export const organizations = social.table(
  "organizations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    city: text("city").notNull(),
    about: text("about").notNull().default(""),
    /** Sportarten/Themen aus dem festen Katalog (packages/shared/src/tags.ts), max. 5. */
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Stammdaten fuer Rechnungen (Anschrift, IBAN, Steuerhinweis); nur Vorstand/Kassenwart sehen und aendern sie. */
    address: text("address").notNull().default(""),
    iban: text("iban").notNull().default(""),
    taxInfo: text("tax_info").notNull().default(""),
    /** Vereinslogo/-banner (gehoeren dem Verein, social.media mit org_id). */
    logoMediaId: uuid("logo_media_id").references((): AnyPgColumn => media.id, { onDelete: "set null" }),
    bannerMediaId: uuid("banner_media_id").references((): AnyPgColumn => media.id, { onDelete: "set null" }),
    /** Oeffentliche Vereinsseite /verein/<slug> ohne Login (Standard aus, nur der Vorstand schaltet ein). */
    publicPage: boolean("public_page").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("organizations_tags_idx").using("gin", t.tags)],
);

/** Einladungslinks: nur der SHA-256-Hash des Tokens wird gespeichert (wie bei Sessions). */
export const orgInvites = social.table(
  "org_invites",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** Token AES-256-GCM-verschluesselt (HKDF aus AUTH_SECRET_KEY, info "invite"), damit der Vorstand den Link erneut sieht. Pflicht seit 0024 (alte Einladungen ohne wurden geloescht). */
    tokenEnc: text("token_enc").notNull(),
    maxUses: integer("max_uses").notNull(),
    uses: integer("uses").notNull().default(0),
    /** link = vom Vorstand geteilter Link (Liste, max. 20 aktiv) | import = persoenliche Einladung aus dem Mitglieder-Import (einmalig, nicht in der Liste). */
    purpose: text("purpose").notNull().default("link"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Null nach Kontoloeschung der erstellenden Person. */
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("org_invites_org_idx").on(t.orgId, t.createdAt)],
);

export const orgMembers = social.table(
  "org_members",
  {
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // admin | treasurer | moderator | member
    status: text("status").notNull().default("pending"), // pending | active
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index("org_members_user_idx").on(t.userId)],
);

export const follows = social.table(
  "follows",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] }), index("follows_org_idx").on(t.orgId)],
);

export const posts = social.table(
  "posts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    kind: text("kind").notNull().default("update"),
    /** Tags aus dem festen Katalog, max. 3 (bei Vereinsbeitraegen standardmaessig die des Vereins). */
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Zuletzt bearbeitet (Text/Tags); null = nie. */
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Moderation (DSA): ausgeblendete Beitraege bleiben mit Begruendung gespeichert.
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenReason: text("hidden_reason"),
  },
  (t) => [
    index("posts_created_idx").on(t.createdAt),
    index("posts_org_created_idx").on(t.orgId, t.createdAt),
    index("posts_author_created_idx").on(t.authorId, t.createdAt),
    index("posts_tags_idx").using("gin", t.tags),
    // Aufraeumjob: soft-geloeschte Beitraege nach 30 Tagen endgueltig entfernen
    index("posts_deleted_idx").on(t.deletedAt).where(sql`deleted_at IS NOT NULL`),
  ],
);

export const postLikes = social.table(
  "post_likes",
  {
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] }), index("post_likes_user_created_idx").on(t.userId, t.createdAt)],
);

export const comments = social.table(
  "comments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_post_idx").on(t.postId), index("comments_author_created_idx").on(t.authorId, t.createdAt)],
);

/** Umfrage an einem Beitrag (Einfachwahl, anonym). Unveraenderlich nach dem Anlegen. */
export const polls = social.table(
  "polls",
  {
    postId: uuid("post_id").primaryKey().references(() => posts.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [check("polls_question_chk", sql`char_length(question) BETWEEN 3 AND 200`)],
);

export const pollOptions = social.table(
  "poll_options",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    postId: uuid("post_id").notNull().references(() => polls.postId, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    /** Stimmen; gepflegt vom Trigger social.poll_votes_count (auch bei Kaskaden wie Kontoloeschung). */
    votes: integer("votes").notNull().default(0),
  },
  (t) => [
    unique("poll_options_post_position_uq").on(t.postId, t.position),
    // Ziel des zusammengesetzten Fremdschluessels der Stimmen (Option gehoert sicher zur Umfrage)
    unique("poll_options_id_post_uq").on(t.id, t.postId),
    check("poll_options_label_chk", sql`char_length(label) BETWEEN 1 AND 80`),
    check("poll_options_votes_chk", sql`votes >= 0`),
  ],
);

/** Eine Stimme je Person und Umfrage (Primaerschluessel); wer wie gestimmt hat, gibt die API nie heraus. */
export const pollVotes = social.table(
  "poll_votes",
  {
    postId: uuid("post_id").notNull().references(() => polls.postId, { onDelete: "cascade" }),
    optionId: uuid("option_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    index("poll_votes_user_idx").on(t.userId),
    index("poll_votes_option_idx").on(t.optionId),
    foreignKey({ name: "poll_votes_option_fk", columns: [t.optionId, t.postId], foreignColumns: [pollOptions.id, pollOptions.postId] }).onDelete("cascade"),
  ],
);

export const reports = social.table("reports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  /** gesetzt = Meldung eines Kommentars (post_id ist dann der Beitrag des Kommentars). */
  commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
  reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  note: text("note"),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("open"), // open | dismissed | actioned
  resolvedBy: uuid("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("reports_org_status_idx").on(t.orgId, t.status),
  index("reports_post_status_idx").on(t.postId, t.status),
  // Je Person hoechstens eine offene Meldung pro Beitrag bzw. pro Kommentar (Doppelklicks, Spam).
  uniqueIndex("reports_open_once_uq").on(t.postId, t.reporterId).where(sql`status = 'open' AND comment_id IS NULL`),
  uniqueIndex("reports_comment_open_once_uq").on(t.commentId, t.reporterId).where(sql`status = 'open' AND comment_id IS NOT NULL`),
]);

export const notifications = social.table(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // comment | membership_request | membership_decision | post_hidden
    data: jsonb("data").notNull().default({}),
    /** Ausloesende Person (Kommentar, Folgen); Kontoloeschung entfernt ihre Benachrichtigungen bei anderen (Kaskade). */
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_actor_idx").on(t.actorId).where(sql`actor_id IS NOT NULL`),
    index("notifications_created_idx").on(t.createdAt),
  ],
);

/** E-Mail-Einstellungen fuer Benachrichtigungen: nur die taegliche Sammelmail, standardmaessig aus (Opt-in). */
export const notificationPrefs = social.table("notification_prefs", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  emailDigest: boolean("email_digest").notNull().default(false),
  /** Seit wann die Sammelmail an ist (Nachweis der eigenen Wahl); null = aus. */
  digestSince: timestamp("digest_since", { withTimezone: true }),
  /** Zeitpunkt der letzten Sammelmail (nur Benachrichtigungen danach kommen in die naechste). */
  lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Termine & Teams ---------------------------------------------------------

export const teams = social.table(
  "teams",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("teams_org_name_uq").on(t.orgId, t.name)],
);

export const teamMembers = social.table(
  "team_members",
  {
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("team_members_user_idx").on(t.userId)],
);

export const events = social.table(
  "events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    location: text("location").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    visibility: text("visibility").notNull().default("members"), // public | members
    /** Termine einer Wiederholungsserie teilen sich diese ID. */
    seriesId: uuid("series_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    kind: text("kind").notNull().default("other"), // training | match | meeting | party | other
    /** Teilnehmerlimit, null = unbegrenzt. */
    capacity: integer("capacity"),
    /** Zahl der Zusagen; gepflegt vom Trigger social.event_rsvps_count (auch bei Kaskaden), begrenzt per CHECK. */
    yesCount: integer("yes_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_org_starts_idx").on(t.orgId, t.startsAt),
    index("events_starts_idx").on(t.startsAt),
    index("events_series_idx").on(t.seriesId),
    index("events_team_idx").on(t.teamId),
    check("events_kind_chk", sql`kind IN ('training', 'match', 'meeting', 'party', 'other')`),
    check("events_capacity_chk", sql`capacity IS NULL OR capacity BETWEEN 1 AND 10000`),
    check("events_yes_count_chk", sql`yes_count >= 0 AND (capacity IS NULL OR yes_count <= capacity)`),
  ],
);

/** Kalender-Abo-Link je Nutzer (nur der Hash des Tokens wird gespeichert). */
export const calendarTokens = social.table("calendar_tokens", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventRsvps = social.table(
  "event_rsvps",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // yes | maybe | no | waitlist
    /** Reihenfolge der Warteliste (nur bei status waitlist gesetzt). */
    waitlistedAt: timestamp("waitlisted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    index("event_rsvps_user_idx").on(t.userId),
    index("event_rsvps_waitlist_idx").on(t.eventId, t.status, t.waitlistedAt),
  ],
);

/** Helferliste: Dienste an einem Termin (z. B. Kuchenstand 14-16 Uhr, 3 Plaetze). */
export const eventShifts = social.table(
  "event_shifts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    slots: integer("slots").notNull(),
    /** Belegte Plaetze; gepflegt vom Trigger social.event_shift_signups_count, begrenzt per CHECK. */
    taken: integer("taken").notNull().default(0),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("event_shifts_event_position_idx").on(t.eventId, t.position),
    check("event_shifts_title_chk", sql`char_length(title) BETWEEN 2 AND 80`),
    check("event_shifts_slots_chk", sql`slots BETWEEN 1 AND 100`),
    check("event_shifts_taken_chk", sql`taken >= 0 AND taken <= slots`),
  ],
);

export const eventShiftSignups = social.table(
  "event_shift_signups",
  {
    shiftId: uuid("shift_id").notNull().references(() => eventShifts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.shiftId, t.userId] }), index("event_shift_signups_user_idx").on(t.userId)],
);

/** Anwesenheit je Termin und Person (nur Vorstand/Moderation). Bewusst ohne Freitext/Grund (keine Art.-9-Daten). */
export const eventAttendance = social.table(
  "event_attendance",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // present | absent | excused
    markedBy: uuid("marked_by").references(() => users.id, { onDelete: "set null" }),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    index("event_attendance_user_idx").on(t.userId),
    index("event_attendance_marked_idx").on(t.markedAt),
    check("event_attendance_status_chk", sql`status IN ('present', 'absent', 'excused')`),
  ],
);

// --- Chat (eigener Bereich, KEINE Fremdschluessel auf identity/social) -----------
// Nutzer-IDs sind einfache UUID-Spalten: Der Bereich kann auf einen eigenen Server ziehen.

export const chat = pgSchema("chat");

export const conversations = chat.table(
  "conversations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    kind: text("kind").notNull(), // direct | group
    title: text("title"),
    orgId: uuid("org_id"),
    createdBy: uuid("created_by").notNull(),
    /** Eindeutig je Paar bei Direktchats ("<kleinere-id>:<groessere-id>"). */
    directKey: text("direct_key").unique(),
    /** Datenschluessel der Unterhaltung, mit dem Master-Schluessel verschluesselt (AES-256-GCM). */
    wrappedKey: text("wrapped_key").notNull(),
    keyVersion: integer("key_version").notNull(),
    retentionDays: integer("retention_days"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  },
  (t) => [index("conversations_key_version_idx").on(t.keyVersion), index("conversations_org_idx").on(t.orgId)],
);

export const conversationMembers = chat.table(
  "conversation_members",
  {
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull().default("member"), // owner | member
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("conversation_members_user_idx").on(t.userId)],
);

export const messages = chat.table(
  "messages",
  {
    id: uuid("id").primaryKey(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").notNull(),
    /** "iv.tag.ciphertext" (base64url), AES-256-GCM mit dem Datenschluessel der Unterhaltung. */
    ciphertext: text("ciphertext").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("messages_conv_created_idx").on(t.conversationId, t.createdAt, t.id),
    index("messages_sender_idx").on(t.senderId),
  ],
);

export const chatBlocks = chat.table(
  "blocks",
  {
    blockerId: uuid("blocker_id").notNull(),
    blockedId: uuid("blocked_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index("blocks_blocked_idx").on(t.blockedId)],
);

/**
 * Meldungen sind Beweismittel (DSA): kein Fremdschluessel auf messages, damit sie Loeschen der Nachricht, Austritt
 * oder Kontoloeschung ueberstehen. Die Kopie ist mit einem EIGENEN Datenschluessel verschluesselt (snapshot_key,
 * mit dem Master-Schluessel umhuellt), also unabhaengig von der Unterhaltung lesbar.
 */
export const messageReports = chat.table(
  "message_reports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    messageId: uuid("message_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    /** Null, wenn die meldende Person ihr Konto geloescht hat (Meldung bleibt anonym bestehen). */
    reporterId: uuid("reporter_id"),
    /** Absender der gemeldeten Nachricht (Kopie, Nachricht kann inzwischen geloescht sein). */
    senderId: uuid("sender_id"),
    reason: text("reason").notNull(),
    note: text("note"),
    /** Verschluesselte Kopie des Textes als Beweis (gesperrt gegen Loeschfristen, solange offen). */
    snapshot: text("snapshot").notNull(),
    /** Datenschluessel der Kopie (umhuellt); null bei Altzeilen (dann Schluessel der Unterhaltung). */
    snapshotKey: text("snapshot_key"),
    snapshotKeyVersion: integer("snapshot_key_version"),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("message_reports_message_status_idx").on(t.messageId, t.status),
    uniqueIndex("message_reports_open_once_uq").on(t.messageId, t.reporterId).where(sql`status = 'open'`),
  ],
);

// --- Profile, Medien, Feed-Feedback (Bereich social) ---------------------------

export const profiles = social.table("profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  handle: text("handle").notNull().unique(),
  bio: text("bio").notNull().default(""),
  location: text("location").notNull().default(""),
  visibility: text("visibility").notNull().default("public"), // public | private (Folgeanfragen)
  showClubs: boolean("show_clubs").notNull().default(true),
  avatarMediaId: uuid("avatar_media_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userFollows = social.table(
  "user_follows",
  {
    followerId: uuid("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    followedId: uuid("followed_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"), // active | pending
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followedId] }), index("user_follows_followed_idx").on(t.followedId, t.status)],
);

export const media = social.table(
  "media",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // Nutzerbilder: owner_id; Vereinsbilder (Logo/Banner): org_id, owner_id NULL (bleiben bei Kontoloeschung)
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // avatar | post | org_logo | org_banner
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("media_owner_idx").on(t.ownerId),
    index("media_org_idx").on(t.orgId),
    check("media_owner_or_org_chk", sql`owner_id IS NOT NULL OR org_id IS NOT NULL`),
  ],
);

export const postMedia = social.table(
  "post_media",
  {
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.postId, t.mediaId] }), index("post_media_media_idx").on(t.mediaId)],
);

/** "Weniger davon": ausgeblendete Beitraege sowie stummgeschaltete Nutzer/Vereine (nur fuer den eigenen Feed). */
export const feedFeedback = social.table(
  "feed_feedback",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetKind: text("target_kind").notNull(), // post | user | org
    targetId: uuid("target_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetKind, t.targetId] })],
);

// --- Abrechnung (eigener Bereich, KEINE Fremdschluessel auf identity/social) ---------
// Personen und Vereine sind einfache UUID-Spalten; Name/Anschrift werden als Kopie gespeichert
// (GoBD: Rechnungen bleiben unveraendert, auch wenn Konto oder Verein sich aendern).

export const billing = pgSchema("billing");

/** Beitragslauf: erzeugt Rechnungsentwuerfe fuer Mitglieder ausgewaehlter Beitragsklassen (Finalisieren bleibt manuell). */
export const feeRuns = billing.table(
  "fee_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull(),
    periodLabel: text("period_label").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    feeClassIds: uuid("fee_class_ids").array().notNull(),
    status: text("status").notNull().default("queued"), // queued | running | done | failed
    createdCount: integer("created_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Lebenszeichen des laufenden Jobs (Claim und nach jedem Block); aelter als 15 Min. = haengend, darf neu geclaimt werden. */
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    /** Zahl der Ausfuehrungsversuche; ab 5 keine automatische Wiederholung mehr (nur "Erneut versuchen"). */
    attempts: integer("attempts").notNull().default(0),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    unique("fee_runs_org_period_unique").on(t.orgId, t.periodLabel),
    index("fee_runs_org_created_idx").on(t.orgId, t.createdAt),
    index("fee_runs_status_idx").on(t.status),
    check("fee_runs_status_chk", sql`status IN ('queued', 'running', 'done', 'failed')`),
    check("fee_runs_period_chk", sql`char_length(period_label) BETWEEN 1 AND 40`),
  ],
);

export const invoices = billing.table(
  "invoices",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull(),
    /** Lueckenloser Nummernkreis je Verein und Jahr ("2026-0001"); erst beim Finalisieren gesetzt. */
    number: text("number"),
    status: text("status").notNull().default("draft"), // draft | open | paid | void
    /** Null nach Loeschung des Empfaengerkontos (Name wird dann anonymisiert). */
    recipientUserId: uuid("recipient_user_id"),
    recipientName: text("recipient_name").notNull(),
    recipientAddress: text("recipient_address").notNull().default(""),
    issuerName: text("issuer_name").notNull(),
    issuerCity: text("issuer_city").notNull().default(""),
    issuerAddress: text("issuer_address").notNull().default(""),
    issuerIban: text("issuer_iban").notNull().default(""),
    issuerTaxInfo: text("issuer_tax_info").notNull().default(""),
    issueDate: date("issue_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    note: text("note").notNull().default(""),
    vatNote: text("vat_note").notNull().default(""),
    currency: text("currency").notNull().default("EUR"),
    netCents: integer("net_cents").notNull().default(0),
    vatCents: integer("vat_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    overdueNotifiedAt: timestamp("overdue_notified_at", { withTimezone: true }),
    /** Herkunft aus einem Beitragslauf (je Lauf und Empfaenger hoechstens ein Entwurf). */
    feeRunId: uuid("fee_run_id").references((): AnyPgColumn => feeRuns.id, { onDelete: "set null" }),
  },
  (t) => [
    unique("invoices_org_number_unique").on(t.orgId, t.number),
    unique("invoices_fee_run_recipient_unique").on(t.feeRunId, t.recipientUserId),
    index("invoices_org_created_idx").on(t.orgId, t.createdAt),
    index("invoices_recipient_idx").on(t.recipientUserId),
    index("invoices_open_due_idx").on(t.status, t.dueDate),
  ],
);

export const invoiceItems = billing.table(
  "invoice_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitCents: integer("unit_cents").notNull(),
    vatRate: integer("vat_rate").notNull(),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId, t.position)],
);

export const invoiceCounters = billing.table(
  "invoice_counters",
  {
    orgId: uuid("org_id").notNull(),
    year: integer("year").notNull(),
    lastNo: integer("last_no").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.year] })],
);

/** Web-Push-Abos der Geraete eines Nutzers (Endpunkt + Schluessel des Browsers). */
export const pushSubscriptions = social.table(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

// --- Mitgliederverwaltung (eigener Bereich `members`, KEINE Fremdschluessel auf identity/social) ---
// Personen und Vereine nur als UUID. Personenbezogene Felder werden bei Austritt/Kontoloeschung geloescht,
// siehe docs/DATENSCHUTZ-LAUNCH.md (Abschnitt 4).

export const membersArea = pgSchema("members");

export const feeClasses = membersArea.table(
  "fee_classes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull(),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    interval: text("interval").notNull(), // monthly | quarterly | halfyearly | yearly
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("fee_classes_org_name_unique").on(t.orgId, t.name), index("fee_classes_org_idx").on(t.orgId)],
);

export const memberProfiles = membersArea.table(
  "member_profiles",
  {
    orgId: uuid("org_id").notNull(),
    userId: uuid("user_id").notNull(),
    /** Fortlaufende Mitgliedsnummer je Verein (atomarer Zaehler), bleibt auch nach Austritt als Vereinsunterlage. */
    memberNo: integer("member_no").notNull(),
    street: text("street").notNull().default(""),
    zip: text("zip").notNull().default(""),
    city: text("city").notNull().default(""),
    phone: text("phone").notNull().default(""),
    birthDate: date("birth_date", { mode: "string" }),
    guardianName: text("guardian_name").notNull().default(""),
    guardianEmail: text("guardian_email").notNull().default(""),
    feeClassId: uuid("fee_class_id").references(() => feeClasses.id, { onDelete: "set null" }),
    joinedOn: date("joined_on", { mode: "string" }).notNull(),
    /** Gesetzt beim Austritt; dann sind alle personenbezogenen Felder geleert. */
    leftOn: date("left_on", { mode: "string" }),
    notes: text("notes").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    unique("member_profiles_no_unique").on(t.orgId, t.memberNo),
    index("member_profiles_user_idx").on(t.userId),
  ],
);

export const memberCounters = membersArea.table("member_counters", {
  orgId: uuid("org_id").primaryKey(),
  lastNo: integer("last_no").notNull().default(0),
});

/**
 * Vorgemerkte Mitglieder aus dem CSV-Import (noch ohne Konto). Jede Zeile bekommt eine persoenliche Einladung
 * (social.org_invites, purpose "import", nur als UUID referenziert). Beim Beitritt werden Nummer, Eintritt und Beitragsklasse
 * in member_profiles uebernommen und die Zeile geloescht. Loeschung spaetestens 30 Tage nach Ablauf der Einladung
 * bzw. 60 Tage nach dem Import, wenn nie verschickt (purgeExpired), sowie beim Entfernen durch den Vorstand.
 */
export const pendingMembers = membersArea.table(
  "pending_members",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    /** Kleingeschrieben, je Verein eindeutig (Dubletten). */
    email: text("email").notNull(),
    memberNo: integer("member_no"),
    joinedOn: date("joined_on", { mode: "string" }),
    feeClassId: uuid("fee_class_id").references(() => feeClasses.id, { onDelete: "set null" }),
    /** queued = Einladung wartet auf Versand | sent = eingereiht/verschickt. */
    status: text("status").notNull().default("queued"),
    inviteId: uuid("invite_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    /** Null nach Kontoloeschung der importierenden Person. */
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("pending_members_email_unique").on(t.orgId, t.email),
    unique("pending_members_no_unique").on(t.orgId, t.memberNo),
    index("pending_members_status_idx").on(t.orgId, t.status),
    index("pending_members_invite_idx").on(t.inviteId),
  ],
);

// --- Mail (eigener Bereich, nur eigene Tabellen, keine Fremdschluessel) ---------------------------

export const mailArea = pgSchema("mail");

/**
 * Sperrliste: Adressen nur als HMAC-Hash (Teilschluessel "mail-address"), nie im Klartext.
 * scope: all (harter Bounce/Beschwerde, spaeter per Webhook) | invite (Abmeldung von Einladungs-Mails).
 */
export const mailSuppressions = mailArea.table(
  "suppressions",
  {
    addressHash: text("address_hash").notNull(),
    scope: text("scope").notNull(),
    reason: text("reason").notNull(), // unsubscribe | bounce | complaint
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.addressHash, t.scope] }), index("mail_suppressions_created_idx").on(t.createdAt)],
);

// --- Warteliste fuer Vereine (eigener Bereich, nur eigene Tabelle, keine Fremdschluessel) ---------

export const waitlistArea = pgSchema("waitlist");

/**
 * Vorab-Anmeldungen ohne Konto (Double-Opt-in). pending: Bestaetigungslink offen (nur SHA-256-Hash, 48 h), Loeschung
 * 7 Tage nach der letzten Anfrage (purgeExpired). confirmed: bis Widerruf (Link in jeder Mail) bzw. spaetestens
 * 6 Monate nach Launch (docs/OFFENE-PUNKTE.md). Einwilligung: Version des Texts, Zeitpunkt der Abgabe und der Bestaetigung.
 */
export const waitlistEntries = waitlistArea.table(
  "entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    /** Kleingeschrieben, eindeutig. */
    email: text("email").notNull(),
    orgName: text("org_name").notNull(),
    city: text("city").notNull().default(""),
    orgType: text("org_type").notNull().default(""),
    role: text("role"),
    status: text("status").notNull().default("pending"), // pending | confirmed
    tokenHash: text("token_hash"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    consentVersion: text("consent_version").notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /** Letzte Anmeldung mit dieser Adresse (Frist fuer unbestaetigte Eintraege). */
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("waitlist_entries_email_unique").on(t.email),
    unique("waitlist_entries_token_unique").on(t.tokenHash),
    index("waitlist_entries_status_idx").on(t.status, t.requestedAt),
  ],
);
