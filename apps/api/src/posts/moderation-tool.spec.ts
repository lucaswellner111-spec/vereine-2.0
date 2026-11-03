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

describe("Moderations-Werkzeug (Vereinsebene)", () => {
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
    const reg = await app.inject({ method: "POST", url: "/auth/register", payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true } });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: reg.json().id };
  }
  const req = (u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: u ? { cookie: u.cookie } : {} });

  it("Moderatoren sehen, blenden aus/ein und loeschen Kommentare; andere nicht; alles protokolliert und benachrichtigt", async () => {
    const [vera, mo, mia, nina] = [await signup("vera"), await signup("mo"), await signup("mia"), await signup("nina")];
    const org = "sv-mod";
    await req(vera, "POST", "/orgs", { name: "SV Mod", category: "Sport", city: "Modstadt", tags: ["fussball"] });
    for (const m of [mo, mia]) {
      await req(m, "POST", `/orgs/${org}/membership`);
      await req(vera, "POST", `/orgs/${org}/members/${m.id}/decision`, { decision: "approve" });
    }
    await req(vera, "PUT", `/orgs/${org}/members/${mo.id}/role`, { role: "moderator" });

    const p1 = (await req(vera, "POST", "/posts", { body: "Erster Vereinsbeitrag", orgSlug: org })).json();
    const p2 = (await req(vera, "POST", "/posts", { body: "Zweiter, anstoessiger Beitrag", orgSlug: org })).json();
    const comment = (await req(mia, "POST", `/posts/${p2.id}/comments`, { body: "Ein beleidigender Kommentar" })).json();
    await req(mia, "POST", `/posts/${p2.id}/report`, { reason: "hate" });
    await req(vera, "POST", "/posts", { body: "persoenlicher Beitrag ohne Verein" }); // nicht Teil der Vereins-Moderation

    // Zugriff
    expect((await req(null, "GET", `/orgs/${org}/moderation/posts`)).statusCode).toBe(401);
    for (const u of [mia, nina]) {
      expect((await req(u, "GET", `/orgs/${org}/moderation/posts`)).statusCode).toBe(403);
      expect((await req(u, "GET", `/orgs/${org}/moderation/comments`)).statusCode).toBe(403);
      expect((await req(u, "POST", `/posts/${p2.id}/moderation`, { action: "hide", reason: "Test Begruendung lang genug" })).statusCode).toBe(403);
    }

    // Liste mit Zaehlern und Filtern
    const all = (await req(mo, "GET", `/orgs/${org}/moderation/posts`)).json() as { id: string; comments: number; openReports: number; tags: string[] }[];
    expect(all.map((p) => p.id).sort()).toEqual([p1.id, p2.id].sort());
    const second = all.find((p) => p.id === p2.id)!;
    expect(second).toMatchObject({ comments: 1, openReports: 1, tags: ["fussball"] });
    expect((await req(mo, "GET", `/orgs/${org}/moderation/posts?filter=reported`)).json().map((p: { id: string }) => p.id)).toEqual([p2.id]);
    expect((await req(mo, "GET", `/orgs/${org}/moderation/posts?filter=hidden`)).json()).toEqual([]);

    // Ausblenden: Begruendung Pflicht, Autor wird informiert, Meldung erledigt, Protokoll ohne Inhalt
    expect((await req(mo, "POST", `/posts/${p2.id}/moderation`, { action: "hide", reason: "kurz" })).statusCode).toBe(400);
    expect((await req(mo, "POST", `/posts/${p2.id}/moderation`, { action: "hide", reason: "Verstoss gegen die Regeln des Vereins" })).statusCode).toBe(204);
    const hidden = (await req(mo, "GET", `/orgs/${org}/moderation/posts?filter=hidden`)).json();
    expect(hidden).toHaveLength(1);
    expect(hidden[0]).toMatchObject({ id: p2.id, hidden: true, hiddenReason: "Verstoss gegen die Regeln des Vereins", openReports: 0 });
    const feed = (await req(nina, "GET", "/feed?mode=chrono")).json().posts as { id: string }[];
    expect(feed.some((p) => p.id === p2.id)).toBe(false);
    const notes = (await req(vera, "GET", "/notifications?limit=50")).json().items as { type: string; data: { reason: string } }[];
    expect(notes.some((n) => n.type === "post_hidden" && n.data.reason.includes("Verstoss"))).toBe(true);

    // Wieder einblenden
    expect((await req(mo, "POST", `/posts/${p2.id}/moderation`, { action: "unhide" })).statusCode).toBe(204);
    expect((await req(mo, "GET", `/orgs/${org}/moderation/posts?filter=hidden`)).json()).toEqual([]);
    expect((await req(mo, "POST", `/posts/${p2.id}/moderation`, { action: "boese" })).statusCode).toBe(400);

    // Kommentare
    const comments = (await req(mo, "GET", `/orgs/${org}/moderation/comments`)).json() as { id: string; authorName: string; postExcerpt: string }[];
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ id: comment.id, authorName: "mia" });
    expect((await req(mia, "DELETE", `/moderation/comments/${comment.id}`, {})).statusCode).toBe(403);
    expect((await req(mo, "DELETE", `/moderation/comments/${comment.id}`, {})).statusCode).toBe(204);
    expect((await req(mo, "GET", `/orgs/${org}/moderation/comments`)).json()).toEqual([]);
    expect((await req(mo, "DELETE", `/moderation/comments/${comment.id}`, {})).statusCode).toBe(404);

    // Protokoll: Aktionen stehen drin, Inhalte nicht
    const log = (await db.select().from(schema.auditLog)).filter((l) => ["post.hidden", "post.unhidden", "comment.deleted"].includes(l.action));
    expect(log.map((l) => l.action).sort()).toEqual(["comment.deleted", "post.hidden", "post.unhidden"]);
    expect(JSON.stringify(log)).not.toContain("beleidigender");
  });
});
