import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { CACHE, type Cache } from "../cache/cache.module";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";

const password = "ein-sehr-langes-passwort";
const png = (w = 400, h = 300) => sharp({ create: { width: w, height: h, channels: 3, background: "#3a7d44" } }).png().toBuffer();
const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

/** P4c: oeffentliche Vereinsseite und Vereinsfinder ohne Login. */
describe("P4c: Oeffentlicher Bereich", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let cache: Cache;
  const dir = mkdtempSync(join(tmpdir(), "vereine-public-"));

  beforeAll(async () => {
    process.env.MEDIA_DIR = dir;
    db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    cache = app.get(CACHE);
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.MEDIA_DIR;
  });

  // Jeder Test startet mit frischem IP-Zaehler (app.inject kommt immer von 127.0.0.1)
  beforeEach(async () => {
    await cache.del("lim:pub:ip:127.0.0.1");
  });

  type U = { cookie: string; id: string };
  async function signup(name: string): Promise<U> {
    const email = `${name.toLowerCase().replace(/\s+/g, ".")}@example.de`;
    const reg = await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: reg.json().id };
  }
  const req = (u: U, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });
  const anon = (url: string) => app.inject({ method: "GET", url });
  const upload = (u: U, url: string, data: Buffer) => {
    const boundary = "----pub" + Math.random().toString(16).slice(2);
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({ method: "POST", url, payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}`, cookie: u.cookie } });
  };

  let vera: U, mia: U;
  const slug = "tsv-offen";
  let logoId: string;
  let avatarId: string;
  let postImageId: string;

  beforeAll(async () => {
    [vera, mia] = [await signup("Vera Vorstand"), await signup("Mia Mitglied")];
    expect((await req(vera, "POST", "/orgs", { name: "TSV Offen", category: "Sport", city: "Musterstadt", about: "Wir spielen Fussball.", tags: ["fussball"] })).statusCode).toBe(201);
    expect((await req(vera, "POST", "/orgs", { name: "Geheimbund", category: "Kultur", city: "Musterstadt" })).statusCode).toBe(201);
    await req(mia, "POST", `/orgs/${slug}/membership`);
    await req(vera, "POST", `/orgs/${slug}/members/${mia.id}/decision`, { decision: "approve" });
    await db.update(schema.organizations).set({ iban: "DE89370400440532013000", address: "Hauptstr. 1, 12345 Musterstadt" }).where(eq(schema.organizations.slug, slug));

    const ev = (title: string, extra: object) => req(vera, "POST", `/orgs/${slug}/events`, { title, startsAt: inDays(3), ...extra });
    expect((await ev("Sommerfest offen", { visibility: "public", kind: "party", location: "Sportplatz" })).statusCode).toBe(201);
    expect((await ev("Vorstandssitzung intern", { visibility: "members" })).statusCode).toBe(201);
    const canceled = (await ev("Abgesagtes Turnier", { visibility: "public" })).json();
    await req(vera, "POST", `/events/${canceled.id}/cancel`, {});
    await db.insert(schema.events).values({ orgId: (await db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug)))[0].id, title: "Altes Spiel", visibility: "public", startsAt: new Date(Date.now() - 5 * 86400_000) });

    const img = (await upload(vera, "/media/post", await png())).json();
    postImageId = img.id;
    expect((await req(vera, "POST", "/posts", { body: "Neuer Trainingsplan", orgSlug: slug, mediaIds: [img.id], tags: ["fussball"] })).statusCode).toBe(201);
    const hidden = (await req(vera, "POST", "/posts", { body: "Wird ausgeblendet", orgSlug: slug })).json();
    await req(vera, "POST", `/posts/${hidden.id}/moderation`, { action: "hide", reason: "Testweise ausgeblendet" });
    expect((await req(mia, "POST", "/posts", { body: "Privater Beitrag von Mia" })).statusCode).toBe(201);
    await req(mia, "POST", "/posts", { body: "", orgSlug: slug }); // kein Recht -> 403, kommt nicht vor

    logoId = (await upload(vera, `/media/org/${slug}/logo`, await png(300, 300))).json().id;
    avatarId = (await upload(mia, "/media/avatar", await png(300, 300))).json().id;
  });

  it("ohne Freischaltung 404, nur der Vorstand schaltet um", async () => {
    expect((await anon(`/public/orgs/${slug}`)).statusCode).toBe(404);
    expect((await anon("/public/orgs/gibt-es-nicht")).statusCode).toBe(404);
    expect((await anon("/public/orgs/UNG%C3%9CLTIG!")).statusCode).toBe(404);
    expect((await req(mia, "PUT", `/orgs/${slug}/public-page`, { enabled: true })).statusCode).toBe(403);
    expect((await req(vera, "PUT", `/orgs/${slug}/public-page`, { enabled: "ja" })).statusCode).toBe(400);
    const on = await req(vera, "PUT", `/orgs/${slug}/public-page`, { enabled: true });
    expect(on.statusCode).toBe(200);
    expect(on.json().publicPage).toBe(true);
    expect((await req(mia, "GET", `/orgs/${slug}`)).json().publicPage).toBe(true);
  });

  it("liefert die Seite ohne Cookie - ohne Personendaten, Bankdaten, interne/abgesagte/vergangene Termine", async () => {
    const res = await anon(`/public/orgs/${slug}`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ slug, name: "TSV Offen", category: "Sport", city: "Musterstadt", about: "Wir spielen Fussball.", tags: ["fussball"], members: 2, logoId });
    expect(body.events).toEqual([{ title: "Sommerfest offen", kind: "party", startsAt: expect.any(String), endsAt: null, location: "Sportplatz" }]);
    expect(body.posts).toEqual([{ body: "Neuer Trainingsplan", createdAt: expect.any(String), tags: ["fussball"] }]);
    const raw = res.body;
    for (const forbidden of ["DE89370400440532013000", "Hauptstr", "Vera", "Mia", vera.id, mia.id, "intern", "Abgesagt", "Altes Spiel", "Wird ausgeblendet", postImageId, "author", "iban", "address"]) {
      expect(raw, forbidden).not.toContain(forbidden);
    }
  });

  it("Cache 60 s; Aenderungen ueber die API und Abschalten wirken sofort", async () => {
    await anon(`/public/orgs/${slug}`);
    await db.update(schema.organizations).set({ about: "Direkt in der DB" }).where(eq(schema.organizations.slug, slug));
    expect((await anon(`/public/orgs/${slug}`)).json().about).toBe("Wir spielen Fussball."); // aus dem Cache
    await req(vera, "PUT", `/orgs/${slug}`, { name: "TSV Offen", category: "Sport", city: "Musterstadt", about: "Neu ueber die API" });
    expect((await anon(`/public/orgs/${slug}`)).json().about).toBe("Neu ueber die API");

    // ausgeblendeter Beitrag verschwindet sofort
    const p = (await req(vera, "POST", "/posts", { body: "Kurz sichtbar", orgSlug: slug })).json();
    await cache.del(`pub:org:${slug}`);
    expect((await anon(`/public/orgs/${slug}`)).json().posts[0].body).toBe("Kurz sichtbar");
    await req(vera, "POST", `/posts/${p.id}/moderation`, { action: "hide", reason: "Testweise ausgeblendet" });
    expect((await anon(`/public/orgs/${slug}`)).body).not.toContain("Kurz sichtbar");

    // Liste ebenfalls
    expect((await anon("/public/orgs")).json().map((o: { slug: string }) => o.slug)).toEqual([slug]);
    await req(vera, "PUT", `/orgs/${slug}/public-page`, { enabled: false });
    expect((await anon(`/public/orgs/${slug}`)).statusCode).toBe(404);
    expect((await anon("/public/orgs")).json()).toEqual([]);
    await req(vera, "PUT", `/orgs/${slug}/public-page`, { enabled: true });
    expect((await anon(`/public/orgs/${slug}`)).statusCode).toBe(200);
  });

  it("Vereinsfinder: nur freigeschaltete Vereine, Filter nach Text, Ort, Tag, Kategorie; max. 30", async () => {
    const list = (q = "") => anon(`/public/orgs${q}`).then((r) => r.json().map((o: { slug: string }) => o.slug));
    expect(await list()).toEqual([slug]); // Geheimbund fehlt
    expect(await list("?city=muster")).toEqual([slug]);
    expect(await list("?city=Berlin")).toEqual([]);
    expect(await list("?q=offen")).toEqual([slug]);
    expect(await list("?q=%25")).toEqual([]); // % woertlich
    expect(await list("?tag=fussball")).toEqual([slug]);
    expect(await list("?tag=tennis")).toEqual([]);
    expect(await list("?category=Kultur")).toEqual([]);
    expect((await anon("/public/orgs?category=Quatsch")).statusCode).toBe(400);
    expect(await list("?offset=1")).toEqual([]);
    const first = (await anon("/public/orgs")).json()[0];
    expect(Object.keys(first).sort()).toEqual(["category", "city", "logoId", "members", "name", "slug", "tags"]);

    // Seitengroesse 30
    const vals = Array.from({ length: 35 }, (_, i) => ({ slug: `verein-${String(i).padStart(2, "0")}`, name: `Verein ${String(i).padStart(2, "0")}`, category: "Sport", city: "Seestadt", publicPage: true }));
    await db.insert(schema.organizations).values(vals);
    await cache.incr("pub:ver", 60);
    expect((await list("?city=Seestadt")).length).toBe(30);
    expect((await list("?city=Seestadt&offset=30")).length).toBe(5);

    // App-Suche (angemeldet) mit Ort-Filter
    const inApp = (await req(mia, "GET", "/orgs?city=Seestadt")).json();
    expect(inApp).toHaveLength(35);
    expect((await req(mia, "GET", "/orgs?city=musterstadt")).json().map((o: { slug: string }) => o.slug).sort()).toEqual(["geheimbund", slug]);
  });

  it("/public/media nur fuer Logo/Banner oeffentlicher Vereine, oeffentlich cachebar", async () => {
    const ok = await anon(`/public/media/${logoId}/logo`);
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["cache-control"]).toBe("public, max-age=86400, immutable");
    expect(ok.headers["content-type"]).toBe("image/webp");
    expect((await anon(`/public/media/${logoId}/medium`)).statusCode).toBe(404); // falsche Variante
    expect((await anon(`/public/media/${avatarId}/avatar`)).statusCode).toBe(404);
    expect((await anon(`/public/media/${postImageId}/medium`)).statusCode).toBe(404);
    expect((await anon(`/public/media/../etc/logo`)).statusCode).toBeGreaterThanOrEqual(400);
    // interner Pfad bleibt geschuetzt
    expect((await anon(`/media/${logoId}/logo`)).statusCode).toBe(401);
    await req(vera, "PUT", `/orgs/${slug}/public-page`, { enabled: false });
    expect((await anon(`/public/media/${logoId}/logo`)).statusCode).toBe(404);
    await req(vera, "PUT", `/orgs/${slug}/public-page`, { enabled: true });
  });

  it("Rate-Limit: 60 Anfragen je Minute und IP, die 61. bekommt 429", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 61; i++) codes.push((await anon(i % 2 ? `/public/orgs/${slug}` : "/public/orgs/gibt-es-nicht")).statusCode);
    expect(codes.slice(0, 60).every((c) => c === 200 || c === 404)).toBe(true);
    expect(codes[60]).toBe(429);
    expect((await anon("/public/orgs")).statusCode).toBe(429);
    // andere IP ist nicht betroffen
    expect((await app.inject({ method: "GET", url: "/public/orgs", remoteAddress: "10.0.0.7" })).statusCode).toBe(200);
    // Bilder haben einen eigenen Zaehler: trotz erschoepftem Daten-Limit weiter abrufbar
    expect((await anon(`/public/media/${logoId}/logo`)).statusCode).toBe(200);
  });

  it("Rate-Limit Bilder: 600 je Minute und IP, getrennt vom Daten-Limit", async () => {
    await cache.del("lim:pub:media:ip:127.0.0.1");
    const codes: number[] = [];
    for (let i = 0; i < 100; i++) codes.push((await anon(`/public/media/${logoId}/logo-sm`)).statusCode);
    expect(codes.every((c) => c === 200)).toBe(true);
    // Daten-Limit unberuehrt
    expect((await anon("/public/orgs")).statusCode).toBe(200);
    // Zaehler auf 600 vorspulen: die 601. Anfrage bekommt 429
    for (let i = 100; i < 600; i++) await cache.incr("lim:pub:media:ip:127.0.0.1", 60);
    expect((await anon(`/public/media/${logoId}/logo`)).statusCode).toBe(429);
    await cache.del("lim:pub:media:ip:127.0.0.1");
  });
});
