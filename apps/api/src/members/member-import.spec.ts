import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { CACHE, type Cache } from "../cache/cache.module";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { MemoryMailDriver } from "../mail/mail.drivers";
import { MAIL_DRIVER, MailService } from "../mail/mail.service";
import { createTestDb } from "../testing/test-db";
import { confirmEmailForTest } from "../testing/auth";
import { detectDelimiter, mapColumns, parseCsv, parseDate } from "./csv";
import { IMPORT_CONFIRMS_PER_HOUR, IMPORT_PREVIEWS_PER_HOUR, MemberImportService } from "./member-import.service";

const password = "ein-sehr-langes-passwort";

function multipart(data: Buffer | string, filename = "mitglieder.csv") {
  const boundary = "----imp" + Math.random().toString(16).slice(2);
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"), tail]), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

describe("CSV-Parser", () => {
  it("Anfuehrungszeichen, Trennzeichen und Zeilenumbrueche im Feld, CRLF, leere Zeilen", () => {
    const text = 'a;b;c\r\n"x;1";"sag ""hallo""";"zwei\nZeilen"\r\n\r\nq;;r\n';
    expect(parseCsv(text, ";")).toEqual([
      { line: 1, cells: ["a", "b", "c"] },
      { line: 2, cells: ["x;1", 'sag "hallo"', "zwei\nZeilen"] },
      { line: 5, cells: ["q", "", "r"] },
    ]);
  });
  it("Trennzeichen erkennen (; , Tab), Kommas in Anfuehrungszeichen zaehlen nicht", () => {
    expect(detectDelimiter("Vorname;Nachname;E-Mail\n")).toBe(";");
    expect(detectDelimiter("Vorname,Nachname,E-Mail\n")).toBe(",");
    expect(detectDelimiter('"Name, voll";Mail\n')).toBe(";");
    expect(detectDelimiter("Vorname\tNachname\tMail")).toBe("\t");
  });
  it("Spaltennamen tolerant zuordnen", () => {
    const { index, ignored } = mapColumns(["Vorname", "Name", "E-Mail-Adresse", "Mitglieds-Nr.", "Eintritt am", "Beitragsgruppe", "Telefon"]);
    expect(index).toEqual({ firstName: 0, lastName: 1, email: 2, memberNo: 3, joinedOn: 4, feeClass: 5 });
    expect(ignored).toEqual(["Telefon"]);
  });
  it("Datum: deutsch, ISO, ungueltig", () => {
    expect(parseDate("01.03.2020")).toBe("2020-03-01");
    expect(parseDate("1.3.99")).toBe("1999-03-01");
    expect(parseDate("2021-12-31")).toBe("2021-12-31");
    expect(parseDate("31.02.2020")).toBe("invalid");
    expect(parseDate("gestern")).toBe("invalid");
    expect(parseDate(" ")).toBeNull();
  });
});

describe("Mitglieder-Import (CSV + Einladungen)", () => {
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
  const req = (u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: u ? { cookie: u.cookie } : {} });
  const upload = (u: U | null, url: string, data: Buffer | string) => {
    const m = multipart(data);
    return app.inject({ method: "POST", url, payload: m.payload, headers: { ...m.headers, ...(u ? { cookie: u.cookie } : {}) } });
  };

  let vera: U, kai: U, mia: U, outsider: U;
  let orgId: string;
  const org = "sv-import";
  const base = `/orgs/${org}/member-imports`;

  beforeAll(async () => {
    [vera, kai, mia, outsider] = [await signup("vera"), await signup("kai"), await signup("mia"), await signup("outsider")];
    await req(vera, "POST", "/orgs", { name: "SV Import", category: "Sport", city: "Listenstadt" });
    for (const m of [kai, mia]) {
      await req(m, "POST", `/orgs/${org}/membership`);
      await req(vera, "POST", `/orgs/${org}/members/${m.id}/decision`, { decision: "approve" });
    }
    await req(vera, "PUT", `/orgs/${org}/members/${kai.id}/role`, { role: "treasurer" });
    await req(vera, "POST", `/orgs/${org}/fee-classes`, { name: "Erwachsene", amountCents: 12000, interval: "yearly" });
    await req(vera, "GET", `/orgs/${org}/member-registry`); // vergibt Nummern 1-3 an vorhandene Mitglieder
    orgId = (await db.select().from(schema.organizations).where(eq(schema.organizations.slug, org)))[0].id;
  });

  const csv = [
    "﻿Vorname;Nachname;E-Mail-Adresse;Mitglieds-Nr.;Eintritt;Beitragsklasse;Telefon",
    'Lena;"Müller; geb. Schmidt";lena@example.de;100;01.03.2020;erwachsene;0170 123',
    "Tom;Tester;TOM@example.de;;2019-05-01;;",
    "Ina;Doppelt;lena@example.de;;;;",
    "Kai;Schon;kai@example.de;;;;",
    "Nora;Nummer;nora@example.de;1;;;",
    '"=HYPERLINK(""x"")";Böse;boese@example.de;;;;',
    "Ole;Ohne;keine-mail;;;;",
    "Uwe;Unbekannt;uwe@example.de;;;Senioren;",
    "Zoe;Zukunft;zoe@example.de;;01.01.2999;;",
    ";;;;;;",
  ].join("\r\n");

  it("nur der Vorstand: ohne Login 401, Mitglied/Kassenwart/Fremde 403", async () => {
    expect((await upload(null, `${base}/preview`, csv)).statusCode).toBe(401);
    for (const u of [mia, kai, outsider]) {
      expect((await upload(u, `${base}/preview`, csv)).statusCode).toBe(403);
      expect((await upload(u, base, csv)).statusCode).toBe(403);
      expect((await req(u, "GET", `${base}/pending`)).statusCode).toBe(403);
    }
  });

  it("Vorschau: Zuordnung, Fehler je Zeile, Dubletten, nichts gespeichert", async () => {
    const res = await upload(vera, `${base}/preview`, csv);
    expect(res.statusCode).toBe(200);
    const p = res.json();
    expect(p.delimiter).toBe(";");
    expect(p.columns.map((c: { field: string }) => c.field)).toEqual(["firstName", "lastName", "email", "memberNo", "joinedOn", "feeClass"]);
    expect(p.ignoredColumns).toEqual(["Telefon"]);
    expect(p).toMatchObject({ total: 9, valid: 2, errors: 4, duplicates: 3, mail: { today: 2, later: 0 } });
    const by = (line: number) => p.rows.find((r: { line: number }) => r.line === line);
    expect(by(2)).toMatchObject({ status: "ok", lastName: "Müller; geb. Schmidt", memberNo: 100, joinedOn: "2020-03-01", feeClassName: "erwachsene" });
    expect(by(3)).toMatchObject({ status: "ok", email: "tom@example.de" });
    expect(by(4).status).toBe("duplicate");
    expect(by(4).problems[0]).toMatch(/Zeile 2/);
    expect(by(5)).toMatchObject({ status: "duplicate", problems: ["Diese Person ist schon Mitglied im Verein."] });
    expect(by(6).problems[0]).toMatch(/Mitgliedsnummer 1 ist im Verein schon vergeben/);
    expect(by(7)).toMatchObject({ status: "error" });
    expect(by(7).problems.join()).toMatch(/darf nicht mit = \+ - oder @ beginnen/);
    expect(by(8).problems).toContain("E-Mail-Adresse ist ungültig.");
    expect(by(9).problems[0]).toMatch(/Beitragsklasse „Senioren“/);
    expect(by(10).problems).toContain("Eintrittsdatum liegt in der Zukunft.");
    expect(await db.select().from(schema.pendingMembers)).toHaveLength(0);
  });

  it("Komma-getrennt und Latin-1 werden erkannt", async () => {
    const latin = Buffer.from("Vorname,Nachname,Mail\nJörg,Groß,joerg@example.de\n", "latin1");
    const p = (await upload(vera, `${base}/preview`, latin)).json();
    expect(p).toMatchObject({ delimiter: ",", valid: 1 });
    expect(p.rows[0]).toMatchObject({ firstName: "Jörg", lastName: "Groß" });
  });

  it("Grenzen und kaputte Dateien: generische Meldungen", async () => {
    const many = ["Vorname;Nachname;E-Mail", ...Array.from({ length: 501 }, (_, i) => `A;B;a${i}@example.de`)].join("\n");
    const tooMany = await upload(vera, `${base}/preview`, many);
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json().message).toMatch(/Höchstens 500/);
    expect((await upload(vera, `${base}/preview`, "Vorname;Nachname;E-Mail\n" + "x".repeat(1_000_001))).statusCode).toBe(413);
    const missing = await upload(vera, `${base}/preview`, "Vorname;Telefon\nA;1\n");
    expect(missing.statusCode).toBe(400);
    expect(missing.json().message).toMatch(/fehlen Spalten: Nachname, E-Mail/);
    expect((await upload(vera, `${base}/preview`, Buffer.from([0x50, 0x4b, 3, 4, 0, 0]))).statusCode).toBe(400);
    expect((await upload(vera, `${base}/preview`, "Vorname;Nachname;E-Mail\n")).statusCode).toBe(400);
    expect((await req(vera, "POST", `${base}/preview`, { csv: "a" })).statusCode).toBe(400);
  });

  let lenaToken = "";
  it("Bestaetigen: gueltige Zeilen vormerken, Einladungen per Job, Audit ohne Adressen", async () => {
    mails.clear();
    const res = await upload(vera, base, csv);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ imported: 2, skipped: 7, mailToday: 2, mailLater: 0 });
    const pending = await db.select().from(schema.pendingMembers).where(eq(schema.pendingMembers.orgId, orgId));
    expect(pending.map((p) => p.email).sort()).toEqual(["lena@example.de", "tom@example.de"]);
    expect(pending.every((p) => p.status === "sent" && p.inviteId && p.inviteExpiresAt)).toBe(true);
    const mail = mails.last("lena@example.de", "member-invite")!;
    expect(mail.text).toContain("Hallo Lena,");
    expect(mail.text).toContain("SV Import");
    expect(mail.headers?.["List-Unsubscribe"]).toBeTruthy();
    lenaToken = /\/einladung\/([A-Za-z0-9_-]+)/.exec(mail.text)![1];
    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "members.imported"));
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain("@example.de");
    // Zaehler reserviert die importierte Nummer
    const [counter] = await db.select().from(schema.memberCounters).where(eq(schema.memberCounters.orgId, orgId));
    expect(counter.lastNo).toBeGreaterThanOrEqual(100);
    // Import-Einladungen tauchen nicht in der Linkliste auf
    expect((await req(vera, "GET", `/orgs/${org}/invites`)).json()).toEqual([]);
    // erneuter Import derselben Datei: alles Dubletten
    const again = (await upload(vera, `${base}/preview`, csv)).json();
    expect(again.valid).toBe(0);
    expect((await upload(vera, base, csv)).statusCode).toBe(400);
  });

  it("Vormerkungen: Liste fuer den Vorstand", async () => {
    const page = (await req(vera, "GET", `${base}/pending`)).json();
    expect(page.total).toBe(2);
    expect(page.items.find((i: { email: string }) => i.email === "lena@example.de")).toMatchObject({ status: "sent", memberNo: 100, feeClassName: "Erwachsene", joinedOn: "2020-03-01" });
  });

  it("Beitritt ueber die persoenliche Einladung uebernimmt Nummer, Eintritt und Beitragsklasse", async () => {
    const lena = await signup("lena");
    expect((await req(lena, "POST", `/invites/${lenaToken}/accept`)).statusCode).toBe(200);
    const [profile] = await db.select().from(schema.memberProfiles).where(and(eq(schema.memberProfiles.orgId, orgId), eq(schema.memberProfiles.userId, lena.id)));
    expect(profile).toMatchObject({ memberNo: 100, joinedOn: "2020-03-01" });
    expect(profile.feeClassId).not.toBeNull();
    expect(await db.select().from(schema.pendingMembers).where(eq(schema.pendingMembers.email, "lena@example.de"))).toHaveLength(0);
    // Einmal-Link: ein zweites Konto kommt damit nicht mehr rein
    expect((await req(mia, "GET", `/invites/${lenaToken}`)).statusCode).toBe(404);
  });

  it("Vormerkung entfernen widerruft die Einladung", async () => {
    const [tom] = await db.select().from(schema.pendingMembers).where(eq(schema.pendingMembers.email, "tom@example.de"));
    expect((await req(mia, "DELETE", `${base}/pending/${tom.id}`)).statusCode).toBe(403);
    expect((await req(vera, "DELETE", `${base}/pending/${tom.id}`)).statusCode).toBe(204);
    expect((await req(vera, "DELETE", `${base}/pending/${tom.id}`)).statusCode).toBe(404);
    const [inv] = await db.select().from(schema.orgInvites).where(eq(schema.orgInvites.id, tom.inviteId!));
    expect(inv.revokedAt).not.toBeNull();
  });

  it("Vormerkung waehrend des Versands entfernt: Einladung wird widerrufen", async () => {
    const mail = app.get(MailService);
    const file = ["Vorname;Nachname;E-Mail", "Rita;Race;rita@example.de"].join("\n");
    const orig = mail.send.bind(mail);
    const spy = vi.spyOn(mail, "send").mockImplementation(async (...args: Parameters<MailService["send"]>) => {
      const result = await orig(...args);
      if (args[0] === "rita@example.de") await db.delete(schema.pendingMembers).where(eq(schema.pendingMembers.email, "rita@example.de"));
      return result;
    });
    try {
      expect((await upload(vera, base, file)).statusCode).toBe(201);
    } finally {
      spy.mockRestore();
    }
    expect(await db.select().from(schema.pendingMembers).where(eq(schema.pendingMembers.email, "rita@example.de"))).toHaveLength(0);
    const invites = await db.select().from(schema.orgInvites).where(and(eq(schema.orgInvites.orgId, orgId), eq(schema.orgInvites.purpose, "import")));
    expect(invites.filter((i) => i.revokedAt === null && i.uses === 0).length).toBe(0);
  });

  it("Kontingent reicht nicht: heute nur ein Teil, der Rest bleibt wartend fuer morgen", async () => {
    const cache = app.get<Cache>(CACHE);
    const key = `mail:o:d:${orgId}`; // 99 von 100 Vereins-Einladungen heute verbraucht
    while (Number((await cache.get(key)) ?? 0) < 99) await cache.incr(key, 86400);
    const file = ["Vorname;Nachname;E-Mail", "Anna;A;anna@example.de", "Bert;B;bert@example.de", "Carl;C;carl@example.de"].join("\n");
    const preview = (await upload(vera, `${base}/preview`, file)).json();
    expect(preview.mail).toEqual({ today: 1, later: 2 });
    mails.clear();
    const res = (await upload(vera, base, file)).json();
    expect(res).toEqual({ imported: 3, skipped: 0, mailToday: 1, mailLater: 2 });
    expect(mails.sent.filter((m) => m.template === "member-invite")).toHaveLength(1);
    const rows = await db.select().from(schema.pendingMembers).where(eq(schema.pendingMembers.orgId, orgId));
    expect(rows.filter((r) => r.status === "queued")).toHaveLength(2);
    // nicht verschickte haben keine (verwaiste) Einladung
    expect(rows.filter((r) => r.status === "queued").every((r) => r.inviteId === null)).toBe(true);
    const page = (await req(vera, "GET", `${base}/pending`)).json();
    expect(page.items.filter((i: { status: string }) => i.status === "queued")).toHaveLength(2);
  });

  it("Loeschfrist: abgelaufene Einladungen und alte Vormerkungen werden entfernt", async () => {
    await db.update(schema.pendingMembers).set({ inviteExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.pendingMembers.status, "sent"));
    const removed = await app.get(MemberImportService).purgeExpired();
    expect(removed).toBe(1);
    expect((await db.select().from(schema.pendingMembers)).every((r) => r.status === "queued")).toBe(true);
  });

  it("Rate-Limit: zu viele Pruefungen/Bestaetigungen ergeben 429, ohne etwas zu speichern oder zu loggen", async () => {
    const cache = app.get<Cache>(CACHE);
    const file = ["Vorname;Nachname;E-Mail", "Rita;Rate;rita@example.de"].join("\n");
    const prevKey = `lim:import:prev:${orgId}:${vera.id}`;
    while (Number((await cache.get(prevKey)) ?? 0) < IMPORT_PREVIEWS_PER_HOUR) await cache.incr(prevKey, 3600);
    const limited = await upload(vera, `${base}/preview`, file);
    expect(limited.statusCode).toBe(429);
    expect(JSON.stringify(limited.json())).not.toContain("rita@");
    const confKey = `lim:import:conf:${orgId}`;
    while (Number((await cache.get(confKey)) ?? 0) < IMPORT_CONFIRMS_PER_HOUR) await cache.incr(confKey, 3600);
    expect((await upload(vera, base, file)).statusCode).toBe(429);
    expect((await db.select().from(schema.pendingMembers).where(eq(schema.pendingMembers.email, "rita@example.de")))).toHaveLength(0);
  });
});
