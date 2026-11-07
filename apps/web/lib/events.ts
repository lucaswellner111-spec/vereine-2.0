import type { EventItem, RsvpStatus } from "@vereine/shared";

/** Antwortknoepfe auf einen Termin. */
export const RSVP_OPTIONS: { id: RsvpStatus; label: string }[] = [
  { id: "yes", label: "Zusagen" },
  { id: "maybe", label: "Vielleicht" },
  { id: "no", label: "Absagen" },
];

/** Status einer Antwort (Teilnehmerlisten). */
export const RSVP_STATUS_LABEL: Record<RsvpStatus, string> = { yes: "Zugesagt", maybe: "Vielleicht", no: "Abgesagt" };

/** Wendet eine Zusage sofort lokal an (Zaehler und eigener Status), bevor der Server antwortet. */
export function withRsvp(e: EventItem, status: RsvpStatus): EventItem {
  const counts = { ...e.counts };
  if (e.myStatus) counts[e.myStatus] = Math.max(0, counts[e.myStatus] - 1);
  counts[status] += 1;
  return { ...e, myStatus: status, counts };
}
