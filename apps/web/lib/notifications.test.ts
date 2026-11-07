import type { NotificationItem } from "@vereine/shared";
import { describe, expect, it } from "vitest";
import { describeNotification, mergeNotifications, NOTIFICATION_ICONS, relativeTime } from "./notifications";

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
