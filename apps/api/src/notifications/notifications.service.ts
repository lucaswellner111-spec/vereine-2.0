import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
import type { NotificationActor, NotificationItem, NotificationsResponse } from "@vereine/shared";
import { UsersDirectory } from "../auth/users-directory.service";
import { YouthDirectory } from "../auth/youth-directory.service";
import { REALTIME_BUS, type RealtimeBus } from "../chat/realtime-bus";
import { decodeCursor, encodeCursor } from "../common/cursor";
import { ago, purgeInRounds, RETENTION, RETENTION_BATCH } from "../common/retention";
import { DB, type Database } from "../db/db.module";
import { JobsService } from "../jobs/jobs.service";
import { commentLikes, notifications, postLikes, postMedia, posts, userFollows } from "../db/schema";
import { ProfileAccess } from "../profiles/profile-access.service";
import { PushService, pushMessage } from "./push.service";

type Type = NotificationItem["type"];

/** Ab dieser Empfaengerzahl wird der Versand in Bloecken ueber die Job-Warteschlange verteilt. */
const FANOUT_THRESHOLD = 100;
const CHUNK = 500;

/**
 * Datenauskunft: je Typ nur diese Felder aus `data`. Namen und Textauszuege anderer Personen (`commenter`, `name`,
 * `excerpt`) fallen weg; die ausloesende Person erscheint nur als ID (`actorId`) bzw. Benutzername (`handle`).
 */
const EVENT_KEYS = ["eventId", "title", "orgSlug", "orgName", "startsAt", "series"];
const EXPORT_KEYS: Record<Type, string[]> = {
  comment: ["postId"],
  membership_request: ["orgSlug", "orgName"],
  membership_decision: ["orgSlug", "orgName", "decision", "child"],
  post_hidden: ["orgName", "reason"],
  event_created: EVENT_KEYS,
  event_reminder: EVENT_KEYS,
  event_canceled: EVENT_KEYS,
  event_updated: EVENT_KEYS,
  event_waitlist_promoted: EVENT_KEYS,
  new_follower: ["handle"],
  follow_request: ["handle"],
  follow_accepted: ["handle"],
  invoice_new: ["invoiceId", "number", "orgName", "amount"],
  invoice_overdue: ["invoiceId", "number", "orgName"],
  fee_run_done: ["runId", "periodLabel", "created", "orgName", "orgSlug"],
  like: ["postId"],
  comment_like: ["postId", "commentId"],
  comment_reply: ["postId", "commentId"],
  mention: ["postId", "commentId"],
  // Jugend: Name des Kindes steht NICHT in den Daten (nur im Klartext der Oberflaeche aus dem Kontext der Eltern)
  child_rsvp: [...EVENT_KEYS, "status"],
  child_graduation: ["days"],
  // Zweiter Elternteil, Rechnungsempfaenger, Loeschung: nur die Art des Hinweises (kein Name des Kindes, kein Klartext)
  guardian_notice: ["kind", "deleteAfter"],
};

/** Termin-Benachrichtigungen: Kinder (Jugendkonten) haben keinen eigenen Zugang, sie gehen an die Eltern. */
const GUARDIAN_ROUTED: Type[] = ["event_created", "event_reminder", "event_canceled", "event_updated", "event_waitlist_promoted"];

/** Gebuendelte Typen: je Empfaenger, Ziel und Tag eine Zeile mit hoechstens MAX_GROUP_ACTORS Personen plus Zaehler. */
export const GROUPED_TYPES = ["like", "comment_like"] as const;
const MAX_GROUP_ACTORS = 3;
/** Kein Web-Push fuer Likes (zu laut); die Aktivitaetsseite und das Live-Banner zeigen sie. */
const NO_PUSH: Type[] = ["like", "comment_like"];
/** Live-Zustellung (WebSocket) nur fuer persoenliche Ereignisse, nicht fuer Massen (Termine an alle Mitglieder). */
const LIVE_MAX_RECIPIENTS = 50;
const FOLLOW_TYPES: Type[] = ["new_follower", "follow_request", "follow_accepted"];

export function exportNotificationData(type: string, data: Record<string, unknown>): Record<string, string> {
  const keys = EXPORT_KEYS[type as Type] ?? [];
  const out: Record<string, string> = {};
  for (const k of keys) if (typeof data[k] === "string") out[k] = data[k] as string;
  return out;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(PushService) private readonly push: PushService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
    @Inject(YouthDirectory) private readonly youth: YouthDirectory,
    @Inject(ProfileAccess) private readonly access: ProfileAccess,
    @Inject(REALTIME_BUS) private readonly bus: RealtimeBus,
  ) {}

  onModuleInit() {
    this.jobs.define("notifications.insert", async (d: { userIds: string[]; type: Type; data: Record<string, string>; actorId?: string | null }) =>
      this.insert(d.userIds, d.type, d.data, d.actorId ?? null),
    );
  }

  private async insert(userIds: string[], type: Type, data: Record<string, string>, actorId: string | null) {
    if (!userIds.length) return;
    const rows = await this.db
      .insert(notifications)
      .values(userIds.map((userId) => ({ userId, type, data, actorId })))
      .returning({ id: notifications.id, userId: notifications.userId });
    // Live-Zustellung und Push sind Zusaetze: Fehler duerfen das Speichern der Benachrichtigung nie beeintraechtigen.
    if (rows.length <= LIVE_MAX_RECIPIENTS) await Promise.all(rows.map((r) => this.live(r.userId, r.id)));
    if (!NO_PUSH.includes(type)) await this.push.sendToUsers(userIds, { ...pushMessage(type, data), tag: type }).catch(() => undefined);
  }

  /** Meldet dem Gateway (Redis Pub/Sub) eine neue Benachrichtigung; nur die ID, der Inhalt wird per REST geholt. */
  private live(userId: string, id: string): Promise<void> {
    return this.bus.publish({ userIds: [userId], event: { type: "notification", id } }).catch(() => undefined);
  }

  /**
   * Legt Benachrichtigungen an und stellt sie live zu (Redis Pub/Sub -> chat-gateway, Ereignis `notification`);
   * Polling im Client ist nur der Rueckfall.
   * `actorId`: ausloesende Person, wenn `data` ihren Namen/Text enthaelt (Kommentar, Folgen). Loescht sie ihr Konto,
   * verschwinden diese Benachrichtigungen bei den Empfaengern per Kaskade (keine Klarnamen Geloeschter).
   */
  async notify(userIds: string[], type: Type, data: Record<string, string>, opts: { actorId?: string } = {}): Promise<void> {
    const actorId = opts.actorId ?? null;
    let unique = [...new Set(userIds)];
    if (GUARDIAN_ROUTED.includes(type) && unique.length > 0) {
      // Jugendkonten ersetzen durch ihre Eltern (je Elternteil nur eine Benachrichtigung, auch bei Geschwistern)
      const kids = await this.youth.youthIds(unique);
      if (kids.size > 0) {
        const parents = await this.youth.guardiansOfMany([...kids]);
        unique = [...new Set([...unique.filter((u) => !kids.has(u)), ...[...parents.values()].flat()])];
      }
    }
    // SKALIERUNG: Kleine Mengen sofort; grosse Mengen (z. B. Termin an 5.000 Mitglieder) als Jobs in Bloecken,
    // die der Worker parallel abarbeitet. Ab ~50k Empfaengern zusaetzlich Rate begrenzen / eigene Queue.
    if (unique.length <= FANOUT_THRESHOLD) return this.insert(unique, type, data, actorId);
    for (let i = 0; i < unique.length; i += CHUNK) {
      await this.jobs.enqueue("notifications.insert", { userIds: unique.slice(i, i + CHUNK), type, data, actorId });
    }
  }

  /** Datenauskunft (Art. 15): eigene Benachrichtigungen, Inhalte gefiltert (siehe EXPORT_KEYS). */
  async exportFor(userId: string) {
    const rows = await this.db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
    return rows.map((n) => ({
      type: n.type,
      data: exportNotificationData(n.type, (n.data ?? {}) as Record<string, unknown>),
      actorId: n.actorId,
      actorIds: n.actorIds,
      actorCount: n.actorCount,
      readAt: n.readAt?.toISOString() ?? null,
      at: n.createdAt.toISOString(),
    }));
  }

  /** Loeschfrist 180 Tage (Job privacy.retention), blockweise. */
  purgeExpired(): Promise<number> {
    return purgeInRounds(async () => {
      const ids = this.db
        .select({ id: notifications.id })
        .from(notifications)
        .where(lt(notifications.createdAt, ago(RETENTION.notifications)))
        .limit(RETENTION_BATCH);
      return (await this.db.delete(notifications).where(inArray(notifications.id, ids)).returning({ id: notifications.id })).length;
    });
  }

  /**
   * Gebuendelte Like-Benachrichtigung ("Anna und 3 weitere ...") fuer `ownerId` aus den echten Likes des heutigen Tages
   * neu berechnen (je Ziel, Typ und Tag eine Zeile). Wird nach jedem Like UND jedem Zurueckziehen aufgerufen, damit Zaehler
   * und Personenliste stimmen; ohne Likes verschwindet die Zeile. `exclude`: Personen mit Blockierung zum Empfaenger (zaehlen nicht mit). Der Aufrufer prueft die Sichtbarkeit.
   */
  async syncLikeGroup(kind: (typeof GROUPED_TYPES)[number], ownerId: string, targetId: string, data: Record<string, string>, exclude: string[] = []): Promise<void> {
    const likes = kind === "like" ? postLikes : commentLikes;
    const targetCol = kind === "like" ? postLikes.postId : commentLikes.commentId;
    const dayStart = sql`date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;
    const where = and(eq(targetCol, targetId), ne(likes.userId, ownerId), exclude.length ? notInArray(likes.userId, exclude) : undefined, sql`${likes.createdAt} >= ${dayStart}`);
    const [latest, [{ n }]] = await Promise.all([
      this.db.select({ userId: likes.userId }).from(likes).where(where).orderBy(desc(likes.createdAt)).limit(MAX_GROUP_ACTORS),
      this.db.select({ n: sql<number>`count(*)::int` }).from(likes).where(where),
    ]);
    const groupKey = `${kind}:${targetId}:${new Date().toISOString().slice(0, 10)}`;
    const mine = and(eq(notifications.userId, ownerId), eq(notifications.groupKey, groupKey));
    if (n === 0) {
      await this.db.delete(notifications).where(mine);
      return;
    }
    const [existing] = await this.db.select({ count: notifications.actorCount }).from(notifications).where(mine).limit(1);
    const actorIds = latest.map((l) => l.userId);
    if (existing && existing.count === n) {
      await this.db.update(notifications).set({ actorIds }).where(mine); // gleiche Zahl: nur Liste angleichen, nicht neu melden
      return;
    }
    const grew = !existing || n > existing.count;
    const [row] = await this.db
      .insert(notifications)
      .values({ userId: ownerId, type: kind, data, groupKey, actorIds, actorCount: n })
      .onConflictDoUpdate({
        target: [notifications.userId, notifications.groupKey],
        targetWhere: sql`group_key IS NOT NULL`,
        set: grew ? { actorIds, actorCount: n, readAt: null, createdAt: sql`now()` } : { actorIds, actorCount: n },
      })
      .returning({ id: notifications.id });
    if (grew && row) await this.live(ownerId, row.id);
  }

  /** Kontoloeschung: die Person aus gebuendelten Benachrichtigungen anderer entfernen (Zaehler -1, leere Zeilen weg). */
  async eraseUser(userId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ actorIds: sql`array_remove(${notifications.actorIds}, ${userId}::uuid)`, actorCount: sql`greatest(${notifications.actorCount} - 1, 0)` })
      .where(sql`${userId}::uuid = any(${notifications.actorIds})`);
    await this.db.delete(notifications).where(and(sql`${notifications.groupKey} is not null`, sql`${notifications.actorCount} = 0`));
  }

  /** Eigene Benachrichtigung ausblenden (loeschen). */
  async remove(userId: string, id: string): Promise<void> {
    await this.db.delete(notifications).where(and(eq(notifications.userId, userId), eq(notifications.id, id)));
  }

  /** Einzelne Benachrichtigung (Live-Banner); null, wenn sie nicht (mehr) existiert oder jemand anderem gehoert. */
  async get(userId: string, id: string): Promise<NotificationItem | null> {
    const rows = await this.db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.id, id))).limit(1);
    return (await this.hydrate(userId, rows))[0] ?? null;
  }

  /** Neueste zuerst, Keyset-Paging ueber (created_at, id). */
  async list(userId: string, limit = 30, cursor?: string): Promise<NotificationsResponse> {
    const after = decodeCursor(cursor);
    const [found, [{ n }]] = await Promise.all([
      this.db
        .select({ row: notifications, ts: sql<string>`${notifications.createdAt}::text` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            after ? sql`(${notifications.createdAt}, ${notifications.id}) < (${after.ts}::timestamptz, ${after.id}::uuid)` : undefined,
          ),
        )
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit + 1),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
    ]);
    const page = found.slice(0, limit);
    const last = page[page.length - 1];
    return {
      unread: n,
      nextCursor: found.length > limit && last ? encodeCursor({ ts: last.ts, id: last.row.id }) : null,
      items: await this.hydrate(
        userId,
        page.map((f) => f.row),
      ),
    };
  }

  /** Ausloesende Personen (Name/Handle/Avatar beim Lesen aufgeloest), Folge-Zustand und Beitragsvorschau ergaenzen. */
  private async hydrate(viewerId: string, rows: (typeof notifications.$inferSelect)[]): Promise<NotificationItem[]> {
    const actorIdsOf = (r: (typeof rows)[number]) => (r.actorIds.length ? r.actorIds : r.actorId ? [r.actorId] : []);
    const everyone = [...new Set(rows.flatMap(actorIdsOf))];
    const postIds = [
      ...new Set(rows.map((r) => (r.data as Record<string, string>).postId).filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v))),
    ];
    const followIds = [...new Set(rows.filter((r) => FOLLOW_TYPES.includes(r.type as Type)).flatMap(actorIdsOf))];
    const [names, profiles, follows, previews] = await Promise.all([
      this.directory.names(everyone),
      this.access.ensureMany(everyone),
      followIds.length
        ? this.db.select({ id: userFollows.followedId, status: userFollows.status }).from(userFollows).where(and(eq(userFollows.followerId, viewerId), inArray(userFollows.followedId, followIds)))
        : Promise.resolve([]),
      this.previews(postIds),
    ]);
    const followState = new Map(follows.map((f) => [f.id, f.status === "active" ? ("following" as const) : ("requested" as const)]));
    return rows.map((r) => {
      const type = r.type as Type;
      const actors: NotificationActor[] = actorIdsOf(r).flatMap((id) => {
        const name = names.get(id);
        if (!name) return [];
        const p = profiles.get(id);
        return [{ id, name, handle: p?.handle ?? null, avatarId: p?.avatarMediaId ?? null, ...(FOLLOW_TYPES.includes(type) ? { following: followState.get(id) ?? ("none" as const) } : {}) }];
      });
      const data = r.data as Record<string, string>;
      const item: NotificationItem = {
        id: r.id,
        type,
        data,
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      };
      if (actors.length) item.actors = actors;
      if (r.actorCount > 0) item.count = r.actorCount;
      else if (actors.length) item.count = actors.length;
      const pv = data.postId ? previews.get(data.postId) : undefined;
      if (pv) item.preview = pv;
      return item;
    });
  }

  /** Vorschau je Beitrag: erstes Bild und kurzer Textauszug; geloeschte/ausgeblendete Beitraege ohne Vorschau. */
  private async previews(postIds: string[]): Promise<Map<string, { mediaId: string | null; text: string | null }>> {
    if (postIds.length === 0) return new Map();
    const [bodies, media] = await Promise.all([
      this.db.select({ id: posts.id, body: posts.body }).from(posts).where(and(inArray(posts.id, postIds), isNull(posts.deletedAt), isNull(posts.hiddenAt))),
      this.db.select({ postId: postMedia.postId, mediaId: postMedia.mediaId }).from(postMedia).where(inArray(postMedia.postId, postIds)).orderBy(asc(postMedia.position)),
    ]);
    const first = new Map<string, string>();
    for (const m of media) if (!first.has(m.postId)) first.set(m.postId, m.mediaId);
    return new Map(bodies.map((b) => [b.id, { mediaId: first.get(b.id) ?? null, text: b.body ? b.body.slice(0, 80) : null }]));
  }

  async markRead(userId: string, ids?: string[]): Promise<void> {
    const own = and(eq(notifications.userId, userId), isNull(notifications.readAt));
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(ids?.length ? and(own, inArray(notifications.id, ids)) : own);
  }
}
