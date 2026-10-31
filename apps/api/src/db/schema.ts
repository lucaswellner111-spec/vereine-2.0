import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

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

export const auditLog = identity.table("audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id"),
  action: text("action").notNull(),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Vereine, Beitraege, Feed ------------------------------------------------

export const organizations = social.table("organizations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  city: text("city").notNull(),
  about: text("about").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Moderation (DSA): ausgeblendete Beitraege bleiben mit Begruendung gespeichert.
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenReason: text("hidden_reason"),
  },
  (t) => [
    index("posts_created_idx").on(t.createdAt),
    index("posts_org_created_idx").on(t.orgId, t.createdAt),
    index("posts_author_created_idx").on(t.authorId, t.createdAt),
  ],
);

export const postLikes = social.table(
  "post_likes",
  {
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
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
  (t) => [index("comments_post_idx").on(t.postId)],
);

export const reports = social.table("reports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  note: text("note"),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("open"), // open | dismissed | actioned
  resolvedBy: uuid("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("reports_org_status_idx").on(t.orgId, t.status)]);

export const notifications = social.table(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // comment | membership_request | membership_decision | post_hidden
    data: jsonb("data").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)],
);

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
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_org_starts_idx").on(t.orgId, t.startsAt), index("events_starts_idx").on(t.startsAt)],
);

export const eventRsvps = social.table(
  "event_rsvps",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // yes | maybe | no
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
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
  (t) => [index("conversations_key_version_idx").on(t.keyVersion)],
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

export const messageReports = chat.table("message_reports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").notNull(),
  reporterId: uuid("reporter_id").notNull(),
  reason: text("reason").notNull(),
  note: text("note"),
  /** Kopie des verschluesselten Textes als Beweis (gesperrt gegen Loeschfristen, solange offen). */
  snapshot: text("snapshot").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // avatar | post
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_owner_idx").on(t.ownerId)],
);

export const postMedia = social.table(
  "post_media",
  {
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.postId, t.mediaId] })],
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
