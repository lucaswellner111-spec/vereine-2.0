import type { NotificationItem } from "@vereine/shared";
import { describe, expect, it } from "vitest";
import { actorsLabel, describeNotification, groupBySection, mergeNotifications, NOTIFICATION_ICONS, relativeTime, SECTION_LABELS, sectionOf } from "./notifications";

describe("relativeTime", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  const ago = (s: number) => new Date(now - s * 1000).toISOString();
  it("formatiert kurz und deutsch", () => {
    expect(relativeTime(ago(10), now)).toBe("gerade eben");
    expect(relativeTime(ago(5 * 60), now)).toBe("vor 5 Min.");
    expect(relativeTime(ago(3 * 3600), now)).toBe("vor 3 Std.");
    expect(relativeTime(ago(86_400), now)).toBe("gestern");
    expect(relativeTime(ago(30 * 86_400), now)).toBe("08.10.2026");
  });
});

describe("describeNotification", () => {
  it("liefert Text, Ziel und Icon je Art", () => {
    const n = { id: "1", type: "new_follower", data: { name: "Anna", handle: "anna" }, readAt: null, createdAt: "" } as NotificationItem;
    expect(describeNotification(n)).toEqual({ text: "Anna folgt dir jetzt.", href: "/profil/anna" });
    expect(NOTIFICATION_ICONS.new_follower).toBeTruthy();
  });

  it("Kommentar fuehrt zur Beitragsseite", () => {
    const n = { id: "2", type: "comment", data: { commenter: "Ben", excerpt: "Super", postId: "p1" }, readAt: null, createdAt: "" } as NotificationItem;
    expect(describeNotification(n)).toEqual({ text: "Ben hat kommentiert: „Super“", href: "/beitrag/p1" });
  });
});

describe("Termin-Benachrichtigungen P4b", () => {
  it("geaendert und nachgerueckt fuehren zum Termin", () => {
    const upd = { id: "3", type: "event_updated", data: { title: "Training", eventId: "e1", startsAt: "2026-11-10T18:00:00Z" }, readAt: null, createdAt: "" } as NotificationItem;
    expect(describeNotification(upd).href).toBe("/kalender/e1");
    expect(describeNotification(upd).text).toMatch(/^Geändert: Training – jetzt /);
    const pro = { id: "4", type: "event_waitlist_promoted", data: { title: "Ausflug", eventId: "e2", startsAt: "2026-11-10T18:00:00Z" }, readAt: null, createdAt: "" } as NotificationItem;
    expect(describeNotification(pro)).toMatchObject({ href: "/kalender/e2" });
    expect(describeNotification(pro).text).toMatch(/nachgerückt: Ausflug/);
    expect(NOTIFICATION_ICONS.event_updated).toBeTruthy();
    expect(NOTIFICATION_ICONS.event_waitlist_promoted).toBeTruthy();
  });
});

describe("mergeNotifications", () => {
  const item = (id: string, readAt: string | null = null) => ({ id, type: "new_follower", data: { name: id, handle: id }, readAt, createdAt: "" }) as NotificationItem;
  it("behaelt nachgeladene Seiten und Cursor, neue oben, bekannte aktualisiert", () => {
    const prev = { items: [item("b"), item("c"), item("d")], unread: 3, nextCursor: "alt" };
    const next = { items: [item("a"), item("b", "2026-11-07T00:00:00Z")], unread: 3, nextCursor: "neu" };
    const m = mergeNotifications(prev, next);
    expect(m.items.map((n) => n.id)).toEqual(["a", "b", "c", "d"]);
    expect(m.items[1].readAt).not.toBeNull();
    expect(m.nextCursor).toBe("alt");
    expect(m.unread).toBe(3);
  });
});

describe("Beitragslauf-Benachrichtigung", () => {
  it("fuehrt zu den Rechnungen", () => {
    const n = { id: "9", type: "fee_run_done", data: { periodLabel: "2027", orgName: "SV", created: "12" }, readAt: null, createdAt: "" } as NotificationItem;
    expect(describeNotification(n)).toEqual({ text: "Beitragslauf „2027“ bei SV fertig: 12 Entwürfe zum Prüfen und Finalisieren.", href: "/verwaltung/rechnungen" });
    expect(NOTIFICATION_ICONS.fee_run_done).toBeTruthy();
  });
});

describe("Aktivitaet (S3)", () => {
  const actors = [
    { id: "1", name: "Anna", handle: "anna", avatarId: null },
    { id: "2", name: "Ben", handle: "ben", avatarId: null },
  ];
  it("actorsLabel: eine, zwei, mehrere Personen", () => {
    expect(actorsLabel([actors[0]])).toBe("Anna");
    expect(actorsLabel(actors)).toBe("Anna und Ben");
    expect(actorsLabel(actors, 4)).toBe("Anna und 3 weitere");
    expect(actorsLabel([])).toBe("Jemand");
  });

  it("neue Arten: Like, Kommentar-Like, Antwort, Erwaehnung", () => {
    const mk = (type: NotificationItem["type"], data: Record<string, string>, count = 1) => ({ id: "x", type, data, readAt: null, createdAt: "", actors, count }) as NotificationItem;
    expect(describeNotification(mk("like", { postId: "p" }, 4))).toEqual({ text: "Anna und 3 weitere gefällt dein Beitrag.", href: "/beitrag/p" });
    expect(describeNotification(mk("comment_like", { postId: "p" })).text).toBe("Anna gefällt dein Kommentar.");
    expect(describeNotification(mk("comment_reply", { postId: "p", excerpt: "Stimmt" }))).toEqual({ text: "Anna hat auf deinen Kommentar geantwortet: „Stimmt“", href: "/beitrag/p" });
    expect(describeNotification(mk("mention", { postId: "p", commentId: "c", excerpt: "hi" })).text).toBe("Anna hat dich in einem Kommentar erwähnt: „hi“");
    expect(describeNotification(mk("mention", { postId: "p" })).text).toBe("Anna hat dich in einem Beitrag erwähnt.");
    expect(NOTIFICATION_ICONS.like).toBeTruthy();
    expect(NOTIFICATION_ICONS.mention).toBeTruthy();
  });

  it("Folgen-Benachrichtigung nutzt den aufgeloesten Namen (Fallback: data.name)", () => {
    const n = { id: "f", type: "new_follower", data: { name: "Alt", handle: "alt" }, readAt: null, createdAt: "", actors: [actors[0]] } as NotificationItem;
    expect(describeNotification(n)).toEqual({ text: "Anna folgt dir jetzt.", href: "/profil/anna" });
    expect(describeNotification({ ...n, actors: undefined }).text).toBe("Alt folgt dir jetzt.");
  });

  it("Abschnitte Heute / Diese Woche / Frueher, leere fallen weg", () => {
    const now = new Date("2026-11-14T15:00:00").getTime();
    expect(sectionOf("2026-11-14T08:00:00", now)).toBe("today");
    expect(sectionOf("2026-11-13T23:00:00", now)).toBe("week");
    expect(sectionOf("2026-11-08T12:00:00", now)).toBe("week");
    expect(sectionOf("2026-11-07T12:00:00", now)).toBe("earlier");
    const g = groupBySection(["2026-11-14T10:00:00", "2026-11-14T09:00:00", "2026-11-01T09:00:00"], (t) => t, now);
    expect(g.map((x) => [x.section, x.items.length])).toEqual([["today", 2], ["earlier", 1]]);
    expect(SECTION_LABELS.week).toBe("Diese Woche");
  });

  it("merge: aktualisierte gebuendelte Zeile rueckt nach oben, aeltere Seiten bleiben", () => {
    const row = (id: string, createdAt: string) => ({ id, type: "like", data: {}, readAt: null, createdAt }) as NotificationItem;
    const prev = { items: [row("a", "3"), row("b", "2"), row("old", "1")], unread: 2, nextCursor: "alt" };
    const next = { items: [row("b", "4"), row("a", "3")], unread: 2, nextCursor: "neu" };
    const m = mergeNotifications(prev, next);
    expect(m.items.map((n) => n.id)).toEqual(["b", "a", "old"]);
    expect(m.nextCursor).toBe("alt");
  });
});
