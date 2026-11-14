import {
  AlarmClock,
  BadgeCheck,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  AtSign,
  CornerDownRight,
  EyeOff,
  Heart,
  MessageCircle,
  Receipt,
  ReceiptText,
  TriangleAlert,
  UserCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { NotificationActor, NotificationItem, NotificationsResponse } from "@vereine/shared";

const fmt = (iso: string) => new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** "Anna", "Anna und Ben", "Anna und 3 weitere" (count = alle Personen, auch ueber die gezeigten hinaus). */
export function actorsLabel(actors: Pick<NotificationActor, "name">[], count = actors.length): string {
  const first = actors[0]?.name ?? "Jemand";
  if (count <= 1) return first;
  if (count === 2 && actors[1]) return `${first} und ${actors[1].name}`;
  return `${first} und ${count - 1} weitere`;
}

const postHref = (d: Record<string, string>) => (d.postId ? `/beitrag/${d.postId}` : "/feed");
const quote = (d: Record<string, string>) => (d.excerpt ? `: „${d.excerpt}“` : ".");

/** Text und Ziel einer Benachrichtigung (Glocke und Seite /aktivitaet). */
export function describeNotification(n: NotificationItem): { text: string; href: string } {
  const d = n.data;
  const who = actorsLabel(n.actors ?? [], n.count);
  const name = n.actors?.[0]?.name ?? d.name;
  switch (n.type) {
    case "like":
      return { text: `${who} gefällt dein Beitrag.`, href: postHref(d) };
    case "comment_like":
      return { text: `${who} gefällt dein Kommentar.`, href: postHref(d) };
    case "comment_reply":
      return { text: `${who} hat auf deinen Kommentar geantwortet${quote(d)}`, href: postHref(d) };
    case "mention":
      return { text: `${who} hat dich ${d.commentId ? "in einem Kommentar" : "in einem Beitrag"} erwähnt${quote(d)}`, href: postHref(d) };
    case "comment":
      return { text: `${d.commenter} hat kommentiert: „${d.excerpt}“`, href: d.postId ? `/beitrag/${d.postId}` : "/feed" };
    case "membership_request":
      return { text: `Neuer Mitgliedsantrag bei ${d.orgName}`, href: "/verwaltung/antraege" };
    case "membership_decision":
      return {
        text: d.child
          ? d.decision === "approve" ? `Dein Kind ist jetzt Mitglied bei ${d.orgName}.` : `Der Antrag für dein Kind bei ${d.orgName} wurde abgelehnt.`
          : d.decision === "approve" ? `Du bist jetzt Mitglied bei ${d.orgName}.` : `Dein Antrag bei ${d.orgName} wurde abgelehnt.`,
        href: d.child ? "/kinder" : `/vereine/${d.orgSlug}`,
      };
    case "event_created":
      return { text: `Neuer Termin${d.series ? `serie (${d.series}×)` : ""} bei ${d.orgName}: ${d.title} (ab ${fmt(d.startsAt)})`, href: "/kalender" };
    case "event_reminder":
      return { text: `Erinnerung: ${d.title} – ${fmt(d.startsAt)}`, href: d.eventId ? `/kalender/${d.eventId}` : "/kalender" };
    case "event_canceled":
      return { text: d.series ? `Abgesagt: ${d.title} – ${d.series} Termine ab ${fmt(d.startsAt)}` : `Abgesagt: ${d.title} (${fmt(d.startsAt)})`, href: d.eventId ? `/kalender/${d.eventId}` : "/kalender" };
    case "event_updated":
      return { text: d.series ? `Geändert: ${d.title} (${d.series} Termine der Serie)` : `Geändert: ${d.title} – jetzt ${fmt(d.startsAt)}`, href: d.eventId ? `/kalender/${d.eventId}` : "/kalender" };
    case "event_waitlist_promoted":
      return { text: `Du bist nachgerückt: ${d.title} (${fmt(d.startsAt)}) – dein Platz ist bestätigt.`, href: d.eventId ? `/kalender/${d.eventId}` : "/kalender" };
    case "new_follower":
      return { text: `${name} folgt dir jetzt.`, href: `/profil/${n.actors?.[0]?.handle ?? d.handle}` };
    case "follow_request":
      return { text: `${name} möchte dir folgen.`, href: "/einstellungen/profil" };
    case "follow_accepted":
      return { text: `${name} hat deine Folgeanfrage angenommen.`, href: `/profil/${d.handle}` };
    case "invoice_new":
      return { text: `Neue Rechnung ${d.number} von ${d.orgName}: ${d.amount}`, href: "/rechnungen" };
    case "invoice_overdue":
      return { text: `Rechnung ${d.number} von ${d.orgName} ist überfällig.`, href: "/rechnungen" };
    case "fee_run_done":
      return { text: `Beitragslauf „${d.periodLabel}“ bei ${d.orgName} fertig: ${d.created} Entwürfe zum Prüfen und Finalisieren.`, href: "/verwaltung/rechnungen" };
    case "child_rsvp":
      return { text: `${d.status === "yes" ? "Zusage" : d.status === "no" ? "Absage" : "Rückmeldung"} für dein Kind: ${d.title} (${fmt(d.startsAt)})`, href: d.eventId ? `/kalender/${d.eventId}` : "/kinder" };
    case "child_graduation":
      return { text: `Dein Kind wird in ${d.days} Tagen 16 und braucht dann ein eigenes Konto.`, href: "/kinder" };
    case "post_hidden":
      return { text: `Dein Beitrag „${d.excerpt}“ wurde ausgeblendet. Grund: ${d.reason}`, href: "/feed" };
  }
}

export const NOTIFICATION_ICONS: Record<NotificationItem["type"], LucideIcon> = {
  comment: MessageCircle,
  membership_request: UserPlus,
  membership_decision: BadgeCheck,
  event_created: CalendarPlus,
  event_reminder: AlarmClock,
  event_canceled: CalendarX,
  event_updated: CalendarClock,
  event_waitlist_promoted: CalendarCheck,
  new_follower: UserPlus,
  follow_request: UserPlus,
  follow_accepted: UserCheck,
  invoice_new: Receipt,
  invoice_overdue: TriangleAlert,
  fee_run_done: ReceiptText,
  post_hidden: EyeOff,
  child_rsvp: CalendarCheck,
  child_graduation: AlarmClock,
  like: Heart,
  comment_like: Heart,
  comment_reply: CornerDownRight,
  mention: AtSign,
};

/** Kurzer Titel fuer das Live-Banner. */
export const NOTIFICATION_TITLES: Partial<Record<NotificationItem["type"], string>> = {
  like: "Gefällt mir",
  comment_like: "Gefällt mir",
  comment: "Neuer Kommentar",
  comment_reply: "Neue Antwort",
  mention: "Erwähnung",
  new_follower: "Neuer Follower",
  follow_request: "Folgeanfrage",
  follow_accepted: "Folgeanfrage angenommen",
  membership_request: "Mitgliedsantrag",
  membership_decision: "Mitgliedschaft",
  invoice_new: "Neue Rechnung",
  invoice_overdue: "Rechnung überfällig",
};

export type ActivitySection = "today" | "week" | "earlier";
export const SECTION_LABELS: Record<ActivitySection, string> = { today: "Heute", week: "Diese Woche", earlier: "Früher" };

/** Abschnitt einer Zeit: heute (lokaler Kalendertag), die letzten 7 Tage, sonst frueher. */
export function sectionOf(iso: string, now: number = Date.now()): ActivitySection {
  const d = new Date(iso);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (d.getTime() >= today.getTime()) return "today";
  if (d.getTime() >= today.getTime() - 6 * 86_400_000) return "week";
  return "earlier";
}

/** Gruppiert in der vorhandenen Reihenfolge (neueste zuerst) in Heute / Diese Woche / Frueher; leere Abschnitte fallen weg. */
export function groupBySection<T>(items: T[], timeOf: (item: T) => string, now: number = Date.now()): { section: ActivitySection; items: T[] }[] {
  const out: { section: ActivitySection; items: T[] }[] = [];
  for (const item of items) {
    const section = sectionOf(timeOf(item), now);
    const last = out[out.length - 1];
    if (last && last.section === section) last.items.push(item);
    else out.push({ section, items: [item] });
  }
  return out;
}

const rtf = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto", style: "short" });
const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Relative Zeit ("vor 5 Min.", "gestern"); aelter als eine Woche als Datum. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = Math.round((new Date(iso).getTime() - now) / 1000); // negativ = Vergangenheit
  const abs = Math.abs(diff);
  if (abs < 45) return "gerade eben";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 7 * 86_400) return rtf.format(Math.round(diff / 86_400), "day");
  return dateFmt.format(new Date(iso));
}

/**
 * Stille Aktualisierung (Rueckkehr zum Tab, Live-Ereignis): die frische erste Seite steht oben in Serverreihenfolge
 * (gebuendelte Likes ruecken mit neuer Zeit nach oben), darunter die schon nachgeladenen aelteren Zeilen samt Cursor.
 */
export function mergeNotifications(prev: NotificationsResponse, next: NotificationsResponse): NotificationsResponse {
  const fresh = new Set(next.items.map((n) => n.id));
  return { ...prev, unread: next.unread, items: [...next.items, ...prev.items.filter((n) => !fresh.has(n.id))] };
}
