import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NotificationItem, NotificationsResponse } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { notifications } from "../db/schema";

type Type = NotificationItem["type"];

@Injectable()
export class NotificationsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Legt Benachrichtigungen an. Bewusst ohne Echtzeit-Push: Clients fragen per Polling ab.
   * SKALIERUNG: Bei Chat/WebSocket (Phase 2) wird hier ueber Redis Pub/Sub live zugestellt.
   */
  async notify(userIds: string[], type: Type, data: Record<string, string>): Promise<void> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;
    await this.db.insert(notifications).values(unique.map((userId) => ({ userId, type, data })));
  }

  async list(userId: string, limit = 30): Promise<NotificationsResponse> {
    const [rows, [{ n }]] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(limit),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
    ]);
    return {
      unread: n,
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
