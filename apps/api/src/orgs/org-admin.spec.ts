import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isValidIban } from "@vereine/shared";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";

const password = "ein-sehr-langes-passwort";
const IBAN = "DE89 3704 0044 0532 0130 00";

describe("Vereinsstammdaten und Einladungslinks", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    db = drizzle(new PGlite(), { schema });
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
    const reg = await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: reg.json().id };
  }
  const req = (u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: u ? { cookie: u.cookie } : {} });

  let vera: U, kai: U, mia: U, ben: U, tom: U, nina: U;
  const org = "sv-onboarding";

  beforeAll(async () => {
    [vera, kai, mia, ben, tom, nina] = [await signup("vera"), await signup("kai"), await signup("mia"), await signup("ben"), await signup("tom"), await signup("nina")];
    await req(vera, "POST", "/orgs", { name: "SV Onboarding", category: "Sport", city: "Startstadt" });
    for (const m of [kai, mia]) {
      await req(m, "POST", `/orgs/${org}/membership`);
      await req(vera, "POST", `/orgs/${org}/members/${m.id}/decision`, { decision: "approve" });
    }
    await req(vera, "PUT", `/orgs/${org}/members/${kai.id}/role`, { role: "treasurer" });
  });

  it("IBAN-Pruefsumme", () => {
    expect(isValidIban(IBAN)).toBe(true);
    expect(isValidIban("DE89 3704 0044 0532 0130 01")).toBe(false);
    expect(isValidIban("XX")).toBe(false);
  });

  it("Stammdaten: Vorstand schreibt, Kassenwart liest, andere nicht; IBAN wird geprueft und normalisiert", async () => {
    expect((await req(null, "GET", `/orgs/${org}/billing-profile`)).statusCode).toBe(401);
    expect((await req(mia, "GET", `/orgs/${org}/billing-profile`)).statusCode).toBe(403);
    expect((await req(kai, "PUT", `/orgs/${org}/billing-profile`, { address: "x" })).statusCode).toBe(403);
    expect((await req(vera, "PUT", `/orgs/${org}/billing-profile`, { iban: "DE00 1234" })).statusCode).toBe(400);
    const ok = await req(vera, "PUT", `/orgs/${org}/billing-profile`, { address: "Vereinsweg 1\n12345 Startstadt", iban: IBAN, taxInfo: "Freistellungsbescheid vom 01.01.2026" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().iban).toBe("DE89370400440532013000");
    const read = await req(kai, "GET", `/orgs/${org}/billing-profile`);
    expect(read.json().address).toContain("Vereinsweg 1");
    // Stammdaten duerfen nicht ueber die oeffentlichen Vereinsendpunkte auslaufen
    for (const url of [`/orgs/${org}`, "/orgs", "/orgs/managed"]) {
      const body = (await req(nina, "GET", url)).body;
      expect(body).not.toContain("DE8937");
      expect(body).not.toContain("Vereinsweg");
    }
  });

  it("Rechnungen uebernehmen die Stammdaten als Kopie", async () => {
    const created = await req(vera, "POST", `/orgs/${org}/invoices`, {
      recipientUserId: mia.id,
      dueDate: "2030-01-31",
      items: [{ description: "Jahresbeitrag", quantity: 1, unitCents: 5000, vatRate: 0 }],
    });
    const inv = created.json();
    expect(inv.issuerIban).toBe("DE89370400440532013000");
    await req(vera, "PUT", `/orgs/${org}/billing-profile`, { address: "Neue Anschrift 2", iban: "", taxInfo: "" });
    const again = (await req(vera, "GET", `/invoices/${inv.id}`)).json();
    expect(again.issuerIban).toBe("DE89370400440532013000"); // unveraendert
    expect(again.issuerAddress).toContain("Vereinsweg 1");
    const pdf = await req(vera, "GET", `/invoices/${inv.id}/pdf`);
    expect(pdf.statusCode).toBe(200);
  });

  let token: string;
  let inviteId: string;
  it("Einladungen: nur Vorstand, Token nur einmal sichtbar, Hash in der Datenbank", async () => {
    expect((await req(mia, "POST", `/orgs/${org}/invites`, {})).statusCode).toBe(403);
    expect((await req(kai, "GET", `/orgs/${org}/invites`)).statusCode).toBe(403);
    const created = await req(vera, "POST", `/orgs/${org}/invites`, { maxUses: 2, expiresInDays: 7 });
    expect(created.statusCode).toBe(201);
    token = created.json().token;
    inviteId = created.json().id;
    expect(token.length).toBeGreaterThanOrEqual(40);
    const list = (await req(vera, "GET", `/orgs/${org}/invites`)).json();
    expect(JSON.stringify(list)).not.toContain(token);
    expect(list[0]).toMatchObject({ id: inviteId, maxUses: 2, uses: 0, status: "active" });
    const [row] = await db.select().from(schema.orgInvites).where(eq(schema.orgInvites.id, inviteId));
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toHaveLength(64);
  });

  it("Beitritt per Link: sofort aktives Mitglied und Follower, Mehrfachnutzung zaehlt nicht doppelt", async () => {
    expect((await req(null, "GET", `/invites/${token}`)).statusCode).toBe(401);
    expect((await req(ben, "GET", "/invites/falscher-token")).statusCode).toBe(404);
    const info = (await req(ben, "GET", `/invites/${token}`)).json();
    expect(info).toMatchObject({ orgName: "SV Onboarding", orgSlug: org, alreadyMember: false });
    const acc = await req(ben, "POST", `/invites/${token}/accept`);
    expect(acc.statusCode).toBe(200);
    const detail = (await req(ben, "GET", `/orgs/${org}`)).json();
    expect(detail.viewer).toMatchObject({ membership: "active", role: "member", following: true });
    // erneut annehmen: bereits Mitglied, kein weiterer Verbrauch
    expect((await req(ben, "POST", `/invites/${token}/accept`)).json().alreadyMember).toBe(true);
    expect((await req(vera, "GET", `/orgs/${org}/invites`)).json()[0].uses).toBe(1);
  });

  it("Ausstehende Antraege werden durch den Link freigeschaltet", async () => {
    await req(tom, "POST", `/orgs/${org}/membership`); // pending
    expect((await req(tom, "GET", `/orgs/${org}`)).json().viewer.membership).toBe("pending");
    await req(tom, "POST", `/invites/${token}/accept`);
    expect((await req(tom, "GET", `/orgs/${org}`)).json().viewer.membership).toBe("active");
  });

  it("Limit erreicht: weitere Annahmen scheitern einheitlich", async () => {
    const res = await req(nina, "POST", `/invites/${token}/accept`);
    expect(res.statusCode).toBe(404);
    expect((await req(nina, "GET", `/invites/${token}`)).statusCode).toBe(404);
    expect((await req(nina, "GET", `/orgs/${org}`)).json().viewer.membership).toBe("none");
  });

  it("Parallele Annahmen ueberschreiten das Limit nicht", async () => {
    const one = (await req(vera, "POST", `/orgs/${org}/invites`, { maxUses: 1, expiresInDays: 1 })).json();
    const racers = await Promise.all([signup("r1"), signup("r2"), signup("r3")]);
    const results = await Promise.all(racers.map((r) => req(r, "POST", `/invites/${one.token}/accept`)));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    const [row] = await db.select().from(schema.orgInvites).where(eq(schema.orgInvites.id, one.id));
    expect(row.uses).toBe(1);
  });

  it("Widerruf und Ablauf machen Links ungueltig", async () => {
    const a = (await req(vera, "POST", `/orgs/${org}/invites`, {})).json();
    expect((await req(mia, "DELETE", `/orgs/${org}/invites/${a.id}`)).statusCode).toBe(403);
    expect((await req(vera, "DELETE", `/orgs/${org}/invites/${a.id}`)).statusCode).toBe(204);
    expect((await req(nina, "GET", `/invites/${a.token}`)).statusCode).toBe(404);
    expect((await req(vera, "DELETE", `/orgs/${org}/invites/${a.id}`)).statusCode).toBe(404); // schon widerrufen

    const b = (await req(vera, "POST", `/orgs/${org}/invites`, {})).json();
    await db.update(schema.orgInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.orgInvites.id, b.id));
    expect((await req(nina, "POST", `/invites/${b.token}/accept`)).statusCode).toBe(404);
    expect((await req(vera, "GET", `/orgs/${org}/invites`)).json().find((i: { id: string }) => i.id === b.id).status).toBe("expired");
  });

  it("Validierung und Obergrenze aktiver Links", async () => {
    expect((await req(vera, "POST", `/orgs/${org}/invites`, { maxUses: 0 })).statusCode).toBe(400);
    expect((await req(vera, "POST", `/orgs/${org}/invites`, { expiresInDays: 999 })).statusCode).toBe(400);
    let last = 201;
    for (let i = 0; i < 25 && last === 201; i++) last = (await req(vera, "POST", `/orgs/${org}/invites`, {})).statusCode;
    expect(last).toBe(400);
  });
});
