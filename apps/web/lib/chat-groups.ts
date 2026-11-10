/*
 * Darstellung des Chatverlaufs: Tagestrenner ("Heute", "Gestern", Datum) und Gruppen aufeinanderfolgender
 * Nachrichten derselben Person (Name nur an der ersten, Uhrzeit nur an der letzten Blase sichtbar).
 */

/** Hoechstabstand zweier Nachrichten derselben Person innerhalb einer Gruppe. */
export const GROUP_GAP_MS = 5 * 60_000;

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const weekdayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
const fullFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Beschriftung des Tagestrenners. */
export function dayLabel(date: Date, now: Date = new Date()): string {
  if (dayKey(date) === dayKey(now)) return "Heute";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(y)) return "Gestern";
  return date.getFullYear() === now.getFullYear() ? weekdayFmt.format(date) : fullFmt.format(date);
}

type Msg = { senderId: string; createdAt: string; deleted?: boolean };

export type MessageLayout = {
  /** Tagestrenner vor dieser Nachricht (Beschriftung) oder null */
  day: string | null;
  /** erste bzw. letzte Nachricht ihrer Gruppe */
  first: boolean;
  last: boolean;
};

/** Layout je Nachricht (Liste chronologisch aufsteigend). */
export function layoutMessages(msgs: readonly Msg[], now: Date = new Date()): MessageLayout[] {
  const joins = (a: Msg | undefined, b: Msg | undefined) =>
    !!a &&
    !!b &&
    a.senderId === b.senderId &&
    dayKey(new Date(a.createdAt)) === dayKey(new Date(b.createdAt)) &&
    Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) <= GROUP_GAP_MS;
  return msgs.map((m, i) => {
    const prev = msgs[i - 1];
    const next = msgs[i + 1];
    const d = new Date(m.createdAt);
    const newDay = !prev || dayKey(new Date(prev.createdAt)) !== dayKey(d);
    return { day: newDay ? dayLabel(d, now) : null, first: !joins(prev, m), last: !joins(m, next) };
  });
}
