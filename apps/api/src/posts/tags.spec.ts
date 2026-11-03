import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TAGS, TAG_GROUPS, TAG_IDS, isTagId, tagLabel } from "@vereine/shared";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";

const password = "ein-sehr-langes-passwort";

describe("Tag-Katalog", () => {
  it("hat eindeutige IDs, gueltige Gruppen und sinnvolle Menge", () => {
    expect(new Set(TAG_IDS).size).toBe(TAGS.length);
    expect(TAGS.length).toBeGreaterThanOrEqual(70);
    for (const t of TAGS) {
      expect(t.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(TAG_GROUPS).toContain(t.group);
      expect(t.label.length).toBeGreaterThan(2);
    }
    expect(isTagId("fussball")).toBe(true);
    expect(isTagId("erfunden")).toBe(false);
    expect(tagLabel("fussball")).toBe("Fußball");
  });
});

describe("Tags an Vereinen und Beitraegen", () => {
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
  const req = (u: U, method: "GET" | "POST" | "PUT", url: string, payload?: object) => app.inject({ method, url, payload, headers: { cookie: u.cookie } });

  it("Vereine: Tags beim Gruendern, nur aus dem Katalog, Limit 5, ohne Duplikate; Filter in der Vereinsliste", async () => {
    const [vera, mia, nina] = [await signup("vera"), await signup("mia"), await signup("nina")];
    const bad = await req(vera, "POST", "/orgs", { name: "Tag Verein", category: "Sport", city: "Tagstadt", tags: ["fussball", "erfunden"] });
    expect(bad.statusCode).toBe(400);
    expect((await req(vera, "POST", "/orgs", { name: "Tag Verein", category: "Sport", city: "Tagstadt", tags: ["fussball", "handball", "tennis", "judo", "chor", "schach"] })).statusCode).toBe(400);
    const created = await req(vera, "POST", "/orgs", { name: "SV Tags", category: "Sport", city: "Tagstadt", tags: ["fussball", "fussball", "handball"] });
    expect(created.statusCode).toBe(201);
    expect(created.json().tags).toEqual(["fussball", "handball"]);
    await req(vera, "POST", "/orgs", { name: "Chor Tags", category: "Kultur", city: "Tagstadt", tags: ["chor"] });
    await req(vera, "POST", "/orgs", { name: "Ohne Tags", category: "Sonstiges", city: "Tagstadt" });

    const names = async (q: string) => ((await req(nina, "GET", `/orgs${q}`)).json() as { name: string }[]).map((o) => o.name).sort();
    expect(await names("?tag=fussball")).toEqual(["SV Tags"]);
    expect(await names("?tag=chor")).toEqual(["Chor Tags"]);
    expect(await names("?tag=chor&q=Tags")).toEqual(["Chor Tags"]);
    expect(await names("?tag=erfunden")).toHaveLength(3); // unbekannter Tag = kein Filter
    expect((await names("")).length).toBe(3);

    // Vorstand aendert, andere nicht
    await req(mia, "POST", "/orgs/sv-tags/membership");
    await req(vera, "POST", `/orgs/sv-tags/members/${mia.id}/decision`, { decision: "approve" });
    expect((await req(mia, "PUT", "/orgs/sv-tags/tags", { tags: ["tennis"] })).statusCode).toBe(403);
    const upd = await req(vera, "PUT", "/orgs/sv-tags/tags", { tags: ["tennis", "tischtennis"] });
    expect(upd.statusCode).toBe(200);
    expect(await names("?tag=fussball")).toEqual([]);
    expect(await names("?tag=tischtennis")).toEqual(["SV Tags"]);
    expect((await req(vera, "PUT", "/orgs/sv-tags/tags", { tags: ["unsinn"] })).statusCode).toBe(400);
    expect((await req(vera, "PUT", "/orgs/sv-tags/tags", { tags: [] })).statusCode).toBe(200);
  });

  it("Beitraege: Vereinsbeitrag erbt Tags, eigene Tags ueberschreiben, Limit 3, Feed-Filter", async () => {
    const [vera, ben, lia] = [await signup("vera2"), await signup("ben"), await signup("lia")];
    await req(vera, "POST", "/orgs", { name: "FC Feed", category: "Sport", city: "Feedstadt", tags: ["fussball", "futsal"] });
    await req(vera, "POST", "/orgs", { name: "Chor Feed", category: "Kultur", city: "Feedstadt", tags: ["chor"] });

    const inherited = await req(vera, "POST", "/posts", { body: "Spieltag!", orgSlug: "fc-feed" });
    expect(inherited.statusCode).toBe(201);
    expect(inherited.json().tags).toEqual(["fussball", "futsal"]);
    const own = await req(vera, "POST", "/posts", { body: "Nur Futsal", orgSlug: "fc-feed", tags: ["futsal"] });
    expect(own.json().tags).toEqual(["futsal"]);
    await req(vera, "POST", "/posts", { body: "Chorprobe", orgSlug: "chor-feed" });
    const personal = await req(ben, "POST", "/posts", { body: "Privat ohne Tags" });
    expect(personal.json().tags).toEqual([]);
    expect((await req(ben, "POST", "/posts", { body: "zu viele", tags: ["fussball", "tennis", "judo", "chor"] })).statusCode).toBe(400);
    expect((await req(ben, "POST", "/posts", { body: "falscher Tag", tags: ["quatsch"] })).statusCode).toBe(400);
    const taggedPersonal = await req(ben, "POST", "/posts", { body: "Mein Fussball-Tag", tags: ["fussball"] });
    expect(taggedPersonal.statusCode).toBe(201);

    // Feed-Filter: auch Vereine, denen lia nicht folgt; private Beitraege Fremder nicht
    const feedBodies = async (u: U, tag: string) => ((await req(u, "GET", `/feed?mode=chrono&tag=${tag}`)).json().posts as { body: string; tags: string[] }[]).map((p) => p.body).sort();
    expect(await feedBodies(lia, "fussball")).toEqual(["Spieltag!"]);
    expect(await feedBodies(lia, "futsal")).toEqual(["Nur Futsal", "Spieltag!"]);
    expect(await feedBodies(lia, "chor")).toEqual(["Chorprobe"]);
    expect(await feedBodies(ben, "fussball")).toEqual(["Mein Fussball-Tag", "Spieltag!"]); // eigener Beitrag zaehlt mit
    expect(await feedBodies(lia, "tennis")).toEqual([]);
    // ohne Filter bleibt alles beim Alten
    const all = (await req(lia, "GET", "/feed?mode=chrono")).json().posts as { tags: string[] }[];
    expect(all.every((p) => Array.isArray(p.tags))).toBe(true);
    expect(all.length).toBeGreaterThanOrEqual(3);
  });
});
