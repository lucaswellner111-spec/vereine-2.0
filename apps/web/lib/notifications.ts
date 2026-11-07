import {
  AlarmClock,
  BadgeCheck,
  CalendarPlus,
  CalendarX,
  EyeOff,
  MessageCircle,
  Receipt,
  TriangleAlert,
  UserCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { NotificationItem, NotificationsResponse } from "@vereine/shared";

const fmt = (iso: string) => new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Text und Ziel einer Benachrichtigung (Glocke und Seite /benachrichtigungen). */
export function describeNotification(n: NotificationItem): { text: string; href: string } {
  const d = n.data;
  switch (n.type) {
    case "comment":
      return { text: `${d.commenter} hat kommentiert: „${d.excerpt}“`, href: "/feed" };
    case "membership_request":
      return { text: `Neuer Mitgliedsantrag bei ${d.orgName}`, href: "/verwaltung/antraege" };
    case "membership_decision":
      return {
        text: d.decision === "approve" ? `Du bist jetzt Mitglied bei ${d.orgName}.` : `Dein Antrag bei ${d.orgName} wurde abgelehnt.`,
        href: `/vereine/${d.orgSlug}`,
      };
    case "event_created":
      return { text: `Neuer Termin${d.series ? `serie (${d.series}×)` : ""} bei ${d.orgName}: ${d.title} (ab ${fmt(d.startsAt)})`, href: "/kalender" };
    case "event_reminder":
      return { text: `Erinnerung: ${d.title} – ${fmt(d.startsAt)}`, href: d.eventId ? `/kalender/${d.eventId}` : "/kalender" };
    case "event_canceled":
      return { text: d.series ? `Abgesagt: ${d.title} – ${d.series} Termine ab ${fmt(d.startsAt)}` : `Abgesagt: ${d.title} (${fmt(d.startsAt)})`, href: d.eventId ? `/kalender/${d.eventId}` : "/kalender" };
    case "new_follower":
      return { text: `${d.name} folgt dir jetzt.`, href: `/profil/${d.handle}` };
    case "follow_request":
      return { text: `${d.name} möchte dir folgen.`, href: "/einstellungen/profil" };
    case "follow_accepted":
      return { text: `${d.name} hat deine Folgeanfrage angenommen.`, href: `/profil/${d.handle}` };
    case "invoice_new":
      return { text: `Neue Rechnung ${d.number} von ${d.orgName}: ${d.amount}`, href: "/rechnungen" };
    case "invoice_overdue":
      return { text: `Rechnung ${d.number} von ${d.orgName} ist überfällig.`, href: "/rechnungen" };
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
  new_follower: UserPlus,
  follow_request: UserPlus,
  follow_accepted: UserCheck,
  invoice_new: Receipt,
  invoice_overdue: TriangleAlert,
  post_hidden: EyeOff,
};

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

/** Stille Aktualisierung (Rueckkehr zum Tab): neue oben, bekannte aktualisieren, nachgeladene Seiten und Cursor behalten. */
export function mergeNotifications(prev: NotificationsResponse, next: NotificationsResponse): NotificationsResponse {
  const known = new Set(prev.items.map((n) => n.id));
  const fresh = new Map(next.items.map((n) => [n.id, n]));
  return {
    ...prev,
    unread: next.unread,
    items: [...next.items.filter((n) => !known.has(n.id)), ...prev.items.map((n) => fresh.get(n.id) ?? n)],
  };
}
