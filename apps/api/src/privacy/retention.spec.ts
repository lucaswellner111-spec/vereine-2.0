import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { createTestDb } from "../testing/test-db";
import { StorageService } from "../media/storage.service";
import { Logger } from "@nestjs/common";
import { vi } from "vitest";
import { AuditService } from "../auth/audit.service";
import { BillingService } from "../billing/billing.service";
import { EventsService } from "../events/events.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrgAdminService } from "../orgs/org-admin.service";
import { PostsService } from "../posts/posts.service";
import { RetentionService } from "./retention.service";

const DAY = 86400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

describe("Aufraeum-Jobs (privacy.retention)", () => {
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let retention: RetentionService;
  let storage: StorageService;
  let billing: BillingService;
  let notificationsSvc: NotificationsService, postsSvc: PostsService, audit: AuditService, eventsSvc: EventsService, orgAdmin: OrgAdminService;
  let close: () => Promise<void>;
  const dir = mkdtempSync(join(tmpdir(), "vereine-retention-"));
  let userA: string, userB: string, orgId: string;

  beforeAll(async () => {
    process.env.MEDIA_DIR = dir;
    db = await createTestDb();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    const app = moduleRef;
    await app.init();
    close = () => app.close();
    retention = app.get(RetentionService);
    storage = app.get(StorageService);
    notificationsSvc = app.get(NotificationsService);
    postsSvc = app.get(PostsService);
    audit = app.get(AuditService);
    billing = app.get(BillingService);
    eventsSvc = app.get(EventsService);
    orgAdmin = app.get(OrgAdminService);

    const users = await db
      .insert(schema.users)
      .values([
        { email: "a@example.de", passwordHash: "x", displayName: "A" },
        { email: "b@example.de", passwordHash: "x", displayName: "B" },
      ])
      .returning();
    [userA, userB] = users.map((u) => u.id);
    const [org] = await db.insert(schema.organizations).values({ slug: "sv-frist", name: "SV Frist", category: "Sport", city: "X" }).returning();
    orgId = org.id;
  });

  afterAll(async () => {
    await close();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.MEDIA_DIR;
  });

  it("ist als taeglicher Job registriert und laeuft komplett", async () => {
    const result = await retention.runAll();
    expect(Object.keys(result).sort()).toEqual(["attendance", "auditLog", "authTokens", "deletedPosts", "guardianConsents", "invites", "invoices", "mailSuppressions", "notifications", "orphanedYouth", "pendingAccounts", "pendingMembers", "waitlist"]);
  });

  it("ein fehlschlagender Schritt haelt die anderen nicht auf; Fehler am Ende mit Schrittnamen", async () => {
    const errors = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const boom = vi.spyOn(postsSvc, "purgeExpired").mockRejectedValueOnce(new Error("Datenbank weg"));
    const others = [
      vi.spyOn(notificationsSvc, "purgeExpired"),
      vi.spyOn(audit, "purgeExpired"),
      vi.spyOn(eventsSvc, "purgeExpiredAttendance"),
      vi.spyOn(orgAdmin, "purgeExpiredInvites"),
    ];
    await expect(retention.runAll()).rejects.toThrow("Aufraeumen unvollstaendig: deletedPosts");
    expect(boom).toHaveBeenCalledTimes(1);
    for (const s of others) expect(s).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls.map((c) => String(c[0]))).toContain("Aufraeumen deletedPosts fehlgeschlagen: Datenbank weg");
    vi.restoreAllMocks();
  });

  it("Benachrichtigungen: 179 Tage bleiben, 181 Tage werden geloescht", async () => {
    const rows = await db
      .insert(schema.notifications)
      .values([
        { userId: userA, type: "comment", createdAt: daysAgo(179) },
        { userId: userA, type: "comment", createdAt: daysAgo(181) },
        { userId: userB, type: "comment", createdAt: daysAgo(1) },
      ])
      .returning();
    expect(await notificationsSvc.purgeExpired()).toBe(1);
    const left = await db.select({ id: schema.notifications.id }).from(schema.notifications);
    expect(left.map((r) => r.id).sort()).toEqual([rows[0].id, rows[2].id].sort());
  });

  it("loescht blockweise (2.500 Zeilen in mehreren Runden)", async () => {
    await db.delete(schema.notifications);
    const old = daysAgo(200);
    await db.insert(schema.notifications).values(Array.from({ length: 2500 }, () => ({ userId: userB, type: "comment", createdAt: old })));
    await db.insert(schema.notifications).values({ userId: userB, type: "comment" });
    expect(await notificationsSvc.purgeExpired()).toBe(2500);
    expect(await db.select().from(schema.notifications)).toHaveLength(1);
  });

  it("gelöschte Beitraege: nach 30 Tagen endgueltig inkl. Bild, offene Meldung schuetzt", async () => {
    const [recent, old, reported, live] = await db
      .insert(schema.posts)
      .values([
        { authorId: userA, body: "", deletedAt: daysAgo(29) },
        { authorId: userA, body: "", deletedAt: daysAgo(31) },
        { authorId: userA, body: "Beweis", deletedAt: daysAgo(40) },
        { authorId: userA, body: "lebt" },
      ])
      .returning();
    const [m] = await db.insert(schema.media).values({ ownerId: userA, kind: "post", width: 1, height: 1, bytes: 1 }).returning();
    await storage.put(`${m.id}/medium.webp`, Buffer.from("bild"));
    await db.insert(schema.postMedia).values({ postId: old.id, mediaId: m.id });
    await db.insert(schema.comments).values({ postId: old.id, authorId: userB, body: "weg" });
    await db.insert(schema.reports).values({ postId: reported.id, reporterId: userB, reason: "spam" });
    await db.insert(schema.feedFeedback).values([
      { userId: userB, targetKind: "post", targetId: old.id },
      { userId: userB, targetKind: "post", targetId: live.id },
    ]);

    expect(await postsSvc.purgeExpired()).toBe(1);
    const left = (await db.select({ id: schema.posts.id }).from(schema.posts)).map((r) => r.id).sort();
    expect(left).toEqual([recent.id, reported.id, live.id].sort());
    expect(await db.select().from(schema.media).where(eq(schema.media.id, m.id))).toHaveLength(0);
    expect(await storage.get(`${m.id}/medium.webp`)).toBeNull();
    expect(await db.select().from(schema.comments).where(eq(schema.comments.postId, old.id))).toHaveLength(0);
    const fb = await db.select().from(schema.feedFeedback);
    expect(fb.map((f) => f.targetId)).toEqual([live.id]);

    // Meldung erledigt -> naechster Lauf entfernt auch diesen Beitrag
    await db.update(schema.reports).set({ status: "dismissed" }).where(eq(schema.reports.postId, reported.id));
    expect(await postsSvc.purgeExpired()).toBe(1);
  });

  it("erledigte Meldungen: 30 Tage nach Bearbeitung weg, offene und frische bleiben", async () => {
    const [p] = await db.insert(schema.posts).values({ authorId: userA, body: "lebt weiter" }).returning();
    await db.insert(schema.reports).values([
      { postId: p.id, reporterId: userB, reason: "spam", status: "dismissed", resolvedAt: daysAgo(31) }, // weg
      { postId: p.id, reporterId: userA, reason: "spam", status: "actioned", resolvedAt: daysAgo(29) }, // bleibt
    ]);
    await db.insert(schema.reports).values({ postId: p.id, reporterId: userB, reason: "spam", status: "open", createdAt: daysAgo(90) }); // offen: bleibt
    expect(await postsSvc.purgeExpired()).toBe(1);
    const left = await db.select().from(schema.reports).where(eq(schema.reports.postId, p.id));
    expect(left.map((r) => r.status).sort()).toEqual(["actioned", "open"]);
  });

  it("Zugriffsprotokoll: 12 Monate allgemein, 24 Monate Moderation, 10 Jahre Rechnungen", async () => {
    const rows = await db
      .insert(schema.auditLog)
      .values([
        { userId: userA, action: "user.login", createdAt: daysAgo(360) }, // bleibt
        { userId: userA, action: "user.login", createdAt: daysAgo(370) }, // weg
        { userId: null, action: "user.deleted", createdAt: daysAgo(370) }, // weg
        { userId: userA, action: "platform.report.resolved", createdAt: daysAgo(400) }, // bleibt
        { userId: userA, action: "post.hidden", createdAt: daysAgo(700) }, // bleibt
        { userId: userA, action: "comment.deleted", createdAt: daysAgo(740) }, // weg
        { userId: userA, action: "platform.chat-reports.viewed", createdAt: daysAgo(740) }, // weg
        { userId: userA, action: "invoice.finalized", createdAt: daysAgo(3000) }, // bleibt
        { userId: userA, action: "invoice.paid", createdAt: daysAgo(3700) }, // weg (> 10 Jahre)
      ])
      .returning();
    expect(await audit.purgeExpired()).toBe(5);
    const left = new Set((await db.select({ id: schema.auditLog.id }).from(schema.auditLog)).map((r) => r.id));
    expect([0, 3, 4, 7].every((i) => left.has(rows[i].id))).toBe(true);
    expect([1, 2, 5, 6, 8].some((i) => left.has(rows[i].id))).toBe(false);
  });

  it("Rechnungen: finalisierte Rechnungen geloeschter Vereine nach 10 Jahren, Nummernkreis ohne Rest", async () => {
    const gone = "00000000-0000-4000-8000-0000000000aa";
    const gone2 = "00000000-0000-4000-8000-0000000000bb";
    const base = { recipientName: "X", issuerName: "Weg e.V.", dueDate: "2000-01-31", createdBy: userA };
    const years = (n: number) => new Date(Date.now() - n * 365 * DAY);
    const inv = await db
      .insert(schema.invoices)
      .values([
        { ...base, orgId: gone, number: "2010-0001", status: "paid", finalizedAt: years(12) }, // weg
        { ...base, orgId: gone, number: "2025-0001", status: "open", finalizedAt: years(1) }, // bleibt (Frist laeuft)
        { ...base, orgId: orgId, number: "2010-0001", status: "paid", finalizedAt: years(12) }, // bleibt (Verein besteht)
        { ...base, orgId: gone2, number: "2010-0001", status: "void", finalizedAt: years(12) }, // weg
      ])
      .returning();
    await db.insert(schema.invoiceItems).values({ invoiceId: inv[0].id, position: 1, description: "B", quantity: 1, unitCents: 100, vatRate: 0 });
    await db.insert(schema.invoiceCounters).values([
      { orgId: gone, year: 2010, lastNo: 1 }, // bleibt (Rechnung uebrig)
      { orgId: gone2, year: 2010, lastNo: 1 }, // weg
      { orgId, year: 2010, lastNo: 1 }, // bleibt (Verein besteht)
    ]);
    expect(await billing.purgeExpired()).toBe(2);
    const left = (await db.select({ id: schema.invoices.id }).from(schema.invoices)).map((r) => r.id);
    expect(left.sort()).toEqual([inv[1].id, inv[2].id].sort());
    expect(await db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, inv[0].id))).toHaveLength(0);
    expect((await db.select().from(schema.invoiceCounters)).map((c) => c.orgId).sort()).toEqual([gone, orgId].sort());
    // zweiter Lauf: nichts mehr zu tun
    expect(await billing.purgeExpired()).toBe(0);
  });

  it("Anwesenheit: 23 Monate bleiben, 25 Monate werden geloescht", async () => {
    const evs = await db
      .insert(schema.events)
      .values([
        { orgId, title: "Alt", startsAt: daysAgo(760) },
        { orgId, title: "Juenger", startsAt: daysAgo(700) },
      ])
      .returning();
    await db.insert(schema.eventAttendance).values([
      { eventId: evs[0].id, userId: userA, status: "present", markedAt: daysAgo(760) }, // ~25 Monate
      { eventId: evs[0].id, userId: userB, status: "absent", markedAt: daysAgo(760) },
      { eventId: evs[1].id, userId: userA, status: "excused", markedAt: daysAgo(700) }, // ~23 Monate
    ]);
    expect(await eventsSvc.purgeExpiredAttendance()).toBe(2);
    const left = await db.select().from(schema.eventAttendance);
    expect(left).toHaveLength(1);
    expect(left[0].eventId).toBe(evs[1].id);
    // Termine selbst bleiben
    expect(await db.select().from(schema.events).where(inArray(schema.events.id, evs.map((e) => e.id)))).toHaveLength(2);
  });

  it("Einladungen: 30 Tage nach Ablauf oder Widerruf geloescht", async () => {
    const base = { orgId, maxUses: 5, createdBy: userA, tokenEnc: "x" };
    const rows = await db
      .insert(schema.orgInvites)
      .values([
        { ...base, tokenHash: "t1", expiresAt: new Date(Date.now() + DAY) }, // aktiv
        { ...base, tokenHash: "t2", expiresAt: daysAgo(29) }, // abgelaufen, noch sichtbar
        { ...base, tokenHash: "t3", expiresAt: daysAgo(31) }, // weg
        { ...base, tokenHash: "t4", expiresAt: new Date(Date.now() + 10 * DAY), revokedAt: daysAgo(31) }, // weg
        { ...base, tokenHash: "t5", expiresAt: new Date(Date.now() + 10 * DAY), revokedAt: daysAgo(2) }, // bleibt
      ])
      .returning();
    expect(await orgAdmin.purgeExpiredInvites()).toBe(2);
    const left = (await db.select({ h: schema.orgInvites.tokenHash }).from(schema.orgInvites)).map((r) => r.h).sort();
    expect(left).toEqual(["t1", "t2", "t5"]);
    expect(rows).toHaveLength(5);
  });
});
