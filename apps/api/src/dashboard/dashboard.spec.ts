import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";

const password = "ein-sehr-langes-passwort";

describe("Vereinsübersicht (Dashboard)", () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
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
    const reg = await app.inject({ method: "POST", url: "/auth/register", payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true } });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: reg.json().id };
  }
  const req = (u: U | null, method: "GET" | "POST" | "PUT", url: string, payload?: object) => app.inject({ method, url, payload, headers: u ? { cookie: u.cookie } : {} });

  it("zeigt Kennzahlen aus Mitgliedern, Rechnungen und Terminen; nur Vorstand/Kassenwart", async () => {
    const [vera, kai, mia, ben, nina] = [await signup("vera"), await signup("kai"), await signup("mia"), await signup("ben"), await signup("nina")];
    const org = "sv-dash";
    await req(vera, "POST", "/orgs", { name: "SV Dash", category: "Sport", city: "Zahlenstadt" });
    for (const m of [kai, mia]) {
      await req(m, "POST", `/orgs/${org}/membership`);
      await req(vera, "POST", `/orgs/${org}/members/${m.id}/decision`, { decision: "approve" });
    }
    await req(vera, "PUT", `/orgs/${org}/members/${kai.id}/role`, { role: "treasurer" });
    await req(ben, "POST", `/orgs/${org}/membership`); // offen
    await req(vera, "PUT", `/orgs/${org}/member-registry/${mia.id}`, { joinedOn: "2024-01-01", birthDate: `${new Date().getUTCFullYear() - 10}-02-02` });
    const cls = (await req(vera, "POST", `/orgs/${org}/fee-classes`, { name: "Jugend", amountCents: 3000, interval: "yearly" })).json()[0].id;
    await req(vera, "PUT", `/orgs/${org}/member-registry/${mia.id}`, { joinedOn: "2024-01-01", birthDate: `${new Date().getUTCFullYear() - 10}-02-02`, feeClassId: cls });
    const inv = (await req(vera, "POST", `/orgs/${org}/invoices`, { recipientUserId: mia.id, dueDate: "2020-01-01", items: [{ description: "Beitrag", quantity: 1, unitCents: 3000, vatRate: 0 }] })).json();
    await req(vera, "POST", `/invoices/${inv.id}/finalize`);
    await req(vera, "POST", `/orgs/${org}/events`, { title: "Training", startsAt: new Date(Date.now() + 86400_000).toISOString() });

    expect((await req(null, "GET", `/orgs/${org}/dashboard`)).statusCode).toBe(401);
    for (const u of [mia, nina]) expect((await req(u, "GET", `/orgs/${org}/dashboard`)).statusCode).toBe(403);
    const d = (await req(kai, "GET", `/orgs/${org}/dashboard`)).json();
    expect(d).toMatchObject({ members: 3, pendingRequests: 1, minors: 1 });
    expect(d.invoices).toMatchObject({ open: 1, overdue: 1, openCents: 3000, paidThisYearCents: 0 });
    expect(d.upcomingEvents.map((e: { title: string }) => e.title)).toEqual(["Training"]);
    expect(d.byFeeClass).toEqual(expect.arrayContaining([{ name: "Jugend", members: 1 }, { name: "Ohne Klasse", members: 2 }]));
    expect(d.joinsByMonth).toHaveLength(12);
    expect(d.newMembers30d).toBeGreaterThanOrEqual(2);
  });
});
