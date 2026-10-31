import "reflect-metadata";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { AuthService } from "../auth/auth.service";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { REALTIME_BUS } from "./realtime-bus";
import { attachChatGateway } from "./ws-gateway";

const password = "ein-sehr-langes-passwort";
const ORIGIN = "https://klubnest.example";

describe("WebSocket-Gateway", () => {
  let app: NestFastifyApplication;
  let port: number;
  let gateway: ReturnType<typeof attachChatGateway>;

  beforeAll(async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.listen(0, "127.0.0.1");
    port = (app.getHttpServer().address() as AddressInfo).port;
    gateway = attachChatGateway(app.getHttpServer(), { auth: app.get(AuthService), bus: app.get(REALTIME_BUS), allowedOrigin: ORIGIN });
  });

  afterAll(async () => {
    await gateway.close();
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
  const rest = (u: U, method: "GET" | "POST" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });

  /** Verbindet und sammelt alle Nachrichten; `status` ist bei Ablehnung der HTTP-Code. */
  function connect(cookie?: string, origin: string | null = ORIGIN) {
    return new Promise<{ ws?: WebSocket; events: any[]; status?: number }>((resolve) => {
      const events: any[] = [];
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) } });
      ws.on("message", (d) => events.push(JSON.parse(String(d))));
      ws.on("open", () => resolve({ ws, events }));
      ws.on("unexpected-response", (_req, res) => {
        resolve({ events, status: res.statusCode });
        ws.terminate();
      });
      ws.on("error", () => undefined);
    });
  }
  const until = async (fn: () => boolean, ms = 2000) => {
    const start = Date.now();
    while (!fn() && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 20));
  };

  let mia: U, ben: U, nina: U;
  let convId: string;

  it("Aufbau: Org mit zwei Mitgliedern, Direktchat", async () => {
    const vera = await signup("vera");
    [mia, ben, nina] = [await signup("mia"), await signup("ben"), await signup("nina")];
    await rest(vera, "POST", "/orgs", { name: "WS Verein", category: "Sport", city: "Wsstadt" });
    for (const m of [mia, ben]) {
      await rest(m, "POST", "/orgs/ws-verein/membership");
      await rest(vera, "POST", `/orgs/ws-verein/members/${m.id}/decision`, { decision: "approve" });
    }
    const res = await rest(mia, "POST", "/chat/conversations", { kind: "direct", userId: ben.id });
    expect(res.statusCode).toBe(201);
    convId = res.json().id;
  });

  it("lehnt Verbindungen ohne Anmeldung, mit falscher Sitzung und fremdem Origin ab", async () => {
    expect((await connect(undefined)).status).toBe(401);
    expect((await connect("sid=falscher-token")).status).toBe(401);
    expect((await connect(mia.cookie, "https://boese-seite.example")).status).toBe(403);
    expect((await connect(mia.cookie, null)).status).toBe(403); // ohne Origin-Header ebenfalls
    expect(gateway.connections()).toBe(0);
  });

  it("stellt Nachrichten-Ereignisse nur an Mitglieder zu, ohne Inhalt", async () => {
    const benSock = await connect(ben.cookie);
    const miaSock = await connect(mia.cookie);
    const ninaSock = await connect(nina.cookie);
    await until(() => benSock.events.length > 0 && miaSock.events.length > 0 && ninaSock.events.length > 0);
    expect(benSock.events[0]).toEqual({ type: "ready" });

    const sent = await rest(mia, "POST", `/chat/conversations/${convId}/messages`, { body: "Geheimer Inhalt" });
    await until(() => benSock.events.length > 1 && miaSock.events.length > 1);
    await new Promise((r) => setTimeout(r, 200)); // Zeit, falls Nina faelschlich etwas bekaeme

    const expected = { type: "message", conversationId: convId, messageId: sent.json().id };
    expect(benSock.events[1]).toEqual(expected);
    expect(miaSock.events[1]).toEqual(expected); // auch das eigene zweite Geraet
    expect(ninaSock.events).toEqual([{ type: "ready" }]); // Fremde bekommen nichts
    expect(JSON.stringify(benSock.events)).not.toMatch(/Geheimer/);

    await rest(ben, "POST", `/chat/conversations/${convId}/read`);
    await until(() => benSock.events.some((e) => e.type === "read"));
    expect(benSock.events.at(-1)).toEqual({ type: "read", conversationId: convId });
    expect(miaSock.events.some((e) => e.type === "read")).toBe(false); // "gelesen" geht nur an den Leser selbst

    [benSock, miaSock, ninaSock].forEach((s) => s.ws?.terminate());
    await until(() => gateway.connections() === 0);
  });

  it("begrenzt gleichzeitige Verbindungen pro Nutzer (5)", async () => {
    const socks = [];
    for (let i = 0; i < 5; i++) socks.push(await connect(nina.cookie));
    expect(socks.every((s) => !!s.ws)).toBe(true);
    expect((await connect(nina.cookie)).status).toBe(429);
    socks.forEach((s) => s.ws?.terminate());
    await until(() => gateway.connections() === 0);
  });

  it("Nach dem Logout ist keine neue Verbindung mehr moeglich", async () => {
    const u = await signup("ella");
    expect((await connect(u.cookie)).ws).toBeDefined();
    await rest(u, "POST", "/auth/logout");
    expect((await connect(u.cookie)).status).toBe(401);
  });
});
