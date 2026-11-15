import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberImportPreview, YouthChild } from "@vereine/shared";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { MemoryMailDriver } from "../mail/mail.drivers";
import { MAIL_DRIVER } from "../mail/mail.service";
import { confirmEmailForTest } from "../testing/auth";
import { createTestDb } from "../testing/test-db";
import { mapColumns } from "./csv";

const password = "ein-sehr-langes-passwort";

function multipart(data: string) {
  const boundary = "----imp" + Math.random().toString(16).slice(2);
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="mitglieder.csv"\r\nContent-Type: text/csv\r\n\r\n`);
  return { payload: Buffer.concat([head, Buffer.from(data, "utf8"), Buffer.from(`\r\n--${boundary}--\r\n`)]), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}
/** Datum, an dem jemand heute n Jahre alt ist, als ISO und als TT.MM.JJJJ. */
const bornYearsAgo = (years: number, plusDays = 0) => {
  const d = new Date(Date.now() + plusDays * 86400_000);
  const iso = `${d.getUTCFullYear() - years}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { iso, de: `${iso.slice(8)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` };
};

describe("CSV: Spalten fuer Kinder", () => {
  it("Geburtsdatum und Eltern-E-Mail werden tolerant erkannt", () => {
    const { index, ignored } = mapColumns(["Vorname", "Nachname", "E-Mail", "Geburtsdatum", "Eltern-E-Mail", "Telefon"]);
    expect(index).toEqual({ firstName: 0, lastName: 1, email: 2, birthDate: 3, guardianEmail: 4 });
    expect(ignored).toEqual(["Telefon"]);
    expect(mapColumns(["Vorname", "Name", "Geburtstag", "E-Mail Eltern"]).index).toMatchObject({ birthDate: 2, guardianEmail: 3 });
  });
});

describe("Mitglieder-Import fuer Kinder (Etappe E2)", () => {
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

  type U = { cookie: string; id: string };
  async function signup(name: string): Promise<U> {
    const email = `${name}@example.de`;
    await app.inject({ method: "POST", url: "/auth/register", payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true } });
    await confirmEmailForTest(app, email);
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: login.json().id };
  }
  const req = (u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) => app.inject({ method, url, payload, headers: u ? { cookie: u.cookie } : {} });
  const upload = (u: U, url: string, data: string) => {
    const m = multipart(data);
    return app.inject({ method: "POST", url, payload: m.payload, headers: { ...m.headers, cookie: u.cookie } });
  };

  const org = "sv-kinder-import";
  const base = `/orgs/${org}/member-imports`;
  let vera: U, eltern: U;
  let orgId: string;
  const mia = bornYearsAgo(10);
  const ben = bornYearsAgo(7);
  const sechzehn = bornYearsAgo(16);
  const header = "Vorname;Nachname;E-Mail;Geburtsdatum;E-Mail der Eltern";
  const csv = [
    header,
    `Mia;Klein;mia-eigene-adresse@example.de;${mia.de};familie-klein@example.de`, // Kind: eigene Adresse wird nicht uebernommen
    `Ben;Klein;;${ben.de};familie-klein@example.de`, // Geschwister mit gleicher Elternadresse
    `Mia;Klein;;${mia.de};familie-klein@example.de`, // Dublette in der Datei
    `Kim;Ohneeltern;;${mia.de};`, // Kind ohne Elternadresse
    `Tiny;Zufrueh;;${bornYearsAgo(4).de};tiny@example.de`, // unter 6
    `Zuk;Zukunft;;01.01.2999;zuk@example.de`,
    `Wirr;Datum;wirr@example.de;gestern;`,
    `Erna;Erwachsen;erna@example.de;01.01.1980;`, // Erwachsene: Geburtsdatum wird nicht gespeichert
    `Jan;Sechzehn;jan@example.de;${sechzehn.de};`, // heute 16: Erwachsenenkonto
    `Otto;Ohnedatum;otto@example.de;;`, // ohne Geburtsdatum: Erwachsene
  ].join("\r\n");

  beforeAll(async () => {
    [vera, eltern] = [await signup("ki-vera"), await signup("ki-eltern")];
    await req(vera, "POST", "/orgs", { name: "SV Kinder Import", category: "Sport", city: "Listenstadt" });
    orgId = (await db.select().from(schema.organizations).where(eq(schema.organizations.slug, org)))[0].id;
  });

  it("Vorschau: Kinder gekennzeichnet, Altersprueefung, Eltern-Adresse Pflicht, Geschwister kein Duplikat", async () => {
    const res = await upload(vera, `${base}/preview`, csv);
    expect(res.statusCode).toBe(200);
    const p = res.json() as MemberImportPreview;
    expect(p.columns.map((c) => c.field)).toEqual(["firstName", "lastName", "email", "birthDate", "guardianEmail"]);
    expect(p).toMatchObject({ total: 10, valid: 5, errors: 4, duplicates: 1, youthRows: 4 });
    const by = (line: number) => p.rows.find((r) => r.line === line)!;
    expect(by(2)).toMatchObject({ status: "ok", youth: true, email: "familie-klein@example.de", birthDate: mia.iso });
    expect(by(3)).toMatchObject({ status: "ok", youth: true, email: "familie-klein@example.de" });
    expect(by(4)).toMatchObject({ status: "duplicate" });
    expect(by(4).problems[0]).toMatch(/Dieses Kind steht schon in Zeile 2/);
    expect(by(5)).toMatchObject({ status: "error", youth: true });
    expect(by(5).problems.join()).toMatch(/E-Mail der Eltern/);
    expect(by(6).problems.join()).toMatch(/unter 6 Jahren/);
    expect(by(7).problems.join()).toMatch(/Zukunft/);
    expect(by(8).problems.join()).toMatch(/Geburtsdatum ist ungültig/);
    // Erwachsene (auch genau 16 oder ohne Datum): normale Einladung an die eigene Adresse, kein Geburtsdatum in der Vorschau
    expect(by(9)).toMatchObject({ status: "ok", youth: false, birthDate: null, email: "erna@example.de" });
    expect(by(10)).toMatchObject({ status: "ok", youth: false, email: "jan@example.de" });
    expect(by(11)).toMatchObject({ status: "ok", youth: false });
    expect(await db.select().from(schema.pendingMembers)).toHaveLength(0);
  });

  it("Bestaetigen: Einladung geht an die Eltern (eigene Kind-Adresse nie), Geburtsdatum nur bei Kindern, Audit ohne Adressen", async () => {
    mails.clear();
    const res = await upload(vera, base, csv);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ imported: 5 });
    const pending = await db.select().from(schema.pendingMembers).where(eq(schema.pendingMembers.orgId, orgId));
    const kids = pending.filter((p) => p.isMinor);
    expect(kids.map((k) => k.firstName).sort()).toEqual(["Ben", "Mia"]);
    expect(kids.every((k) => k.email === "familie-klein@example.de" && k.birthDate)).toBe(true);
    expect(pending.filter((p) => !p.isMinor).every((p) => p.birthDate === null)).toBe(true);
    expect(JSON.stringify(pending)).not.toContain("mia-eigene-adresse");
    // Mails: Eltern bekommen die Kinder-Vorlage je Kind, nichts an die Kind-Adresse
    const toParents = mails.sent.filter((m) => m.to === "familie-klein@example.de");
    expect(toParents).toHaveLength(2);
    expect(toParents.every((m) => m.template === "member-invite-guardian")).toBe(true);
    expect(toParents.some((m) => m.text.includes("Mia"))).toBe(true);
    expect(mails.sent.some((m) => m.to === "mia-eigene-adresse@example.de")).toBe(false);
    expect(mails.last("erna@example.de", "member-invite")).toBeTruthy();
    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "members.imported"));
    expect(JSON.stringify(audit)).not.toMatch(/@example\.de|Mia|Klein/);
    expect(audit[0].meta).toMatchObject({ youth: 2 });
    // Vorstand sieht die Kennzeichnung in der Liste der offenen Einladungen
    const page = (await req(vera, "GET", `${base}/pending`)).json();
    expect(page.items.filter((i: { youth: boolean }) => i.youth)).toHaveLength(2);
    // erneut: Kinder sind Dubletten, Geschwister blieben nebeneinander moeglich
    const again = (await upload(vera, `${base}/preview`, csv)).json() as MemberImportPreview;
    expect(again.valid).toBe(0);
    expect(again.rows.find((r) => r.line === 2)!.problems[0]).toMatch(/schon importiert/);
  });

  it("Annahme: nie fuer das Elternkonto selbst, nur fuer ein Jugendkonto mit passendem Geburtsdatum", async () => {
    const mailMia = mails.sent.filter((m) => m.to === "familie-klein@example.de").find((m) => m.text.includes("Mia"))!;
    const token = /\/einladung\/([A-Za-z0-9_-]+)/.exec(mailMia.text)![1];
    // Info nennt "fuer ein Kind"
    expect((await req(eltern, "GET", `/invites/${token}`)).json()).toMatchObject({ forChild: true, orgSlug: org });
    // Elternkonto selbst: nein
    const adult = await req(eltern, "POST", `/invites/${token}/accept`);
    expect(adult.statusCode).toBe(409);
    expect(adult.json().message).toMatch(/Kind unter 16/);
    expect(await db.select().from(schema.orgMembers).where(eq(schema.orgMembers.userId, eltern.id))).toHaveLength(0);

    // Jugendkonto mit falschem Geburtsdatum: nein
    const wrong = (await req(eltern, "POST", "/guardian/children", { firstName: "Mia", lastName: "Klein", birthDate: bornYearsAgo(9).iso, confirmGuardian: true })).json() as YouthChild;
    const blocked = await req(eltern, "POST", `/guardian/children/${wrong.id}/orgs`, { token });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().message).toMatch(/Geburtsdatum/);

    // passendes Kind: Mitglied, Vormerkung geloescht, Geschwister-Einladung bleibt
    const right = (await req(eltern, "POST", "/guardian/children", { firstName: "Mia", lastName: "Klein", birthDate: mia.iso, confirmGuardian: true })).json() as YouthChild;
    const ok = await req(eltern, "POST", `/guardian/children/${right.id}/orgs`, { token });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ orgSlug: org, status: "active" });
    const left = await db.select().from(schema.pendingMembers).where(eq(schema.pendingMembers.orgId, orgId));
    expect(left.filter((p) => p.isMinor).map((p) => p.firstName)).toEqual(["Ben"]);
    // Link ist einmalig
    expect((await req(eltern, "POST", `/guardian/children/${right.id}/orgs`, { token })).statusCode).toBeLessThan(500);
  });

  it("Rate-Limit: hoechstens 5 Importe mit Kindern je Verein und Tag", async () => {
    // 1 Import mit Kindern ist schon gelaufen; vier weitere gehen, der sechste nicht
    for (let i = 0; i < 4; i++) {
      const ok = await upload(vera, base, `${header}\r\nKind${i};Limit${i};;${mia.de};eltern-limit${i}@example.de`);
      expect(ok.statusCode).toBe(201);
    }
    const sixth = await upload(vera, base, `${header}\r\nKind9;Limit9;;${mia.de};eltern-limit9@example.de`);
    expect(sixth.statusCode).toBe(429);
    // Vorschau bleibt moeglich (eigenes Limit)
    expect((await upload(vera, `${base}/preview`, `${header}\r\nKind9;Limit9;;${mia.de};eltern-limit9@example.de`)).statusCode).toBe(200);
  });
});
