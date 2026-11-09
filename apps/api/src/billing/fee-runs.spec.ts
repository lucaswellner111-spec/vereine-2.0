import "reflect-metadata";
import { join } from "node:path";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FeeClassItem, FeeRunItem, FeeRunPreview, InvoiceDetail, InvoiceSummary, NotificationsResponse } from "@vereine/shared";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { createTestDb } from "../testing/test-db";
import { JobsService } from "../jobs/jobs.service";
import { MembersService } from "../members/members.service";
import { NotificationsService } from "../notifications/notifications.service";
import { FEE_RUN_MAX_ATTEMPTS, FeeRunsService } from "./fee-runs.service";

const password = "ein-sehr-langes-passwort";
const dayOffset = (d: number) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);

describe("Beitragslauf (Entwuerfe je Beitragsklasse)", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let runs: FeeRunsService;

  beforeAll(async () => {
    db = await createTestDb();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    runs = app.get(FeeRunsService);
  });

  afterAll(async () => {
    await app.close();
  });

  type U = { cookie: string; id: string };
  async function signup(name: string, displayName = name): Promise<U> {
    const email = `${name}@example.de`;
    const reg = await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email, password, displayName, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: reg.json().id };
  }
  const req = (u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: u ? { cookie: u.cookie } : {} });

  const org = "sv-beitragslauf";
  let vera: U, kai: U, moni: U, mia: U, ben: U, lea: U, tom: U;
  let adults: FeeClassItem, youth: FeeClassItem, other: FeeClassItem;

  beforeAll(async () => {
    [vera, kai, moni, mia, ben, lea, tom] = [
      await signup("fr-vera", "Vera Vorstand"), await signup("fr-kai", "Kai Kasse"), await signup("fr-moni", "Moni Moderation"),
      await signup("fr-mia", "Mia Muster"), await signup("fr-ben", "Ben Beispiel"), await signup("fr-lea", "Lea Leer"), await signup("fr-tom", "Tom Tschuess"),
    ];
    await req(vera, "POST", "/orgs", { name: "SV Beitragslauf", category: "Sport", city: "Zahlstadt" });
    for (const m of [kai, moni, mia, ben, lea, tom]) {
      await req(m, "POST", `/orgs/${org}/membership`);
      await req(vera, "POST", `/orgs/${org}/members/${m.id}/decision`, { decision: "approve" });
    }
    await req(vera, "PUT", `/orgs/${org}/members/${kai.id}/role`, { role: "treasurer" });
    await req(vera, "PUT", `/orgs/${org}/members/${moni.id}/role`, { role: "moderator" });
    await req(vera, "PUT", `/orgs/${org}/billing-profile`, { address: "Vereinsweg 1", iban: "DE89 3704 0044 0532 0130 00", taxInfo: "" });
    await req(vera, "POST", `/orgs/${org}/fee-classes`, { name: "Erwachsene", amountCents: 12000, interval: "yearly" });
    await req(vera, "POST", `/orgs/${org}/fee-classes`, { name: "Jugend", amountCents: 6000, interval: "yearly" });
    const classes = (await req(vera, "POST", `/orgs/${org}/fee-classes`, { name: "Passiv", amountCents: 2400, interval: "yearly" })).json() as FeeClassItem[];
    adults = classes.find((c) => c.name === "Erwachsene")!;
    youth = classes.find((c) => c.name === "Jugend")!;
    other = classes.find((c) => c.name === "Passiv")!;

    const assign = async (u: U, feeClassId: string | null, extra: object = {}) => {
      const rec = (await req(vera, "GET", `/orgs/${org}/member-registry/${u.id}`)).json();
      const res = await req(vera, "PUT", `/orgs/${org}/member-registry/${u.id}`, { ...rec, feeClassId, ...extra });
      expect(res.statusCode).toBe(200);
    };
    await assign(mia, adults.id, { street: "Hauptstr. 5", zip: "12345", city: "Zahlstadt" });
    await assign(ben, youth.id);
    await assign(tom, adults.id, { street: "Weg 1", zip: "11111", city: "Fort" });
    await assign(kai, other.id);
    // lea und moni ohne Klasse; vera ohne Klasse
  });

  const body = (extra: object = {}) => ({ periodLabel: "2027", dueDate: dayOffset(30), feeClassIds: [adults.id, youth.id], ...extra });

  it("Rechte: Vorstand und Kassenwart ja, Moderation, Mitglied und Fremde 403, ohne Anmeldung 401", async () => {
    expect((await req(null, "POST", `/orgs/${org}/fee-runs/preview`, body())).statusCode).toBe(401);
    expect((await req(moni, "POST", `/orgs/${org}/fee-runs/preview`, body())).statusCode).toBe(403);
    expect((await req(moni, "POST", `/orgs/${org}/fee-runs`, body())).statusCode).toBe(403);
    expect((await req(moni, "GET", `/orgs/${org}/fee-runs`)).statusCode).toBe(403);
    expect((await req(mia, "POST", `/orgs/${org}/fee-runs/preview`, body())).statusCode).toBe(403);
    expect((await req(kai, "POST", `/orgs/${org}/fee-runs/preview`, body())).statusCode).toBe(200);
    expect((await req(vera, "GET", `/orgs/${org}/fee-runs`)).statusCode).toBe(200);
  });

  it("prueft Eingaben (Zeitraum, Klassen, Faelligkeit, fremde Klasse)", async () => {
    expect((await req(kai, "POST", `/orgs/${org}/fee-runs/preview`, body({ periodLabel: "" }))).statusCode).toBe(400);
    expect((await req(kai, "POST", `/orgs/${org}/fee-runs/preview`, body({ periodLabel: "x".repeat(41) }))).statusCode).toBe(400);
    expect((await req(kai, "POST", `/orgs/${org}/fee-runs/preview`, body({ feeClassIds: [] }))).statusCode).toBe(400);
    expect((await req(kai, "POST", `/orgs/${org}/fee-runs/preview`, body({ feeClassIds: [adults.id, adults.id] }))).statusCode).toBe(400);
    expect((await req(kai, "POST", `/orgs/${org}/fee-runs/preview`, body({ feeClassIds: ["00000000-0000-4000-8000-000000000001"] }))).statusCode).toBe(400);
    expect((await req(kai, "POST", `/orgs/${org}/fee-runs`, body({ dueDate: dayOffset(-3), periodLabel: "alt" }))).statusCode).toBe(400);
  });

  it("Vorschau: Anzahl, Summe, je Klasse und Mitglieder ohne Klasse", async () => {
    const res = await req(kai, "POST", `/orgs/${org}/fee-runs/preview`, body());
    const p = res.json() as FeeRunPreview;
    expect(p.count).toBe(3); // mia, tom (Erwachsene), ben (Jugend)
    expect(p.totalCents).toBe(2 * 12000 + 6000);
    expect(p.byClass).toEqual([
      { feeClassId: adults.id, name: "Erwachsene", amountCents: 12000, members: 2, totalCents: 24000 },
      { feeClassId: youth.id, name: "Jugend", amountCents: 6000, members: 1, totalCents: 6000 },
    ]);
    expect(p.withoutClass).toBe(3); // vera, moni, lea
    expect(JSON.stringify(p)).not.toMatch(/Mia|Hauptstr/); // Vorschau ohne Personendaten
  });

  it("Lauf erzeugt Entwuerfe ohne Ausgetretene, mit Anschrift; doppelter Zeitraum 409; Benachrichtigung", async () => {
    // tom tritt aus, bevor der Lauf startet
    expect((await req(tom, "DELETE", `/orgs/${org}/members/${tom.id}`)).statusCode).toBe(204);
    const res = await req(kai, "POST", `/orgs/${org}/fee-runs`, body());
    expect(res.statusCode).toBe(201);
    const run = res.json() as FeeRunItem;
    expect(run).toMatchObject({ periodLabel: "2027", status: "done", createdCount: 2, skippedCount: 0 }); // inline: sofort fertig
    expect((await req(vera, "POST", `/orgs/${org}/fee-runs`, body())).statusCode).toBe(409);

    const list = (await req(kai, "GET", `/orgs/${org}/invoices?status=draft`)).json() as InvoiceSummary[];
    expect(list.map((i) => i.recipientName).sort()).toEqual(["Ben Beispiel", "Mia Muster"]);
    const miaInv = list.find((i) => i.recipientName === "Mia Muster")!;
    const detail = (await req(kai, "GET", `/invoices/${miaInv.id}`)).json() as InvoiceDetail;
    expect(detail).toMatchObject({ status: "draft", dueDate: body().dueDate, totalCents: 12000, vatCents: 0, recipientAddress: "Hauptstr. 5\n12345 Zahlstadt", issuerIban: "DE89370400440532013000" });
    expect(detail.items).toEqual([{ description: "Erwachsene 2027", quantity: 1, unitCents: 12000, vatRate: 0 }]);
    // Entwuerfe sehen Empfaenger nicht
    expect((await req(mia, "GET", `/invoices/${miaInv.id}`)).statusCode).toBe(404);

    const notes = (await req(kai, "GET", "/notifications")).json() as NotificationsResponse;
    const done = notes.items.filter((n) => n.type === "fee_run_done");
    expect(done).toHaveLength(1);
    expect(done[0].data).toMatchObject({ periodLabel: "2027", created: "2", orgSlug: org });
    expect((await req(kai, "GET", `/orgs/${org}/fee-runs`)).json()).toEqual([expect.objectContaining({ id: run.id, status: "done", createdCount: 2 })]);
  });

  it("Job zweimal / erneut nach Fehler: keine Duplikate", async () => {
    const [row] = await db.select().from(schema.feeRuns).where(eq(schema.feeRuns.periodLabel, "2027"));
    // fertiger Lauf wird nicht erneut geclaimt
    expect(await runs.execute(row.id)).toBeNull();
    // nach Fehlschlag (Status failed) laeuft er erneut, legt aber nichts doppelt an
    await db.update(schema.feeRuns).set({ status: "failed" }).where(eq(schema.feeRuns.id, row.id));
    expect(await runs.execute(row.id)).toBe(2);
    expect(await runs.execute(row.id)).toBeNull();
    const all = await db.select().from(schema.invoices).where(eq(schema.invoices.feeRunId, row.id));
    expect(all).toHaveLength(2);
    const items = await db.select().from(schema.invoiceItems);
    expect(items.filter((i) => all.some((a) => a.id === i.invoiceId))).toHaveLength(2);
    // parallele Ausfuehrung: nur ein Claim gewinnt
    await db.update(schema.feeRuns).set({ status: "queued" }).where(eq(schema.feeRuns.id, row.id));
    const results = await Promise.all([runs.execute(row.id), runs.execute(row.id), runs.execute(row.id)]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(await db.select().from(schema.invoices).where(eq(schema.invoices.feeRunId, row.id))).toHaveLength(2);
    // haengender Lauf (running, Claim aelter als 15 Min.) darf erneut geclaimt werden, frischer nicht
    await db.update(schema.feeRuns).set({ status: "running" }).where(eq(schema.feeRuns.id, row.id));
    expect(await runs.execute(row.id)).toBeNull();
    await db.update(schema.feeRuns).set({ status: "running", heartbeatAt: new Date(Date.now() - 20 * 60_000) }).where(eq(schema.feeRuns.id, row.id));
    expect(await runs.execute(row.id)).toBe(2);
  });

  it("Finalisieren bleibt manuell; geloeschte Entwuerfe stoeren den Lauf nicht", async () => {
    const list = (await req(kai, "GET", `/orgs/${org}/invoices?status=draft`)).json() as InvoiceSummary[];
    expect(list.every((i) => i.number === null)).toBe(true);
    const fin = await req(kai, "POST", `/invoices/${list[0].id}/finalize`);
    expect(fin.statusCode).toBe(201);
    expect((fin.json() as InvoiceDetail).status).toBe("open");
  });

  const runRow = async (periodLabel: string) => (await db.select().from(schema.feeRuns).where(eq(schema.feeRuns.periodLabel, periodLabel)))[0];
  const drafts = async (runId: string) => (await db.select().from(schema.invoices).where(eq(schema.invoices.feeRunId, runId))).length;
  const ago = (min: number) => new Date(Date.now() - min * 60_000);

  it("Vorschau meldet einen schon vorhandenen Zeitraum", async () => {
    expect(((await req(kai, "POST", `/orgs/${org}/fee-runs/preview`, body())).json() as FeeRunPreview).periodTaken).toBe(true);
    expect(((await req(kai, "POST", `/orgs/${org}/fee-runs/preview`, body({ periodLabel: "2099" }))).json() as FeeRunPreview).periodTaken).toBe(false);
  });

  it("Stall: haengender Lauf wird vom Sweep nachgeholt; frisches Lebenszeichen verhindert doppelten Claim", async () => {
    expect((await req(kai, "POST", `/orgs/${org}/fee-runs`, body({ periodLabel: "2028" }))).statusCode).toBe(201);
    const run = await runRow("2028");
    expect(run.heartbeatAt).not.toBeNull();
    expect(run.attempts).toBe(1);
    // Worker stirbt mitten im Lauf: Status running, Entwuerfe noch nicht da
    await db.delete(schema.invoices).where(eq(schema.invoices.feeRunId, run.id));
    await db.update(schema.feeRuns).set({ status: "running", heartbeatAt: new Date() }).where(eq(schema.feeRuns.id, run.id));
    expect(await runs.sweep()).toBe(0); // Lebenszeichen frisch: kein zweiter Claim
    expect(await runs.execute(run.id)).toBeNull();
    expect(await drafts(run.id)).toBe(0);
    await db.update(schema.feeRuns).set({ heartbeatAt: ago(20) }).where(eq(schema.feeRuns.id, run.id));
    expect(await runs.sweep()).toBe(1);
    expect(await drafts(run.id)).toBe(2);
    expect(await runRow("2028")).toMatchObject({ status: "done", createdCount: 2, attempts: 2 });
  });

  it("fehlgeschlagenes enqueue: Lauf bleibt queued und wird nach 1 Min. nachgeholt", async () => {
    const spy = vi.spyOn(app.get(JobsService), "enqueue").mockRejectedValueOnce(new Error("Queue nicht erreichbar"));
    const res = await req(kai, "POST", `/orgs/${org}/fee-runs`, body({ periodLabel: "2029" }));
    spy.mockRestore();
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: "queued", createdCount: 0, attempts: 0 });
    const run = await runRow("2029");
    expect(await runs.sweep()).toBe(0); // juenger als 1 Minute
    await db.update(schema.feeRuns).set({ createdAt: ago(2) }).where(eq(schema.feeRuns.id, run.id));
    expect(await runs.sweep()).toBe(1);
    expect(await runRow("2029")).toMatchObject({ status: "done", createdCount: 2 });
    expect(await drafts(run.id)).toBe(2);
  });

  it(`nach ${FEE_RUN_MAX_ATTEMPTS} Versuchen keine automatische Wiederholung; haengend wird failed`, async () => {
    const run = await runRow("2029");
    await db.update(schema.feeRuns).set({ status: "failed", attempts: FEE_RUN_MAX_ATTEMPTS }).where(eq(schema.feeRuns.id, run.id));
    expect(await runs.execute(run.id)).toBeNull();
    await db.update(schema.feeRuns).set({ status: "queued", createdAt: ago(5) }).where(eq(schema.feeRuns.id, run.id));
    expect(await runs.sweep()).toBe(0);
    await db.update(schema.feeRuns).set({ status: "running", heartbeatAt: ago(30) }).where(eq(schema.feeRuns.id, run.id));
    expect(await runs.sweep()).toBe(0);
    expect((await runRow("2029")).status).toBe("failed");
  });

  it("Erneut versuchen: nur failed (409), nur eigener Verein (404), Moderation 403; setzt Versuche zurueck", async () => {
    const run = await runRow("2029"); // failed mit ausgeschoepften Versuchen
    const done = await runRow("2028");
    await req(vera, "POST", "/orgs", { name: "SV Fremdlauf", category: "Sport", city: "Anderswo" });
    expect((await req(vera, "POST", `/orgs/sv-fremdlauf/fee-runs/${run.id}/retry`)).statusCode).toBe(404);
    expect((await req(moni, "POST", `/orgs/${org}/fee-runs/${run.id}/retry`)).statusCode).toBe(403);
    expect((await req(kai, "POST", `/orgs/${org}/fee-runs/${done.id}/retry`)).statusCode).toBe(409);
    expect((await req(kai, "POST", `/orgs/${org}/fee-runs/not-a-uuid/retry`)).statusCode).toBe(400);
    const res = await req(kai, "POST", `/orgs/${org}/fee-runs/${run.id}/retry`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "done", attempts: 1, createdCount: 2 });
    expect(await drafts(run.id)).toBe(2); // keine Duplikate
  });

  it("Benachrichtigungsfehler setzt den Lauf nicht auf failed", async () => {
    const spy = vi.spyOn(app.get(NotificationsService), "notify").mockRejectedValueOnce(new Error("kaputt"));
    const res = await req(kai, "POST", `/orgs/${org}/fee-runs`, body({ periodLabel: "2030" }));
    spy.mockRestore();
    expect(res.json()).toMatchObject({ status: "done", createdCount: 2 });
  });

  it("Bereichsgrenze: billing liest Anschrift nur ueber MembersService", async () => {
    const src = (await import("node:fs")).readFileSync(join(__dirname, "fee-runs.service.ts"), "utf8");
    expect(src).not.toMatch(/memberProfiles|feeClasses\b(?!Of)/);
    expect(src).toMatch(/members\.feeRunCandidates/);
  });
});

describe("Beitragslauf ohne Grenze bei 2000 Mitgliedern", () => {
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

  it("erzeugt Entwuerfe fuer alle Mitglieder ueber 2000 (Keyset, keine stille Grenze)", async () => {
    const email = "gross-vera@example.de";
    await app.inject({ method: "POST", url: "/auth/register", payload: { email, password, displayName: "Vera", confirmAge16: true, acceptTerms: true, acceptPrivacy: true } });
    const cookie = String((await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } })).headers["set-cookie"]).split(";")[0];
    const call = (method: "GET" | "POST", url: string, payload?: object) => app.inject({ method, url, payload, headers: { cookie } });
    await call("POST", "/orgs", { name: "SV Gross", category: "Sport", city: "Riesenstadt" });
    const [orgRow] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, "sv-gross"));
    const N = 2050;
    for (let i = 0; i < N; i += 500) {
      const ids = await db
        .insert(schema.users)
        .values(Array.from({ length: Math.min(500, N - i) }, (_, k) => ({ email: `gross-${i + k}@example.de`, passwordHash: "x", displayName: `Mitglied ${i + k}` })))
        .returning({ id: schema.users.id });
      await db.insert(schema.orgMembers).values(ids.map((u) => ({ orgId: orgRow.id, userId: u.id, role: "member", status: "active" })));
    }
    const classes = (await call("POST", "/orgs/sv-gross/fee-classes", { name: "Alle", amountCents: 1000, interval: "yearly" })).json() as FeeClassItem[];
    // Profile anlegen (ensureProfiles) und allen die Klasse geben
    const before = await app.get(MembersService).feeRunCandidates(orgRow.id, [classes[0].id]);
    expect(before.withoutClass).toBe(N + 1); // inkl. Vorstand: alle haben ein Profil bekommen
    await db.update(schema.memberProfiles).set({ feeClassId: classes[0].id }).where(eq(schema.memberProfiles.orgId, orgRow.id));

    const input = { periodLabel: "2027", dueDate: dayOffset(30), feeClassIds: [classes[0].id] };
    expect(((await call("POST", "/orgs/sv-gross/fee-runs/preview", input)).json() as FeeRunPreview).count).toBe(N + 1);
    const res = await call("POST", "/orgs/sv-gross/fee-runs", input);
    expect(res.json()).toMatchObject({ status: "done", createdCount: N + 1, skippedCount: 0 });
    const nos = await db.select({ no: schema.memberProfiles.memberNo }).from(schema.memberProfiles).where(eq(schema.memberProfiles.orgId, orgRow.id));
    expect(Math.max(...nos.map((r) => r.no))).toBe(N + 1);
    expect(new Set(nos.map((r) => r.no)).size).toBe(N + 1);
  }, 120_000);
});
