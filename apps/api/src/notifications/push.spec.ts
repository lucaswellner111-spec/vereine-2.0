import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
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
  endpoint: `https://push.example.test/send/${n}`,
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

  it("Kurztexte kennen alle Typen", () => {
    const types = ["comment", "membership_request", "membership_decision", "post_hidden", "event_created", "event_reminder", "event_canceled", "new_follower", "follow_request", "follow_accepted", "invoice_new", "invoice_overdue"] as const;
    for (const t of types) {
      const m = pushMessage(t, { orgName: "TSV", title: "Training", amount: "10 €", name: "Mia", handle: "mia", orgSlug: "tsv", decision: "approve" });
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.url.startsWith("/")).toBe(true);
    }
  });
});
