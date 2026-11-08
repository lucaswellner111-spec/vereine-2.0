import type { EventItem } from "@vereine/shared";
import { describe, expect, it } from "vitest";
import { capacityText, myStatusText, withRsvp } from "./events";

const ev = (p: Partial<EventItem> = {}): EventItem => ({
  id: "e1", orgSlug: "tsv", orgName: "TSV", teamId: null, teamName: null, title: "Training", description: "", location: "",
  startsAt: "2026-11-10T18:00:00Z", endsAt: null, visibility: "members", canceled: false, seriesId: null, kind: "training",
  capacity: null, counts: { yes: 0, maybe: 0, no: 0, waitlist: 0 }, myStatus: null, waitlistPosition: null, canManage: false, ...p,
});

describe("withRsvp", () => {
  it("ohne Limit: ersetzt die eigene Antwort", () => {
    const a = withRsvp(ev({ counts: { yes: 2, maybe: 1, no: 0, waitlist: 0 }, myStatus: "maybe" }), "yes");
    expect(a.counts).toEqual({ yes: 3, maybe: 0, no: 0, waitlist: 0 });
    expect(a.myStatus).toBe("yes");
  });

  it("voller Termin: Zusage landet auf der Warteliste am Ende", () => {
    const a = withRsvp(ev({ capacity: 2, counts: { yes: 2, maybe: 0, no: 1, waitlist: 3 }, myStatus: "no" }), "yes");
    expect(a).toMatchObject({ myStatus: "waitlist", waitlistPosition: 4, counts: { yes: 2, no: 0, waitlist: 4 } });
  });

  it("Warteliste verlassen senkt den Zaehler; erneut Zusagen bleibt auf der Warteliste", () => {
    const w = ev({ capacity: 2, counts: { yes: 2, maybe: 0, no: 0, waitlist: 1 }, myStatus: "waitlist", waitlistPosition: 1 });
    expect(withRsvp(w, "yes")).toBe(w);
    const out = withRsvp(w, "no");
    expect(out).toMatchObject({ myStatus: "no", waitlistPosition: null, counts: { waitlist: 0, no: 1, yes: 2 } });
  });

  it("freier Platz: Zusage zaehlt", () => {
    expect(withRsvp(ev({ capacity: 3, counts: { yes: 2, maybe: 0, no: 0, waitlist: 0 } }), "yes").myStatus).toBe("yes");
  });
});

describe("Texte", () => {
  it("Plaetze und eigener Status", () => {
    expect(capacityText(ev({ capacity: 20, counts: { yes: 12, maybe: 0, no: 0, waitlist: 3 } }))).toBe("12/20 Plätze · 3 auf der Warteliste");
    expect(capacityText(ev({ counts: { yes: 1, maybe: 0, no: 0, waitlist: 0 } }))).toBe("1 Zusage");
    expect(myStatusText(ev({ myStatus: "waitlist", waitlistPosition: 2 }))).toBe("Warteliste (Platz 2)");
    expect(myStatusText(ev({ myStatus: "yes" }))).toBe("Zugesagt");
    expect(myStatusText(ev())).toBeNull();
  });
});
