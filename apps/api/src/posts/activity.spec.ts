import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { REALTIME_BUS, type BusMessage, type RealtimeBus } from "../chat/realtime-bus";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { exportNotificationData } from "../notifications/notifications.service";
import { createTestDb } from "../testing/test-db";
import { confirmEmailForTest } from "../testing/auth";
import { parseMentions } from "./activity.service";

const password = "ein-sehr-langes-passwort";

describe("parseMentions", () => {
  it("findet Benutzernamen, ignoriert Mailadressen, Doppelte und begrenzt auf fuenf", () => {
    expect(parseMentions("Hallo @Anna_1 und @ben, mail a@example.de, nochmal @anna_1")).toEqual(["anna_1", "ben"]);
    expect(parseMentions("@ab zu kurz, @@doppelt")).toEqual([]);
    expect(parseMentions("@aaa @bbb @ccc @ddd @eee @fff")).toHaveLength(5);
  });
});

describe("Aktivitaet: Likes, Antworten, Erwaehnungen", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const live: BusMessage[] = [];
  const bus: RealtimeBus = { publish: async (m) => void live.push(m), subscribe: async () => undefined, close: async () => undefined };

  beforeAll(async () => {
    db = await createTestDb();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).overrideProvider(REALTIME_BUS).useValue(bus).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app.close();
  });

  type U = { cookie: string; id: string; handle: string };
  async function signup(name: string): Promise<U> {
    const email = `${name}@example.de`;
    await app.inject({ method: "POST", url: "/auth/register", payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true } });
    await confirmEmailForTest(app, email);
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const me = await app.inject({ method: "GET", url: "/profiles/me", headers: { cookie } });
    return { cookie, id: login.json().id, handle: me.json().handle };
  }
  const req = (u: U, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });
  const notes = async (u: U) => (await req(u, "GET", "/notifications?limit=50")).json() as { unread: number; items: any[] };

  let anna: U, ben: U, cem: U, dora: U, emil: U;
  let postId: string;

  beforeAll(async () => {
    [anna, ben, cem, dora, emil] = [await signup("anna"), await signup("ben"), await signup("cem"), await signup("dora"), await signup("emil")];
    postId = (await req(anna, "POST", "/posts", { body: "Hallo Welt" })).json().id;
  });

  it("buendelt Likes je Beitrag und Tag: eine Zeile, Personenliste begrenzt, Zaehler stimmt", async () => {
    for (const u of [ben, cem, dora, emil]) expect((await req(u, "POST", `/posts/${postId}/like`)).statusCode).toBe(200);
    const n = (await notes(anna)).items.filter((i) => i.type === "like");
    expect(n).toHaveLength(1);
    expect(n[0].count).toBe(4);
    expect(n[0].actors).toHaveLength(3);
    expect(n[0].actors[0]).toMatchObject({ name: "emil", handle: emil.handle });
    expect(n[0].data).toEqual({ postId });
    // Live-Ereignis (nur ID) ging an die Autorin
    expect(live.some((m) => m.userIds[0] === anna.id && m.event.type === "notification")).toBe(true);
    expect(JSON.stringify(live)).not.toContain("emil"); // keine Namen im Bus
  });

  it("eigener Like erzeugt nichts; Zurueckziehen verringert den Zaehler, ohne Likes verschwindet die Zeile", async () => {
    await req(anna, "POST", `/posts/${postId}/like`);
    expect((await notes(anna)).items.find((i) => i.type === "like").count).toBe(4);
    await req(emil, "POST", `/posts/${postId}/like`); // zurueck
    const after = (await notes(anna)).items.find((i) => i.type === "like");
    expect(after.count).toBe(3);
    expect(after.actors.map((a: any) => a.name)).not.toContain("emil");
    for (const u of [ben, cem, dora]) await req(u, "POST", `/posts/${postId}/like`);
    expect((await notes(anna)).items.filter((i) => i.type === "like")).toHaveLength(0);
  });

  it("Like-Liste: Betrachter sieht Personen, private Profile bleiben verborgen", async () => {
    for (const u of [ben, cem]) await req(u, "POST", `/posts/${postId}/like`);
    await req(cem, "PUT", "/profiles/me", { visibility: "private" });
    const page = (await req(dora, "GET", `/posts/${postId}/likes`)).json();
    expect(page.total).toBe(3); // anna, ben, cem
    expect(page.items.map((i: any) => i.name).sort()).toEqual(["anna", "ben"]);
    expect((await req(cem, "GET", `/posts/${postId}/likes`)).json().items.map((i: any) => i.name)).toContain("cem");
    await req(cem, "PUT", "/profiles/me", { visibility: "public" });
  });

  it("Antworten: eine Ebene, Benachrichtigung an den Kommentar-Autor, Likes auf Kommentare", async () => {
    const top = (await req(ben, "POST", `/posts/${postId}/comments`, { body: "Erster!" })).json();
    expect(top.parentId).toBeNull();
    const reply = (await req(cem, "POST", `/posts/${postId}/comments`, { body: "Stimmt", parentId: top.id })).json();
    expect(reply.parentId).toBe(top.id);
    // keine zweite Ebene, kein fremder Beitrag
    expect((await req(dora, "POST", `/posts/${postId}/comments`, { body: "x", parentId: reply.id })).statusCode).toBe(400);
    const other = (await req(anna, "POST", "/posts", { body: "anderer" })).json().id;
    expect((await req(dora, "POST", `/posts/${other}/comments`, { body: "x", parentId: top.id })).statusCode).toBe(404);

    const bens = (await notes(ben)).items.find((i) => i.type === "comment_reply");
    expect(bens).toMatchObject({ data: { postId, commentId: reply.id }, actors: [{ name: "cem" }] });
    // Autorin bekommt "comment" fuer beide, keine Doppelung durch Antwort
    expect((await notes(anna)).items.filter((i) => i.type === "comment")).toHaveLength(2);

    // Kommentar-Likes (gebuendelt) und Anzeige
    await req(dora, "POST", `/comments/${top.id}/like`);
    await req(emil, "POST", `/comments/${top.id}/like`);
    const cl = (await notes(ben)).items.find((i) => i.type === "comment_like");
    expect(cl).toMatchObject({ count: 2, data: { postId, commentId: top.id } });
    const list = (await req(dora, "GET", `/posts/${postId}/comments`)).json();
    expect(list.find((c: any) => c.id === top.id)).toMatchObject({ likes: 2, likedByMe: true, parentId: null });
    expect(list.find((c: any) => c.id === reply.id)).toMatchObject({ parentId: top.id, likes: 0, likedByMe: false });
    // Elternkommentar loeschen entfernt die Antworten
    await req(ben, "DELETE", `/comments/${top.id}`);
    expect((await req(dora, "GET", `/posts/${postId}/comments`)).json().filter((c: any) => c.parentId)).toHaveLength(0);
  });

  it("@Erwaehnungen: Benachrichtigung nur, wenn die Person den Beitrag sehen darf", async () => {
    // privater Autor: nur Follower sehen den Beitrag
    await req(anna, "PUT", "/profiles/me", { visibility: "private" });
    await req(ben, "POST", `/profiles/${anna.handle}/follow`);
    await req(anna, "POST", `/profiles/requests/${ben.id}/decision`, { decision: "approve" });
    const secret = (await req(anna, "POST", "/posts", { body: `Hi @${ben.handle} und @${dora.handle}` })).json().id;
    expect((await notes(ben)).items.find((i) => i.type === "mention" && i.data.postId === secret)).toBeTruthy();
    expect((await notes(dora)).items.find((i) => i.type === "mention")).toBeUndefined(); // sieht den Beitrag nicht: kein Hinweis
    // Kommentar mit Erwaehnung einer Person ohne Zugriff
    await req(ben, "POST", `/posts/${secret}/comments`, { body: `cc @${dora.handle}` });
    expect((await notes(dora)).items.find((i) => i.type === "mention")).toBeUndefined();
    // oeffentlicher Beitrag: Erwaehnung kommt an, nicht bei sich selbst
    await req(anna, "PUT", "/profiles/me", { visibility: "public" });
    const open = (await req(anna, "POST", "/posts", { body: `@${dora.handle} @${anna.handle}` })).json().id;
    expect((await notes(dora)).items.find((i) => i.type === "mention")).toMatchObject({ data: { postId: open }, actors: [{ name: "anna" }] });
    expect((await notes(anna)).items.find((i) => i.type === "mention")).toBeUndefined();
  });

  it("Blockierung: keine Benachrichtigung in keine Richtung", async () => {
    const p = (await req(anna, "POST", "/posts", { body: "Block-Test" })).json().id;
    await req(anna, "PUT", `/chat/blocks/${emil.id}`);
    await req(emil, "POST", `/posts/${p}/like`);
    await req(emil, "POST", `/posts/${p}/comments`, { body: `hi @${anna.handle}` });
    const items = (await notes(anna)).items.filter((i) => i.data.postId === p);
    expect(items).toHaveLength(0);
    await req(anna, "DELETE", `/chat/blocks/${emil.id}`);
  });

  it("GET /me/likes und /me/comments: Keyset-Paging, nur sichtbare Beitraege", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 22; i++) ids.push((await req(anna, "POST", "/posts", { body: `P${i}` })).json().id);
    for (const id of ids) await req(dora, "POST", `/posts/${id}/like`);
    const first = (await req(dora, "GET", "/me/likes")).json();
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toBeTruthy();
    expect(first.items[0].post).toMatchObject({ by: "anna" });
    const second = (await req(dora, "GET", `/me/likes?cursor=${encodeURIComponent(first.nextCursor)}`)).json();
    expect(second.items.length).toBeGreaterThan(0);
    expect(new Set([...first.items, ...second.items].map((i: any) => i.postId)).size).toBe(first.items.length + second.items.length);
    await req(dora, "POST", `/posts/${ids[0]}/comments`, { body: "mein Kommentar" });
    expect((await req(dora, "GET", "/me/comments")).json().items[0]).toMatchObject({ body: "mein Kommentar", post: { id: ids[0] } });
    expect((await req(dora, "GET", "/me/likes?cursor=kaputt")).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/me/likes" })).statusCode).toBe(401);
    // geloeschter Beitrag verschwindet
    await db.update(schema.posts).set({ deletedAt: new Date() }).where(eq(schema.posts.id, ids[1]));
    const again = (await req(dora, "GET", "/me/likes")).json();
    expect(again.items.some((i: any) => i.postId === ids[1])).toBe(false);
  });

  it("Ausblenden loescht nur eigene Benachrichtigungen; Einzelabruf nur fuer den Empfaenger", async () => {
    const mine = (await notes(dora)).items[0];
    expect((await req(emil, "GET", `/notifications/${mine.id}`)).statusCode).toBe(404);
    expect((await req(emil, "DELETE", `/notifications/${mine.id}`)).statusCode).toBe(204);
    expect((await req(dora, "GET", `/notifications/${mine.id}`)).statusCode).toBe(200);
    expect((await req(dora, "DELETE", `/notifications/${mine.id}`)).statusCode).toBe(204);
    expect((await req(dora, "GET", `/notifications/${mine.id}`)).statusCode).toBe(404);
  });

  it("Datenschutz: Export ohne Fremdnamen; Kontoloeschung nimmt die Person aus gebuendelten Likes", async () => {
    expect(exportNotificationData("like", { postId: "p", excerpt: "geheim" })).toEqual({ postId: "p" });
    expect(exportNotificationData("mention", { postId: "p", commentId: "c", excerpt: "geheim" })).toEqual({ postId: "p", commentId: "c" });
    expect(exportNotificationData("comment_reply", { postId: "p", excerpt: "geheim" })).toEqual({ postId: "p" });

    const p = (await req(ben, "POST", "/posts", { body: "Loeschtest" })).json().id;
    await req(cem, "POST", `/posts/${p}/like`);
    await req(dora, "POST", `/posts/${p}/like`);
    expect((await notes(ben)).items.find((i) => i.type === "like" && i.data.postId === p).count).toBe(2);
    expect((await req(cem, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);
    const after = (await notes(ben)).items.find((i) => i.type === "like" && i.data.postId === p);
    expect(after.count).toBe(1);
    expect(after.actors.map((a: any) => a.name)).toEqual(["dora"]);

    const exp = (await req(dora, "GET", "/privacy/export")).json();
    expect(exp.likes.length).toBeGreaterThan(0);
    expect(Array.isArray(exp.commentLikes)).toBe(true);
  });
});
