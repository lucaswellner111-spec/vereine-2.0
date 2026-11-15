import "reflect-metadata";
import { createHash } from "node:crypto";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { hash } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FeeClassItem, FeeRunItem, FeeRunPreview, InvoiceDetail, InvoiceSummary, MemberRegistryPage, NotificationsResponse, PublicUser, YouthChild, YouthChildDetail } from "@vereine/shared";
import { YOUTH_CONSENT_VERSION } from "@vereine/shared";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { ARGON_OPTIONS, AuthService } from "../auth/auth.service";
import { YouthDirectory } from "../auth/youth-directory.service";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { MailService } from "../mail/mail.service";
import { OrgAdminService } from "../orgs/org-admin.service";
import { OrgsService } from "../orgs/orgs.service";
import { PrivacyService } from "../privacy/privacy.service";
import { ProfileAccess } from "../profiles/profile-access.service";
import { confirmEmailForTest } from "../testing/auth";
import { createTestDb } from "../testing/test-db";
import { GuardianService, NO_LOGIN_HASH } from "./guardian.service";

const password = "ein-sehr-langes-passwort";
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const dayOffset = (d: number) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);
/** Geburtsdatum, an dem ein Kind heute n Jahre alt ist (plus offset Tage in der Zukunft). */
const bornYearsAgo = (years: number, plusDays = 0) => {
  const d = new Date(Date.now() + plusDays * 86400_000);
  return `${d.getUTCFullYear() - years}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

describe("Jugendkonten: Eltern verwalten Kinder (Etappe E1)", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    db = await createTestDb();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app.close();
  });

  type U = { cookie: string; id: string; email: string };
  async function signup(name: string, displayName = name): Promise<U> {
    const email = `${name}@example.de`;
    await app.inject({ method: "POST", url: "/auth/register", payload: { email, password, displayName, confirmAge16: true, acceptTerms: true, acceptPrivacy: true } });
    await confirmEmailForTest(app, email);
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: login.json().id, email };
  }
  const req = (u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: u ? { cookie: u.cookie } : {} });
  const newChild = async (u: U, firstName: string, lastName: string, birthDate = bornYearsAgo(11)) => {
    const res = await req(u, "POST", "/guardian/children", { firstName, lastName, birthDate, confirmGuardian: true });
    expect(res.statusCode).toBe(201);
    return res.json() as YouthChild;
  };
  const publicOf = (id: string): PublicUser => ({ id, email: "x@konto.invalid", displayName: "Kind", createdAt: new Date().toISOString(), accountType: "youth" });

  const org = "sv-jugend";
  let vera: U, pia: U, pam: U, fremd: U;
  let lena: YouthChild, max: YouthChild;
  let inviteToken: string;

  beforeAll(async () => {
    [vera, pia, pam, fremd] = [await signup("jg-vera", "Vera Vorstand"), await signup("jg-pia", "Pia Elternteil"), await signup("jg-pam", "Pam Elternteil"), await signup("jg-fremd", "Frieda Fremd")];
    await req(vera, "POST", "/orgs", { name: "SV Jugend", category: "Sport", city: "Kinderstadt" });
    await req(vera, "PUT", `/orgs/${org}/billing-profile`, { address: "Vereinsweg 1", iban: "DE89 3704 0044 0532 0130 00", taxInfo: "" });
    inviteToken = (await req(vera, "POST", `/orgs/${org}/invites`, { maxUses: 20, expiresInDays: 7 })).json().token;
  });

  it("Eltern legen ein Kind an: Name, Geburtsdatum, Selbstauskunft; Jugendkonto ohne Zugangsdaten", async () => {
    lena = await newChild(pia, "Lena", "Kowalski");
    expect(lena).toMatchObject({ name: "Lena K.", fullName: "Lena Kowalski", age: 11, paused: false, isBillingContact: true, orgs: [] });
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, lena.id));
    expect(u).toMatchObject({ accountType: "youth", displayName: "Lena K.", passwordHash: NO_LOGIN_HASH, emailVerifiedAt: null });
    expect(u.email).toBe(`youth+${lena.id}@konto.invalid`);
    const [p] = await db.select().from(schema.youthProfiles).where(eq(schema.youthProfiles.userId, lena.id));
    expect(p.birthDate).toBe(bornYearsAgo(11));
    // Nachweis der Selbstauskunft (append-only), ohne IP/User-Agent
    const consents = await db.select().from(schema.guardianConsents).where(eq(schema.guardianConsents.youthUserId, lena.id));
    expect(consents).toEqual([expect.objectContaining({ purpose: "account", granted: true, guardianUserId: pia.id, textVersion: YOUTH_CONSENT_VERSION })]);
    expect(Object.keys(consents[0])).not.toContain("ip");
    expect((await req(pia, "GET", "/guardian/children")).json()).toEqual([expect.objectContaining({ id: lena.id })]);
    // Audit ohne Klartext-Personendaten
    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "youth.created"));
    expect(JSON.stringify(audit.map((a) => a.meta))).not.toMatch(/Lena|Kowalski|20\d\d-\d\d-\d\d/);
  });

  it("prueft Selbstauskunft, Alter (6 bis 15) und Rechte der Anlage", async () => {
    const ok = { firstName: "Tim", lastName: "Test", birthDate: bornYearsAgo(10), confirmGuardian: true };
    expect((await req(pia, "POST", "/guardian/children", { ...ok, confirmGuardian: false })).statusCode).toBe(400);
    expect((await req(pia, "POST", "/guardian/children", { ...ok, firstName: "" })).statusCode).toBe(400);
    expect((await req(pia, "POST", "/guardian/children", { ...ok, birthDate: bornYearsAgo(16) })).statusCode).toBe(400); // heute 16: eigenes Konto
    expect((await req(pia, "POST", "/guardian/children", { ...ok, birthDate: bornYearsAgo(5) })).statusCode).toBe(400); // unter 6
    expect((await req(pia, "POST", "/guardian/children", { ...ok, birthDate: dayOffset(3) })).statusCode).toBe(400); // Zukunft
    expect((await req(pia, "POST", "/guardian/children", { ...ok, birthDate: "kaputt" })).statusCode).toBe(400);
    expect((await req(null, "POST", "/guardian/children", ok)).statusCode).toBe(401);
    expect((await req(null, "GET", "/guardian/children")).statusCode).toBe(401);
  });

  it("Limits: hoechstens 10 Kinder je Elternteil", async () => {
    const vielkind = await signup("jg-viele", "Viele Kinder");
    for (let i = 0; i < 5; i++) await newChild(vielkind, `K${i}`, "Viele");
    // Tageslimit 5 Anlagen (Zaehler im Cache); danach 429
    expect((await req(vielkind, "POST", "/guardian/children", { firstName: "Zu", lastName: "Viel", birthDate: bornYearsAgo(8), confirmGuardian: true })).statusCode).toBe(429);
  });

  it("Kein Login, kein Passwort-Reset, keine Sitzung fuer Jugendkonten", async () => {
    const email = `youth+${lena.id}@konto.invalid`;
    expect((await req(null, "POST", "/auth/login", { email, password })).statusCode).toBe(401);
    // selbst mit einem gueltigen argon2-Hash (z. B. durch Fehlbedienung gesetzt) bleibt der Login verwehrt
    await db.update(schema.users).set({ passwordHash: await hash(password, ARGON_OPTIONS) }).where(eq(schema.users.id, lena.id));
    expect((await req(null, "POST", "/auth/login", { email, password })).statusCode).toBe(401);
    const auth = app.get(AuthService);
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, lena.id));
    await expect(auth.startSession(row)).rejects.toThrow();
    expect(await auth.verifyPassword(lena.id, password)).toBe(false);
    await db.update(schema.users).set({ passwordHash: NO_LOGIN_HASH }).where(eq(schema.users.id, lena.id));

    // Passwort vergessen: gleiche Antwort, aber kein Link
    expect((await req(null, "POST", "/auth/password/forgot", { email })).statusCode).toBe(202);
    expect(await db.select().from(schema.authTokens).where(eq(schema.authTokens.userId, lena.id))).toHaveLength(0);
    // selbst ein von Hand eingetragener Reset-Link funktioniert nicht
    const token = "a".repeat(43);
    await db.insert(schema.authTokens).values({ tokenHash: sha256(token), userId: lena.id, purpose: "reset", expiresAt: new Date(Date.now() + 3600_000) });
    expect((await req(null, "POST", "/auth/password/reset", { token, newPassword: "ein-neues-langes-passwort" })).statusCode).toBe(400);
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, lena.id));
    expect(after.passwordHash).toBe(NO_LOGIN_HASH);

    // Sitzung: selbst eine eingetragene Sitzung wird nicht anerkannt
    const sid = "b".repeat(43);
    await db.insert(schema.sessions).values({ tokenHash: sha256(sid), userId: lena.id, expiresAt: new Date(Date.now() + 3600_000) });
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: `sid=${sid}` } })).statusCode).toBe(401);
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, lena.id));
  });

  it("An Platzhalteradressen (*.invalid) wird nie eine Mail verschickt", async () => {
    const mail = app.get(MailService);
    expect(await mail.send(`youth+${lena.id}@konto.invalid`, "password-reset", { name: "x", link: "https://example.de/x", validMinutes: 60 })).toBe("suppressed");
  });

  it("Fremde sehen und aendern keine Kinder (404, auch bei Export und Loeschung)", async () => {
    expect((await req(fremd, "GET", `/guardian/children/${lena.id}`)).statusCode).toBe(404);
    expect((await req(fremd, "POST", `/guardian/children/${lena.id}/orgs`, { token: inviteToken })).statusCode).toBe(404);
    expect((await req(fremd, "GET", `/guardian/children/${lena.id}/export`)).statusCode).toBe(404);
    expect((await req(fremd, "DELETE", `/guardian/children/${lena.id}`, { password })).statusCode).toBe(404);
    expect((await req(fremd, "GET", "/guardian/children")).json()).toEqual([]);
    expect((await req(fremd, "GET", `/guardian/children/${lena.id}`)).body).not.toMatch(/Lena|Kowalski/);
  });

  it("Mitgliedschaft per Einladungslink (Vereinsbestaetigung) und per Antrag; Kind nie selbst", async () => {
    const joined = await req(pia, "POST", `/guardian/children/${lena.id}/orgs`, { token: inviteToken });
    expect(joined.statusCode).toBe(200);
    expect(joined.json()).toMatchObject({ orgSlug: org, status: "active" });
    // zweiter Aufruf: kein Fehler, kein doppelter Nachweis
    expect((await req(pia, "POST", `/guardian/children/${lena.id}/orgs`, { token: inviteToken })).statusCode).toBe(200);
    const consents = await db.select().from(schema.guardianConsents).where(and(eq(schema.guardianConsents.youthUserId, lena.id), eq(schema.guardianConsents.purpose, "org_membership")));
    expect(consents).toHaveLength(1);
    expect(consents[0]).toMatchObject({ granted: true, guardianUserId: pia.id });
    // Vorstand sieht den vollen Namen in den Mitgliedern
    const members = (await req(vera, "GET", `/orgs/${org}/members`)).json() as { userId: string; name: string }[];
    expect(members.find((m) => m.userId === lena.id)?.name).toBe("Lena Kowalski");

    // Antrag ueber die Vereinsadresse: der Vorstand bestaetigt
    max = await newChild(pia, "Max", "Mustermann", bornYearsAgo(9));
    const asked = await req(pia, "POST", `/guardian/children/${max.id}/orgs`, { slug: org });
    expect(asked.json()).toMatchObject({ status: "pending" });
    expect((await req(pia, "POST", `/guardian/children/${max.id}/orgs`, { slug: org })).statusCode).toBe(409);
    expect((await req(pia, "POST", `/guardian/children/${max.id}/orgs`, {})).statusCode).toBe(400);
    expect((await req(pia, "POST", `/guardian/children/${max.id}/orgs`, { slug: org, token: inviteToken })).statusCode).toBe(400);
    expect((await req(vera, "POST", `/orgs/${org}/members/${max.id}/decision`, { decision: "approve" })).statusCode).toBeLessThan(300);
    const notes = (await req(pia, "GET", "/notifications")).json() as NotificationsResponse;
    expect(notes.items.find((n) => n.type === "membership_decision")?.data).toMatchObject({ orgSlug: org, decision: "approve", child: "1" });

    // Kind selbst: weder annehmen noch beantragen (Verteidigung in den Diensten)
    await expect(app.get(OrgAdminService).accept(publicOf(lena.id), inviteToken)).rejects.toThrow(/Elternteil/);
    await expect(app.get(OrgsService).requestMembership("sv-jugend", fremd.id.replace(/^./, "0") && max.id)).rejects.toThrow(/Elternteil/);
    // Jugendkonten haben nur die Rolle Mitglied
    expect((await req(vera, "PUT", `/orgs/${org}/members/${lena.id}/role`, { role: "moderator" })).statusCode).toBe(400);
  });

  let eventId: string;
  let shiftId: string;
  it("Zu-/Absagen und Helferlisten durch die Eltern fuer das Kind; der andere Elternteil erfaehrt davon", async () => {
    const created = await req(vera, "POST", `/orgs/${org}/events`, { title: "Kindertraining", startsAt: inHours(48), capacity: 10 });
    eventId = created.json().id;
    shiftId = (await req(vera, "POST", `/events/${eventId}/shifts`, { title: "Kuchen", slots: 2 })).json()[0].id;
    // zweiter Elternteil (E2: Einladung; hier direkt eingetragen)
    await db.insert(schema.guardianships).values({ guardianUserId: pam.id, youthUserId: lena.id });

    expect((await req(pia, "PUT", `/guardian/children/${lena.id}/events/${eventId}/rsvp`, { status: "yes" })).json()).toEqual({ status: "yes" });
    expect((await req(pia, "PUT", `/guardian/children/${lena.id}/events/${eventId}/rsvp`, { status: "vielleicht" })).statusCode).toBe(400);
    expect((await req(fremd, "PUT", `/guardian/children/${lena.id}/events/${eventId}/rsvp`, { status: "yes" })).statusCode).toBe(404);
    const notes = (await req(pam, "GET", "/notifications")).json() as NotificationsResponse;
    const n = notes.items.find((i) => i.type === "child_rsvp");
    expect(n?.data).toMatchObject({ eventId, status: "yes", title: "Kindertraining" });
    expect(JSON.stringify(n)).not.toMatch(/Lena|Kowalski/); // kein Kindesname in der Benachrichtigung

    expect((await req(pam, "PUT", `/guardian/children/${lena.id}/shifts/${shiftId}`)).statusCode).toBe(204);
    const detail = (await req(pia, "GET", `/guardian/children/${lena.id}`)).json() as YouthChildDetail;
    const ev = detail.events.find((e) => e.id === eventId)!;
    expect(ev.myStatus).toBe("yes");
    expect(ev.shifts).toEqual([expect.objectContaining({ id: shiftId, taken: 1, mine: true })]);
    expect(detail.consents.map((c) => `${c.purpose}:${c.granted}`).sort()).toEqual(["account:true", "org_membership:true"]);
    expect(detail.orgs).toEqual([expect.objectContaining({ slug: org, status: "active" })]);
    expect((await req(pia, "DELETE", `/guardian/children/${lena.id}/shifts/${shiftId}`)).statusCode).toBe(204);
    expect((await req(pia, "PUT", `/guardian/children/${lena.id}/events/${eventId}/rsvp`, { status: "no" })).json()).toEqual({ status: "no" });
    // Max (Antrag bestaetigt, aber nicht angemeldet fuer das Kind eines Fremden)
    expect((await req(pia, "PUT", `/guardian/children/${max.id}/events/${eventId}/rsvp`, { status: "yes" })).statusCode).toBe(200);
  });

  it("Anwesenheit und Mitgliederliste zeigen das Kind als Mitglied mit Jugend-Kennzeichnung (nur Vorstand/Moderation)", async () => {
    const att = (await req(vera, "GET", `/events/${eventId}/attendance`)).json() as { entries: { userId: string; name: string; youth?: boolean; handle: string | null }[] };
    const entry = att.entries.find((e) => e.userId === max.id)!;
    expect(entry).toMatchObject({ name: "Max Mustermann", youth: true, handle: null });
    expect(att.entries.find((e) => e.userId === vera.id)?.youth).toBe(false);
    const registry = (await req(vera, "GET", `/orgs/${org}/member-registry`)).json() as MemberRegistryPage;
    expect(registry.items.find((m) => m.userId === lena.id)).toMatchObject({ name: "Lena Kowalski", youth: true, minor: true, guardianName: "Pia Elternteil" });
    expect(registry.items.find((m) => m.userId === vera.id)).toMatchObject({ youth: false, guardianName: null });
    // normale Mitglieder sehen weder Liste noch Anwesenheit
    expect((await req(pia, "GET", `/orgs/${org}/member-registry`)).statusCode).toBe(403);
  });

  it("Kinder sind nicht auffindbar, nicht anschreibbar, ohne Profilseite", async () => {
    expect(await app.get(OrgsService).canContact(vera.id, lena.id)).toBe(false);
    expect(await app.get(OrgsService).canContact(lena.id, vera.id)).toBe(false);
    expect((await app.get(OrgsService).contactCandidates(vera.id)).map((c) => c.userId)).not.toContain(lena.id);
    const handle = (await app.get(ProfileAccess).handles([lena.id])).get(lena.id)!;
    expect(handle).toBeTruthy();
    expect((await req(vera, "GET", `/profiles/${handle}`)).statusCode).toBe(404);
    expect((await req(vera, "PUT", `/profiles/${handle}/follow`)).statusCode).toBe(404);
    expect(JSON.stringify((await req(vera, "GET", "/profiles/search?q=Lena")).json())).not.toContain(lena.id);
    expect(await app.get(ProfileAccess).canView(vera.id, lena.id)).toBe(false);
  });

  it("Beitragslauf: Rechnung an den Elternteil (Geschwister = zwei Rechnungen), Kind ohne Empfaenger wird uebersprungen und genannt", async () => {
    await req(vera, "POST", `/orgs/${org}/fee-classes`, { name: "Jugend", amountCents: 6000, interval: "yearly" });
    const classes = (await req(vera, "GET", `/orgs/${org}/fee-classes`)).json() as FeeClassItem[];
    const jugend = classes.find((c) => c.name === "Jugend")!;
    const waise = await newChild(pam, "Olli", "Waise", bornYearsAgo(12));
    await req(pam, "POST", `/guardian/children/${waise.id}/orgs`, { token: inviteToken });
    for (const id of [lena.id, max.id, waise.id]) {
      const rec = (await req(vera, "GET", `/orgs/${org}/member-registry/${id}`)).json();
      expect((await req(vera, "PUT", `/orgs/${org}/member-registry/${id}`, { ...rec, feeClassId: jugend.id })).statusCode).toBe(200);
    }
    await db.delete(schema.guardianships).where(eq(schema.guardianships.youthUserId, waise.id)); // Olli hat keinen Elternteil mehr
    const body = { periodLabel: "2027", dueDate: dayOffset(30), feeClassIds: [jugend.id] };
    const preview = (await req(vera, "POST", `/orgs/${org}/fee-runs/preview`, body)).json() as FeeRunPreview;
    expect(preview).toMatchObject({ count: 2, withoutRecipient: 1 });
    expect(JSON.stringify(preview)).not.toMatch(/Lena|Olli|Pia/);
    const run = (await req(vera, "POST", `/orgs/${org}/fee-runs`, body)).json() as FeeRunItem;
    expect(run).toMatchObject({ status: "done", createdCount: 2, skippedNoRecipient: 1, skippedCount: 1 });

    const drafts = (await req(vera, "GET", `/orgs/${org}/invoices?status=draft`)).json() as InvoiceSummary[];
    expect(drafts).toHaveLength(2);
    expect(drafts.every((d) => d.recipientUserId === pia.id && d.recipientName === "Pia Elternteil")).toBe(true);
    expect(drafts.map((d) => d.subjectName).sort()).toEqual(["Lena Kowalski", "Max Mustermann"]);
    const lenaInv = drafts.find((d) => d.subjectName === "Lena Kowalski")!;
    const detail = (await req(vera, "GET", `/invoices/${lenaInv.id}`)).json() as InvoiceDetail;
    expect(detail.items[0].description).toBe("Jugend 2027 für Lena Kowalski");
    expect(drafts.some((d) => d.recipientUserId === waise.id)).toBe(false); // nie an das Kind adressiert

    // Finalisiert sieht der Elternteil die Rechnungen, das Kind hat keinen Zugang
    expect((await req(vera, "POST", `/invoices/${lenaInv.id}/finalize`)).statusCode).toBeLessThan(300);
    const mine = (await req(pia, "GET", "/billing/mine")).json() as InvoiceSummary[];
    expect(mine).toEqual([expect.objectContaining({ id: lenaInv.id, subjectName: "Lena Kowalski" })]);
    expect((await req(pam, "GET", "/billing/mine")).json()).toEqual([]);

    // Einzelrechnung an ein Kind geht ebenfalls an den Elternteil; ohne Empfaenger Fehler
    const item = { description: "Turnier", quantity: 1, unitCents: 500, vatRate: 0 };
    const manual = await req(vera, "POST", `/orgs/${org}/invoices`, { recipientUserId: lena.id, dueDate: dayOffset(14), items: [item] });
    expect(manual.statusCode).toBe(201);
    expect(manual.json()).toMatchObject({ recipientName: "Pia Elternteil", subjectName: "Lena Kowalski" });
    const noContact = await req(vera, "POST", `/orgs/${org}/invoices`, { recipientUserId: waise.id, dueDate: dayOffset(14), items: [item] });
    expect(noContact.statusCode).toBe(400);
    expect(noContact.json().message).toMatch(/Rechnungsempfänger/);
  });

  it("Auskunft und Loeschung durch die Eltern; Nachweise bleiben pseudonym, Rechnungskopie bleibt", async () => {
    const res = await req(pia, "GET", `/guardian/children/${lena.id}/export`);
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.youth.account).toMatchObject({ fullName: "Lena Kowalski", birthDate: bornYearsAgo(11) });
    expect(data.youth.consents.map((c: { purpose: string }) => c.purpose)).toEqual(expect.arrayContaining(["account", "org_membership"]));
    expect(data.events.responses.length).toBeGreaterThan(0);
    expect(data.invoicesForChild).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/konto\.invalid|passwordHash/);
    // Elternteil: eigene Auskunft nennt Kinder und erteilte Freigaben
    const own = (await req(pia, "GET", "/privacy/export")).json();
    expect(own.guardianship.children.map((c: { childId: string }) => c.childId)).toEqual(expect.arrayContaining([lena.id, max.id]));
    expect(own.guardianship.consentsGiven.length).toBeGreaterThanOrEqual(3);

    expect((await req(pia, "DELETE", `/guardian/children/${lena.id}`, { password: "falsch-falsch-falsch" })).statusCode).toBe(403);
    // Zwei Elternteile (E2): zweiter Elternteil darf ebenfalls, aber mit 7 Tagen Vorankuendigung; nach Fristende loescht der Job
    const scheduled = await req(pam, "DELETE", `/guardian/children/${lena.id}`, { password });
    expect(scheduled.statusCode).toBe(200);
    expect(scheduled.json()).toMatchObject({ status: "scheduled" });
    expect(await app.get(PrivacyService).eraseOrphanedYouth()).toBe(0);
    await db.update(schema.youthProfiles).set({ deletionRequestedAt: new Date(Date.now() - 8 * 86400_000) }).where(eq(schema.youthProfiles.userId, lena.id));
    expect(await app.get(PrivacyService).eraseOrphanedYouth()).toBe(1);
    expect(await db.select().from(schema.users).where(eq(schema.users.id, lena.id))).toHaveLength(0);
    expect(await db.select().from(schema.youthProfiles).where(eq(schema.youthProfiles.userId, lena.id))).toHaveLength(0);
    expect(await db.select().from(schema.guardianships).where(eq(schema.guardianships.youthUserId, lena.id))).toHaveLength(0);
    const kept = await db.select().from(schema.guardianConsents).where(eq(schema.guardianConsents.youthUserId, lena.id));
    expect(kept.length).toBeGreaterThanOrEqual(2);
    expect(kept.every((c) => c.retainUntil && c.retainUntil.getTime() > Date.now() + 2 * 365 * 86400_000)).toBe(true);
    // Rechnungskopie bleibt (Aufbewahrung), Verweis auf das Kind entfaellt
    const inv = await db.select().from(schema.invoices).where(eq(schema.invoices.subjectName, "Lena Kowalski"));
    expect(inv.length).toBeGreaterThan(0);
    expect(inv.every((i) => i.subjectUserId === null)).toBe(true);
    expect((await req(pia, "GET", "/guardian/children")).json().map((c: YouthChild) => c.id)).not.toContain(lena.id);
  });

  it("Nachweis der Freigaben ist append-only (Trigger); Loeschen nur durch den Aufbewahrungsjob nach Fristende", async () => {
    const [row] = await db.select().from(schema.guardianConsents).where(eq(schema.guardianConsents.youthUserId, max.id));
    await expect(db.update(schema.guardianConsents).set({ granted: false }).where(eq(schema.guardianConsents.id, row.id))).rejects.toThrow();
    await expect(db.update(schema.guardianConsents).set({ purpose: "x" }).where(eq(schema.guardianConsents.id, row.id))).rejects.toThrow();
    await expect(db.delete(schema.guardianConsents).where(eq(schema.guardianConsents.id, row.id))).rejects.toThrow();
    // Ohne Freigabe des Jobs auch abgelaufene Zeilen nicht loeschbar
    const [old] = await db
      .insert(schema.guardianConsents)
      .values({ youthUserId: "00000000-0000-4000-8000-0000000000aa", guardianUserId: null, purpose: "account", granted: true, textVersion: "x", textHash: "y", retainUntil: new Date(Date.now() - 1000) })
      .returning();
    await expect(db.delete(schema.guardianConsents).where(eq(schema.guardianConsents.id, old.id))).rejects.toThrow();
    // einzige erlaubte Aenderung: Person entkoppeln
    await db.update(schema.guardianConsents).set({ guardianUserId: null }).where(eq(schema.guardianConsents.id, row.id));
    expect(await app.get(GuardianService).purgeExpired()).toBe(1);
    expect(await db.select().from(schema.guardianConsents).where(eq(schema.guardianConsents.id, old.id))).toHaveLength(0);
    expect(await db.select().from(schema.guardianConsents).where(eq(schema.guardianConsents.id, row.id))).toHaveLength(1);
  });

  it("Austritt (Eltern oder Vorstand): Freigabe wird als widerrufen nachgewiesen", async () => {
    expect((await req(pia, "DELETE", `/guardian/children/${max.id}/orgs/${org}`)).statusCode).toBe(204);
    const rows = await db.select().from(schema.guardianConsents).where(and(eq(schema.guardianConsents.youthUserId, max.id), eq(schema.guardianConsents.purpose, "org_membership")));
    expect(rows.map((r) => r.granted).sort()).toEqual([false, true]);
    expect((await req(pia, "GET", `/guardian/children/${max.id}`)).json().orgs).toEqual([]);
    // Vorstand entfernt: Nachweis ohne Elternteil (null), idempotent
    await req(pia, "POST", `/guardian/children/${max.id}/orgs`, { token: inviteToken });
    expect((await req(vera, "DELETE", `/orgs/${org}/members/${max.id}`)).statusCode).toBe(204);
    const after = await db.select().from(schema.guardianConsents).where(and(eq(schema.guardianConsents.youthUserId, max.id), eq(schema.guardianConsents.purpose, "org_membership")));
    expect(after.filter((r) => !r.granted)).toHaveLength(2);
  });

  it("Elternteil loescht sein Konto: Rechnungsempfaenger geht an den anderen Elternteil; letzter Elternteil = Kind ruht, nach 30 Tagen geloescht", async () => {
    const mama = await signup("jg-mama", "Mama Eltern");
    const papa = await signup("jg-papa", "Papa Eltern");
    const solo = await signup("jg-solo", "Solo Eltern");
    const tim = await newChild(mama, "Tim", "Zwei");
    await db.insert(schema.guardianships).values({ guardianUserId: papa.id, youthUserId: tim.id });
    const kira = await newChild(solo, "Kira", "Allein");
    const dir = app.get(YouthDirectory);
    expect((await dir.billingContacts([tim.id])).get(tim.id)).toBe(mama.id);

    expect((await req(mama, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);
    expect((await dir.billingContacts([tim.id])).get(tim.id)).toBe(papa.id);
    expect((await db.select().from(schema.youthProfiles).where(eq(schema.youthProfiles.userId, tim.id)))[0].orphanedAt).toBeNull();
    const timConsents = await db.select().from(schema.guardianConsents).where(eq(schema.guardianConsents.youthUserId, tim.id));
    expect(timConsents.every((c) => c.guardianUserId === null)).toBe(true); // Nachweis bleibt, Person entkoppelt

    expect((await req(solo, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);
    const [p] = await db.select().from(schema.youthProfiles).where(eq(schema.youthProfiles.userId, kira.id));
    expect(p.orphanedAt).not.toBeNull();
    const privacy = app.get(PrivacyService);
    expect(await privacy.eraseOrphanedYouth()).toBe(0); // noch keine 30 Tage
    await db.update(schema.youthProfiles).set({ orphanedAt: new Date(Date.now() - 31 * 86400_000) }).where(eq(schema.youthProfiles.userId, kira.id));
    expect(await privacy.eraseOrphanedYouth()).toBe(1);
    expect(await db.select().from(schema.users).where(eq(schema.users.id, kira.id))).toHaveLength(0);
  });

  it("16. Geburtstag: Hinweis 30 und 7 Tage vorher (je einmal), am Tag selbst ruht das Jugendkonto", async () => {
    const mutter = await signup("jg-mutter", "Mutter Eltern");
    const in20 = await newChild(mutter, "Zwanzig", "Tage", bornYearsAgo(16, 20));
    const in5 = await newChild(mutter, "Fuenf", "Tage", bornYearsAgo(16, 5));
    const in1 = await newChild(mutter, "Morgen", "Sechzehn", bornYearsAgo(16, 1));
    const svc = app.get(GuardianService);
    expect(await svc.runGraduation()).toEqual({ notified: 3, paused: 0 });
    expect(await svc.runGraduation()).toEqual({ notified: 0, paused: 0 }); // idempotent
    const notes = ((await req(mutter, "GET", "/notifications")).json() as NotificationsResponse).items.filter((n) => n.type === "child_graduation");
    expect(notes.map((n) => n.data.days).sort()).toEqual(["1", "20", "5"]);
    // Der Stichtag: ab dem 16. Geburtstag ruht das Konto
    const later = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
    expect(await svc.runGraduation(later)).toMatchObject({ paused: 1 });
    const detail = (await req(mutter, "GET", "/guardian/children")).json() as YouthChild[];
    expect(detail.find((c) => c.id === in1.id)?.paused).toBe(true);
    expect(detail.find((c) => c.id === in20.id)?.paused).toBe(false);
    const blocked = await req(mutter, "POST", `/guardian/children/${in1.id}/orgs`, { token: inviteToken });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().message).toMatch(/16/);
    void in5;
  });

  it("Zentrale Zuordnung: YouthDirectory kennt Kinder, Elternteile und volle Namen", async () => {
    const dir = app.get(YouthDirectory);
    expect([...(await dir.youthIds([max.id, vera.id, pia.id]))]).toEqual([max.id]);
    expect(await dir.isGuardianOf(pia.id, max.id)).toBe(true);
    expect(await dir.isGuardianOf(fremd.id, max.id)).toBe(false);
    expect((await dir.fullNames([max.id, vera.id])).get(max.id)).toBe("Max Mustermann");
    expect((await dir.fullNames([max.id, vera.id])).get(vera.id)).toBe("Vera Vorstand");
  });
});
