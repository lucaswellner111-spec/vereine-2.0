import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { describeDevice } from "./auth.service";

const password = "ein-sehr-langes-passwort";
const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("Konto-Sicherheit", () => {
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

  const register = (name: string) =>
    app.inject({
      method: "POST", url: "/auth/register",
      payload: { email: `${name}@example.de`, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
  const login = async (name: string, pw = password, ua = CHROME_WIN) =>
    app.inject({ method: "POST", url: "/auth/login", payload: { email: `${name}@example.de`, password: pw }, headers: { "user-agent": ua } });
  const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers["set-cookie"]).split(";")[0];

  it("Geraetebeschreibung aus dem User-Agent", () => {
    expect(describeDevice(CHROME_WIN)).toBe("Chrome auf Windows");
    expect(describeDevice(IPHONE)).toBe("Safari auf iOS");
    expect(describeDevice(undefined)).toBe("Unbekanntes Gerät");
  });

  it("Konto-Drosselung: nach 10 Fehlversuchen 15 Minuten gesperrt, auch mit richtigem Passwort", async () => {
    await register("anna");
    for (let i = 0; i < 10; i++) expect((await login("anna", "falsch-falsch-falsch")).statusCode).toBe(401);
    const blocked = await login("anna");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().message).toMatch(/Fehlversuche/);
    // andere Konten sind nicht betroffen
    await register("berta");
    expect((await login("berta")).statusCode).toBe(200);
  });

  it("Drosselung gilt auch fuer unbekannte Adressen (kein Hinweis, ob ein Konto existiert)", async () => {
    for (let i = 0; i < 10; i++) await login("gibtsnicht", "falsch-falsch-falsch");
    const res = await login("gibtsnicht", "falsch-falsch-falsch");
    expect(res.statusCode).toBe(429);
  });

  it("Erfolgreicher Login setzt den Fehlerzaehler zurueck", async () => {
    await register("carla");
    for (let i = 0; i < 9; i++) await login("carla", "falsch-falsch-falsch");
    expect((await login("carla")).statusCode).toBe(200); // 9 Fehler, dann Erfolg
    for (let i = 0; i < 9; i++) await login("carla", "falsch-falsch-falsch"); // Zaehler begann von vorn
    expect((await login("carla")).statusCode).toBe(200);
  });

  it("Sitzungsliste: Geraet, aktuelle Sitzung markiert, keine Hashes im Klartext", async () => {
    await register("dora");
    const desktop = cookieOf(await login("dora"));
    const phone = cookieOf(await login("dora", password, IPHONE));
    const res = await app.inject({ method: "GET", url: "/auth/sessions", headers: { cookie: desktop } });
    expect(res.statusCode).toBe(200);
    const list = res.json() as { id: string; current: boolean; device: string }[];
    expect(list).toHaveLength(2);
    expect(list.find((s) => s.current)?.device).toBe("Chrome auf Windows");
    expect(list.find((s) => !s.current)?.device).toBe("Safari auf iOS");
    expect(list.every((s) => /^[0-9a-f]{16}$/.test(s.id))).toBe(true);
    const stored = await db.select().from(schema.sessions);
    expect(stored.some((s) => s.tokenHash === list[0].id)).toBe(false); // nur ein Praefix wird ausgegeben
    expect(await app.inject({ method: "GET", url: "/auth/sessions" })).toMatchObject({ statusCode: 401 });
    void phone;
  });

  it("Einzelne Sitzung beenden: nur eigene, sofort wirksam", async () => {
    await register("emil");
    await register("fritz");
    const a = cookieOf(await login("emil"));
    const b = cookieOf(await login("emil", password, IPHONE));
    const fritz = cookieOf(await login("fritz"));
    const sessions = (await app.inject({ method: "GET", url: "/auth/sessions", headers: { cookie: a } })).json() as { id: string; current: boolean }[];
    const other = sessions.find((s) => !s.current)!;

    // Fremde koennen sie nicht beenden
    expect((await app.inject({ method: "DELETE", url: `/auth/sessions/${other.id}`, headers: { cookie: fritz } })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: "/auth/sessions/kaputt", headers: { cookie: a } })).statusCode).toBe(400);

    expect((await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: b } })).statusCode).toBe(200);
    expect((await app.inject({ method: "DELETE", url: `/auth/sessions/${other.id}`, headers: { cookie: a } })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: b } })).statusCode).toBe(401); // Cache wurde verworfen
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: a } })).statusCode).toBe(200);
  });

  it("Alle anderen Sitzungen beenden", async () => {
    await register("gerd");
    const a = cookieOf(await login("gerd"));
    const b = cookieOf(await login("gerd"));
    const c = cookieOf(await login("gerd"));
    const res = await app.inject({ method: "POST", url: "/auth/sessions/revoke-others", payload: {}, headers: { cookie: a } });
    expect(res.json()).toEqual({ revoked: 2 });
    for (const dead of [b, c]) expect((await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: dead } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: a } })).statusCode).toBe(200);
  });

  it("Passwort aendern: aktuelles Passwort noetig, andere Sitzungen enden, altes Passwort geht nicht mehr", async () => {
    await register("hanna");
    const here = cookieOf(await login("hanna"));
    const elsewhere = cookieOf(await login("hanna", password, IPHONE));
    const change = (cookie: string, body: object) => app.inject({ method: "PUT", url: "/auth/password", payload: body, headers: { cookie } });

    expect((await app.inject({ method: "PUT", url: "/auth/password", payload: { currentPassword: password, newPassword: "ein-neues-langes-passwort" } })).statusCode).toBe(401);
    expect((await change(here, { currentPassword: "falsch-falsch-falsch", newPassword: "ein-neues-langes-passwort" })).statusCode).toBe(401);
    expect((await change(here, { currentPassword: password, newPassword: "kurz" })).statusCode).toBe(400);
    expect((await change(here, { currentPassword: password, newPassword: password })).statusCode).toBe(409);

    expect((await change(here, { currentPassword: password, newPassword: "ein-neues-langes-passwort" })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: here } })).statusCode).toBe(200); // aktuelle Sitzung bleibt
    expect((await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: elsewhere } })).statusCode).toBe(401);
    expect((await login("hanna")).statusCode).toBe(401); // altes Passwort
    expect((await login("hanna", "ein-neues-langes-passwort")).statusCode).toBe(200);

    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, "hanna@example.de"));
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "user.password.changed"));
    expect(audit).toHaveLength(1);
  });
});
