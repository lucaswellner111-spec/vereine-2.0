import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GuardianInviteInfo, NotificationsResponse, YouthChild, YouthChildDetail, YouthGuardiansView } from "@vereine/shared";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { YouthDirectory } from "../auth/youth-directory.service";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { addressHash } from "../mail/mail-limits";
import { MemoryMailDriver } from "../mail/mail.drivers";
import { MAIL_DRIVER } from "../mail/mail.service";
import { PrivacyService } from "../privacy/privacy.service";
import { confirmEmailForTest } from "../testing/auth";
import { createTestDb } from "../testing/test-db";
import { objectingGuardian } from "./consent-rules";
import { GuardianService } from "./guardian.service";

const password = "ein-sehr-langes-passwort";
const bornYearsAgo = (years: number) => {
  const d = new Date();
  return `${d.getUTCFullYear() - years}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

describe("Freigaben bei mehreren Eltern (reine Regel)", () => {
  it("ein Widerspruch eines anderen aktiven Elternteils genuegt; eigener Widerruf blockiert nicht; Altlasten zaehlen nicht", () => {
    // neueste zuerst
    expect(objectingGuardian([{ guardianUserId: "b", granted: false }, { guardianUserId: "a", granted: true }], ["a", "b"], "a")).toBe("b");
    expect(objectingGuardian([{ guardianUserId: "b", granted: false }, { guardianUserId: "a", granted: true }], ["a", "b"], "b")).toBeNull();
    // b hat widerrufen, aber danach wieder erteilt
    expect(objectingGuardian([{ guardianUserId: "b", granted: true }, { guardianUserId: "b", granted: false }], ["a", "b"], "a")).toBeNull();
    // Widerruf des Vereins (ohne Person) und Widerruf einer ehemaligen Elternperson zaehlen nicht
    expect(objectingGuardian([{ guardianUserId: null, granted: false }, { guardianUserId: "x", granted: false }], ["a", "b"], "a")).toBeNull();
    expect(objectingGuardian([], ["a"], "a")).toBeNull();
  });
});

describe("Jugendkonten Etappe E2: zweiter Elternteil, Rechnungsempfaenger, Loeschung mit Vorankuendigung", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const mails = new MemoryMailDriver();

  beforeAll(async () => {
    db = await createTestDb();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).overrideProvider(MAIL_DRIVER).useValue(mails).compile();
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
  const req = (u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) => app.inject({ method, url, payload, headers: u ? { cookie: u.cookie } : {} });
  const newChild = async (u: U, firstName: string, lastName: string) => {
    const res = await req(u, "POST", "/guardian/children", { firstName, lastName, birthDate: bornYearsAgo(10), confirmGuardian: true });
    expect(res.statusCode).toBe(201);
    return res.json() as YouthChild;
  };
  const notes = async (u: U) => ((await req(u, "GET", "/notifications")).json() as NotificationsResponse).items;
  const tokenFrom = (text: string) => /\/eltern-einladung\/([A-Za-z0-9_-]+)/.exec(text)![1];

  const org = "sv-zwei-eltern";
  let vera: U, pia: U, pam: U, fremd: U;
  let lena: YouthChild;
  let orgToken: string;
  let inviteToken: string;

  beforeAll(async () => {
    [vera, pia, pam, fremd] = [await signup("e2-vera", "Vera Vorstand"), await signup("e2-pia", "Pia Elternteil"), await signup("e2-pam", "Pam Elternteil"), await signup("e2-fremd", "Frieda Fremd")];
    await req(vera, "POST", "/orgs", { name: "SV Zwei Eltern", category: "Sport", city: "Kinderstadt" });
    orgToken = (await req(vera, "POST", `/orgs/${org}/invites`, { maxUses: 20, expiresInDays: 7 })).json().token;
    lena = await newChild(pia, "Lena", "Kowalski");
  });

  it("Elternteil laedt den zweiten per Mail ein: Hash statt Adresse, Mail ohne Kindesnamen, Limit zwei Eltern, Audit ohne Klartext", async () => {
    mails.clear();
    expect((await req(pia, "POST", `/guardian/children/${lena.id}/guardians`, { email: pia.email })).statusCode).toBe(400); // eigene Adresse
    expect((await req(pia, "POST", `/guardian/children/${lena.id}/guardians`, { email: "kaputt" })).statusCode).toBe(400);
    expect((await req(fremd, "POST", `/guardian/children/${lena.id}/guardians`, { email: pam.email })).statusCode).toBe(404);
    expect((await req(null, "POST", `/guardian/children/${lena.id}/guardians`, { email: pam.email })).statusCode).toBe(401);

    expect((await req(pia, "POST", `/guardian/children/${lena.id}/guardians`, { email: pam.email })).statusCode).toBe(204);
    const mail = mails.last(pam.email, "guardian-invite")!;
    expect(mail.text).toContain("Pia Elternteil");
    expect(mail.text).not.toMatch(/Lena|Kowalski/);
    inviteToken = tokenFrom(mail.text);

    const rows = await db.select().from(schema.guardianInvites).where(eq(schema.guardianInvites.youthUserId, lena.id));
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("@example.de");
    expect(rows[0].tokenHash).not.toContain(inviteToken);
    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "youth.guardian.invited"));
    expect(JSON.stringify(audit)).not.toMatch(/@example\.de|Lena|Kowalski/);

    // eine offene Einladung belegt den zweiten Platz
    expect((await req(pia, "POST", `/guardian/children/${lena.id}/guardians`, { email: "dritter@example.de" })).statusCode).toBe(400);
    const view = (await req(pia, "GET", `/guardian/children/${lena.id}/guardians`)).json() as YouthGuardiansView;
    expect(view).toMatchObject({ canInvite: false });
    expect(view.guardians).toEqual([expect.objectContaining({ name: "Pia Elternteil", isMe: true, isBillingContact: true })]);
    expect(view.invites).toHaveLength(1);
  });

  it("Widerruf einer Einladung; Annahme nur mit eigenem Konto zur eingeladenen Adresse und Selbstauskunft", async () => {
    const [open] = await db.select().from(schema.guardianInvites).where(eq(schema.guardianInvites.youthUserId, lena.id));
    expect((await req(fremd, "DELETE", `/guardian/children/${lena.id}/guardian-invites/${open.id}`)).statusCode).toBe(404);

    // fremdes Konto (andere Adresse): weder Info noch Annahme, und kein Wort ueber das Kind
    const wrongInfo = await req(fremd, "GET", `/guardian/invites/${inviteToken}`);
    expect(wrongInfo.statusCode).toBe(403);
    expect(wrongInfo.body).not.toMatch(/Lena|Kowalski/);
    expect((await req(fremd, "POST", `/guardian/invites/${inviteToken}/accept`, { confirmGuardian: true })).statusCode).toBe(403);
    expect((await req(null, "GET", `/guardian/invites/${inviteToken}`)).statusCode).toBe(401);
    expect((await req(pam, "GET", `/guardian/invites/${"x".repeat(43)}`)).statusCode).toBe(404);
    expect((await req(pia, "GET", `/guardian/invites/${inviteToken}`)).statusCode).toBe(403); // der Einladende hat eine andere Adresse

    const info = (await req(pam, "GET", `/guardian/invites/${inviteToken}`)).json() as GuardianInviteInfo;
    expect(info).toEqual({ inviterName: "Pia Elternteil", childName: "Lena K." });
    expect((await req(pam, "POST", `/guardian/invites/${inviteToken}/accept`, {})).statusCode).toBe(400); // Selbstauskunft fehlt
    expect((await req(pam, "POST", `/guardian/invites/${inviteToken}/accept`, { confirmGuardian: false })).statusCode).toBe(400);

    // Widerruf macht den Link wirkungslos, danach neue Einladung
    expect((await req(pia, "DELETE", `/guardian/children/${lena.id}/guardian-invites/${open.id}`)).statusCode).toBe(204);
    expect((await req(pam, "POST", `/guardian/invites/${inviteToken}/accept`, { confirmGuardian: true })).statusCode).toBe(404);
    mails.clear();
    expect((await req(pia, "POST", `/guardian/children/${lena.id}/guardians`, { email: pam.email })).statusCode).toBe(204);
    inviteToken = tokenFrom(mails.last(pam.email, "guardian-invite")!.text);

    // abgelaufen
    await db.update(schema.guardianInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.guardianInvites.tokenHash, (await db.select().from(schema.guardianInvites).where(eq(schema.guardianInvites.status, "open")))[0].tokenHash));
    expect((await req(pam, "GET", `/guardian/invites/${inviteToken}`)).statusCode).toBe(404);
    await db.update(schema.guardianInvites).set({ expiresAt: new Date(Date.now() + 3600_000) }).where(eq(schema.guardianInvites.status, "open"));

    const accepted = await req(pam, "POST", `/guardian/invites/${inviteToken}/accept`, { confirmGuardian: true });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ childId: lena.id });
    expect((await req(pam, "POST", `/guardian/invites/${inviteToken}/accept`, { confirmGuardian: true })).statusCode).toBe(404); // einmalig

    // beide sehen und verwalten das Kind; Nachweis der Selbstauskunft des zweiten Elternteils
    expect(((await req(pam, "GET", "/guardian/children")).json() as YouthChild[]).map((c) => c.id)).toEqual([lena.id]);
    expect((await req(pam, "GET", `/guardian/children/${lena.id}`)).statusCode).toBe(200);
    const consents = await db.select().from(schema.guardianConsents).where(and(eq(schema.guardianConsents.youthUserId, lena.id), eq(schema.guardianConsents.guardianUserId, pam.id)));
    expect(consents).toEqual([expect.objectContaining({ purpose: "account", granted: true })]);
    expect((await notes(pia)).find((n) => n.type === "guardian_notice")?.data).toEqual({ kind: "invite_accepted" });
    const view = (await req(pam, "GET", `/guardian/children/${lena.id}/guardians`)).json() as YouthGuardiansView;
    expect(view.guardians.map((g) => g.name).sort()).toEqual(["Pam Elternteil", "Pia Elternteil"]);
    expect(view).toMatchObject({ canInvite: false, invites: [] });
    // mehr als zwei Eltern gibt es nicht
    expect((await req(pam, "POST", `/guardian/children/${lena.id}/guardians`, { email: "dritter@example.de" })).statusCode).toBe(400);
  });

  it("Rechnungsempfaenger wechseln: genau einer bleibt, beide erfahren es, Audit ohne Klartext", async () => {
    const dir = app.get(YouthDirectory);
    expect((await dir.billingContacts([lena.id])).get(lena.id)).toBe(pia.id);
    expect((await req(fremd, "PUT", `/guardian/children/${lena.id}/billing-contact`, { guardianId: pam.id })).statusCode).toBe(404);
    expect((await req(pam, "PUT", `/guardian/children/${lena.id}/billing-contact`, { guardianId: fremd.id })).statusCode).toBe(404); // kein Elternteil dieses Kindes
    expect((await req(pam, "PUT", `/guardian/children/${lena.id}/billing-contact`, { guardianId: "kein-uuid" })).statusCode).toBe(400);

    expect((await req(pam, "PUT", `/guardian/children/${lena.id}/billing-contact`, { guardianId: pam.id })).statusCode).toBe(204);
    expect((await dir.billingContacts([lena.id])).get(lena.id)).toBe(pam.id);
    const active = await db.select().from(schema.guardianships).where(and(eq(schema.guardianships.youthUserId, lena.id), eq(schema.guardianships.isBillingContact, true)));
    expect(active).toHaveLength(1);
    expect((await notes(pia)).filter((n) => n.type === "guardian_notice").map((n) => n.data.kind)).toContain("billing_changed");
    expect((await notes(pam)).filter((n) => n.data.kind === "billing_changed")).toHaveLength(0); // wer wechselt, braucht keinen Hinweis
    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "youth.billing_contact.changed"));
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toMatch(/@example\.de|Lena|Kowalski|Pia|Pam/);
    // idempotent: erneut dieselbe Person aendert nichts
    expect((await req(pam, "PUT", `/guardian/children/${lena.id}/billing-contact`, { guardianId: pam.id })).statusCode).toBe(204);
    expect(await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "youth.billing_contact.changed"))).toHaveLength(1);
    // und zurueck
    expect((await req(pia, "PUT", `/guardian/children/${lena.id}/billing-contact`, { guardianId: pia.id })).statusCode).toBe(204);
    expect((await dir.billingContacts([lena.id])).get(lena.id)).toBe(pia.id);
  });

  it("Freigaben restriktiv: ein Widerspruch genuegt, nur wer widersprochen hat, hebt ihn auf", async () => {
    expect((await req(pia, "POST", `/guardian/children/${lena.id}/orgs`, { token: orgToken })).statusCode).toBe(200);
    // Pam widerspricht durch den Austritt, Pia erfaehrt es
    expect((await req(pam, "DELETE", `/guardian/children/${lena.id}/orgs/${org}`)).statusCode).toBe(204);
    expect((await notes(pia)).filter((n) => n.data.kind === "org_left")).toHaveLength(1);
    const blocked = await req(pia, "POST", `/guardian/children/${lena.id}/orgs`, { token: orgToken });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().message).toMatch(/widersprochen/);
    expect(((await req(pia, "GET", `/guardian/children/${lena.id}`)).json() as YouthChildDetail).orgs).toEqual([]);
    // Pam selbst darf wieder anmelden (ihr eigener Widerruf blockiert sie nicht), damit ist die Freigabe wieder erteilt
    expect((await req(pam, "POST", `/guardian/children/${lena.id}/orgs`, { token: orgToken })).statusCode).toBe(200);
    expect(((await req(pia, "GET", `/guardian/children/${lena.id}`)).json() as YouthChildDetail).orgs).toEqual([expect.objectContaining({ slug: org, status: "active" })]);
  });

  it("Termin-Benachrichtigungen an das Kind gehen an die Eltern (je Elternteil eine), nicht in den Posteingang des Jugendkontos", async () => {
    const before = { pia: (await notes(pia)).filter((n) => n.type === "event_created").length, pam: (await notes(pam)).filter((n) => n.type === "event_created").length };
    expect((await req(vera, "POST", `/orgs/${org}/events`, { title: "Kindertraining", startsAt: new Date(Date.now() + 48 * 3600_000).toISOString(), capacity: 10 })).statusCode).toBe(201);
    expect((await notes(pia)).filter((n) => n.type === "event_created")).toHaveLength(before.pia + 1);
    expect((await notes(pam)).filter((n) => n.type === "event_created")).toHaveLength(before.pam + 1);
    expect(await db.select().from(schema.notifications).where(eq(schema.notifications.userId, lena.id))).toHaveLength(0);
    // Export der Benachrichtigung enthaelt keinen Namen des Kindes
    expect(JSON.stringify((await req(pia, "GET", "/privacy/export")).json().notifications ?? "")).not.toMatch(/Lena|Kowalski/);
  });

  it("Loeschung: ein Elternteil sofort, zwei Eltern mit 7 Tagen Vorankuendigung; Widerspruch bricht ab; danach loescht der Job", async () => {
    const solo = await newChild(pia, "Max", "Allein"); // nur Pia
    // Pia loescht Max sofort
    const gone = await req(pia, "DELETE", `/guardian/children/${solo.id}`, { password });
    expect(gone.statusCode).toBe(200);
    expect(gone.json()).toEqual({ status: "deleted" });
    expect(await db.select().from(schema.users).where(eq(schema.users.id, solo.id))).toHaveLength(0);

    // Lena hat zwei Eltern: Pam beantragt, falsches Passwort zaehlt nicht
    expect((await req(pam, "DELETE", `/guardian/children/${lena.id}`, { password: "falsch-falsch-falsch" })).statusCode).toBe(403);
    const sched = await req(pam, "DELETE", `/guardian/children/${lena.id}`, { password });
    expect(sched.statusCode).toBe(200);
    expect(sched.json()).toMatchObject({ status: "scheduled" });
    const days = (Date.parse(sched.json().deleteAfter) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(await db.select().from(schema.users).where(eq(schema.users.id, lena.id))).toHaveLength(1);
    const pending = (await notes(pia)).find((n) => n.data.kind === "deletion_requested");
    expect(pending?.data.deleteAfter).toBe(sched.json().deleteAfter);
    expect(JSON.stringify(pending)).not.toMatch(/Lena|Kowalski/);
    // beide sehen die geplante Loeschung; wiederholter Antrag verlaengert die Frist nicht
    expect(((await req(pia, "GET", `/guardian/children/${lena.id}`)).json() as YouthChildDetail).deletion).toMatchObject({ byMe: false });
    expect(((await req(pam, "GET", `/guardian/children/${lena.id}`)).json() as YouthChildDetail).deletion).toMatchObject({ byMe: true });
    expect((await req(pam, "DELETE", `/guardian/children/${lena.id}`, { password })).json().deleteAfter).toBe(sched.json().deleteAfter);

    // Widerspruch von Pia: abgebrochen, Pam erfaehrt es; nichts wird geloescht
    expect((await req(fremd, "DELETE", `/guardian/children/${lena.id}/deletion`)).statusCode).toBe(404);
    expect((await req(pia, "DELETE", `/guardian/children/${lena.id}/deletion`)).statusCode).toBe(204);
    expect((await req(pia, "DELETE", `/guardian/children/${lena.id}/deletion`)).statusCode).toBe(404);
    expect((await notes(pam)).some((n) => n.data.kind === "deletion_canceled")).toBe(true);
    const privacy = app.get(PrivacyService);
    await db.update(schema.youthProfiles).set({ deletionRequestedAt: null }).where(eq(schema.youthProfiles.userId, lena.id));
    expect(await privacy.eraseOrphanedYouth()).toBe(0);

    // Neuer Antrag, Frist noch nicht um: nichts. Nach 8 Tagen ohne Widerspruch loescht der Job (Audit ohne Elternperson).
    expect((await req(pam, "DELETE", `/guardian/children/${lena.id}`, { password })).json()).toMatchObject({ status: "scheduled" });
    expect(await privacy.eraseOrphanedYouth()).toBe(0);
    await db.update(schema.youthProfiles).set({ deletionRequestedAt: new Date(Date.now() - 8 * 86400_000) }).where(eq(schema.youthProfiles.userId, lena.id));
    expect(await app.get(GuardianService).deletionDue()).toEqual([lena.id]);
    expect(await privacy.eraseOrphanedYouth()).toBe(1);
    expect(await db.select().from(schema.users).where(eq(schema.users.id, lena.id))).toHaveLength(0);
    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "youth.deleted"));
    expect(audit.some((a) => a.userId === null)).toBe(true);
    expect(JSON.stringify(audit)).not.toMatch(/Lena|Kowalski/);
  });

  it("Auskunft, Konto loeschen und Aufbewahrung der Einladungen", async () => {
    const kid = await newChild(pia, "Tim", "Auskunft");
    mails.clear();
    await req(pia, "POST", `/guardian/children/${kid.id}/guardians`, { email: "extern@example.de" });
    const own = (await req(pia, "GET", "/privacy/export")).json();
    expect(own.guardianship.guardianInvitesSent).toContainEqual(expect.objectContaining({ childId: kid.id, status: "open" }));
    expect(JSON.stringify(own.guardianship)).not.toContain("extern@example.de");

    // Fristen: abgelaufene/benutzte Einladungen verschwinden nach 30 Tagen
    await db.update(schema.guardianInvites).set({ expiresAt: new Date(Date.now() - 31 * 86400_000) }).where(eq(schema.guardianInvites.youthUserId, kid.id));
    expect(await app.get(GuardianService).purgeExpired()).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(schema.guardianInvites).where(eq(schema.guardianInvites.youthUserId, kid.id))).toHaveLength(0);

    // Konto des Einladenden loeschen: offene Einladungen verschwinden mit
    await req(pia, "POST", `/guardian/children/${kid.id}/guardians`, { email: "extern2@example.de" });
    expect(await db.select().from(schema.guardianInvites).where(eq(schema.guardianInvites.youthUserId, kid.id))).toHaveLength(1);
    await app.get(GuardianService).eraseUser(pia.id);
    expect(await db.select().from(schema.guardianInvites).where(eq(schema.guardianInvites.youthUserId, kid.id))).toHaveLength(0);
  });

  it("P2: Kind-Export ohne Platzhalter-Adresse, Entwuerfe weg, ab 16 keine Eltern-Auskunft/-Loeschung, ruhende Konten nach 12 Monaten, Fehler je Konto", async () => {
    const paul = await signup("e2-paul", "Paul Elternteil");
    const [a, b, c, d] = [await newChild(paul, "Ana", "Eins"), await newChild(paul, "Ben", "Zwei"), await newChild(paul, "Cem", "Drei"), await newChild(paul, "Dora", "Vier")];

    // Export: keine *.invalid-Adresse, keine E-Mail-/Sperr-/Wartelisten-Bereiche; 2FA-Fristbeginn im normalen Export
    const exp = await req(paul, "GET", `/guardian/children/${a.id}/export`);
    expect(exp.statusCode).toBe(200);
    expect(exp.body).not.toContain(".invalid");
    const exported = exp.json();
    expect(exported).not.toHaveProperty("email");
    expect(exported).not.toHaveProperty("mailSuppressions");
    expect(exported).not.toHaveProperty("waitlist");
    expect((await req(paul, "GET", "/privacy/export")).json().twoFactor).toHaveProperty("requiredSince");

    // Entwuerfe auf das Kind werden mit dem Kind geloescht, finalisierte Rechnungen bleiben ohne Verweis
    const base = { orgId: a.id, recipientName: "Paul Elternteil", issuerName: "Verein", dueDate: "2030-01-01", createdBy: paul.id, subjectUserId: a.id, subjectName: "Ana E." };
    await db.insert(schema.invoices).values([{ ...base, status: "draft" }, { ...base, status: "open", number: "2030-0001" }]);
    expect((await req(paul, "DELETE", `/guardian/children/${a.id}`, { password })).json()).toEqual({ status: "deleted" });
    const left = await db.select().from(schema.invoices).where(eq(schema.invoices.orgId, a.id));
    expect(left.map((r) => r.status)).toEqual(["open"]);
    expect(left[0].subjectUserId).toBeNull();

    // Ab dem 16. Geburtstag: keine Eltern-Auskunft; Loeschung bleibt bis E5 erlaubt (Art. 17, Kind hat noch keinen Login)
    await db.update(schema.youthProfiles).set({ birthDate: bornYearsAgo(16), graduationStartedAt: new Date() }).where(inArray(schema.youthProfiles.userId, [b.id, d.id]));
    expect((await req(paul, "GET", `/guardian/children/${b.id}/export`)).statusCode).toBe(409);
    expect((await req(paul, "DELETE", `/guardian/children/${d.id}`, { password })).json()).toEqual({ status: "deleted" });
    expect(await db.select().from(schema.users).where(eq(schema.users.id, d.id))).toHaveLength(0);

    // Ruhend seit 11 Monaten: bleibt; seit 13 Monaten: wird geloescht. Ein Fehler bei einem Konto stoppt die anderen nicht.
    const privacy = app.get(PrivacyService);
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000);
    await db.update(schema.youthProfiles).set({ graduationStartedAt: ago(335) }).where(eq(schema.youthProfiles.userId, b.id));
    expect(await privacy.eraseOrphanedYouth()).toBe(0);
    await db.update(schema.youthProfiles).set({ birthDate: bornYearsAgo(16), graduationStartedAt: ago(400) }).where(inArray(schema.youthProfiles.userId, [b.id, c.id]));
    const spy = vi.spyOn(privacy, "eraseEverything").mockImplementationOnce(async () => {
      throw new Error("Datenbank weg: geheim@example.de");
    });
    expect(await privacy.eraseOrphanedYouth()).toBe(1); // ein Konto scheitert, das andere ist weg
    spy.mockRestore();
    expect(await privacy.eraseOrphanedYouth()).toBeGreaterThanOrEqual(0); // naechster Lauf holt das gescheiterte nach
    expect(await db.select().from(schema.users).where(inArray(schema.users.id, [b.id, c.id]))).toHaveLength(0);
  });

  it("Einladung: parallele Annahmen ergeben nie drei Elternteile; ruhendes Kind/geplante Loeschung lehnen ab; Export enthaelt angenommene", async () => {
    const [host, p1, p2] = [await signup("e2-race-host", "Host Eltern"), await signup("e2-race-p1", "Race Eins"), await signup("e2-race-p2", "Race Zwei")];
    const kid = await newChild(host, "Rene", "Rennen");
    // zwei offene Einladungen direkt anlegen (die API laesst bei einem Elternteil nur eine zu)
    const tokens = ["race-token-1-" + "a".repeat(30), "race-token-2-" + "b".repeat(30)];
    const sha = (v: string) => createHash("sha256").update(v).digest("hex");
    const future = new Date(Date.now() + 3600_000);
    await db.insert(schema.guardianInvites).values([
      { youthUserId: kid.id, inviterUserId: host.id, tokenHash: sha(tokens[0]), emailHash: addressHash(p1.email), expiresAt: future },
      { youthUserId: kid.id, inviterUserId: host.id, tokenHash: sha(tokens[1]), emailHash: addressHash(p2.email), expiresAt: future },
    ]);
    const results = await Promise.all([
      req(p1, "POST", `/guardian/invites/${tokens[0]}/accept`, { confirmGuardian: true }),
      req(p2, "POST", `/guardian/invites/${tokens[1]}/accept`, { confirmGuardian: true }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const active = await db.select().from(schema.guardianships).where(and(eq(schema.guardianships.youthUserId, kid.id), eq(schema.guardianships.status, "active")));
    expect(active).toHaveLength(2);

    // Export des Annehmenden enthaelt die angenommene Einladung
    const accepter = results[0].statusCode === 200 ? p1 : p2;
    const exp = (await req(accepter, "GET", "/privacy/export")).json();
    expect(exp.guardianship.guardianInvitesAccepted).toContainEqual(expect.objectContaining({ childId: kid.id }));

    // Ruhendes Kind und geplante Loeschung: Annahme wie bei ungueltigem Link abgelehnt
    const solo = await newChild(host, "Sina", "Solo");
    const late = await signup("e2-race-late", "Race Spaet");
    const mk = async (name: string) => {
      const t = name + "x".repeat(40);
      await db.insert(schema.guardianInvites).values({ youthUserId: solo.id, inviterUserId: host.id, tokenHash: sha(t), emailHash: addressHash(late.email), expiresAt: future });
      return t;
    };
    const t1 = await mk("ruht-");
    await db.update(schema.youthProfiles).set({ birthDate: bornYearsAgo(16), graduationStartedAt: new Date() }).where(eq(schema.youthProfiles.userId, solo.id));
    expect((await req(late, "POST", `/guardian/invites/${t1}/accept`, { confirmGuardian: true })).statusCode).toBe(404);
    await db.update(schema.youthProfiles).set({ birthDate: bornYearsAgo(10), graduationStartedAt: null, deletionRequestedAt: new Date() }).where(eq(schema.youthProfiles.userId, solo.id));
    expect((await req(late, "POST", `/guardian/invites/${t1}/accept`, { confirmGuardian: true })).statusCode).toBe(404);
    expect((await req(late, "GET", `/guardian/invites/${t1}`)).statusCode).toBe(404);
  });

  it("P2: Graduierungsjob arbeitet unerledigte Faelle nach Faelligkeit ab und ist idempotent", async () => {
    const parent = await signup("e2-greta", "Greta Elternteil");
    const [x, y] = [await newChild(parent, "Xaver", "Eins"), await newChild(parent, "Yvonne", "Zwei")];
    const set = (id: string, days: number) => {
      const due = new Date(Date.now() + days * 86_400_000);
      const birth = `${due.getUTCFullYear() - 16}-${String(due.getUTCMonth() + 1).padStart(2, "0")}-${String(due.getUTCDate()).padStart(2, "0")}`;
      return db.update(schema.youthProfiles).set({ birthDate: birth, graduationDueOn: due.toISOString().slice(0, 10) }).where(eq(schema.youthProfiles.userId, id));
    };
    await set(x.id, 20); // 20 Tage vorher: 30-Tage-Hinweis
    await set(y.id, 5); // 5 Tage vorher: 7-Tage-Hinweis
    const guardians = app.get(GuardianService);
    const first = await guardians.runGraduation();
    expect(first.paused).toBe(0);
    expect(first.notified).toBeGreaterThanOrEqual(2);
    expect(await guardians.runGraduation()).toEqual({ notified: 0, paused: 0 });
  });
});
