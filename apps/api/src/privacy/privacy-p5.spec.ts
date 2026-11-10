import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { createTestDb } from "../testing/test-db";
import { confirmEmailForTest } from "../testing/auth";

const password = "ein-sehr-langes-passwort";
const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

function multipart(data: Buffer) {
  const boundary = "----p5boundary" + Math.random().toString(16).slice(2);
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bild.png"\r\nContent-Type: image/png\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, data, tail]), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}
const png = () => sharp({ create: { width: 400, height: 300, channels: 3, background: "#3a7d44" } }).png().toBuffer();

describe("Datenschutz P5: vollstaendige Auskunft, Bilder-ZIP, Loeschung", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const dir = mkdtempSync(join(tmpdir(), "vereine-p5-"));

  beforeAll(async () => {
    process.env.MEDIA_DIR = dir;
    db = await createTestDb();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.MEDIA_DIR;
  });

  type U = { cookie: string; id: string; email: string; handle: string };
  async function signup(name: string, displayName = name): Promise<U> {
    const email = `${name}@example.de`;
    const reg = await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email, password, displayName, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    await confirmEmailForTest(app, email);
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const me = await app.inject({ method: "GET", url: "/profiles/me", headers: { cookie } });
    return { cookie, id: login.json().id, email, handle: me.json().handle };
  }
  const req = (u: U, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });
  const upload = (u: U, url: string, data: Buffer) => {
    const m = multipart(data);
    return app.inject({ method: "POST", url, payload: m.payload, headers: { ...m.headers, cookie: u.cookie } });
  };

  let anna: U, ben: U, clara: U;
  let benPostId: string, annaPostId: string, eventId: string;
  const annaMedia: string[] = [];
  let benMediaId: string;

  beforeAll(async () => {
    [anna, ben, clara] = [await signup("anna", "Anna Muster"), await signup("ben"), await signup("clara")];
    await db.update(schema.profiles).set({ bio: "Anna-Bio", location: "Annastadt" }).where(eq(schema.profiles.userId, anna.id));

    // Folgen: Anna -> Ben, Clara -> Anna; Ben -> Clara (fremde Beziehung)
    await req(anna, "POST", `/profiles/${ben.handle}/follow`);
    await req(clara, "POST", `/profiles/${anna.handle}/follow`);
    await req(ben, "POST", `/profiles/${clara.handle}/follow`);

    // Beitraege, Likes, Kommentare, Meldungen
    benPostId = (await req(ben, "POST", "/posts", { body: "BEN-BEITRAG-GEHEIM" })).json().id;
    annaPostId = (await req(anna, "POST", "/posts", { body: "Annas Beitrag" })).json().id;
    await req(anna, "POST", `/posts/${benPostId}/like`);
    await req(ben, "POST", `/posts/${annaPostId}/like`);
    await req(anna, "POST", `/posts/${benPostId}/comments`, { body: "Annas Kommentar" });
    await req(ben, "POST", `/posts/${annaPostId}/comments`, { body: "Bens Kommentar" });
    await req(anna, "POST", `/posts/${benPostId}/report`, { reason: "spam", note: "Annas Notiz" });
    await req(clara, "POST", `/posts/${annaPostId}/report`, { reason: "other", note: "CLARA-NOTIZ" });

    // Verein, Team, Termin, Zusage, Helferdienst, Anwesenheit
    await req(anna, "POST", "/orgs", { name: "SV Export", category: "Sport", city: "Exportstadt" });
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, "sv-export"));
    const [team] = await db.insert(schema.teams).values({ orgId: org.id, name: "Erste" }).returning();
    await db.insert(schema.teamMembers).values({ teamId: team.id, userId: anna.id });
    eventId = (await req(anna, "POST", "/orgs/sv-export/events", { title: "Training", startsAt: inHours(30) })).json().id;
    await req(anna, "PUT", `/events/${eventId}/rsvp`, { status: "yes" });
    const [shift] = await db.insert(schema.eventShifts).values({ eventId, title: "Kuchen", slots: 2 }).returning();
    await db.insert(schema.eventShiftSignups).values({ shiftId: shift.id, userId: anna.id });
    await db.insert(schema.eventAttendance).values({ eventId, userId: anna.id, status: "present", markedBy: anna.id });

    // Push-Abos, 2FA (Geheimnisse duerfen nie im Export stehen)
    await db.insert(schema.pushSubscriptions).values([
      { userId: anna.id, endpoint: "https://fcm.googleapis.com/fcm/send/ANNA-ENDPOINT-TOKEN", p256dh: "ANNA-P256DH", auth: "ANNA-AUTH" },
      { userId: ben.id, endpoint: "https://updates.push.services.mozilla.com/wpush/v2/BEN", p256dh: "BEN-P256DH", auth: "BEN-AUTH" },
    ]);
    await db.insert(schema.userTotp).values({ userId: anna.id, secretEnc: "TOTP-GEHEIMNIS", enabledAt: new Date() });

    // Bilder
    annaMedia.push((await upload(anna, "/media/avatar", await png())).json().id);
    annaMedia.push((await upload(anna, "/media/post", await png())).json().id);
    benMediaId = (await upload(ben, "/media/post", await png())).json().id;
  });

  it("Export enthaelt alle neuen Sektionen", async () => {
    const res = await req(anna, "GET", "/privacy/export");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.socialProfile).toMatchObject({ handle: anna.handle, bio: "Anna-Bio", location: "Annastadt", visibility: "public", hasAvatar: true });
    expect(body.following).toEqual([expect.objectContaining({ userId: ben.id, handle: ben.handle, status: "active" })]);
    expect(body.followers).toEqual([expect.objectContaining({ userId: clara.id, handle: clara.handle })]);
    expect(body.likes).toEqual([expect.objectContaining({ postId: benPostId })]);
    expect(body.comments).toEqual([expect.objectContaining({ body: "Annas Kommentar", postId: benPostId })]);
    expect(body.reports).toEqual([expect.objectContaining({ postId: benPostId, reason: "spam", note: "Annas Notiz", status: "open" })]);
    expect(body.notifications.map((n: { type: string }) => n.type).sort()).toEqual(["comment", "new_follower"]);
    expect(body.pushSubscriptions).toEqual([{ host: "fcm.googleapis.com", at: expect.any(String) }]);
    expect(body.twoFactor).toMatchObject({ enabled: true });
    expect(body.events.responses).toEqual([expect.objectContaining({ eventId, status: "yes" })]);
    expect(body.events.helperShifts).toEqual([expect.objectContaining({ shiftTitle: "Kuchen" })]);
    expect(body.events.attendance).toEqual([expect.objectContaining({ eventId, status: "present" })]);
    expect(body.events.teams).toEqual([expect.objectContaining({ name: "Erste" })]);
    expect(body.pollVotes).toEqual([]);
    expect(body.memberships).toEqual([expect.objectContaining({ role: "admin", status: "active" })]);
    expect(body.memberData).toBeDefined();
    expect(body.invoices).toBeDefined();
    expect(body.chat).toMatchObject({ reportsFiled: [] });
    expect(body.media.count).toBe(2);
    expect(body.media.items.map((m: { id: string }) => m.id).sort()).toEqual([...annaMedia].sort());
    expect(body.calendarFeed).toEqual({ active: false, since: null });
  });

  it("Export enthaelt keine fremden Daten und keine Geheimnisse", async () => {
    const text = (await req(anna, "GET", "/privacy/export")).payload;
    for (const forbidden of [
      ben.email, clara.email, "BEN-BEITRAG-GEHEIM", "CLARA-NOTIZ", "mozilla", benMediaId,
      "ANNA-ENDPOINT-TOKEN", "ANNA-P256DH", "ANNA-AUTH", "TOTP-GEHEIMNIS", "argon2",
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    // Bens Like auf Annas Beitrag ist nicht Annas Like; Claras Meldung nicht Annas Meldung
    const body = JSON.parse(text);
    expect(body.likes).toHaveLength(1);
    expect(body.reports).toHaveLength(1);
    expect(body.following.some((f: { userId: string }) => f.userId === clara.id)).toBe(false);
  });

  it("Benachrichtigungen im Export: ohne Namen/Textauszug anderer, mit Akteur-ID und Handle", async () => {
    const res = await req(ben, "GET", "/privacy/export");
    const text = res.payload;
    expect(text).not.toContain("Anna Muster");
    expect(text).not.toContain("Annas Kommentar");
    const notes = res.json().notifications as { type: string; data: Record<string, string>; actorId: string | null }[];
    const comment = notes.find((n) => n.type === "comment")!;
    expect(comment).toMatchObject({ actorId: anna.id, data: { postId: benPostId } });
    expect(Object.keys(comment.data)).toEqual(["postId"]);
    expect(notes.find((n) => n.type === "new_follower")).toMatchObject({ actorId: anna.id, data: { handle: anna.handle } });
  });

  it("Datenauskunft: Rate-Limit 5 je Stunde", async () => {
    for (let i = 0; i < 5; i++) expect((await req(clara, "GET", "/privacy/export")).statusCode).toBe(200);
    expect((await req(clara, "GET", "/privacy/export")).statusCode).toBe(429);
  });

  it("media.zip: nur eigene Bilder, ZIP-Format, ohne Login 401, Rate-Limit", async () => {
    expect((await app.inject({ method: "GET", url: "/privacy/export/media.zip" })).statusCode).toBe(401);
    const res = await req(anna, "GET", "/privacy/export/media.zip");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toMatch(/meine-bilder\.zip/);
    const zip = res.rawPayload;
    expect(zip.subarray(0, 2).toString("latin1")).toBe("PK");
    const names = zip.toString("latin1");
    expect(names).toContain(`profilbild/`);
    for (const id of annaMedia) expect(names).toContain(`${id}.webp`);
    expect(names).not.toContain(benMediaId);
    expect(names).not.toContain("anna");
    expect(names).toContain("LIESMICH.txt");
    // WebP-Daten unverschluesselt und unkomprimiert enthalten
    expect(names.split("RIFF").length - 1).toBe(2);

    for (let i = 0; i < 4; i++) expect((await req(anna, "GET", "/privacy/export/media.zip")).statusCode).toBe(200);
    expect((await req(anna, "GET", "/privacy/export/media.zip")).statusCode).toBe(429);
  });

  it("Beitrag loeschen leert den Text, ausser bei offener Meldung", async () => {
    const plainImg = (await upload(ben, "/media/post", await png())).json().id;
    const plain = (await req(ben, "POST", "/posts", { body: "Wird geleert", mediaIds: [plainImg] })).json().id;
    expect((await req(ben, "DELETE", `/posts/${plain}`)).statusCode).toBe(204);
    expect(await db.select().from(schema.media).where(eq(schema.media.id, plainImg))).toHaveLength(0); // Bild sofort weg
    const [p] = await db.select().from(schema.posts).where(eq(schema.posts.id, plain));
    expect(p.deletedAt).not.toBeNull();
    expect(p.body).toBe("");

    // Annas Beitrag hat eine offene Meldung von Clara: Text bleibt als Beweis
    const evidenceImg = (await upload(anna, "/media/post", await png())).json().id;
    const extra = (await req(anna, "POST", "/posts", { body: "Gemeldet und geloescht", mediaIds: [evidenceImg] })).json().id;
    await req(clara, "POST", `/posts/${extra}/report`, { reason: "hate" });
    await req(anna, "DELETE", `/posts/${extra}`);
    const [q] = await db.select().from(schema.posts).where(eq(schema.posts.id, extra));
    expect(q.deletedAt).not.toBeNull();
    expect(q.body).toBe("Gemeldet und geloescht");
    // Bild bleibt als Beweis gespeichert, ist aber nicht mehr abrufbar (Beitrag geloescht)
    expect(await db.select().from(schema.media).where(eq(schema.media.id, evidenceImg))).toHaveLength(1);
    expect((await req(ben, "GET", `/media/${evidenceImg}/medium`)).statusCode).toBe(404);
    annaMedia.push(evidenceImg); // gehoert weiter Anna (Kontoloeschung entfernt es)
  });

  it("Kontoloeschung: fremde Verweise geleert, Benachrichtigungen mit Akteur weg", async () => {
    // Verweise ohne Fremdschluessel vorbereiten (Ben verwaltet einen eigenen Verein)
    await req(ben, "POST", "/orgs", { name: "SV Ben", category: "Sport", city: "Benstadt" });
    const [benOrg] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, "sv-ben"));
    const [invite] = await db
      .insert(schema.orgInvites)
      .values({ orgId: benOrg.id, tokenHash: "hash-p5", tokenEnc: "x", maxUses: 5, expiresAt: new Date(Date.now() + 86400_000), createdBy: anna.id })
      .returning();
    const [resolved] = await db
      .insert(schema.reports)
      .values({ postId: benPostId, reporterId: clara.id, reason: "spam", status: "dismissed", resolvedBy: anna.id, resolvedAt: new Date() })
      .returning();
    await db.insert(schema.feedFeedback).values({ userId: ben.id, targetKind: "user", targetId: anna.id });
    await db.insert(schema.auditLog).values({ userId: ben.id, action: "member.profile.updated", meta: { orgId: benOrg.id, memberId: anna.id } });

    const benBefore = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, ben.id));
    expect(benBefore.find((n) => n.type === "comment")?.actorId).toBe(anna.id);
    const commentNote = (await req(ben, "GET", "/notifications")).json().items.find((n: { type: string }) => n.type === "comment");
    expect(commentNote.data.commenter).toBe("Anna Muster");

    expect((await req(anna, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);

    const benAfter = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, ben.id));
    expect(benAfter.some((n) => n.actorId === anna.id)).toBe(false);
    expect(JSON.stringify(benAfter)).not.toContain("anna");
    expect(benAfter.length).toBeLessThan(benBefore.length);
    const claraAfter = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, clara.id));
    expect(claraAfter.some((n) => n.actorId === anna.id)).toBe(false); // Folgen-Benachrichtigungen ebenso

    const [inv] = await db.select().from(schema.orgInvites).where(eq(schema.orgInvites.id, invite.id));
    expect(inv.createdBy).toBeNull();
    const [rep] = await db.select().from(schema.reports).where(eq(schema.reports.id, resolved.id));
    expect(rep.resolvedBy).toBeNull();
    expect(await db.select().from(schema.feedFeedback).where(eq(schema.feedFeedback.targetId, anna.id))).toHaveLength(0);
    const audit = await db.select().from(schema.auditLog);
    expect(JSON.stringify(audit)).not.toContain(anna.id);

    // Eigene Daten weg (Kaskaden)
    for (const t of [schema.profiles, schema.pushSubscriptions, schema.userTotp, schema.teamMembers, schema.eventShiftSignups, schema.eventAttendance]) {
      expect((await db.select().from(t)).some((r) => (r as { userId?: string }).userId === anna.id)).toBe(false);
    }
    expect(await db.select().from(schema.userFollows).where(eq(schema.userFollows.followerId, anna.id))).toHaveLength(0);
    expect(await db.select().from(schema.userFollows).where(eq(schema.userFollows.followedId, anna.id))).toHaveLength(0);
    expect(await db.select().from(schema.postLikes).where(eq(schema.postLikes.userId, anna.id))).toHaveLength(0);
    expect(await db.select().from(schema.media).where(eq(schema.media.ownerId, anna.id))).toHaveLength(0);
    // Bens Daten bleiben
    expect(await db.select().from(schema.media).where(eq(schema.media.id, benMediaId))).toHaveLength(1);
    expect(await db.select().from(schema.posts).where(eq(schema.posts.id, benPostId))).toHaveLength(1);
  });
});
