import "reflect-metadata";
import { randomBytes } from "node:crypto";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { AuthService } from "../auth/auth.service";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { createTestDb } from "../testing/test-db";
import { ChatCrypto } from "./chat-crypto.service";
import { ChatService } from "./chat.service";
import { confirmEmailForTest } from "../testing/auth";

const password = "ein-sehr-langes-passwort";
const k1 = randomBytes(32).toString("base64");
const k2 = randomBytes(32).toString("base64");

/** Beweiskopie gemeldeter Nachrichten: eigener Schluessel, uebersteht Loeschen, Austritt und Kontoloeschung. */
describe("Chat-Meldungen", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let chat: ChatService;
  const env = { ...process.env };

  beforeAll(async () => {
    process.env.CHAT_MASTER_KEYS = `1:${k1},2:${k2}`;
    process.env.CHAT_ACTIVE_KEY_VERSION = "2";
    db = await createTestDb();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    chat = app.get(ChatService);
  });

  afterAll(async () => {
    await app.close();
    process.env = { ...env };
  });

  type U = { cookie: string; id: string };
  async function signup(name: string): Promise<U> {
    const email = `${name}@example.de`;
    const reg = await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    await confirmEmailForTest(app, email);
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: login.json().id };
  }
  const req = (u: U, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });

  type Item = { id: string; text: string | null; senderName: string; reporterName: string; conversationKind: string | null };
  const reports = async (): Promise<Item[]> => (await req(root, "GET", "/platform/chat-reports")).json();
  const sendAndReport = async (from: U, to: U, body: string, convId?: string) => {
    const conv = convId ?? (await req(from, "POST", "/chat/conversations", { kind: "direct", userId: to.id })).json().id;
    const m = (await req(from, "POST", `/chat/conversations/${conv}/messages`, { body })).json();
    expect((await req(to, "POST", `/chat/messages/${m.id}/report`, { reason: "hate" })).statusCode).toBe(204);
    const [row] = await db.select().from(schema.messageReports).where(eq(schema.messageReports.messageId, m.id));
    return { conv, message: m.id, report: row };
  };

  let root: U, vera: U, mia: U, ben: U, tom: U, kim: U;
  const org = "melde-verein";

  beforeAll(async () => {
    [root, vera, mia, ben, tom, kim] = [await signup("root"), await signup("vera"), await signup("mia"), await signup("ben"), await signup("tom"), await signup("kim")];
    await app.get(AuthService).setPlatformAdmin("root@example.de", true);
    await req(vera, "POST", "/orgs", { name: "Melde Verein", category: "Sport", city: "Meldestadt" });
    for (const m of [mia, ben, tom, kim]) {
      await req(m, "POST", `/orgs/${org}/membership`);
      await req(vera, "POST", `/orgs/${org}/members/${m.id}/decision`, { decision: "approve" });
    }
  });

  it("Beweiskopie mit eigenem Schluessel; doppelte Meldung ohne neue Zeile", async () => {
    const { message, report } = await sendAndReport(mia, ben, "Beleidigung A");
    expect(report).toMatchObject({ senderId: mia.id, reporterId: ben.id, snapshotKeyVersion: 2 });
    expect(report.snapshotKey).toBeTruthy();
    expect(report.snapshot).not.toMatch(/Beleidigung/);
    expect((await req(ben, "POST", `/chat/messages/${message}/report`, { reason: "spam" })).statusCode).toBe(204);
    expect(await db.select().from(schema.messageReports).where(eq(schema.messageReports.messageId, message))).toHaveLength(1);
  });

  it("Absender loescht die Nachricht -> Beweiskopie bleibt lesbar", async () => {
    const { message, report } = await sendAndReport(mia, ben, "Beleidigung B");
    expect((await req(mia, "DELETE", `/chat/messages/${message}`)).statusCode).toBe(204);
    expect((await reports()).find((r) => r.id === report.id)).toMatchObject({ text: "Beleidigung B", senderName: "mia", conversationKind: "direct" });
  });

  it("letzte Person verlaesst die Gruppe -> Meldung bleibt lesbar, Unterhaltung als geloescht", async () => {
    const group = (await req(vera, "POST", "/chat/conversations", { kind: "group", orgSlug: org, title: "Vorstand", memberIds: [mia.id] })).json().id;
    const { report } = await sendAndReport(mia, vera, "Beleidigung C", group);
    await req(vera, "DELETE", `/chat/conversations/${group}/members/${vera.id}`);
    await req(mia, "DELETE", `/chat/conversations/${group}/members/${mia.id}`);
    expect(await db.select().from(schema.conversations).where(eq(schema.conversations.id, group))).toHaveLength(0);
    expect((await reports()).find((r) => r.id === report.id)).toMatchObject({ text: "Beleidigung C", conversationKind: null });
  });

  it("Absender loescht sein Konto -> Meldung und Text bleiben, Absender anonym", async () => {
    const { report } = await sendAndReport(tom, ben, "Beleidigung D");
    expect((await req(tom, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);
    expect(await db.select().from(schema.messages).where(eq(schema.messages.senderId, tom.id))).toHaveLength(0);
    expect((await reports()).find((r) => r.id === report.id)).toMatchObject({ text: "Beleidigung D", senderName: "Gelöschter Nutzer", reporterName: "ben" });
  });

  it("Melder loescht sein Konto -> offene Meldung bleibt anonym bestehen", async () => {
    const { report } = await sendAndReport(mia, kim, "Beleidigung E");
    expect((await req(kim, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);
    const [row] = await db.select().from(schema.messageReports).where(eq(schema.messageReports.id, report.id));
    expect(row).toMatchObject({ reporterId: null, status: "open" });
    expect((await reports()).find((r) => r.id === report.id)).toMatchObject({ text: "Beleidigung E", reporterName: "Gelöschter Nutzer" });
  });

  it("Rotation umhuellt auch Meldungsschluessel", async () => {
    const { report } = await sendAndReport(mia, ben, "Beleidigung F");
    // Altzustand herstellen: Meldungsschluessel unter Master-Version 1
    const active = app.get(ChatCrypto);
    const dataKey = active.unwrapReportKey(report.snapshotKey!, 2);
    process.env.CHAT_ACTIVE_KEY_VERSION = "1";
    const old = new ChatCrypto().wrapReportKey(dataKey);
    process.env.CHAT_ACTIVE_KEY_VERSION = "2";
    await db.update(schema.messageReports).set({ snapshotKey: old.wrapped, snapshotKeyVersion: 1 }).where(eq(schema.messageReports.id, report.id));

    expect(await chat.rewrapKeys()).toBe(1);
    const [row] = await db.select().from(schema.messageReports).where(eq(schema.messageReports.id, report.id));
    expect(row.snapshotKeyVersion).toBe(2);
    expect(row.snapshotKey).not.toBe(old.wrapped);
    expect((await reports()).find((r) => r.id === report.id)?.text).toBe("Beleidigung F");
  });
});
