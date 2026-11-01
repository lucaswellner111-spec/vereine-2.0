import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { CalendarFeedCreated, CalendarFeedStatus } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { calendarTokens } from "../db/schema";
import { EventsService } from "./events.service";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Kalender-Abo per Link (iCal): Kalenderprogramme koennen keine Anmeldung, daher gibt es einen geheimen
 * Token je Nutzer. Nur der Hash wird gespeichert; ein neuer Token macht den alten ungueltig. Der Feed zeigt
 * genau die Termine, die der Nutzer auch in der App sieht.
 */
@Injectable()
export class CalendarFeedService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  async status(userId: string): Promise<CalendarFeedStatus> {
    const [row] = await this.db.select().from(calendarTokens).where(eq(calendarTokens.userId, userId)).limit(1);
    return { enabled: !!row, createdAt: row?.createdAt.toISOString() ?? null };
  }

  async rotate(userId: string): Promise<CalendarFeedCreated> {
    const token = randomBytes(32).toString("base64url");
    const createdAt = new Date();
    await this.db
      .insert(calendarTokens)
      .values({ userId, tokenHash: sha256(token), createdAt })
      .onConflictDoUpdate({ target: calendarTokens.userId, set: { tokenHash: sha256(token), createdAt } });
    return { token, createdAt: createdAt.toISOString() };
  }

  async disable(userId: string): Promise<void> {
    await this.db.delete(calendarTokens).where(eq(calendarTokens.userId, userId));
  }

  async feed(token: string): Promise<string> {
    const [row] = await this.db.select().from(calendarTokens).where(eq(calendarTokens.tokenHash, sha256(token))).limit(1);
    if (!row) throw new NotFoundException("Kalender nicht gefunden.");
    return this.events.icsFeed(row.userId);
  }
}
