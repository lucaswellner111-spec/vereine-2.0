import { sql } from "drizzle-orm";
import {
  boolean,
  index,
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
