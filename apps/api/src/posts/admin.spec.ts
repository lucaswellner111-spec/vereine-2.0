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

describe("Mitgliederverwaltung, Moderation, Benachrichtigungen, Paging", () => {
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
  const req = (u: U, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie: u.cookie } });

  let vera: U, mia: U, tom: U, nina: U;
  const org = "sv-test";

  beforeAll(async () => {
    [vera, mia, tom, nina] = [await signup("vera"), await signup("mia"), await signup("tom"), await signup("nina")];
    await req(vera, "POST", "/orgs", { name: "SV Test", category: "Sport", city: "Testdorf" });
  });

  it("Mitgliedsantrag benachrichtigt den Vorstand; Vorstand sieht und entscheidet", async () => {
    await req(mia, "POST", `/orgs/${org}/membership`);
    await req(tom, "POST", `/orgs/${org}/membership`);

    const notes = (await req(vera, "GET", "/notifications")).json();
    expect(notes.unread).toBe(2);
    expect(notes.items[0]).toMatchObject({ type: "membership_request", data: { orgSlug: org } });

    // Nur Vorstand darf die Liste sehen
    expect((await req(mia, "GET", `/orgs/${org}/members`)).statusCode).toBe(403);
    const pending = (await req(vera, "GET", `/orgs/${org}/members?status=pending`)).json();
    expect(pending.map((m: { name: string }) => m.name).sort()).toEqual(["mia", "tom"]);
    expect(JSON.stringify(pending)).not.toMatch(/example\.de/); // keine E-Mail-Adressen

    expect((await req(mia, "POST", `/orgs/${org}/members/${tom.id}/decision`, { decision: "approve" })).statusCode).toBe(403);
    expect((await req(vera, "POST", `/orgs/${org}/members/${mia.id}/decision`, { decision: "approve" })).statusCode).toBe(204);
    expect((await req(vera, "POST", `/orgs/${org}/members/${tom.id}/decision`, { decision: "reject" })).statusCode).toBe(204);
    expect((await req(vera, "POST", `/orgs/${org}/members/${tom.id}/decision`, { decision: "approve" })).statusCode).toBe(404);

    expect((await req(mia, "GET", `/orgs/${org}`)).json().viewer).toMatchObject({ membership: "active", role: "member" });
    expect((await req(tom, "GET", `/orgs/${org}`)).json().viewer.membership).toBe("none");

    const miaNotes = (await req(mia, "GET", "/notifications")).json();
    expect(miaNotes.items[0]).toMatchObject({ type: "membership_decision", data: { decision: "approve" } });
    const tomNotes = (await req(tom, "GET", "/notifications")).json();
    expect(tomNotes.items[0].data.decision).toBe("reject");
  });

  it("Benachrichtigungen: als gelesen markieren, nur eigene", async () => {
    const before = (await req(vera, "GET", "/notifications")).json();
    expect(before.unread).toBeGreaterThan(0);
    expect((await req(nina, "POST", "/notifications/read", { ids: before.items.map((i: { id: string }) => i.id) })).statusCode).toBe(204);
    expect((await req(vera, "GET", "/notifications")).json().unread).toBe(before.unread); // fremde IDs wirkungslos
    expect((await req(vera, "POST", "/notifications/read", {})).statusCode).toBe(204);
    expect((await req(vera, "GET", "/notifications")).json().unread).toBe(0);
  });

  it("Rollen: Vorstand ernennt Moderation, letzter Vorstand ist geschuetzt", async () => {
    expect((await req(mia, "PUT", `/orgs/${org}/members/${mia.id}/role`, { role: "admin" })).statusCode).toBe(403);
    expect((await req(vera, "PUT", `/orgs/${org}/members/${mia.id}/role`, { role: "moderator" })).statusCode).toBe(204);
    expect((await req(vera, "PUT", `/orgs/${org}/members/${mia.id}/role`, { role: "chef" })).statusCode).toBe(400);
    expect((await req(vera, "PUT", `/orgs/${org}/members/${vera.id}/role`, { role: "member" })).statusCode).toBe(400);
    expect((await req(vera, "DELETE", `/orgs/${org}/members/${vera.id}`)).statusCode).toBe(400);

    // Moderation darf fuer den Verein posten
    expect((await req(mia, "POST", "/posts", { body: "Trainingszeiten aendern sich.", orgSlug: org })).statusCode).toBe(201);
  });

  let postId: string;

  it("Kommentar benachrichtigt den Autor", async () => {
    const post = (await req(vera, "POST", "/posts", { body: "Neue Trikots sind da", orgSlug: org })).json();
    postId = post.id;
    await req(tom, "POST", `/posts/${postId}/comments`, { body: "Sieht gut aus!" });
    await req(vera, "POST", `/posts/${postId}/comments`, { body: "Danke" }); // eigener Kommentar: keine Benachrichtigung
    const notes = (await req(vera, "GET", "/notifications")).json();
    const comment = notes.items.filter((n: { type: string }) => n.type === "comment");
    expect(comment).toHaveLength(1);
    expect(comment[0].data).toMatchObject({ commenter: "tom", excerpt: "Sieht gut aus!" });
  });

  it("Moderation: Meldung -> Ausblenden mit Begruendung -> Autor wird informiert", async () => {
    await req(tom, "POST", `/posts/${postId}/report`, { reason: "spam", note: "Werbung" });
    await req(nina, "POST", `/posts/${postId}/report`, { reason: "other" });

    expect((await req(tom, "GET", `/orgs/${org}/reports`)).statusCode).toBe(403);
    const queue = (await req(mia, "GET", `/orgs/${org}/reports`)).json(); // Moderation darf
    expect(queue).toHaveLength(2);
    expect(queue[0].post.body).toBe("Neue Trikots sind da");

    // Ausblenden braucht eine Begruendung (DSA)
    const noReason = await req(mia, "POST", `/reports/${queue[0].id}/resolve`, { action: "hide", reason: "kurz" });
    expect(noReason.statusCode).toBe(400);
    expect((await req(tom, "POST", `/reports/${queue[0].id}/resolve`, { action: "dismiss" })).statusCode).toBe(403);

    const ok = await req(mia, "POST", `/reports/${queue[0].id}/resolve`, { action: "hide", reason: "Werbung ist im Verein nicht erlaubt." });
    expect(ok.statusCode).toBe(204);

    // alle offenen Meldungen zu diesem Beitrag sind erledigt, Beitrag ist verschwunden
    expect((await req(mia, "GET", `/orgs/${org}/reports`)).json()).toHaveLength(0);
    expect((await req(mia, "GET", `/orgs/${org}/reports?status=actioned`)).json()).toHaveLength(2);
    expect((await req(tom, "POST", `/posts/${postId}/like`)).statusCode).toBe(404);
    const feed = (await req(vera, "GET", "/feed?mode=chrono")).json();
    expect(feed.posts.some((p: { id: string }) => p.id === postId)).toBe(false);

    const authorNotes = (await req(vera, "GET", "/notifications")).json();
    const hidden = authorNotes.items.find((n: { type: string }) => n.type === "post_hidden");
    expect(hidden.data.reason).toBe("Werbung ist im Verein nicht erlaubt.");
    const [row] = await db.select().from(schema.posts).where(eqId(postId));
    expect(row.hiddenAt).not.toBeNull(); // bleibt gespeichert (Nachweis), ist aber unsichtbar
  });

  it("Moderation: Meldung ablehnen", async () => {
    const p = (await req(vera, "POST", "/posts", { body: "Alles in Ordnung", orgSlug: org })).json();
    await req(tom, "POST", `/posts/${p.id}/report`, { reason: "other" });
    const [r] = (await req(vera, "GET", `/orgs/${org}/reports`)).json();
    expect((await req(vera, "POST", `/reports/${r.id}/resolve`, { action: "dismiss" })).statusCode).toBe(204);
    expect((await req(vera, "GET", `/orgs/${org}/reports?status=dismissed`)).json()).toHaveLength(1);
    expect((await req(vera, "GET", `/orgs/${org}/posts`)).json().posts.some((x: { id: string }) => x.id === p.id)).toBe(true);
  });

  it("Feed-Paging: Keyset-Cursor liefert alle Beitraege ohne Doppelte, auch bei gleichen Zeitstempeln", async () => {
    for (let i = 1; i <= 45; i++) await req(vera, "POST", "/posts", { body: `Beitrag ${i}`, orgSlug: org });

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `/feed?mode=chrono${cursor ? `&cursor=${cursor}` : ""}`;
      const res: { posts: { id: string }[]; nextCursor: string | null } = (await req(vera, "GET", url)).json();
      seen.push(...res.posts.map((p) => p.id));
      cursor = res.nextCursor;
      pages++;
    } while (cursor && pages < 10);

    expect(pages).toBeGreaterThanOrEqual(3);
    expect(new Set(seen).size).toBe(seen.length); // keine Duplikate
    expect(seen.length).toBe(45 + 2); // 45 neue + 2 sichtbare Altbeitraege (Trainingszeiten, "Alles in Ordnung"); "Neue Trikots" ist ausgeblendet
    expect((await req(vera, "GET", "/feed?cursor=kaputt")).statusCode).toBe(400);
  });

  it("Ranking-Paging: ranked liefert Seiten mit r:-Cursor", async () => {
    await req(vera, "PUT", "/privacy/consents", { purpose: "personalized_feed", granted: true });
    const first = (await req(vera, "GET", "/feed?mode=ranked")).json();
    expect(first.personalized).toBe(true);
    expect(first.posts).toHaveLength(20);
    expect(first.nextCursor).toBe("r:20");
    const second = (await req(vera, "GET", `/feed?mode=ranked&cursor=${first.nextCursor}`)).json();
    const ids = new Set([...first.posts, ...second.posts].map((p: { id: string }) => p.id));
    expect(ids.size).toBe(first.posts.length + second.posts.length);
  });

  it("Entdecken: Neue Nutzer ohne Follows sehen oeffentliche Vereinsbeitraege", async () => {
    const feed = (await req(nina, "GET", "/feed?mode=chrono")).json();
    expect(feed.posts.length).toBeGreaterThan(0);
    expect(feed.posts[0].reason).toMatch(/Entdecken|Beliebt/);
  });

  it("Austritt: Mitglied kann den Verein verlassen, Vorstand kann entfernen", async () => {
    expect((await req(mia, "DELETE", `/orgs/${org}/members/${mia.id}`)).statusCode).toBe(204);
    expect((await req(tom, "DELETE", `/orgs/${org}/members/${mia.id}`)).statusCode).toBe(403);
    await req(tom, "POST", `/orgs/${org}/membership`);
    expect((await req(vera, "POST", `/orgs/${org}/members/${tom.id}/decision`, { decision: "approve" })).statusCode).toBe(204);
    expect((await req(vera, "DELETE", `/orgs/${org}/members/${tom.id}`)).statusCode).toBe(204);
  });
});

import { eq } from "drizzle-orm";
const eqId = (id: string) => eq(schema.posts.id, id);
