import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { diversify, scorePost } from "./ranking";

describe("Ranking v2 (reine Funktionen)", () => {
  const base = { likes: 0, comments: 0, ageHours: 1, relation: "follow" as const };

  it("Affinitaet, Bilder und Termine erhoehen den Score moderat; Freund > Verein folgen", () => {
    expect(scorePost({ ...base, affinity: 5 })).toBeGreaterThan(scorePost(base));
    expect(scorePost({ ...base, affinity: 1000 }) / scorePost(base)).toBeLessThanOrEqual(2); // gedeckelt
    expect(scorePost({ ...base, hasMedia: true })).toBeGreaterThan(scorePost(base));
    expect(scorePost({ ...base, kind: "event" })).toBeGreaterThan(scorePost(base));
    expect(scorePost({ ...base, relation: "friend" })).toBeGreaterThan(scorePost({ ...base, relation: "follow" }));
  });

  it("Interaktion wirkt logarithmisch: virale Beitraege erschlagen den Feed nicht", () => {
    const small = scorePost({ ...base, likes: 10 });
    const viral = scorePost({ ...base, likes: 10_000 });
    expect(viral).toBeGreaterThan(small);
    expect(viral / small).toBeLessThan(5);
  });

  it("Vielfalt: derselbe Absender wird nicht dreimal hintereinander ausgespielt", () => {
    const items = [
      { id: 1, key: "A", score: 10 }, { id: 2, key: "A", score: 9.5 }, { id: 3, key: "A", score: 9 },
      { id: 4, key: "B", score: 8 }, { id: 5, key: "C", score: 7 },
    ];
    const order = diversify(items).map((i) => i.id);
    expect(order[0]).toBe(1);
    expect(order.slice(0, 3)).not.toEqual([1, 2, 3]);
    expect([...order].sort()).toEqual([1, 2, 3, 4, 5]); // nichts geht verloren
    // ohne Wiederholung bleibt die Reihenfolge nach Score
    expect(diversify([{ key: "A", score: 3 }, { key: "B", score: 2 }, { key: "C", score: 1 }]).map((i) => i.key)).toEqual(["A", "B", "C"]);
  });
});

describe("Feed-Algorithmus v2 (Integration)", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const password = "ein-sehr-langes-passwort";

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
  const req = (u: U, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });
  const feed = async (u: U, mode = "ranked") => (await req(u, "GET", `/feed?mode=${mode}`)).json();
  const bodies = (f: { posts: { body: string }[] }) => f.posts.map((p) => p.body);

  let vera: U, wolf: U, leo: U, mia: U;

  beforeAll(async () => {
    [vera, wolf, leo, mia] = [await signup("vera"), await signup("wolf"), await signup("leo"), await signup("mia")];
    await req(vera, "POST", "/orgs", { name: "Verein Alpha", category: "Sport", city: "A-Stadt" });
    await req(wolf, "POST", "/orgs", { name: "Verein Beta", category: "Kultur", city: "B-Stadt" });
    await req(leo, "POST", "/orgs", { name: "Verein Gamma", category: "Umwelt", city: "G-Stadt" });
    for (const o of ["verein-alpha", "verein-beta"]) await req(mia, "POST", `/orgs/${o}/follow`);
    await req(mia, "PUT", "/privacy/consents", { purpose: "personalized_feed", granted: true });
  });

  it("Affinitaet: Wer mit einem Verein oft interagiert, sieht dessen neue Beitraege weiter oben", async () => {
    // Fruehere Beitraege beider Vereine; mia likt/kommentiert nur die von Alpha
    const oldA = (await req(vera, "POST", "/posts", { body: "Alpha alt 1", orgSlug: "verein-alpha" })).json();
    const oldA2 = (await req(vera, "POST", "/posts", { body: "Alpha alt 2", orgSlug: "verein-alpha" })).json();
    const oldB = (await req(wolf, "POST", "/posts", { body: "Beta alt", orgSlug: "verein-beta" })).json();
    for (const p of [oldA, oldA2]) {
      await req(mia, "POST", `/posts/${p.id}/like`);
      await req(mia, "POST", `/posts/${p.id}/comments`, { body: "super" });
    }
    // Die fruehere Interaktion liegt 5 Tage zurueck: die alten Beitraege selbst sollen die Reihenfolge nicht dominieren
    for (const p of [oldA, oldA2, oldB]) await db.execute(sql`update social.posts set created_at = now() - interval '5 days' where id = ${p.id}`);
    // Neue Beitraege mit gleichem Alter/Engagement - Beta wurde zuletzt gepostet (waere ohne Affinitaet vorn)
    await req(vera, "POST", "/posts", { body: "Alpha neu", orgSlug: "verein-alpha" });
    await req(wolf, "POST", "/posts", { body: "Beta neu", orgSlug: "verein-beta" });

    const f = await feed(mia);
    expect(f.personalized).toBe(true);
    const order = bodies(f);
    expect(order.indexOf("Alpha neu")).toBeLessThan(order.indexOf("Beta neu"));
    const alpha = f.posts.find((p: { body: string }) => p.body === "Alpha neu");
    expect(alpha.reason).toMatch(/Du folgst Verein Alpha\..*interagierst oft/);
  });

  it("Feedback: Beitrag ausblenden (Chrono und Ranking), rueckgaengig machbar", async () => {
    const target = (await feed(mia, "chrono")).posts.find((p: { body: string }) => p.body === "Beta neu");
    expect((await req(mia, "POST", `/posts/${target.id}/feedback`, { kind: "hide" })).statusCode).toBe(204);
    expect(bodies(await feed(mia, "chrono"))).not.toContain("Beta neu");
    expect(bodies(await feed(mia, "ranked"))).not.toContain("Beta neu");
    // andere Nutzer sehen ihn weiterhin
    await req(leo, "POST", "/orgs/verein-beta/follow");
    expect(bodies(await feed(leo, "chrono"))).toContain("Beta neu");

    const muted = (await req(mia, "GET", "/feed/muted")).json();
    expect(muted).toEqual([expect.objectContaining({ kind: "post", id: target.id, label: "Beta neu" })]);
    expect((await req(mia, "DELETE", `/feed/muted/post/${target.id}`)).statusCode).toBe(204);
    expect(bodies(await feed(mia, "chrono"))).toContain("Beta neu");
  });

  it("Feedback: Verein stummschalten blendet alle seine Beitraege aus, auch bei Entdecken", async () => {
    const post = (await feed(mia, "chrono")).posts.find((p: { body: string }) => p.body === "Beta alt");
    expect((await req(mia, "POST", `/posts/${post.id}/feedback`, { kind: "mute_org" })).statusCode).toBe(204);
    const after = bodies(await feed(mia, "chrono"));
    expect(after.some((b) => b.startsWith("Beta"))).toBe(false);
    expect(bodies(await feed(mia, "ranked")).some((b) => b.startsWith("Beta"))).toBe(false);
    expect((await req(mia, "GET", "/feed/muted")).json()).toEqual([expect.objectContaining({ kind: "org", label: "Verein Beta" })]);
    const [m] = (await req(mia, "GET", "/feed/muted")).json();
    await req(mia, "DELETE", `/feed/muted/org/${m.id}`);
    expect(bodies(await feed(mia, "chrono")).some((b) => b.startsWith("Beta"))).toBe(true);
  });

  it("Feedback: Person stummschalten betrifft nur persoenliche Beitraege; Validierung", async () => {
    await req(wolf, "POST", "/profiles/me", {}); // Profil anlegen (kein Fehler erwartet)
    const handle = (await req(wolf, "GET", "/profiles/me")).json().handle;
    await req(mia, "POST", `/profiles/${handle}/follow`);
    const personal = (await req(wolf, "POST", "/posts", { body: "Wolfs privater Gedanke" })).json();
    expect(bodies(await feed(mia, "chrono"))).toContain("Wolfs privater Gedanke");

    const orgPost = (await feed(mia, "chrono")).posts.find((p: { body: string }) => p.body === "Beta neu");
    expect((await req(mia, "POST", `/posts/${orgPost.id}/feedback`, { kind: "mute_author" })).statusCode).toBe(400); // Vereinsbeitrag -> Verein stummschalten
    expect((await req(mia, "POST", `/posts/${personal.id}/feedback`, { kind: "mute_org" })).statusCode).toBe(400);
    expect((await req(wolf, "POST", `/posts/${personal.id}/feedback`, { kind: "mute_author" })).statusCode).toBe(400); // nicht sich selbst
    expect((await req(mia, "POST", `/posts/${personal.id}/feedback`, { kind: "unbekannt" })).statusCode).toBe(400);

    expect((await req(mia, "POST", `/posts/${personal.id}/feedback`, { kind: "mute_author" })).statusCode).toBe(204);
    const after = bodies(await feed(mia, "chrono"));
    expect(after).not.toContain("Wolfs privater Gedanke");
    expect(after).toContain("Beta neu"); // Wolfs Vereinsbeitraege bleiben
  });

  it("Exploration: Seite 1 mischt einen oeffentlichen Beitrag eines nicht gefolgten Vereins ein", async () => {
    await req(leo, "POST", "/posts", { body: "Gamma fuer alle", orgSlug: "verein-gamma" });
    const first = await feed(mia, "ranked");
    const hit = first.posts.find((p: { body: string }) => p.body === "Gamma fuer alle");
    expect(hit).toBeDefined();
    expect(hit.reason).toMatch(/Entdecken|Beliebt/);
    expect(first.posts.indexOf(hit)).toBeGreaterThan(0); // nicht an erster Stelle
    // ohne Einwilligung keine Personalisierung: chronologisch, Entdecken nur als Auffueller
    await req(mia, "PUT", "/privacy/consents", { purpose: "personalized_feed", granted: false });
    expect((await feed(mia, "ranked")).personalized).toBe(false);
  });
});
