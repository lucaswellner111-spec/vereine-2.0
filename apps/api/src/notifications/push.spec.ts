import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// VAPID-Schluessel muessen vor dem Import des Dienstes gesetzt sein (er liest sie im Konstruktor).
process.env.VAPID_PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
process.env.VAPID_PRIVATE_KEY = "UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => sendNotification(...a) } }));

import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { NotificationsService } from "./notifications.service";
import { pushMessage } from "./push.service";

const password = "ein-sehr-langes-passwort";
const sub = (n: number) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${n}`,
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
});

describe("Web-Push", () => {
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
  beforeEach(() => sendNotification.mockReset());

  const call = (method: "GET" | "POST" | "DELETE", url: string, payload?: object, cookie?: string) =>
    app.inject({ method, url, payload, headers: cookie ? { cookie } : {} });
  async function signup(name: string) {
    const email = `${name}@example.de`;
    const reg = await call("POST", "/auth/register", { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true });
    const login = await call("POST", "/auth/login", { email, password });
    return { id: reg.json().id as string, cookie: String(login.headers["set-cookie"]).split(";")[0] };
  }

  it("verlangt Anmeldung, liefert den oeffentlichen Schluessel und zaehlt Geraete", async () => {
    expect((await call("GET", "/push")).statusCode).toBe(401);
    const u = await signup("pia");
    const state = (await call("GET", "/push", undefined, u.cookie)).json();
    expect(state.publicKey).toBe(process.env.VAPID_PUBLIC_KEY);
    expect(state.devices).toBe(0);
    expect(JSON.stringify(state)).not.toContain(process.env.VAPID_PRIVATE_KEY!);
  });

  it("Abo: nur https, doppelte Endpunkte aktualisieren, Abmelden entfernt nur das eigene", async () => {
    const a = await signup("anna");
    const b = await signup("bert");
    expect((await call("POST", "/push/subscribe", { endpoint: "http://insecure.test/x", keys: sub(1).keys }, a.cookie)).statusCode).toBe(400);
    expect((await call("POST", "/push/subscribe", { endpoint: sub(1).endpoint, keys: { p256dh: "x", auth: "y" } }, a.cookie)).statusCode).toBe(400);
    expect((await call("POST", "/push/subscribe", sub(1), a.cookie)).statusCode).toBe(204);
    expect((await call("POST", "/push/subscribe", sub(1), a.cookie)).statusCode).toBe(204);
    expect((await call("GET", "/push", undefined, a.cookie)).json().devices).toBe(1);
    // fremdes Abo nicht loeschbar
    await call("DELETE", "/push/subscribe", { endpoint: sub(1).endpoint }, b.cookie);
    expect((await call("GET", "/push", undefined, a.cookie)).json().devices).toBe(1);
    expect((await call("DELETE", "/push/subscribe", { endpoint: sub(1).endpoint }, a.cookie)).statusCode).toBe(204);
    expect((await call("GET", "/push", undefined, a.cookie)).json().devices).toBe(0);
  });

  it("Benachrichtigungen loesen Push aus - ohne Nutzertexte im Inhalt", async () => {
    const c = await signup("clara");
    await call("POST", "/push/subscribe", sub(2), c.cookie);
    sendNotification.mockResolvedValue({ statusCode: 201 });
    await app.get(NotificationsService).notify([c.id], "comment", { commenter: "Max", excerpt: "GEHEIMER KOMMENTARTEXT", postId: "p" });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [subscription, body] = sendNotification.mock.calls[0];
    expect(subscription.endpoint).toBe(sub(2).endpoint);
    const payload = JSON.parse(body as string);
    expect(payload).toMatchObject({ title: "Neuer Kommentar", url: "/feed", tag: "comment" });
    expect(body as string).not.toContain("GEHEIMER");
  });

  it("abgelaufene Abos (410) werden entfernt, andere Fehler brechen nichts ab", async () => {
    const d = await signup("dora");
    await call("POST", "/push/subscribe", sub(3), d.cookie);
    await call("POST", "/push/subscribe", sub(4), d.cookie);
    sendNotification.mockImplementation((...args: unknown[]) => {
      const s = args[0] as { endpoint: string } | undefined;
      if (!s) return Promise.resolve({ statusCode: 201 }); // Aufrufe ohne Abo (Test-Framework-Artefakt) ignorieren
      const code = s.endpoint === sub(3).endpoint ? 410 : 500;
      return Promise.reject(Object.assign(new Error("push-fehler"), { statusCode: code }));
    });
    await expect(app.get(NotificationsService).notify([d.id], "new_follower", { name: "X", handle: "x" })).resolves.toBeUndefined();
    expect((await call("GET", "/push", undefined, d.cookie)).json().devices).toBe(1); // 410 weg, 500 bleibt
    // die gespeicherte Benachrichtigung existiert trotz Push-Fehlern
    expect((await call("GET", "/notifications", undefined, d.cookie)).json().unread).toBe(1);
  });

  it("nur bekannte Push-Dienste: fremder Host, http, anderer Port, IP -> 400", async () => {
    const u = await signup("hans");
    for (const endpoint of ["https://evil.example.com/push/1", "http://fcm.googleapis.com/fcm/send/1", "https://fcm.googleapis.com:8443/fcm/send/1", "https://192.168.0.10/push"]) {
      const res = await call("POST", "/push/subscribe", { endpoint, keys: sub(1).keys }, u.cookie);
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain("Dieser Push-Dienst wird nicht unterstützt.");
    }
    expect((await call("POST", "/push/subscribe", { endpoint: "https://wns2-par02p.notify.windows.com/w/?token=abc", keys: sub(1).keys }, u.cookie)).statusCode).toBe(204);
  });

  it("hoechstens 10 Geraete: das 11. ersetzt das aelteste", async () => {
    const u = await signup("ida");
    for (let i = 100; i < 110; i++) {
      await call("POST", "/push/subscribe", sub(i), u.cookie);
      await db.execute(sql`update social.push_subscriptions set created_at = now() - make_interval(mins => ${200 - i}) where endpoint = ${sub(i).endpoint}`);
    }
    expect((await call("GET", "/push", undefined, u.cookie)).json().devices).toBe(10);
    await call("POST", "/push/subscribe", sub(110), u.cookie);
    const rows = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, u.id));
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.endpoint)).not.toContain(sub(100).endpoint);
    expect(rows.map((r) => r.endpoint)).toContain(sub(110).endpoint);
  });

  it("fremder Endpunkt wird nicht still uebernommen, sondern neu angelegt", async () => {
    const a = await signup("jan");
    const b = await signup("kai");
    await call("POST", "/push/subscribe", sub(200), a.cookie);
    const [before] = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, sub(200).endpoint));
    expect((await call("POST", "/push/subscribe", sub(200), b.cookie)).statusCode).toBe(204);
    const rows = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, sub(200).endpoint));
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(b.id);
    expect(rows[0].id).not.toBe(before.id);
    expect((await call("GET", "/push", undefined, a.cookie)).json().devices).toBe(0);
  });

  it("Altzeilen mit fremdem Host werden nicht angefragt, sondern entfernt; Abmelden alter Endpunkte geht", async () => {
    const u = await signup("lea");
    await call("POST", "/push/subscribe", sub(300), u.cookie);
    await db.insert(schema.pushSubscriptions).values([
      { userId: u.id, endpoint: "https://intern.example.net/push/1", p256dh: sub(1).keys.p256dh, auth: sub(1).keys.auth },
      { userId: u.id, endpoint: "https://intern.example.net/push/2", p256dh: sub(1).keys.p256dh, auth: sub(1).keys.auth },
    ]);
    // Abmelden eines Alt-Endpunkts ist weiterhin moeglich (Allowlist gilt nur beim Anmelden)
    expect((await call("DELETE", "/push/subscribe", { endpoint: "https://intern.example.net/push/2" }, u.cookie)).statusCode).toBe(204);
    sendNotification.mockResolvedValue({ statusCode: 201 });
    await app.get(NotificationsService).notify([u.id], "new_follower", { name: "X", handle: "x" });
    const hosts = sendNotification.mock.calls.map((c) => (c[0] as { endpoint: string }).endpoint);
    expect(hosts).toEqual([sub(300).endpoint]);
    const left = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, u.id));
    expect(left.map((r) => r.endpoint)).toEqual([sub(300).endpoint]);
  });

  it("Kurztexte kennen alle Typen", () => {
    const types = ["comment", "membership_request", "membership_decision", "post_hidden", "event_created", "event_reminder", "event_canceled", "new_follower", "follow_request", "follow_accepted", "invoice_new", "invoice_overdue"] as const;
    for (const t of types) {
      const m = pushMessage(t, { orgName: "TSV", title: "Training", amount: "10 €", name: "Mia", handle: "mia", orgSlug: "tsv", decision: "approve" });
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.url.startsWith("/")).toBe(true);
    }
  });
});
