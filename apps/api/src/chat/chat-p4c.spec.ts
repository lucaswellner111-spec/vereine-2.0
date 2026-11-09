import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { createTestDb } from "../testing/test-db";
import { REALTIME_BUS, type RealtimeBus } from "./realtime-bus";

const password = "ein-sehr-langes-passwort";
const png = () => sharp({ create: { width: 300, height: 300, channels: 3, background: "#3a7d44" } }).png().toBuffer();

/** P4c: Mitglieder-Kandidaten fuer Gruppen, Avatare in Liste/Kopf/Mitgliedern, Blockliste aufheben. */
describe("Chat P4c", () => {
  let app: NestFastifyApplication;
  const dir = mkdtempSync(join(tmpdir(), "vereine-chat-p4c-"));

  beforeAll(async () => {
    process.env.MEDIA_DIR = dir;
    const db = await createTestDb();
    const bus: RealtimeBus = { publish: async () => undefined, subscribe: async () => undefined, close: async () => undefined };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).overrideProvider(REALTIME_BUS).useValue(bus).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.MEDIA_DIR;
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
  const upload = async (u: U, url: string) => {
    const boundary = "----chat" + Math.random().toString(16).slice(2);
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
      await png(),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({ method: "POST", url, payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}`, cookie: u.cookie } });
  };

  let vera: U, mia: U, ben: U, cleo: U, tom: U;
  const org = "chat-p4c";
  let groupId: string;
  let miaAvatar: string;

  beforeAll(async () => {
    [vera, mia, ben, cleo, tom] = [await signup("vera"), await signup("mia"), await signup("ben"), await signup("cleo"), await signup("tom")];
    await req(vera, "POST", "/orgs", { name: "Chat P4c", category: "Sport", city: "Chatstadt" });
    for (const m of [mia, ben, cleo]) {
      await req(m, "POST", `/orgs/${org}/membership`);
      await req(vera, "POST", `/orgs/${org}/members/${m.id}/decision`, { decision: "approve" });
    }
    await req(tom, "POST", `/orgs/${org}/follow`);
    miaAvatar = (await upload(mia, "/media/avatar")).json().id;
    // Mia ist privat - ihr Avatar erscheint trotzdem fuer Mitglieder der Unterhaltung
    await req(mia, "PUT", "/profiles/me", { visibility: "private" });
    groupId = (await req(vera, "POST", "/chat/conversations", { kind: "group", orgSlug: org, title: "Vorstand", memberIds: [mia.id] })).json().id;
  });

  it("candidates: nur Besitzer, aktive Mitglieder ohne bisherige und ohne Blockierte", async () => {
    expect((await req(mia, "GET", `/chat/conversations/${groupId}/candidates`)).statusCode).toBe(403);
    expect((await req(tom, "GET", `/chat/conversations/${groupId}/candidates`)).statusCode).toBe(404);
    await req(cleo, "PUT", `/chat/blocks/${vera.id}`);
    const res = await req(vera, "GET", `/chat/conversations/${groupId}/candidates`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ userId: ben.id, name: "ben", avatarId: null }]);
    await req(cleo, "DELETE", `/chat/blocks/${vera.id}`);
    expect((await req(vera, "GET", `/chat/conversations/${groupId}/candidates`)).json().map((c: { name: string }) => c.name)).toEqual(["ben", "cleo"]);

    // Hinzufuegen ueber die Kandidaten, danach fehlen sie in der Liste
    expect((await req(vera, "POST", `/chat/conversations/${groupId}/members`, { userIds: [ben.id] })).statusCode).toBe(201);
    expect((await req(vera, "GET", `/chat/conversations/${groupId}/candidates`)).json().map((c: { name: string }) => c.name)).toEqual(["cleo"]);
    // Direktchat hat keine Kandidaten
    const direct = (await req(vera, "POST", "/chat/conversations", { kind: "direct", userId: ben.id })).json();
    expect((await req(vera, "GET", `/chat/conversations/${direct.id}/candidates`)).statusCode).toBe(403);
  });

  it("addMembers lehnt Blockierte ab (beide Richtungen), ohne zu verraten, wer blockiert", async () => {
    const g = (await req(vera, "POST", "/chat/conversations", { kind: "group", orgSlug: org, title: "Block-Test", memberIds: [mia.id] })).json().id;
    await req(cleo, "PUT", `/chat/blocks/${vera.id}`); // Cleo blockiert Vera
    const res = await req(vera, "POST", `/chat/conversations/${g}/members`, { userIds: [ben.id, cleo.id] });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("Nicht alle ausgewaehlten Personen koennen hinzugefuegt werden.");
    expect(JSON.stringify(res.json())).not.toMatch(/block|cleo/i);
    // auch Ben wurde nicht hinzugefuegt (alles oder nichts)
    expect((await req(vera, "GET", `/chat/conversations/${g}`)).json().members.map((m: { name: string }) => m.name).sort()).toEqual(["mia", "vera"]);
    await req(cleo, "DELETE", `/chat/blocks/${vera.id}`);
    // Vera blockiert Ben: gleiche Meldung wie bei Nicht-Mitgliedern
    await req(vera, "PUT", `/chat/blocks/${ben.id}`);
    const res2 = await req(vera, "POST", `/chat/conversations/${g}/members`, { userIds: [ben.id] });
    const res3 = await req(vera, "POST", `/chat/conversations/${g}/members`, { userIds: [tom.id] });
    expect([res2.statusCode, res3.statusCode]).toEqual([400, 400]);
    expect(res2.json().message).toBe(res3.json().message);
    await req(vera, "DELETE", `/chat/blocks/${ben.id}`);
    expect((await req(vera, "POST", `/chat/conversations/${g}/members`, { userIds: [ben.id, cleo.id] })).statusCode).toBe(201);
  });

  it("candidates: Suche ?q= serverseitig, hoechstens 50 Treffer", async () => {
    const g = (await req(vera, "POST", "/chat/conversations", { kind: "group", orgSlug: org, title: "Such-Test", memberIds: [] })).json().id;
    expect((await req(vera, "GET", `/chat/conversations/${g}/candidates?q=CLE`)).json().map((c: { name: string }) => c.name)).toEqual(["cleo"]);
    expect((await req(vera, "GET", `/chat/conversations/${g}/candidates?q=xyz`)).json()).toEqual([]);
    expect((await req(vera, "GET", `/chat/conversations/${g}/candidates?q=${"a".repeat(81)}`)).statusCode).toBe(400);
    // 55 weitere Mitglieder: ohne Suche nur die ersten 50 (nach Name)
    for (let i = 0; i < 55; i++) {
      const m = await signup(`zz${String(i).padStart(2, "0")}`);
      await req(m, "POST", `/orgs/${org}/membership`);
      await req(vera, "POST", `/orgs/${org}/members/${m.id}/decision`, { decision: "approve" });
    }
    const all = (await req(vera, "GET", `/chat/conversations/${g}/candidates`)).json();
    expect(all).toHaveLength(50);
    expect(all.slice(0, 3).map((c: { name: string }) => c.name)).toEqual(["ben", "cleo", "mia"]);
    expect((await req(vera, "GET", `/chat/conversations/${g}/candidates?q=zz5`)).json().map((c: { name: string }) => c.name)).toEqual(["zz50", "zz51", "zz52", "zz53", "zz54"]);
  });

  it("Avatare in Liste (Direktchat), Kopf und Mitgliederliste - auch bei privatem Profil", async () => {
    const direct = (await req(vera, "POST", "/chat/conversations", { kind: "direct", userId: mia.id })).json();
    expect(direct.avatarId).toBe(miaAvatar);
    const list = (await req(vera, "GET", "/chat/conversations")).json();
    expect(list.find((c: { id: string }) => c.id === direct.id).avatarId).toBe(miaAvatar);
    expect(list.find((c: { id: string }) => c.id === groupId).avatarId).toBeNull();
    const detail = (await req(vera, "GET", `/chat/conversations/${groupId}`)).json();
    expect(detail.members.find((m: { userId: string }) => m.userId === mia.id).avatarId).toBe(miaAvatar);
    expect(detail.members.find((m: { userId: string }) => m.userId === vera.id).avatarId).toBeNull();
    // Avatare sehen Angemeldete
    expect((await req(vera, "GET", `/media/${miaAvatar}/avatar-sm`)).statusCode).toBe(200);
  });

  it("Blockliste: anzeigen und aufheben", async () => {
    await req(vera, "PUT", `/chat/blocks/${tom.id}`);
    expect((await req(vera, "GET", "/chat/blocks")).json()).toEqual([{ userId: tom.id, name: "tom" }]);
    expect((await req(vera, "DELETE", `/chat/blocks/${tom.id}`)).statusCode).toBe(204);
    expect((await req(vera, "GET", "/chat/blocks")).json()).toEqual([]);
  });
});
