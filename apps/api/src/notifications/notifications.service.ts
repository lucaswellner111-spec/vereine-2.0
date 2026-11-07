import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NotificationItem, NotificationsResponse } from "@vereine/shared";
import { decodeCursor, encodeCursor } from "../common/cursor";
import { DB, type Database } from "../db/db.module";
import { JobsService } from "../jobs/jobs.service";
import { notifications } from "../db/schema";
import { PushService, pushMessage } from "./push.service";

type Type = NotificationItem["type"];

/** Ab dieser Empfaengerzahl wird der Versand in Bloecken ueber die Job-Warteschlange verteilt. */
const FANOUT_THRESHOLD = 100;
const CHUNK = 500;

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(PushService) private readonly push: PushService,
  ) {}

  onModuleInit() {
    this.jobs.define("notifications.insert", async (d: { userIds: string[]; type: Type; data: Record<string, string> }) =>
      this.insert(d.userIds, d.type, d.data),
    );
  }

  private async insert(userIds: string[], type: Type, data: Record<string, string>) {
    if (!userIds.length) return;
    await this.db.insert(notifications).values(userIds.map((userId) => ({ userId, type, data })));
    // Push ist ein Zusatz: Fehler duerfen das Speichern der Benachrichtigung nie beeintraechtigen.
    await this.push.sendToUsers(userIds, { ...pushMessage(type, data), tag: type }).catch(() => undefined);
  }

  /**
   * Legt Benachrichtigungen an. Bewusst ohne Echtzeit-Push: Clients fragen per Polling ab.
   * SKALIERUNG: Bei Chat/WebSocket (Phase 2) wird hier ueber Redis Pub/Sub live zugestellt.
   */
  async notify(userIds: string[], type: Type, data: Record<string, string>): Promise<void> {
    const unique = [...new Set(userIds)];
    // SKALIERUNG: Kleine Mengen sofort; grosse Mengen (z. B. Termin an 5.000 Mitglieder) als Jobs in Bloecken,
    // die der Worker parallel abarbeitet. Ab ~50k Empfaengern zusaetzlich Rate begrenzen / eigene Queue.
    if (unique.length <= FANOUT_THRESHOLD) return this.insert(unique, type, data);
    for (let i = 0; i < unique.length; i += CHUNK) {
      await this.jobs.enqueue("notifications.insert", { userIds: unique.slice(i, i + CHUNK), type, data });
    }
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
    const rows = page.map((f) => f.row);
    return {
      unread: n,
      nextCursor: found.length > limit && last ? encodeCursor({ ts: last.ts, id: last.row.id }) : null,
      items: rows.map((r) => ({
        id: r.id,
        type: r.type as Type,
        data: r.data as Record<string, string>,
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async markRead(userId: string, ids?: string[]): Promise<void> {
    const own = and(eq(notifications.userId, userId), isNull(notifications.readAt));
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(ids?.length ? and(own, inArray(notifications.id, ids)) : own);
  }
}
