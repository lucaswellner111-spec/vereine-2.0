import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { BillingService } from "./billing.service";

const password = "ein-sehr-langes-passwort";
const dayOffset = (d: number) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);
const item = { description: "Mitgliedsbeitrag 2026", quantity: 1, unitCents: 12000, vatRate: 0 };

describe("Rechnungen (Verein -> Mitglied)", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let billing: BillingService;

  beforeAll(async () => {
    db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    billing = app.get(BillingService);
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

  let vera: U, kai: U, mia: U, ben: U, nina: U;
  const org = "sv-rechnung";
  const create = (u: U, recipient: U, extra: object = {}) =>
    req(u, "POST", `/orgs/${org}/invoices`, { recipientUserId: recipient.id, dueDate: dayOffset(14), items: [item], ...extra });

  beforeAll(async () => {
    [vera, kai, mia, ben, nina] = [await signup("vera"), await signup("kai"), await signup("mia"), await signup("ben"), await signup("nina")];
    await req(vera, "POST", "/orgs", { name: "SV Rechnung", category: "Sport", city: "Zahlstadt" });
    for (const m of [kai, mia, ben]) {
      await req(m, "POST", `/orgs/${org}/membership`);
      await req(vera, "POST", `/orgs/${org}/members/${m.id}/decision`, { decision: "approve" });
    }
    await req(vera, "PUT", `/orgs/${org}/members/${kai.id}/role`, { role: "treasurer" });
  });

  it("verlangt Anmeldung und die Rolle Vorstand/Kassenwart", async () => {
    expect((await req(null, "GET", `/orgs/${org}/invoices`)).statusCode).toBe(401);
    expect((await req(mia, "GET", `/orgs/${org}/invoices`)).statusCode).toBe(403);
    expect((await req(nina, "GET", `/orgs/${org}/invoices`)).statusCode).toBe(403);
    expect((await create(mia, ben)).statusCode).toBe(403);
    expect((await req(kai, "GET", `/orgs/${org}/invoices`)).statusCode).toBe(200); // Kassenwart darf
    // Verwaltungsseite: Kassenwart sieht den Verein, einfaches Mitglied nicht
    expect(((await req(kai, "GET", "/orgs/managed")).json() as { slug: string }[]).map((o) => o.slug)).toEqual([org]);
    expect((await req(mia, "GET", "/orgs/managed")).json()).toEqual([]);
  });

  it("legt Entwuerfe an, berechnet Summen und prueft den Empfaenger", async () => {
    const res = await create(kai, mia, {
      items: [item, { description: "Hallenmiete", quantity: 2, unitCents: 5000, vatRate: 19 }],
    });
    expect(res.statusCode).toBe(201);
    const inv = res.json();
    expect(inv.status).toBe("draft");
    expect(inv.number).toBeNull();
    expect(inv.netCents).toBe(22000);
    expect(inv.vatCents).toBe(1900);
    expect(inv.totalCents).toBe(23900);
    expect(inv.recipientName).toBe("mia");
    // Empfaenger muss aktives Mitglied sein
    expect((await create(vera, nina)).statusCode).toBe(400);
    // Validierung
    expect((await create(vera, mia, { items: [] })).statusCode).toBe(400);
    expect((await create(vera, mia, { items: [{ ...item, vatRate: 5 }] })).statusCode).toBe(400);
    expect((await create(vera, mia, { dueDate: "morgen" })).statusCode).toBe(400);
  });

  it("Entwuerfe sind fuer den Empfaenger unsichtbar, nur Entwuerfe sind loeschbar", async () => {
    const draft = (await create(vera, ben)).json();
    expect((await req(ben, "GET", `/invoices/${draft.id}`)).statusCode).toBe(404);
    expect(((await req(ben, "GET", "/billing/mine")).json() as unknown[]).length).toBe(0);
    expect((await req(ben, "DELETE", `/invoices/${draft.id}`)).statusCode).toBe(404);
    expect((await req(vera, "DELETE", `/invoices/${draft.id}`)).statusCode).toBe(204);
    expect((await req(vera, "GET", `/invoices/${draft.id}`)).statusCode).toBe(404);
  });

  it("Finalisieren vergibt lueckenlose Nummern, ist einmalig und benachrichtigt", async () => {
    const year = new Date().getFullYear();
    const a = (await create(vera, ben)).json();
    const b = (await create(vera, ben)).json();
    const fa = await req(vera, "POST", `/invoices/${a.id}/finalize`);
    expect(fa.statusCode).toBe(201);
    expect(fa.json().status).toBe("open");
    expect(fa.json().vatNote).toContain("ohne Umsatzsteuer");
    const fb = await req(vera, "POST", `/invoices/${b.id}/finalize`);
    const numbers = [fa.json().number, fb.json().number].map((n: string) => Number(n.split("-")[1]));
    expect(fa.json().number).toMatch(new RegExp(`^${year}-\\d{4}$`));
    expect(numbers[1]).toBe(numbers[0] + 1);
    // erneut finalisieren: nicht moeglich
    expect((await req(vera, "POST", `/invoices/${a.id}/finalize`)).statusCode).toBe(400);
    // Paralleles Finalisieren desselben Entwurfs: genau einer gewinnt, die Nummern bleiben lueckenlos
    const c = (await create(vera, ben)).json();
    const results = await Promise.all([1, 2, 3].map(() => req(vera, "POST", `/invoices/${c.id}/finalize`)));
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    const next = (await create(vera, ben)).json();
    const fn = await req(vera, "POST", `/invoices/${next.id}/finalize`);
    expect(Number(fn.json().number.split("-")[1])).toBe(numbers[1] + 2);
    // Benachrichtigung
    const notes = (await req(ben, "GET", "/notifications?limit=50")).json().items as { type: string; data: { number: string } }[];
    expect(notes.filter((n) => n.type === "invoice_new").map((n) => n.data.number)).toContain(fa.json().number);
  });

  it("Empfaenger sieht seine Rechnung, andere Mitglieder und Fremde nicht", async () => {
    const inv = (await create(vera, mia)).json();
    await req(vera, "POST", `/invoices/${inv.id}/finalize`);
    expect((await req(mia, "GET", `/invoices/${inv.id}`)).statusCode).toBe(200);
    expect((await req(ben, "GET", `/invoices/${inv.id}`)).statusCode).toBe(404);
    expect((await req(nina, "GET", `/invoices/${inv.id}`)).statusCode).toBe(404);
    expect((await req(mia, "GET", `/invoices/${inv.id}/pdf`)).statusCode).toBe(200);
    expect((await req(ben, "GET", `/invoices/${inv.id}/pdf`)).statusCode).toBe(404);
    const mine = (await req(mia, "GET", "/billing/mine")).json() as { id: string; orgSlug: string }[];
    expect(mine.some((i) => i.id === inv.id && i.orgSlug === org)).toBe(true);
    // Empfaenger darf nichts veraendern
    expect((await req(mia, "POST", `/invoices/${inv.id}/paid`)).statusCode).toBe(403);
    expect((await req(mia, "POST", `/invoices/${inv.id}/void`, { reason: "ich will nicht" })).statusCode).toBe(403);
  });

  it("bezahlt, Storno und ungueltige Uebergaenge", async () => {
    const inv = (await create(vera, ben)).json();
    expect((await req(vera, "POST", `/invoices/${inv.id}/paid`)).statusCode).toBe(400); // Entwurf
    expect((await req(vera, "POST", `/invoices/${inv.id}/void`, { reason: "Test Storno" })).statusCode).toBe(400);
    await req(vera, "POST", `/invoices/${inv.id}/finalize`);
    const paid = await req(kai, "POST", `/invoices/${inv.id}/paid`);
    expect(paid.statusCode).toBe(201);
    expect(paid.json().status).toBe("paid");
    expect(paid.json().paidAt).toBeTruthy();
    expect((await req(vera, "POST", `/invoices/${inv.id}/paid`)).statusCode).toBe(400);
    expect((await req(vera, "POST", `/invoices/${inv.id}/void`, { reason: "kurz" })).statusCode).toBe(400); // Begruendung zu kurz
    const voided = await req(vera, "POST", `/invoices/${inv.id}/void`, { reason: "Falscher Betrag" });
    expect(voided.json().status).toBe("void");
    expect(voided.json().voidReason).toBe("Falscher Betrag");
    expect((await req(vera, "POST", `/invoices/${inv.id}/void`, { reason: "nochmal Storno" })).statusCode).toBe(400);
    // Nummer bleibt erhalten (lueckenloser Nummernkreis)
    expect((await req(vera, "GET", `/invoices/${inv.id}`)).json().number).toMatch(/^\d{4}-\d{4}$/);
    // Zugriffe auf Finalisierung/Storno werden protokolliert
    const log = await db.select().from(schema.auditLog);
    expect(log.some((l) => l.action === "invoice.voided")).toBe(true);
    expect(log.some((l) => l.action === "invoice.finalized")).toBe(true);
  });

  it("Liste mit Filtern, Anzeigestatus 'ueberfaellig' und einmalige Erinnerung", async () => {
    const old = (await create(vera, ben, { dueDate: dayOffset(-3) })).json();
    await req(vera, "POST", `/invoices/${old.id}/finalize`);
    const detail = (await req(vera, "GET", `/invoices/${old.id}`)).json();
    expect(detail.status).toBe("open");
    expect(detail.displayStatus).toBe("overdue");
    const open = (await req(vera, "GET", `/orgs/${org}/invoices?status=open`)).json() as { status: string }[];
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((i) => i.status === "open")).toBe(true);
    expect(((await req(vera, "GET", `/orgs/${org}/invoices?status=bogus`)).json() as unknown[]).length).toBeGreaterThan(open.length);

    expect(await billing.notifyOverdue()).toBeGreaterThanOrEqual(1);
    expect(await billing.notifyOverdue()).toBe(0); // schon benachrichtigt
    const notes = (await req(ben, "GET", "/notifications?limit=50")).json().items as { type: string }[];
    expect(notes.filter((n) => n.type === "invoice_overdue")).toHaveLength(1);
  });

  it("PDF ist ein gueltiges Dokument mit Download-Header", async () => {
    const inv = (await create(vera, mia, { items: [{ description: "Größenwahn-Beitrag äöü € „Test“", quantity: 3, unitCents: 999, vatRate: 7 }] })).json();
    const res = await req(vera, "GET", `/invoices/${inv.id}/pdf`); // auch Entwurf als Vorschau
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(String(res.headers["content-disposition"])).toContain("attachment");
    expect(res.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect(res.rawPayload.length).toBeGreaterThan(1000);
  });

  it("CSV-Export: nur finalisierte, Semikolon/BOM, Formeln werden entschaerft, nur fuer Rechnungssteller", async () => {
    const evil = await signup("evil", "=cmd");
    await req(evil, "POST", `/orgs/${org}/membership`);
    await req(vera, "POST", `/orgs/${org}/members/${evil.id}/decision`, { decision: "approve" });
    const inv = (await create(vera, evil)).json();
    await req(vera, "POST", `/invoices/${inv.id}/finalize`);
    const res = await req(kai, "GET", `/orgs/${org}/invoices.csv`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const body = res.body;
    expect(body.startsWith("﻿Rechnungsnummer;")).toBe(true);
    expect(body).toContain("120,00");
    expect(body).toContain("'=cmd"); // Excel-Formel entschaerft
    expect(body).not.toMatch(/;=cmd/);
    expect(body.split("\r\n").filter((l) => /^\d{4}-\d{4};/.test(l)).length).toBeGreaterThan(3); // keine Entwuerfe ohne Nummer
    expect((await req(mia, "GET", `/orgs/${org}/invoices.csv`)).statusCode).toBe(403);
  });

  it("Kontoloeschung anonymisiert Rechnungen, behaelt sie aber (Aufbewahrung)", async () => {
    const gone = await signup("gert");
    await req(gone, "POST", `/orgs/${org}/membership`);
    await req(vera, "POST", `/orgs/${org}/members/${gone.id}/decision`, { decision: "approve" });
    const inv = (await create(vera, gone, { recipientAddress: "Musterweg 1\n12345 Zahlstadt" })).json();
    await req(vera, "POST", `/invoices/${inv.id}/finalize`);
    const exported = (await req(gone, "GET", "/privacy/export")).json();
    expect(exported.invoices).toHaveLength(1);
    expect(exported.invoices[0].recipientAddress).toContain("Musterweg");
    const del = await req(gone, "DELETE", "/privacy/account", { password });
    expect(del.statusCode).toBe(204);
    const after = (await req(vera, "GET", `/invoices/${inv.id}`)).json();
    expect(after.status).toBe("open");
    expect(after.recipientName).toBe("Gelöschtes Mitglied");
    expect(after.recipientAddress).toBe("");
    expect(after.recipientUserId).toBeNull();
    const [row] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, inv.id));
    expect(row.recipientUserId).toBeNull();
  });
});
