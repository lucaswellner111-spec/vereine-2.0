import type { EventItem, RsvpStatus } from "@vereine/shared";

/** Wendet eine Zusage sofort lokal an (Zaehler und eigener Status), bevor der Server antwortet. */
export function withRsvp(e: EventItem, status: RsvpStatus): EventItem {
  const counts = { ...e.counts };
  if (e.myStatus) counts[e.myStatus] = Math.max(0, counts[e.myStatus] - 1);
  counts[status] += 1;
  return { ...e, myStatus: status, counts };
}
