import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";

const password = "ein-sehr-langes-passwort";
const years = (n: number) => `${new Date().getUTCFullYear() - n}-01-15`;

describe("Mitgliederverwaltung", () => {
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

  let vera: U, kai: U, mo: U, mia: U, ben: U, evil: U, nina: U;
  const org = "sv-mitglieder";
  const reg = `/orgs/${org}/member-registry`;
  const full = (o: object = {}) => ({ street: "", zip: "", city: "", phone: "", birthDate: "", guardianName: "", guardianEmail: "", feeClassId: null, joinedOn: "2024-03-01", notes: "", ...o });

  beforeAll(async () => {
    [vera, kai, mo, mia, ben, evil, nina] = [await signup("vera"), await signup("kai"), await signup("mo"), await signup("mia"), await signup("ben"), await signup("evil", "=Boese"), await signup("nina")];
    await req(vera, "POST", "/orgs", { name: "SV Mitglieder", category: "Sport", city: "Listenstadt" });
    for (const m of [kai, mo, mia, ben, evil]) {
      await req(m, "POST", `/orgs/${org}/membership`);
      await req(vera, "POST", `/orgs/${org}/members/${m.id}/decision`, { decision: "approve" });
    }
    await req(vera, "PUT", `/orgs/${org}/members/${kai.id}/role`, { role: "treasurer" });
    await req(vera, "PUT", `/orgs/${org}/members/${mo.id}/role`, { role: "moderator" });
  });

  it("Zugriff: nur Vorstand/Kassenwart lesen, nur Vorstand aendert und exportiert", async () => {
    expect((await req(null, "GET", reg)).statusCode).toBe(401);
    for (const u of [mia, mo, nina]) expect((await req(u, "GET", reg)).statusCode).toBe(403);
    expect((await req(kai, "GET", reg)).statusCode).toBe(200);
    expect((await req(kai, "PUT", `${reg}/${mia.id}`, full())).statusCode).toBe(403);
    expect((await req(kai, "GET", `${reg}.csv`)).statusCode).toBe(403);
    expect((await req(mia, "GET", `/orgs/${org}/fee-classes`)).statusCode).toBe(403);
    expect((await req(kai, "POST", `/orgs/${org}/fee-classes`, { name: "Test", amountCents: 100, interval: "yearly" })).statusCode).toBe(403);
  });

  it("Mitgliedsnummern: lueckenlos, stabil und auch bei parallelen Aufrufen ohne Doppelte", async () => {
    const results = await Promise.all([req(vera, "GET", reg), req(vera, "GET", reg), req(kai, "GET", reg)]);
    for (const r of results) expect(r.statusCode).toBe(200);
    const page = (await req(vera, "GET", reg)).json();
    expect(page.total).toBe(6);
    const numbers = page.items.map((i: { memberNo: number }) => i.memberNo).sort((a: number, b: number) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
    const again = (await req(vera, "GET", reg)).json();
    expect(again.items.map((i: { memberNo: number; userId: string }) => `${i.userId}:${i.memberNo}`).sort()).toEqual(page.items.map((i: { memberNo: number; userId: string }) => `${i.userId}:${i.memberNo}`).sort());
    // keine E-Mail-Adressen in der Liste (Datensparsamkeit)
    expect(JSON.stringify(page)).not.toContain("@example.de");
  });

  it("Beitragsklassen: anlegen, Namen eindeutig, Zaehler, Validierung, Loeschen", async () => {
    const created = await req(vera, "POST", `/orgs/${org}/fee-classes`, { name: "Erwachsene", amountCents: 12000, interval: "yearly", description: "Jahresbeitrag" });
    expect(created.statusCode).toBe(201);
    expect((await req(vera, "POST", `/orgs/${org}/fee-classes`, { name: "Erwachsene", amountCents: 1, interval: "yearly" })).statusCode).toBe(409);
    expect((await req(vera, "POST", `/orgs/${org}/fee-classes`, { name: "K", amountCents: -5, interval: "yearly" })).statusCode).toBe(400);
    expect((await req(vera, "POST", `/orgs/${org}/fee-classes`, { name: "Jugend", amountCents: 3000, interval: "weekly" })).statusCode).toBe(400);
    const list = (await req(vera, "POST", `/orgs/${org}/fee-classes`, { name: "Jugend", amountCents: 3600, interval: "yearly" })).json() as { id: string; name: string }[];
    expect(list.map((c) => c.name)).toEqual(["Erwachsene", "Jugend"]);
    const adult = list.find((c) => c.name === "Erwachsene")!.id;
    const updated = (await req(vera, "PUT", `/orgs/${org}/fee-classes/${adult}`, { name: "Erwachsene", amountCents: 13000, interval: "yearly" })).json();
    expect(updated.find((c: { id: string }) => c.id === adult).amountCents).toBe(13000);
    expect((await req(kai, "GET", `/orgs/${org}/fee-classes`)).statusCode).toBe(200); // Kassenwart darf lesen
  });

  it("Stammdaten bearbeiten: Validierung, Beitragsklasse, Minderjaehrige, Protokoll ohne Inhalte", async () => {
    const classes = (await req(vera, "GET", `/orgs/${org}/fee-classes`)).json() as { id: string; name: string }[];
    const youth = classes.find((c) => c.name === "Jugend")!.id;
    const bad = (o: object) => req(vera, "PUT", `${reg}/${ben.id}`, full(o));
    expect((await bad({ birthDate: "2999-01-01" })).statusCode).toBe(400);
    expect((await bad({ birthDate: "gestern" })).statusCode).toBe(400);
    expect((await bad({ guardianEmail: "keine-mail" })).statusCode).toBe(400);
    expect((await bad({ feeClassId: "00000000-0000-4000-8000-000000000000" })).statusCode).toBe(400);
    expect((await bad({ joinedOn: "x" })).statusCode).toBe(400);

    const res = await req(vera, "PUT", `${reg}/${ben.id}`, full({ street: "Weg 1", zip: "12345", city: "Listenstadt", phone: "0123", birthDate: years(12), guardianName: "Erika Ben", guardianEmail: "erika@example.de", feeClassId: youth, notes: "Trikotgröße M" }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ street: "Weg 1", minor: true, feeClassId: youth, guardianName: "Erika Ben" });
    const detail = (await req(kai, "GET", `${reg}/${ben.id}`)).json(); // Kassenwart sieht Anschrift (fuer Rechnungen)
    expect(detail.street).toBe("Weg 1");
    expect((await req(vera, "PUT", `${reg}/${mia.id}`, full({ birthDate: years(30) }))).json().minor).toBe(false);
    const log = (await db.select().from(schema.auditLog)).filter((l) => l.action === "member.profile.updated");
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(log)).not.toContain("Weg 1"); // keine Inhalte im Protokoll
    // Zaehler der Klasse
    const counted = ((await req(vera, "GET", `/orgs/${org}/fee-classes`)).json() as { id: string; members: number }[]).find((c) => c.id === youth)!;
    expect(counted.members).toBe(1);
  });

  it("Suche und Filter in der Liste", async () => {
    const youth = ((await req(vera, "GET", `/orgs/${org}/fee-classes`)).json() as { id: string; name: string }[]).find((c) => c.name === "Jugend")!.id;
    expect((await req(vera, "GET", `${reg}?q=ben`)).json().items.map((i: { name: string }) => i.name)).toEqual(["ben"]);
    expect((await req(vera, "GET", `${reg}?q=listenstadt`)).json().total).toBe(1); // Ort
    expect((await req(vera, "GET", `${reg}?feeClassId=${youth}`)).json().total).toBe(1);
    const numberOfMia = (await req(vera, "GET", `${reg}?q=mia`)).json().items[0].memberNo;
    expect((await req(vera, "GET", `${reg}?q=${numberOfMia}`)).json().items[0].name).toBe("mia");
    const paged = (await req(vera, "GET", `${reg}?limit=2&offset=2`)).json();
    expect(paged.items).toHaveLength(2);
    expect(paged.total).toBe(6);
  });

  it("Selbstverwaltung: eigene Daten lesen/aendern, nicht die Vorstandsfelder, nicht fremde", async () => {
    expect((await req(nina, "GET", `/orgs/${org}/my-profile`)).statusCode).toBe(403);
    const res = await req(mia, "PUT", `/orgs/${org}/my-profile`, { street: "Miaweg 2", zip: "54321", city: "Listenstadt", phone: "555", feeClassId: "00000000-0000-4000-8000-000000000000", notes: "hacke", joinedOn: "1999-01-01" });
    expect(res.statusCode).toBe(200);
    expect(res.json().profile.street).toBe("Miaweg 2");
    const asAdmin = (await req(vera, "GET", `${reg}/${mia.id}`)).json();
    expect(asAdmin).toMatchObject({ street: "Miaweg 2", notes: "", feeClassId: null });
    expect(asAdmin.joinedOn).not.toBe("1999-01-01");
    const mine = (await req(mia, "GET", "/me/memberships")).json();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ orgSlug: org, memberNo: asAdmin.memberNo });
    expect((await req(mia, "GET", `${reg}/${ben.id}`)).statusCode).toBe(403); // fremde Daten
    // oeffentliche Vereinsendpunkte verraten keine Stammdaten
    for (const url of [`/orgs/${org}`, "/orgs", "/orgs/managed"]) expect((await req(nina, "GET", url)).body).not.toContain("Miaweg");
  });

  it("CSV-Export: nur Vorstand, BOM, Formeln entschaerft, protokolliert", async () => {
    await req(vera, "PUT", `${reg}/${evil.id}`, full({ street: "=1+1", phone: "+49 30 123" }));
    const res = await req(vera, "GET", `${reg}.csv`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body.startsWith("﻿Mitgliedsnr;Name;")).toBe(true);
    expect(res.body).toContain("'=Boese"); // Anzeigename ist eine Formel
    expect(res.body).toContain("'=1+1");
    expect(res.body).toContain("'+49 30 123");
    expect(res.body.trim().split("\r\n")).toHaveLength(7);
    const log = (await db.select().from(schema.auditLog)).filter((l) => l.action === "members.exported");
    expect(log).toHaveLength(1);
    expect(log[0].meta).toMatchObject({ count: 6 });
  });

  it("Austritt: personenbezogene Felder werden geloescht, Nummer bleibt, Wiedereintritt behaelt die Nummer", async () => {
    const before = (await req(vera, "GET", `${reg}/${ben.id}`)).json();
    expect(before.street).toBe("Weg 1");
    expect((await req(vera, "DELETE", `/orgs/${org}/members/${ben.id}`)).statusCode).toBe(204);
    const [row] = await db.select().from(schema.memberProfiles).where(and(eq(schema.memberProfiles.userId, ben.id), eq(schema.memberProfiles.orgId, (await db.select().from(schema.organizations).where(eq(schema.organizations.slug, org)))[0].id)));
    expect(row).toMatchObject({ street: "", zip: "", city: "", phone: "", birthDate: null, guardianName: "", guardianEmail: "", notes: "", memberNo: before.memberNo });
    expect(row.leftOn).toBeTruthy();
    expect((await req(vera, "GET", `${reg}/${ben.id}`)).statusCode).toBe(404);
    expect((await req(vera, "GET", reg)).json().total).toBe(5);
    // Wiedereintritt per Antrag
    await req(ben, "POST", `/orgs/${org}/membership`);
    await req(vera, "POST", `/orgs/${org}/members/${ben.id}/decision`, { decision: "approve" });
    const back = (await req(vera, "GET", `${reg}/${ben.id}`)).json();
    expect(back.memberNo).toBe(before.memberNo);
    expect(back.street).toBe("");
    // freiwilliger Austritt (selbst)
    expect((await req(mia, "DELETE", `/orgs/${org}/members/${mia.id}`)).statusCode).toBe(204);
    expect((await req(mia, "GET", "/me/memberships")).json()).toEqual([]);
  });

  it("Kontoloeschung entfernt alle Stammdaten; Auskunft enthaelt sie vorher", async () => {
    const gone = await signup("gerda");
    await req(gone, "POST", `/orgs/${org}/membership`);
    await req(vera, "POST", `/orgs/${org}/members/${gone.id}/decision`, { decision: "approve" });
    await req(gone, "PUT", `/orgs/${org}/my-profile`, { street: "Löschweg 9", birthDate: years(40) });
    const exported = (await req(gone, "GET", "/privacy/export")).json();
    expect(exported.memberData).toHaveLength(1);
    expect(exported.memberData[0]).toMatchObject({ club: "SV Mitglieder", street: "Löschweg 9" });
    expect((await req(gone, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);
    expect(await db.select().from(schema.memberProfiles).where(eq(schema.memberProfiles.userId, gone.id))).toHaveLength(0);
  });
});
