import type { AttendanceStatus, EventItem, EventKind, RsvpState, RsvpStatus } from "@vereine/shared";

/** Antwortknoepfe auf einen Termin. */
export const RSVP_OPTIONS: { id: RsvpStatus; label: string }[] = [
  { id: "yes", label: "Zusagen" },
  { id: "maybe", label: "Vielleicht" },
  { id: "no", label: "Absagen" },
];

/** Status einer Antwort (Teilnehmerlisten). */
export const RSVP_STATUS_LABEL: Record<RsvpState, string> = { yes: "Zugesagt", maybe: "Vielleicht", no: "Abgesagt", waitlist: "Warteliste" };

/** Art eines Termins. */
export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  training: "Training",
  match: "Spiel",
  meeting: "Versammlung",
  party: "Fest",
  other: "Sonstiges",
};

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = { present: "Da", absent: "Fehlt", excused: "Entschuldigt" };

/**
 * Wendet eine Antwort sofort lokal an (Zaehler und eigener Status), bevor der Server antwortet.
 * Mit Limit: Wer schon auf der Warteliste steht, bleibt dort; ist der Termin voll, landet die Zusage auf der
 * Warteliste (Platz am Ende). Seiten nutzen das optimistisch nur ohne Limit, der Server entscheidet.
 */
export function withRsvp(e: EventItem, status: RsvpStatus): EventItem {
  if (status === "yes" && (e.myStatus === "yes" || e.myStatus === "waitlist")) return e;
  const counts = { ...e.counts };
  if (e.myStatus) counts[e.myStatus] = Math.max(0, counts[e.myStatus] - 1);
  let next: RsvpState = status;
  let waitlistPosition: number | null = null;
  if (status === "yes" && e.capacity !== null && counts.yes >= e.capacity) {
    next = "waitlist";
    waitlistPosition = counts.waitlist + 1;
  }
  counts[next] += 1;
  return { ...e, myStatus: next, counts, waitlistPosition };
}

/** "12/20 Plätze · 3 auf der Warteliste" bzw. "12 Zusagen" ohne Limit. */
export function capacityText(e: Pick<EventItem, "capacity" | "counts">): string {
  if (e.capacity === null) return `${e.counts.yes} ${e.counts.yes === 1 ? "Zusage" : "Zusagen"}`;
  const wait = e.counts.waitlist ? ` · ${e.counts.waitlist} auf der Warteliste` : "";
  return `${e.counts.yes}/${e.capacity} Plätze${wait}`;
}

/** Eigener Status als Text, z. B. "Warteliste (Platz 2)". */
export function myStatusText(e: Pick<EventItem, "myStatus" | "waitlistPosition">): string | null {
  if (!e.myStatus) return null;
  if (e.myStatus === "waitlist") return e.waitlistPosition ? `Warteliste (Platz ${e.waitlistPosition})` : "Warteliste";
  return RSVP_STATUS_LABEL[e.myStatus];
}
