import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import type { NotificationItem } from "@vereine/shared";
import { DB, type Database } from "../db/db.module";
import { pushSubscriptions } from "../db/schema";

type Type = NotificationItem["type"];
export type PushPayload = { title: string; body: string; url: string; tag?: string };

/**
 * Kurztexte fuer Push-Mitteilungen. Bewusst ohne freie Nutzertexte (Kommentarinhalte u. Ae.): Mitteilungen
 * erscheinen auf Sperrbildschirmen und laufen ueber die Push-Dienste der Browserhersteller.
 */
export function pushMessage(type: Type, d: Record<string, string>): PushPayload {
  switch (type) {
    case "comment":
      return { title: "Neuer Kommentar", body: "Jemand hat deinen Beitrag kommentiert.", url: "/feed" };
    case "membership_request":
      return { title: "Neuer Mitgliedsantrag", body: d.orgName ?? "", url: "/verwaltung" };
    case "membership_decision":
      return { title: d.orgName ?? "Verein", body: d.decision === "approve" ? "Du bist jetzt Mitglied." : "Dein Antrag wurde abgelehnt.", url: `/vereine/${d.orgSlug ?? ""}` };
    case "event_created":
      return { title: `Neuer Termin: ${d.orgName ?? ""}`, body: d.title ?? "", url: "/kalender" };
    case "event_reminder":
      return { title: "Termin morgen", body: d.title ?? "", url: "/kalender" };
    case "event_canceled":
      return { title: "Termin abgesagt", body: d.title ?? "", url: "/kalender" };
    case "new_follower":
      return { title: "Neuer Follower", body: `${d.name ?? "Jemand"} folgt dir jetzt.`, url: `/profil/${d.handle ?? ""}` };
    case "follow_request":
      return { title: "Folgeanfrage", body: `${d.name ?? "Jemand"} möchte dir folgen.`, url: "/einstellungen/profil" };
    case "follow_accepted":
      return { title: "Folgeanfrage angenommen", body: d.name ?? "", url: `/profil/${d.handle ?? ""}` };
    case "post_hidden":
      return { title: "Beitrag ausgeblendet", body: "Einer deiner Beiträge wurde ausgeblendet.", url: "/feed" };
    case "invoice_new":
      return { title: `Neue Rechnung von ${d.orgName ?? ""}`, body: d.amount ?? "", url: "/rechnungen" };
    case "invoice_overdue":
      return { title: "Rechnung überfällig", body: d.orgName ?? "", url: "/rechnungen" };
  }
}

/**
 * Web-Push (VAPID) ohne Drittanbieter-Dienst: Der Browser nutzt den Push-Dienst seines Herstellers als
 * Zustellweg; die Nachricht ist Ende-zu-Ende verschluesselt (RFC 8291). Ohne VAPID-Schluessel ist Push aus.
 * SKALIERUNG: Versand je Empfaenger parallel in kleinen Bloecken; bei vielen Empfaengern laeuft das im Worker.
 */
@Injectable()
export class PushService {
  private readonly log = new Logger("Push");
  private readonly configured: boolean;
  readonly publicKey: string | null;

  constructor(@Inject(DB) private readonly db: Database) {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    this.configured = !!pub && !!priv;
    this.publicKey = this.configured ? pub! : null;
    if (this.configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "https://klubnest.de", pub!, priv!);
  }

  async subscribe(userId: string, sub: { endpoint: string; p256dh: string; auth: string }, userAgent?: string): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values({ userId, ...sub, userAgent: userAgent?.slice(0, 200) ?? null })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.p256dh, auth: sub.auth } });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  }

  async count(userId: string): Promise<number> {
    return (await this.db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))).length;
  }

  /** Sendet an alle Geraete der Nutzer; ungueltige Abos (404/410) werden entfernt. Fehler brechen nichts ab. */
  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (!this.configured || userIds.length === 0) return;
    const subs = await this.db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, [...new Set(userIds)])).limit(5000);
    const body = JSON.stringify(payload);
    const dead: string[] = [];
    for (let i = 0; i < subs.length; i += 20) {
      await Promise.all(
        subs.slice(i, i + 20).map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: "normal" });
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) dead.push(s.endpoint);
            else this.log.warn(`Push fehlgeschlagen (${status ?? "?"})`);
          }
        }),
      );
    }
    if (dead.length) await this.db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, dead));
  }
}
