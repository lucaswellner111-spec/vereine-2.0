import { ForbiddenException, Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { EMAIL_NOT_VERIFIED, type EmailPrefs, type PublicUser } from "@vereine/shared";
import { UsersDirectory } from "../auth/users-directory.service";
import { appLink } from "../common/app-url";
import { DB, type Database } from "../db/db.module";
import { notificationPrefs, notifications } from "../db/schema";
import { JobsService } from "../jobs/jobs.service";
import { MailService } from "../mail/mail.service";

/** Ab dieser Uhrzeit (deutsche Zeit) geht die Sammelmail raus; der Job laeuft stuendlich. */
const DIGEST_HOUR = 7;
const BATCH = 500;

/**
 * Nur diese Arten kommen in die Sammelmail (als Anzahl, ohne Namen oder Inhalte). Alles andere - insbesondere
 * spaetere Likes - bleibt draussen: keine Mails fuer Likes.
 */
const LABELS: Record<string, [string, string]> = {
  comment: ["neuer Kommentar", "neue Kommentare"],
  membership_request: ["neuer Mitgliedsantrag", "neue Mitgliedsanträge"],
  membership_decision: ["Entscheidung zu einer Mitgliedschaft", "Entscheidungen zu Mitgliedschaften"],
  post_hidden: ["ausgeblendeter Beitrag", "ausgeblendete Beiträge"],
  event: ["Neuigkeit zu Terminen", "Neuigkeiten zu Terminen"],
  new_follower: ["neue Person folgt dir", "neue Personen folgen dir"],
  follow_request: ["neue Folgeanfrage", "neue Folgeanfragen"],
  follow_accepted: ["angenommene Folgeanfrage", "angenommene Folgeanfragen"],
  invoice_new: ["neue Rechnung", "neue Rechnungen"],
  invoice_overdue: ["überfällige Rechnung", "überfällige Rechnungen"],
  fee_run_done: ["abgeschlossener Beitragslauf", "abgeschlossene Beitragsläufe"],
};

/** Zeilen der Sammelmail aus Anzahlen je Typ ("3 neue Kommentare"). Unbekannte Typen (z. B. Likes) fallen weg. */
export function digestLines(counts: { type: string; n: number }[]): string[] {
  const merged = new Map<string, number>();
  for (const { type, n } of counts) {
    const key = type.startsWith("event_") ? "event" : type;
    if (LABELS[key]) merged.set(key, (merged.get(key) ?? 0) + n);
  }
  return Object.keys(LABELS)
    .filter((k) => merged.get(k))
    .map((k) => `${merged.get(k)} ${LABELS[k][merged.get(k) === 1 ? 0 : 1]}`);
}

const startOfBerlinDay = sql`(date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')`;
const berlinHour = (d = new Date()) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(d));

/**
 * Taegliche Sammelmail fuer Benachrichtigungen, nur mit Opt-in (Einstellung, standardmaessig aus). Enthaelt nur Anzahlen
 * je Art und einen Link, keine Namen oder Texte. Abmelden per Link ohne Login (List-Unsubscribe) oder in den Einstellungen.
 * Nur an bestaetigte Adressen; ohne neue ungelesene Benachrichtigungen keine Mail.
 */
@Injectable()
export class DigestService implements OnModuleInit {
  private readonly log = new Logger("Digest");

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
  ) {}

  onModuleInit() {
    this.jobs.define("notifications.digest", async () => void (await this.run()));
    this.jobs.every("notifications.digest", 60 * 60 * 1000);
    this.mail.onUnsubscribe("digest", (userId) => this.setDigest(userId, false));
  }

  async prefs(user: PublicUser): Promise<EmailPrefs> {
    const [row] = await this.db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, user.id)).limit(1);
    return { digest: !!row?.emailDigest, since: row?.digestSince?.toISOString() ?? null, available: !!user.emailVerified };
  }

  async setPrefs(user: PublicUser, digest: boolean): Promise<EmailPrefs> {
    if (digest && !user.emailVerified) throw new ForbiddenException(EMAIL_NOT_VERIFIED);
    await this.setDigest(user.id, digest);
    return this.prefs(user);
  }

  /** Einschalten: ab jetzt sammeln (aeltere Benachrichtigungen kommen nicht in die erste Mail). */
  async setDigest(userId: string, on: boolean): Promise<void> {
    const values = on
      ? { emailDigest: true, digestSince: sql`coalesce(${notificationPrefs.digestSince}, now())`, lastDigestAt: sql`coalesce(${notificationPrefs.lastDigestAt}, now())`, updatedAt: new Date() }
      : { emailDigest: false, digestSince: null, updatedAt: new Date() };
    await this.db
      .insert(notificationPrefs)
      .values({ userId, emailDigest: on, digestSince: on ? new Date() : null, lastDigestAt: on ? new Date() : null })
      .onConflictDoUpdate({ target: notificationPrefs.userId, set: values as never });
  }

  /** Datenauskunft: eigene Mail-Einstellungen. */
  async exportFor(userId: string) {
    const [row] = await this.db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId)).limit(1);
    return { emailDigest: !!row?.emailDigest, since: row?.digestSince?.toISOString() ?? null, lastDigestAt: row?.lastDigestAt?.toISOString() ?? null };
  }

  /**
   * Ein Lauf (stuendlich, ab 07:00 Uhr): faellige Konten (heute noch keine Sammelmail), Anzahlen neuer ungelesener
   * Benachrichtigungen seit der letzten Sammelmail (hoechstens 24 h). Mehrere Worker: nur wer das Konto per
   * bedingtem Update "beansprucht", verschickt. `force` ignoriert die Uhrzeit (Tests).
   */
  async run(force = false): Promise<number> {
    if (!force && berlinHour() < DIGEST_HOUR) return 0;
    const due = and(eq(notificationPrefs.emailDigest, true), or(isNull(notificationPrefs.lastDigestAt), lt(notificationPrefs.lastDigestAt, startOfBerlinDay)));
    const dueUsers = await this.db.select({ userId: notificationPrefs.userId }).from(notificationPrefs).where(due).limit(BATCH);
    if (!dueUsers.length) return 0;
    const ids = dueUsers.map((u) => u.userId);
    const counts = await this.db
      .select({ userId: notifications.userId, type: notifications.type, n: sql<number>`count(*)::int` })
      .from(notifications)
      .innerJoin(notificationPrefs, eq(notificationPrefs.userId, notifications.userId))
      .where(
        and(
          inArray(notifications.userId, ids),
          isNull(notifications.readAt),
          sql`${notifications.createdAt} > greatest(coalesce(${notificationPrefs.lastDigestAt}, ${notificationPrefs.digestSince}, now() - interval '1 day'), now() - interval '1 day')`,
        ),
      )
      .groupBy(notifications.userId, notifications.type);
    const claimed = await this.db
      .update(notificationPrefs)
      .set({ lastDigestAt: sql`now()` })
      .where(and(inArray(notificationPrefs.userId, ids), due))
      .returning({ userId: notificationPrefs.userId });
    const byUser = new Map<string, { type: string; n: number }[]>();
    for (const c of counts) byUser.set(c.userId, [...(byUser.get(c.userId) ?? []), { type: c.type, n: c.n }]);
    const withNews = claimed.map((c) => c.userId).filter((id) => digestLines(byUser.get(id) ?? []).length > 0);
    const contacts = await this.directory.mailContacts(withNews);
    let sent = 0;
    for (const id of withNews) {
      const contact = contacts.get(id);
      if (!contact) continue;
      const result = await this.mail
        .send(contact.email, "notification-digest", { name: contact.name, lines: digestLines(byUser.get(id)!), link: appLink("/benachrichtigungen") }, { unsubscribe: { k: "digest", u: id } })
        .catch(() => null);
      if (result === "queued") sent++;
    }
    this.log.log(`Sammelmail: ${sent} eingereiht (${claimed.length} faellig).`);
    return sent;
  }
}
