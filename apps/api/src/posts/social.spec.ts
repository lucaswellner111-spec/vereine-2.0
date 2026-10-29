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

describe("Vereine, Beitraege, Feed", () => {
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

  async function signup(name: string): Promise<string> {
    const email = `${name}@example.de`;
    await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return String(login.headers["set-cookie"]).split(";")[0];
  }

  const req = (cookie: string, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie } });

  let anna: string; // Vereins-Admin
  let ben: string; // Mitglied/Follower
  let clara: string; // Fremde

  it("verlangt Login", async () => {
    expect((await app.inject({ method: "GET", url: "/feed" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/orgs" })).statusCode).toBe(401);
  });

  it("legt Verein an: Ersteller ist Admin, Slug wird erzeugt und eindeutig", async () => {
    anna = await signup("anna");
    ben = await signup("ben");
    clara = await signup("clara");

    const res = await req(anna, "POST", "/orgs", { name: "TSV Müsterstadt 1904", category: "Sport", city: "Musterstadt", about: "Fussball" });
    expect(res.statusCode).toBe(201);
    expect(res.json().slug).toBe("tsv-muesterstadt-1904");
    expect(res.json().viewer).toMatchObject({ following: true, membership: "active", role: "admin" });

    const dup = await req(clara, "POST", "/orgs", { name: "TSV Müsterstadt 1904", category: "Sport", city: "Anderswo" });
    expect(dup.json().slug).toBe("tsv-muesterstadt-1904-2");

    const bad = await req(anna, "POST", "/orgs", { name: "X", category: "Unbekannt", city: "" });
    expect(bad.statusCode).toBe(400);
  });

  it("listet und sucht Vereine", async () => {
    const all = await req(ben, "GET", "/orgs");
    expect(all.json()).toHaveLength(2);
    const found = await req(ben, "GET", "/orgs?q=anderswo");
    expect(found.json()).toHaveLength(1);
  });

  it("Follow/Unfollow und Mitgliedschaftsantrag", async () => {
    const f = await req(ben, "POST", "/orgs/tsv-muesterstadt-1904/follow");
    expect(f.json().viewer.following).toBe(true);
    expect(f.json().followers).toBe(2);
    const u = await req(ben, "DELETE", "/orgs/tsv-muesterstadt-1904/follow");
    expect(u.json().viewer.following).toBe(false);
    await req(ben, "POST", "/orgs/tsv-muesterstadt-1904/follow");

    const m = await req(ben, "POST", "/orgs/tsv-muesterstadt-1904/membership");
    expect(m.json().viewer.membership).toBe("pending");
    expect((await req(ben, "POST", "/orgs/tsv-muesterstadt-1904/membership")).statusCode).toBe(409);
    expect((await req(ben, "GET", "/orgs/gibt-es-nicht")).statusCode).toBe(404);
  });

  let orgPostId: string;

  it("nur Vorstand/Moderation darf fuer den Verein posten; Nutzer duerfen persoenlich posten", async () => {
    const ok = await req(anna, "POST", "/posts", { body: "Heimspiel am Sonntag!", orgSlug: "tsv-muesterstadt-1904", kind: "event" });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().org.name).toBe("TSV Müsterstadt 1904");
    orgPostId = ok.json().id;

    expect((await req(ben, "POST", "/posts", { body: "Ich auch", orgSlug: "tsv-muesterstadt-1904" })).statusCode).toBe(403);
    expect((await req(ben, "POST", "/posts", { body: "Mein privater Beitrag" })).statusCode).toBe(201);
    expect((await req(ben, "POST", "/posts", { body: "   " })).statusCode).toBe(400);
  });

  it("Feed ohne Einwilligung ist chronologisch, mit Einwilligung gerankt", async () => {
    // Bens Feed: gefolgter Verein + eigener Beitrag
    const off = (await req(ben, "GET", "/feed?mode=ranked")).json();
    expect(off.personalized).toBe(false);
    expect(off.mode).toBe("chrono");
    expect(off.posts.map((p: { body: string }) => p.body)).toEqual(["Mein privater Beitrag", "Heimspiel am Sonntag!"]);
    expect(off.posts[1].reason).toMatch(/Mitglied|folgst/);

    await req(ben, "PUT", "/privacy/consents", { purpose: "personalized_feed", granted: true });
    const on = (await req(ben, "GET", "/feed?mode=ranked")).json();
    expect(on.personalized).toBe(true);
    expect(on.mode).toBe("ranked");

    // Interaktion hebt den Vereinsbeitrag ueber den eigenen, neueren Beitrag
    await req(anna, "POST", `/posts/${orgPostId}/like`);
    await req(clara, "POST", `/posts/${orgPostId}/like`);
    await req(clara, "POST", `/posts/${orgPostId}/comments`, { body: "Wir kommen!" });
    const ranked = (await req(ben, "GET", "/feed?mode=ranked")).json();
    expect(ranked.posts[0].body).toBe("Heimspiel am Sonntag!");
    expect(ranked.posts[0]).toMatchObject({ likes: 2, comments: 1, likedByMe: false });

    // Chrono bleibt bei explizitem Wunsch chronologisch
    const chrono = (await req(ben, "GET", "/feed?mode=chrono")).json();
    expect(chrono.posts[0].body).toBe("Mein privater Beitrag");
  });

  it("Likes toggeln, Kommentare listen, Beitraege melden", async () => {
    const l1 = await req(ben, "POST", `/posts/${orgPostId}/like`);
    expect(l1.json()).toEqual({ liked: true, likes: 3 });
    const l2 = await req(ben, "POST", `/posts/${orgPostId}/like`);
    expect(l2.json()).toEqual({ liked: false, likes: 2 });

    const list = await req(ben, "GET", `/posts/${orgPostId}/comments`);
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].author.name).toBe("clara");
    expect((await req(ben, "POST", `/posts/${orgPostId}/comments`, { body: "" })).statusCode).toBe(400);

    expect((await req(ben, "POST", `/posts/${orgPostId}/report`, { reason: "spam" })).statusCode).toBe(204);
    expect(await db.select().from(schema.reports)).toHaveLength(1);
    expect((await req(ben, "POST", "/posts/00000000-0000-0000-0000-000000000000/like")).statusCode).toBe(404);
    expect((await req(ben, "POST", "/posts/kein-uuid/like")).statusCode).toBe(400);
  });

  it("Loeschen: Autor oder Vereins-Admin, sonst 403; geloeschte Beitraege verschwinden", async () => {
    const own = await req(ben, "POST", "/posts", { body: "Weg damit" });
    const id = own.json().id;
    expect((await req(clara, "DELETE", `/posts/${id}`)).statusCode).toBe(403);
    expect((await req(ben, "DELETE", `/posts/${orgPostId}`)).statusCode).toBe(403);
    expect((await req(ben, "DELETE", `/posts/${id}`)).statusCode).toBe(204);
    const feed = (await req(ben, "GET", "/feed?mode=chrono")).json();
    expect(feed.posts.some((p: { id: string }) => p.id === id)).toBe(false);
    expect((await req(ben, "GET", `/posts/${id}/comments`)).statusCode).toBe(404);

    const orgFeed = await req(clara, "GET", "/orgs/tsv-muesterstadt-1904/posts");
    expect(orgFeed.json().posts).toHaveLength(1);
    expect(orgFeed.json().posts[0].canDelete).toBe(false);
    expect((await req(anna, "GET", "/orgs/tsv-muesterstadt-1904/posts")).json().posts[0].canDelete).toBe(true);
  });

  it("Kontoloeschung entfernt Beitraege und Follows des Nutzers", async () => {
    const before = await db.select().from(schema.posts);
    const del = await req(clara, "DELETE", "/privacy/account", { password });
    expect(del.statusCode).toBe(204);
    const after = await db.select().from(schema.posts);
    expect(after.length).toBeLessThanOrEqual(before.length);
    expect((await db.select().from(schema.comments)).some((c) => c.body === "Wir kommen!")).toBe(false);
  });
});
