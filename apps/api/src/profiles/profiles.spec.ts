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

describe("Profile, Folgen, Sichtbarkeit", () => {
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

  type U = { cookie: string; id: string; name: string };
  async function signup(name: string, display = name): Promise<U> {
    const email = `${name}@example.de`;
    const reg = await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email, password, displayName: display, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: reg.json().id, name: display };
  }
  const req = (u: U, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });

  let anna: U, ben: U, clara: U, dirk: U;

  beforeAll(async () => {
    [anna, ben, clara, dirk] = [await signup("anna", "Anna Müller"), await signup("ben", "Ben Schröder"), await signup("clara", "Clara Weiß"), await signup("dirk", "Anna Müller")];
  });

  it("Profil entsteht automatisch, Handle aus dem Namen (Umlaute), Kollisionen werden aufgeloest", async () => {
    const a = (await req(anna, "GET", "/profiles/me")).json();
    expect(a.handle).toBe("anna_mueller");
    expect(a).toMatchObject({ displayName: "Anna Müller", visibility: "public", counts: { posts: 0, followers: 0, following: 0 }, viewer: { isMe: true, canView: true } });
    const d = (await req(dirk, "GET", "/profiles/me")).json();
    expect(d.handle).not.toBe("anna_mueller");
    expect(d.handle).toMatch(/^anna_mueller\d+$/);
    expect((await req(ben, "GET", "/profiles/me")).json().handle).toBe("ben_schroeder");
    expect((await req(clara, "GET", "/profiles/me")).json().handle).toBe("clara_weiss");
  });

  it("Profil ansehen: Gross-/Kleinschreibung egal, unbekannt = 404, ungueltig = 400, Login noetig", async () => {
    expect((await req(ben, "GET", "/profiles/ANNA_MUELLER")).json()).toMatchObject({ handle: "anna_mueller", viewer: { isMe: false, follow: "none", canView: true } });
    expect((await req(ben, "GET", "/profiles/gibt_es_nicht")).statusCode).toBe(404);
    expect((await req(ben, "GET", "/profiles/a")).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/profiles/anna_mueller" })).statusCode).toBe(401);
  });

  it("Profil bearbeiten: Handle, Bio, Ort, Anzeigename; Validierung und Eindeutigkeit", async () => {
    const ok = await req(anna, "PUT", "/profiles/me", { handle: "Anna_M", bio: "Torhüterin & Kassenwartin", location: "Musterstadt", displayName: "Anna M." });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ handle: "anna_m", bio: "Torhüterin & Kassenwartin", location: "Musterstadt", displayName: "Anna M." });
    expect((await req(anna, "GET", "/auth/me")).json().displayName).toBe("Anna M."); // Sitzung zeigt den neuen Namen sofort

    expect((await req(anna, "PUT", "/profiles/me", { handle: "ab" })).statusCode).toBe(400);
    expect((await req(anna, "PUT", "/profiles/me", { handle: "mit leerzeichen" })).statusCode).toBe(400);
    expect((await req(anna, "PUT", "/profiles/me", { handle: "admin" })).statusCode).toBe(400); // reserviert
    expect((await req(anna, "PUT", "/profiles/me", { bio: "x".repeat(301) })).statusCode).toBe(400);
    expect((await req(anna, "PUT", "/profiles/me", { handle: "ben_schroeder" })).statusCode).toBe(409); // vergeben
    expect((await req(ben, "GET", "/profiles/anna_mueller")).statusCode).toBe(404); // alter Handle frei
  });

  it("Folgen: Zaehler, Benachrichtigung, idempotent, kein Selbstfolgen, Entfolgen", async () => {
    const f = await req(ben, "POST", "/profiles/anna_m/follow");
    expect(f.json()).toMatchObject({ counts: { followers: 1 }, viewer: { follow: "following" } });
    await req(ben, "POST", "/profiles/anna_m/follow"); // nochmal: keine Doppelung
    expect((await req(ben, "GET", "/profiles/anna_m")).json().counts.followers).toBe(1);
    expect((await req(ben, "GET", "/profiles/me")).json().counts.following).toBe(1);

    const notes = (await req(anna, "GET", "/notifications")).json().items as { type: string; data: { handle: string } }[];
    expect(notes.filter((n) => n.type === "new_follower")).toHaveLength(1); // nur einmal
    expect(notes.find((n) => n.type === "new_follower")?.data.handle).toBe("ben_schroeder");

    expect((await req(anna, "POST", "/profiles/anna_m/follow")).statusCode).toBe(400);
    const u = await req(ben, "DELETE", "/profiles/anna_m/follow");
    expect(u.json()).toMatchObject({ counts: { followers: 0 }, viewer: { follow: "none" } });
  });

  it("Listen: Follower/Folge, Reihenfolge neueste zuerst", async () => {
    await req(ben, "POST", "/profiles/anna_m/follow");
    await req(clara, "POST", "/profiles/anna_m/follow");
    const followers = (await req(dirk, "GET", "/profiles/anna_m/followers")).json();
    expect(followers.map((p: { handle: string }) => p.handle)).toEqual(["clara_weiss", "ben_schroeder"]);
    expect(followers[0]).toMatchObject({ displayName: "Clara Weiß", follow: "none" });
    expect((await req(dirk, "GET", "/profiles/ben_schroeder/following")).json().map((p: { handle: string }) => p.handle)).toEqual(["anna_m"]);
  });

  it("Suche: nach Name und Handle, ohne sich selbst, Mindestlaenge", async () => {
    const byName = (await req(ben, "GET", "/profiles/search?q=Clara")).json();
    expect(byName.map((p: { handle: string }) => p.handle)).toEqual(["clara_weiss"]);
    const byHandle = (await req(clara, "GET", "/profiles/search?q=@ben_")).json();
    expect(byHandle.map((p: { handle: string }) => p.handle)).toEqual(["ben_schroeder"]);
    expect((await req(ben, "GET", "/profiles/search?q=ben")).json().some((p: { handle: string }) => p.handle === "ben_schroeder")).toBe(false);
    expect((await req(ben, "GET", "/profiles/search?q=a")).json()).toEqual([]);
    expect((await req(ben, "GET", "/profiles/search?q=Anna")).json().find((p: { handle: string }) => p.handle === "anna_m").follow).toBe("following");
  });

  it("Persoenliche Beitraege erscheinen auf dem Profil und im Feed der Follower", async () => {
    await req(anna, "POST", "/posts", { body: "Mein erster Beitrag" });
    const posts = (await req(clara, "GET", "/profiles/anna_m/posts")).json();
    expect(posts).toMatchObject({ locked: false });
    expect(posts.posts).toHaveLength(1);
    expect(posts.posts[0]).toMatchObject({ body: "Mein erster Beitrag", author: { handle: "anna_m", name: "Anna M." } });
    expect((await req(clara, "GET", "/profiles/anna_m")).json().counts.posts).toBe(1);

    // Follower sehen den Beitrag im Feed (Beziehung "Freund"), Nicht-Follower nicht
    const feed = (await req(clara, "GET", "/feed?mode=chrono")).json();
    expect(feed.posts[0]).toMatchObject({ body: "Mein erster Beitrag" });
    expect(feed.posts[0].reason).toMatch(/Du folgst Anna M\./);
    expect((await req(dirk, "GET", "/feed?mode=chrono")).json().posts).toHaveLength(0);
  });

  it("Privates Profil: Folgeanfrage, Beitraege gesperrt, Interaktion fuer Fremde unmoeglich", async () => {
    await req(ben, "PUT", "/profiles/me", { visibility: "private" });
    const post = (await req(ben, "POST", "/posts", { body: "Nur fuer Follower" })).json();

    const view = (await req(clara, "GET", "/profiles/ben_schroeder")).json();
    expect(view).toMatchObject({ visibility: "private", viewer: { follow: "none", canView: false }, clubs: null });
    expect(view.bio).toBeDefined(); // Name/Bio bleiben sichtbar wie bei Instagram
    expect((await req(clara, "GET", "/profiles/ben_schroeder/posts")).json()).toEqual({ posts: [], nextCursor: null, locked: true });
    expect((await req(clara, "GET", "/profiles/ben_schroeder/followers")).json()).toEqual([]);

    // Fremde koennen den Beitrag nicht liken, kommentieren oder melden - auch nicht mit bekannter ID
    expect((await req(clara, "POST", `/posts/${post.id}/like`)).statusCode).toBe(404);
    expect((await req(clara, "POST", `/posts/${post.id}/comments`, { body: "hi" })).statusCode).toBe(404);
    expect((await req(clara, "GET", `/posts/${post.id}/comments`)).statusCode).toBe(404);

    const request = await req(clara, "POST", "/profiles/ben_schroeder/follow");
    expect(request.json().viewer.follow).toBe("requested");
    expect((await req(clara, "GET", "/profiles/ben_schroeder/posts")).json().locked).toBe(true); // Anfrage reicht nicht

    const notes = (await req(ben, "GET", "/notifications")).json().items as { type: string }[];
    expect(notes.some((n) => n.type === "follow_request")).toBe(true);
    const pending = (await req(ben, "GET", "/profiles/requests")).json();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ handle: "clara_weiss", displayName: "Clara Weiß" });
    expect((await req(clara, "GET", "/profiles/requests")).json()).toEqual([]);

    // Nicht der Betroffene kann nicht entscheiden
    expect((await req(dirk, "POST", `/profiles/requests/${clara.id}/decision`, { decision: "approve" })).statusCode).toBe(404);
    expect((await req(ben, "POST", `/profiles/requests/${clara.id}/decision`, { decision: "approve" })).statusCode).toBe(204);

    const after = (await req(clara, "GET", "/profiles/ben_schroeder")).json();
    expect(after.viewer).toMatchObject({ follow: "following", canView: true });
    expect((await req(clara, "GET", "/profiles/ben_schroeder/posts")).json().posts).toHaveLength(1);
    expect((await req(clara, "POST", `/posts/${post.id}/like`)).statusCode).toBe(200);
    const cn = (await req(clara, "GET", "/notifications")).json().items as { type: string }[];
    expect(cn.some((n) => n.type === "follow_accepted")).toBe(true);
  });

  it("Anfrage ablehnen; oeffentlich schalten nimmt offene Anfragen automatisch an", async () => {
    await req(dirk, "POST", "/profiles/ben_schroeder/follow");
    const [pending] = (await req(ben, "GET", "/profiles/requests")).json();
    expect((await req(ben, "POST", `/profiles/requests/${pending.userId}/decision`, { decision: "reject" })).statusCode).toBe(204);
    expect((await req(dirk, "GET", "/profiles/ben_schroeder")).json().viewer.follow).toBe("none");

    await req(dirk, "POST", "/profiles/ben_schroeder/follow");
    await req(ben, "PUT", "/profiles/me", { visibility: "public" });
    expect((await req(dirk, "GET", "/profiles/ben_schroeder")).json().viewer).toMatchObject({ follow: "following", canView: true });
    expect((await req(ben, "GET", "/profiles/requests")).json()).toEqual([]);
  });

  it("Vereine im Profil: sichtbar nur wenn freigegeben", async () => {
    await req(anna, "POST", "/orgs", { name: "Profil Verein", category: "Sport", city: "Pstadt" });
    expect((await req(ben, "GET", "/profiles/anna_m")).json().clubs).toEqual([{ slug: "profil-verein", name: "Profil Verein" }]);
    await req(anna, "PUT", "/profiles/me", { showClubs: false });
    expect((await req(ben, "GET", "/profiles/anna_m")).json().clubs).toBeNull();
  });

  it("Kontoloeschung entfernt Profil und Beziehungen", async () => {
    const del = await req(clara, "DELETE", "/privacy/account", { password });
    expect(del.statusCode).toBe(204);
    expect((await req(ben, "GET", "/profiles/clara_weiss")).statusCode).toBe(404);
    expect((await req(anna, "GET", "/profiles/anna_m")).json().counts.followers).toBe(1); // nur noch ben
    const left = await db.select().from(schema.userFollows);
    expect(left.every((f) => f.followerId !== clara.id && f.followedId !== clara.id)).toBe(true);
  });
});
