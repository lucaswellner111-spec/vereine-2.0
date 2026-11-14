import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AVV_DOCUMENT, avvToMarkdown } from "@vereine/shared";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { confirmEmailForTest } from "../testing/auth";
import { createTestDb } from "../testing/test-db";
import { MemberImportService } from "../members/member-import.service";
import { AvvService, avvGraceUntil, avvHash } from "./avv.service";

const password = "ein-sehr-langes-passwort";
const org = "sv-avv";
const item = { description: "Mitgliedsbeitrag", quantity: 1, unitCents: 12000, vatRate: 0 };

describe("AVV-Akzeptanz (Art. 28 DSGVO)", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let avv: AvvService;

  beforeAll(async () => {
    db = await createTestDb();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    avv = app.get(AvvService);
  });
  afterAll(async () => {
    await app.close();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.AVV_REQUIRED;
  });

  type U = { cookie: string; id: string };
  async function signup(name: string): Promise<U> {
    const email = `${name}@example.de`;
    await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    await confirmEmailForTest(app, email);
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: login.json().id };
  }
  const req = (u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: u ? { cookie: u.cookie } : {} });
  const acceptBody = { version: AVV_DOCUMENT.version, textHash: avvHash(AVV_DOCUMENT), confirm: true };

  let vera: U, kai: U, mia: U, ben: U;
  let orgId: string;
  beforeAll(async () => {
    [vera, kai, mia, ben] = [await signup("vera"), await signup("kai"), await signup("mia"), await signup("ben")];
    await req(vera, "POST", "/orgs", { name: "SV Avv", category: "Sport", city: "Vertragstadt" });
    for (const m of [kai, mia, ben]) {
      await req(m, "POST", `/orgs/${org}/membership`);
      await req(vera, "POST", `/orgs/${org}/members/${m.id}/decision`, { decision: "approve" });
    }
    await req(vera, "PUT", `/orgs/${org}/members/${kai.id}/role`, { role: "treasurer" });
    orgId = (await db.select().from(schema.organizations).where(eq(schema.organizations.slug, org)))[0].id;
  });

  it("Status: nur Vorstand und Kassenwart; ohne Zustimmung nicht aktuell, Durchsetzung standardmaessig aus", async () => {
    expect((await req(null, "GET", `/orgs/${org}/avv`)).statusCode).toBe(401);
    expect((await req(mia, "GET", `/orgs/${org}/avv`)).statusCode).toBe(403);
    const st = (await req(vera, "GET", `/orgs/${org}/avv`)).json();
    expect(st).toMatchObject({ required: false, upToDate: false, blocked: false, accepted: null, canAccept: true });
    expect(st.current).toMatchObject({ version: AVV_DOCUMENT.version, status: "draft", textHash: avvHash(AVV_DOCUMENT) });
    expect((await req(kai, "GET", `/orgs/${org}/avv`)).json().canAccept).toBe(false);
  });

  it("Zustimmung: nur Vorstand, nur mit aktueller Version und Pruefsumme, idempotent, mit Audit-Eintrag", async () => {
    expect((await req(kai, "POST", `/orgs/${org}/avv/accept`, acceptBody)).statusCode).toBe(403);
    expect((await req(mia, "POST", `/orgs/${org}/avv/accept`, acceptBody)).statusCode).toBe(403);
    expect((await req(vera, "POST", `/orgs/${org}/avv/accept`, { ...acceptBody, confirm: false })).statusCode).toBe(400);
    expect((await req(vera, "POST", `/orgs/${org}/avv/accept`, { ...acceptBody, version: "alt" })).statusCode).toBe(409);
    expect((await req(vera, "POST", `/orgs/${org}/avv/accept`, { ...acceptBody, textHash: "a".repeat(64) })).statusCode).toBe(409);
    expect(await db.select().from(schema.avvAcceptances)).toHaveLength(0);

    const ok = await req(vera, "POST", `/orgs/${org}/avv/accept`, acceptBody);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ upToDate: true, blocked: false, canAccept: true, accepted: { version: AVV_DOCUMENT.version, acceptedBy: "vera", isCurrent: true } });
    expect((await req(vera, "POST", `/orgs/${org}/avv/accept`, acceptBody)).statusCode).toBe(200); // zweites Mal: nichts Neues
    const rows = await db.select().from(schema.avvAcceptances);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orgId, version: AVV_DOCUMENT.version, textHash: avvHash(AVV_DOCUMENT), acceptedBy: vera.id });
    expect(Object.keys(rows[0]).sort()).toEqual(["acceptedAt", "acceptedBy", "id", "orgId", "textHash", "version"]); // keine IP
    const audits = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "avv.accepted"));
    expect(audits).toHaveLength(1);
    expect(audits[0].meta).toEqual({ orgId, version: AVV_DOCUMENT.version }); // ohne Text
    expect((await req(kai, "GET", `/orgs/${org}/avv`)).json().accepted.acceptedBy).toBe("vera");
  });

  it("Download: akzeptierter Text mit Pruefsumme; Kassenwart darf, Mitglied nicht; unbekannte Fassung 404", async () => {
    const res = await req(kai, "GET", `/orgs/${org}/avv/document`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/markdown/);
    expect(String(res.headers["content-disposition"])).toContain(`avv-${AVV_DOCUMENT.version}.md`);
    expect(res.headers["x-text-hash"]).toBe(avvHash(AVV_DOCUMENT));
    expect(res.body).toBe(avvToMarkdown(AVV_DOCUMENT));
    expect((await req(mia, "GET", `/orgs/${org}/avv/document`)).statusCode).toBe(403);
    expect((await req(vera, "GET", `/orgs/${org}/avv/document?version=gibtsnicht`)).statusCode).toBe(404);
  });

  it("Datenbank ist append-only: nur die Person darf geleert werden", async () => {
    await expect(db.update(schema.avvAcceptances).set({ textHash: "x" }).where(eq(schema.avvAcceptances.orgId, orgId))).rejects.toThrow();
    await expect(db.update(schema.avvAcceptances).set({ acceptedBy: ben.id }).where(eq(schema.avvAcceptances.orgId, orgId))).rejects.toThrow();
    expect(await db.select().from(schema.avvAcceptances)).toHaveLength(1);
  });

  it("Datenbank sperrt Loeschen und TRUNCATE", async () => {
    await expect(db.delete(schema.avvAcceptances).where(eq(schema.avvAcceptances.orgId, orgId))).rejects.toThrow();
    await expect(db.execute(sql`truncate table avv.acceptances`)).rejects.toThrow();
    expect(await db.select().from(schema.avvAcceptances)).toHaveLength(1);
  });

  describe("Durchsetzung auf allen Wegen (Rechnungen, Beitragslauf, Import)", () => {
    const slug = "sv-wege";
    let wera: U, xaver: U, orgId2: string;
    let draft: string, toPay: string, toVoid: string, runId: string;
    const make = async () => ((await req(wera, "POST", `/orgs/${slug}/invoices`, { recipientUserId: xaver.id, dueDate: "2099-01-31", items: [item] })).json() as { id: string }).id;
    beforeAll(async () => {
      [wera, xaver] = [await signup("wera"), await signup("xaver")];
      await req(wera, "POST", "/orgs", { name: "SV Wege", category: "Sport", city: "Wegstadt" });
      await req(xaver, "POST", `/orgs/${slug}/membership`);
      await req(wera, "POST", `/orgs/${slug}/members/${xaver.id}/decision`, { decision: "approve" });
      await req(wera, "PUT", `/orgs/${slug}/billing-profile`, { address: "Weg 1", iban: "DE89 3704 0044 0532 0130 00", taxInfo: "" });
      orgId2 = (await db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug)))[0].id;
      // Vorbereitung mit AVV aus
      draft = await make();
      toPay = await make();
      toVoid = await make();
      for (const id of [toPay, toVoid]) expect((await req(wera, "POST", `/invoices/${id}/finalize`)).statusCode).toBe(201);
      runId = (await db.insert(schema.feeRuns).values({ orgId: orgId2, periodLabel: "2099", dueDate: "2099-01-31", feeClassIds: [orgId2], status: "failed", createdBy: wera.id }).returning({ id: schema.feeRuns.id }))[0].id;
      await db.insert(schema.pendingMembers).values({ orgId: orgId2, firstName: "Pia", lastName: "P", email: "pia@example.de", status: "queued" });
    });

    it("gesperrt ohne Zustimmung: finalize, loeschen, bezahlt, stornieren, Lauf-retry, Import, Import-Versand; Stammdaten und Lesen bleiben frei", async () => {
      process.env.AVV_REQUIRED = "true";
      const code = (r: { statusCode: number; json: () => { code?: string } }) => [r.statusCode, r.json().code];
      expect(code(await req(wera, "POST", `/invoices/${draft}/finalize`))).toEqual([403, "avv_required"]);
      expect(code(await req(wera, "DELETE", `/invoices/${draft}`))).toEqual([403, "avv_required"]);
      expect(code(await req(wera, "POST", `/invoices/${toPay}/paid`))).toEqual([403, "avv_required"]);
      expect(code(await req(wera, "POST", `/invoices/${toVoid}/void`, { reason: "Irrtum" }))).toEqual([403, "avv_required"]);
      expect(code(await req(wera, "POST", `/orgs/${slug}/fee-runs/${runId}/retry`))).toEqual([403, "avv_required"]);
      await expect(app.get(MemberImportService).confirm({ id: wera.id } as never, slug, Buffer.from("Vorname;Nachname;E-Mail;A;B;ab@example.de"))).rejects.toMatchObject({ response: { code: "avv_required" } });
      // Nachlauf-Job eines frueher bestaetigten Imports: nichts verschickt, Zeile bleibt wartend
      expect(await app.get(MemberImportService).sendInvites(orgId2)).toEqual({ sent: 0, remaining: 1 });
      expect((await db.select().from(schema.pendingMembers).where(eq(schema.pendingMembers.orgId, orgId2)))[0].status).toBe("queued");
      // bewusst nicht gesperrt: Vereinsstammdaten (Vereinsdaten, keine Mitgliederdaten) und Lesen
      expect((await req(wera, "PUT", `/orgs/${slug}/billing-profile`, { address: "Weg 2", iban: "DE89 3704 0044 0532 0130 00", taxInfo: "" })).statusCode).toBe(200);
      expect((await req(wera, "GET", `/orgs/${slug}/invoices`)).statusCode).toBe(200);
    });

    it("nach Zustimmung laufen dieselben Wege", async () => {
      process.env.AVV_REQUIRED = "true";
      expect((await req(wera, "POST", `/orgs/${slug}/avv/accept`, acceptBody)).statusCode).toBe(200);
      expect((await req(wera, "POST", `/invoices/${draft}/finalize`)).statusCode).toBe(201);
      expect((await req(wera, "POST", `/invoices/${toPay}/paid`)).statusCode).toBe(201);
      expect((await req(wera, "POST", `/invoices/${toVoid}/void`, { reason: "Irrtum" })).statusCode).toBe(201);
      expect((await req(wera, "POST", `/orgs/${slug}/fee-runs/${runId}/retry`)).statusCode).toBe(200);
      const d2 = await make();
      expect((await req(wera, "DELETE", `/invoices/${d2}`)).statusCode).toBe(204);
    });
  });

  describe("Durchsetzung (AVV_REQUIRED)", () => {
    const org2 = "sv-ohne-avv";
    let tom: U, uli: U;
    beforeAll(async () => {
      [tom, uli] = [await signup("tom"), await signup("uli")];
      await req(tom, "POST", "/orgs", { name: "SV Ohne Avv", category: "Sport", city: "Lueckenstadt" });
      await req(uli, "POST", `/orgs/${org2}/membership`);
      await req(tom, "POST", `/orgs/${org2}/members/${uli.id}/decision`, { decision: "approve" });
    });
    const classBody = { name: "Erwachsene", amountCents: 12000, interval: "yearly" };

    it("aus (Standard): alles funktioniert wie bisher", async () => {
      expect((await req(tom, "POST", `/orgs/${org2}/fee-classes`, { ...classBody, name: "Vorab" })).statusCode).toBe(201);
    });

    it("an: Verein ohne Zustimmung ist fuer Mitglieder, Beitraege, Rechnungen und Einladungsmails gesperrt (403, code avv_required)", async () => {
      process.env.AVV_REQUIRED = "true";
      const blocked = async (res: Promise<{ statusCode: number; json: () => { code?: string; message?: string } }>) => {
        const r = await res;
        expect(r.statusCode).toBe(403);
        expect(r.json().code).toBe("avv_required");
        expect(r.json().message).toMatch(/Vertrag zur Auftragsverarbeitung/);
      };
      const classes = (await req(tom, "GET", `/orgs/${org2}/fee-classes`)).json() as { id: string }[];
      await blocked(req(tom, "POST", `/orgs/${org2}/fee-classes`, classBody));
      await blocked(req(tom, "PUT", `/orgs/${org2}/fee-classes/${classes[0].id}`, classBody));
      await blocked(req(tom, "DELETE", `/orgs/${org2}/fee-classes/${classes[0].id}`));
      await blocked(req(tom, "PUT", `/orgs/${org2}/member-registry/${uli.id}`, { street: "", zip: "", city: "", phone: "", birthDate: "", guardianName: "", guardianEmail: "", feeClassId: null, joinedOn: "2024-01-01", notes: "" }));
      await blocked(req(tom, "POST", `/orgs/${org2}/invoices`, { recipientUserId: uli.id, dueDate: "2099-01-31", items: [item] }));
      await blocked(req(tom, "POST", `/orgs/${org2}/fee-runs`, { periodLabel: "2027", dueDate: "2099-01-31", feeClassIds: [classes[0].id] }));
      const invite = (await req(tom, "POST", `/orgs/${org2}/invites`, {})).json() as { id: string };
      expect(invite.id).toBeTruthy(); // Einladungslink selbst bleibt moeglich
      await blocked(req(tom, "POST", `/orgs/${org2}/invites/${invite.id}/mail`, { email: "gast@example.de" }));
      // Lesen bleibt erlaubt, Status zeigt die Sperre
      expect((await req(tom, "GET", `/orgs/${org2}/fee-classes`)).statusCode).toBe(200);
      expect((await req(tom, "GET", `/orgs/${org2}/avv`)).json()).toMatchObject({ required: true, blocked: true, upToDate: false });
    });

    it("an: nach Zustimmung des Vorstands geht alles wieder; andere Vereine sind unabhaengig", async () => {
      process.env.AVV_REQUIRED = "true";
      expect((await req(tom, "POST", `/orgs/${org2}/avv/accept`, acceptBody)).statusCode).toBe(200);
      expect((await req(tom, "POST", `/orgs/${org2}/fee-classes`, { ...classBody, name: "Nach Zustimmung" })).statusCode).toBe(201);
      const inv = await req(tom, "POST", `/orgs/${org2}/invoices`, { recipientUserId: uli.id, dueDate: "2099-01-31", items: [item] });
      expect(inv.statusCode).toBe(201);
      expect((await req(tom, "GET", `/orgs/${org2}/avv`)).json()).toMatchObject({ blocked: false, upToDate: true });
      // Verein A hatte schon zugestimmt (Vera), Zustimmung von Verein B gilt nicht fuer A und umgekehrt
      expect((await req(vera, "POST", `/orgs/${org}/fee-classes`, { ...classBody, name: "Vera Beitrag" })).statusCode).toBe(201);
    });

    it("neue Fassung: Verein mit alter Zustimmung arbeitet in der Uebergangsfrist weiter, danach gesperrt bis zur neuen Zustimmung", async () => {
      process.env.AVV_REQUIRED = "true";
      const org3 = "sv-alte-version";
      const oli = await signup("oli");
      await req(oli, "POST", "/orgs", { name: "SV Alte Version", category: "Sport", city: "Altstadt" });
      const id3 = (await db.select().from(schema.organizations).where(eq(schema.organizations.slug, org3)))[0].id;
      await db.insert(schema.avvAcceptances).values({ orgId: id3, version: "2025-01-01-alt", textHash: "b".repeat(64), acceptedBy: oli.id });
      const st = (await req(oli, "GET", `/orgs/${org3}/avv`)).json();
      expect(st).toMatchObject({ upToDate: false, blocked: false, graceUntil: avvGraceUntil(), accepted: { version: "2025-01-01-alt", isCurrent: false } });
      expect((await req(oli, "POST", `/orgs/${org3}/fee-classes`, classBody)).statusCode).toBe(201); // Frist laeuft

      // Nach Fristende (Dienst direkt, damit die Sitzung nicht ablaeuft)
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(`${avvGraceUntil()}T12:00:00Z`).getTime() + 3 * 86400_000);
      await expect(avv.assertAccepted(id3)).rejects.toMatchObject({ response: { code: "avv_required", message: expect.stringMatching(/aktualisiert/) } });
      expect(await avv.status(id3, true)).toMatchObject({ blocked: true, upToDate: false });
      vi.useRealTimers();
      expect((await req(oli, "POST", `/orgs/${org3}/avv/accept`, acceptBody)).statusCode).toBe(200);
      expect((await req(oli, "POST", `/orgs/${org3}/fee-classes`, { ...classBody, name: "Wieder frei" })).statusCode).toBe(201);
      expect(await db.select().from(schema.avvAcceptances).where(eq(schema.avvAcceptances.orgId, id3))).toHaveLength(2); // append-only: alte Zeile bleibt
    });
  });

  it("Auskunft und Kontoloeschung: Person im Export, nach Loeschung entkoppelt, Nachweis bleibt", async () => {
    const exported = (await req(vera, "GET", "/privacy/export")).json();
    expect(exported.avvAcceptances).toEqual([{ orgId, version: AVV_DOCUMENT.version, textHash: avvHash(AVV_DOCUMENT), at: expect.any(String) }]);
    expect((await req(kai, "GET", "/privacy/export")).json().avvAcceptances).toEqual([]); // fremde Zustimmungen nicht
    await avv.eraseUser(vera.id);
    const rows = await db.select().from(schema.avvAcceptances).where(eq(schema.avvAcceptances.orgId, orgId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ acceptedBy: null, version: AVV_DOCUMENT.version, textHash: avvHash(AVV_DOCUMENT) });
    // Status: Zustimmung gilt weiter, Person unbekannt
    expect((await req(kai, "GET", `/orgs/${org}/avv`)).json()).toMatchObject({ upToDate: true, accepted: { acceptedBy: null, isCurrent: true } });
    expect(await db.execute(sql`select 1 as ok`)).toBeTruthy();
  });
});
