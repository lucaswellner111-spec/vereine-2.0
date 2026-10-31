import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { CACHE, type Cache } from "../cache/cache.module";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { ChatCrypto } from "./chat-crypto.service";
import { ChatService } from "./chat.service";
import { REALTIME_BUS, type BusMessage, type RealtimeBus } from "./realtime-bus";

const password = "ein-sehr-langes-passwort";

describe("Chat", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let chat: ChatService;
  const published: BusMessage[] = [];

  beforeAll(async () => {
    db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
    const bus: RealtimeBus = { publish: async (m) => void published.push(m), subscribe: async () => undefined, close: async () => undefined };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DB).useValue(db)
      .overrideProvider(REALTIME_BUS).useValue(bus)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    chat = app.get(ChatService);
  });

  afterAll(async () => {
    await app.close();
  });

  type U = { cookie: string; id: string; name: string };
  async function signup(name: string): Promise<U> {
    const email = `${name}@example.de`;
    const reg = await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: reg.json().id, name };
  }
  const req = (u: U, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });

  let vera: U, mia: U, ben: U, tom: U, nina: U;
  // Das Rate-Limit (30/min) soll nur der eigene Test ausloesen, nicht die Massen-Tests davor.
  beforeEach(async () => {
    const cache = app.get<Cache>(CACHE);
    for (const u of [vera, mia, ben, tom, nina]) if (u) await cache.del(`chat:rate:${u.id}`);
  });
  const org = "chat-verein";

  beforeAll(async () => {
    [vera, mia, ben, tom, nina] = [await signup("vera"), await signup("mia"), await signup("ben"), await signup("tom"), await signup("nina")];
    await req(vera, "POST", "/orgs", { name: "Chat Verein", category: "Sport", city: "Chatstadt" });
    for (const m of [mia, ben]) {
      await req(m, "POST", `/orgs/${org}/membership`);
      await req(vera, "POST", `/orgs/${org}/members/${m.id}/decision`, { decision: "approve" });
    }
    await req(tom, "POST", `/orgs/${org}/follow`); // Follower, kein Mitglied
  });

  it("verlangt Login", async () => {
    expect((await app.inject({ method: "GET", url: "/chat/conversations" })).statusCode).toBe(401);
  });

  it("Direktchat: nur unter Vereinsmitgliedern oder an den Vorstand gefolgter Vereine", async () => {
    expect((await req(mia, "POST", "/chat/conversations", { kind: "direct", userId: ben.id })).statusCode).toBe(201); // gleicher Verein
    expect((await req(tom, "POST", "/chat/conversations", { kind: "direct", userId: vera.id })).statusCode).toBe(201); // Follower -> Vorstand
    expect((await req(tom, "POST", "/chat/conversations", { kind: "direct", userId: mia.id })).statusCode).toBe(403); // Follower -> normales Mitglied
    expect((await req(nina, "POST", "/chat/conversations", { kind: "direct", userId: vera.id })).statusCode).toBe(403); // Fremde
    expect((await req(mia, "POST", "/chat/conversations", { kind: "direct", userId: mia.id })).statusCode).toBe(400);
    expect((await req(mia, "POST", "/chat/conversations", { kind: "direct", userId: "00000000-0000-0000-0000-000000000000" })).statusCode).toBe(404);
    expect((await req(mia, "POST", "/chat/conversations", { kind: "direct" })).statusCode).toBe(400);
  });

  it("Direktchat ist je Paar eindeutig (auch in Gegenrichtung)", async () => {
    const a = (await req(mia, "POST", "/chat/conversations", { kind: "direct", userId: ben.id })).json();
    const b = (await req(ben, "POST", "/chat/conversations", { kind: "direct", userId: mia.id })).json();
    expect(a.id).toBe(b.id);
    expect(a.title).toBe("ben");
    expect(b.title).toBe("mia");
  });

  it("Kontaktliste: Vereinsmitglieder und Vorstand gefolgter Vereine, nie Fremde", async () => {
    const names = async (u: U) => ((await req(u, "GET", "/chat/contacts")).json() as { name: string }[]).map((c) => c.name);
    expect(await names(mia)).toEqual(["ben", "vera"]);
    expect(await names(tom)).toEqual(["vera"]);
    expect(await names(nina)).toEqual([]);
  });

  let dm: string;

  it("Nachrichten senden, lesen, nur verschluesselt gespeichert", async () => {
    dm = (await req(mia, "POST", "/chat/conversations", { kind: "direct", userId: ben.id })).json().id;
    published.length = 0;
    const sent = await req(mia, "POST", `/chat/conversations/${dm}/messages`, { body: "Hallo Ben, trainierst du heute? ⚽" });
    expect(sent.statusCode).toBe(201);
    expect(sent.json()).toMatchObject({ body: "Hallo Ben, trainierst du heute? ⚽", mine: true, senderName: "mia" });

    // in der Datenbank steht kein Klartext
    const rows = await db.select().from(schema.messages);
    expect(JSON.stringify(rows)).not.toMatch(/Hallo Ben|trainierst/);
    expect(rows[0].ciphertext.split(".")).toHaveLength(3);

    // Echtzeit-Ereignis enthaelt nur IDs und gilt allen Mitgliedern
    expect(published).toHaveLength(1);
    expect(published[0].userIds.sort()).toEqual([mia.id, ben.id].sort());
    expect(JSON.stringify(published[0])).not.toMatch(/Hallo/);
    expect(published[0].event).toMatchObject({ type: "message", conversationId: dm });

    const page = (await req(ben, "GET", `/chat/conversations/${dm}/messages`)).json();
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0]).toMatchObject({ body: "Hallo Ben, trainierst du heute? ⚽", mine: false, senderName: "mia" });

    expect((await req(mia, "POST", `/chat/conversations/${dm}/messages`, { body: "   " })).statusCode).toBe(400);
    expect((await req(mia, "POST", `/chat/conversations/${dm}/messages`, { body: "x".repeat(2001) })).statusCode).toBe(400);
  });

  it("Fremde sehen die Unterhaltung nicht (404, kein Hinweis auf Existenz)", async () => {
    for (const u of [nina, tom, vera]) {
      expect((await req(u, "GET", `/chat/conversations/${dm}`)).statusCode).toBe(404);
      expect((await req(u, "GET", `/chat/conversations/${dm}/messages`)).statusCode).toBe(404);
      expect((await req(u, "POST", `/chat/conversations/${dm}/messages`, { body: "hi" })).statusCode).toBe(404);
    }
    expect((await req(mia, "GET", "/chat/conversations/kein-uuid")).statusCode).toBe(400);
  });

  it("Ungelesen-Zaehler, Vorschau, Gelesen-Markierung", async () => {
    await req(mia, "POST", `/chat/conversations/${dm}/messages`, { body: "Zweite Nachricht" });
    expect((await req(ben, "GET", "/chat/unread")).json()).toEqual({ unread: 2 });
    expect((await req(mia, "GET", "/chat/unread")).json()).toEqual({ unread: 0 }); // eigene Nachrichten zaehlen nicht

    const list = (await req(ben, "GET", "/chat/conversations")).json();
    expect(list.find((c: { id: string }) => c.id === dm)).toMatchObject({ unread: 2, title: "mia", lastMessage: { preview: "Zweite Nachricht", mine: false } });

    expect((await req(ben, "POST", `/chat/conversations/${dm}/read`)).statusCode).toBe(204);
    expect((await req(ben, "GET", "/chat/unread")).json()).toEqual({ unread: 0 });
  });

  it("Paging: Keyset-Cursor liefert alle Nachrichten ohne Doppelte, aelteste zuerst", async () => {
    for (let i = 1; i <= 70; i++) {
      if (i % 20 === 0) await app.get<Cache>(CACHE).del(`chat:rate:${ben.id}`); // Rate-Limit nicht ausloesen
      expect((await req(ben, "POST", `/chat/conversations/${dm}/messages`, { body: `Nachricht ${i}` })).statusCode).toBe(201);
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `/chat/conversations/${dm}/messages${cursor ? `?cursor=${cursor}` : ""}`;
      const res: { messages: { id: string; createdAt: string }[]; nextCursor: string | null } = (await req(mia, "GET", url)).json();
      const times = res.messages.map((m) => m.createdAt);
      expect([...times].sort()).toEqual(times); // innerhalb einer Seite aufsteigend
      seen.unshift(...res.messages.map((m) => m.id));
      cursor = res.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(72);
    expect((await req(mia, "GET", `/chat/conversations/${dm}/messages?cursor=kaputt`)).statusCode).toBe(400);
  });

  it("Blockieren: in beide Richtungen keine Nachrichten, aufhebbar", async () => {
    expect((await req(ben, "PUT", `/chat/blocks/${mia.id}`)).statusCode).toBe(204);
    expect((await req(mia, "POST", `/chat/conversations/${dm}/messages`, { body: "geblockt?" })).statusCode).toBe(403);
    expect((await req(ben, "POST", `/chat/conversations/${dm}/messages`, { body: "ich auch nicht" })).statusCode).toBe(403);
    expect((await req(ben, "GET", `/chat/conversations/${dm}`)).json().blocked).toBe(true);
    expect(((await req(ben, "GET", "/chat/contacts")).json() as { name: string }[]).map((c) => c.name)).not.toContain("mia");
    expect((await req(ben, "GET", "/chat/blocks")).json()).toEqual([{ userId: mia.id, name: "mia" }]);
    expect((await req(ben, "PUT", `/chat/blocks/${ben.id}`)).statusCode).toBe(400);

    expect((await req(ben, "DELETE", `/chat/blocks/${mia.id}`)).statusCode).toBe(204);
    expect((await req(mia, "POST", `/chat/conversations/${dm}/messages`, { body: "wieder frei" })).statusCode).toBe(201);
  });

  it("Eigene Nachricht loeschen: Inhalt wird entfernt, Platzhalter bleibt", async () => {
    const m = (await req(mia, "POST", `/chat/conversations/${dm}/messages`, { body: "Das war ein Fehler" })).json();
    expect((await req(ben, "DELETE", `/chat/messages/${m.id}`)).statusCode).toBe(403);
    expect((await req(mia, "DELETE", `/chat/messages/${m.id}`)).statusCode).toBe(204);
    const [row] = await db.select().from(schema.messages).where(eq(schema.messages.id, m.id));
    expect(row.ciphertext).toBe("");
    expect(row.deletedAt).not.toBeNull();
    const page = (await req(ben, "GET", `/chat/conversations/${dm}/messages`)).json();
    expect(page.messages.at(-1)).toMatchObject({ id: m.id, body: null, deleted: true });
  });

  it("Melden: nur Mitglieder, nur fremde Nachrichten, verschluesselte Kopie als Beweis", async () => {
    const m = (await req(mia, "POST", `/chat/conversations/${dm}/messages`, { body: "Unerlaubter Inhalt" })).json();
    expect((await req(mia, "POST", `/chat/messages/${m.id}/report`, { reason: "spam" })).statusCode).toBe(400);
    expect((await req(nina, "POST", `/chat/messages/${m.id}/report`, { reason: "spam" })).statusCode).toBe(404);
    expect((await req(ben, "POST", `/chat/messages/${m.id}/report`, { reason: "unbekannt" })).statusCode).toBe(400);
    expect((await req(ben, "POST", `/chat/messages/${m.id}/report`, { reason: "hate", note: "beleidigend" })).statusCode).toBe(204);
    const [report] = await db.select().from(schema.messageReports);
    expect(report).toMatchObject({ reason: "hate", status: "open", reporterId: ben.id });
    expect(report.snapshot).not.toMatch(/Unerlaubter/);
    // nur die gemeldete Nachricht wurde gesichert, nicht der ganze Verlauf
    expect(await db.select().from(schema.messageReports)).toHaveLength(1);
  });

  it("Rate-Limit: max. 30 Nachrichten pro Minute und Nutzer", async () => {
    const c = (await req(vera, "POST", "/chat/conversations", { kind: "direct", userId: tom.id })).json();
    const results: number[] = [];
    for (let i = 0; i < 32; i++) results.push((await req(vera, "POST", `/chat/conversations/${c.id}/messages`, { body: `Spam ${i}` })).statusCode);
    expect(results.filter((s) => s === 201)).toHaveLength(30);
    expect(results.slice(30)).toEqual([429, 429]);
  });

  let group: string;

  it("Gruppen: nur Vorstand/Moderation legen an, nur Vereinsmitglieder koennen hinein", async () => {
    const body = { kind: "group", orgSlug: org, title: "Trainerteam", memberIds: [mia.id] };
    expect((await req(mia, "POST", "/chat/conversations", body)).statusCode).toBe(403);
    expect((await req(vera, "POST", "/chat/conversations", { ...body, memberIds: [tom.id] })).statusCode).toBe(400); // nur Follower
    expect((await req(vera, "POST", "/chat/conversations", { ...body, title: "x" })).statusCode).toBe(400);
    const res = await req(vera, "POST", "/chat/conversations", body);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ kind: "group", title: "Trainerteam", orgSlug: org, iAmOwner: true });
    group = res.json().id;
    expect(res.json().members.map((m: { name: string }) => m.name)).toEqual(["mia", "vera"]);
  });

  it("Gruppen verwalten: hinzufuegen, entfernen, austreten, Besitzerwechsel", async () => {
    expect((await req(mia, "POST", `/chat/conversations/${group}/members`, { userIds: [ben.id] })).statusCode).toBe(403); // kein Besitzer
    expect((await req(vera, "POST", `/chat/conversations/${group}/members`, { userIds: [nina.id] })).statusCode).toBe(400); // kein Mitglied
    const added = await req(vera, "POST", `/chat/conversations/${group}/members`, { userIds: [ben.id] });
    expect(added.json().members).toHaveLength(3);

    await req(mia, "POST", `/chat/conversations/${group}/messages`, { body: "Hallo Trainer" });
    expect(((await req(ben, "GET", `/chat/conversations/${group}/messages`)).json().messages).length).toBe(1);

    expect((await req(mia, "DELETE", `/chat/conversations/${group}/members/${ben.id}`)).statusCode).toBe(403);
    expect((await req(vera, "DELETE", `/chat/conversations/${group}/members/${ben.id}`)).statusCode).toBe(204);
    expect((await req(ben, "GET", `/chat/conversations/${group}`)).statusCode).toBe(404); // raus = kein Zugriff mehr

    // Besitzerin tritt aus -> aelteste verbleibende Person wird Besitzer
    expect((await req(vera, "DELETE", `/chat/conversations/${group}/members/${vera.id}`)).statusCode).toBe(204);
    expect((await req(mia, "GET", `/chat/conversations/${group}`)).json().iAmOwner).toBe(true);
    // Direktchat kann man nicht verlassen
    expect((await req(mia, "DELETE", `/chat/conversations/${dm}/members/${mia.id}`)).statusCode).toBe(403);
  });

  it("Loeschfristen: Standard und pro Gruppe; offene Meldungen bleiben bis zur Pruefung", async () => {
    expect((await req(mia, "GET", `/chat/conversations/${group}`)).json()).toMatchObject({ retentionDays: null, effectiveRetentionDays: 365 });
    expect((await req(mia, "PUT", `/chat/conversations/${group}/retention`, { days: 0 })).statusCode).toBe(400);
    expect((await req(mia, "PUT", `/chat/conversations/${dm}/retention`, { days: 7 })).statusCode).toBe(403); // Direktchat fest
    const set = await req(mia, "PUT", `/chat/conversations/${group}/retention`, { days: 7 });
    expect(set.json()).toMatchObject({ retentionDays: 7, effectiveRetentionDays: 7 });

    // alte Nachricht in der Gruppe (10 Tage) und im Direktchat (400 Tage, Standard 365) erzeugen
    const old = (await req(mia, "POST", `/chat/conversations/${group}/messages`, { body: "alt in Gruppe" })).json();
    const ancient = (await req(mia, "POST", `/chat/conversations/${dm}/messages`, { body: "uralt im DM" })).json();
    const fresh = (await req(mia, "POST", `/chat/conversations/${group}/messages`, { body: "frisch" })).json();
    await db.execute(sql`update chat.messages set created_at = now() - interval '10 days' where id = ${old.id}`);
    await db.execute(sql`update chat.messages set created_at = now() - interval '400 days' where id = ${ancient.id}`);

    expect(await chat.purgeExpired()).toBe(2);
    const left = (await db.select().from(schema.messages)).map((m) => m.id);
    expect(left).not.toContain(old.id);
    expect(left).not.toContain(ancient.id);
    expect(left).toContain(fresh.id);

    // gemeldete Nachricht ueberlebt die Loeschfrist, solange die Meldung offen ist
    const flagged = (await req(mia, "POST", `/chat/conversations/${dm}/messages`, { body: "bitte pruefen" })).json();
    await req(ben, "POST", `/chat/messages/${flagged.id}/report`, { reason: "other" });
    await db.execute(sql`update chat.messages set created_at = now() - interval '500 days' where id = ${flagged.id}`);
    expect(await chat.purgeExpired()).toBe(0);
    expect((await db.select().from(schema.messages).where(eq(schema.messages.id, flagged.id)))).toHaveLength(1);
  });

  it("Schluessel-Rotation: Datenschluessel werden umgehuellt, Nachrichten bleiben lesbar", async () => {
    const crypto = app.get(ChatCrypto);
    const before = await db.select().from(schema.conversations);
    // Alt-Zustand simulieren: Version 0 existiert nicht; wir setzen Versionen kuenstlich zurueck -> Rewrap erwartet Master der Version
    expect(before.every((c) => c.keyVersion === crypto.activeVersion)).toBe(true);
    expect(await chat.rewrapKeys()).toBe(0); // nichts zu tun
    const page = (await req(ben, "GET", `/chat/conversations/${dm}/messages`)).json();
    expect(page.messages.length).toBeGreaterThan(0);
  });

  it("Auskunft und Loeschung: Export enthaelt eigene Nachrichten, Konto-Loeschung entfernt alles", async () => {
    const exp = (await req(mia, "GET", "/privacy/export")).json();
    expect(exp.chat.conversations).toBeGreaterThan(0);
    expect(exp.chat.messagesSent.some((m: { text: string | null }) => m.text === "Unerlaubter Inhalt")).toBe(true);
    expect(exp.chat.messagesSent.some((m: { text: string | null }) => m.text === "Nachricht 1")).toBe(false); // fremde Nachrichten nicht

    const del = await req(mia, "DELETE", "/privacy/account", { password });
    expect(del.statusCode).toBe(204);
    expect((await db.select().from(schema.messages).where(eq(schema.messages.senderId, mia.id)))).toHaveLength(0);
    expect((await db.select().from(schema.conversationMembers).where(eq(schema.conversationMembers.userId, mia.id)))).toHaveLength(0);
    // Gruppe war nur mit mia besetzt -> geloescht; Direktchat bleibt fuer ben, Name wird anonymisiert
    expect((await db.select().from(schema.conversations).where(eq(schema.conversations.id, group)))).toHaveLength(0);
    const list = (await req(ben, "GET", "/chat/conversations")).json();
    expect(list.find((c: { id: string }) => c.id === dm).title).toBe("Gelöschter Nutzer");
    const page = (await req(ben, "GET", `/chat/conversations/${dm}/messages`)).json();
    expect(page.messages.every((m: { senderId: string }) => m.senderId !== mia.id)).toBe(true);
  });
});
