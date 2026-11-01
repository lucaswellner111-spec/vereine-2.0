import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.VAPID_PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
process.env.VAPID_PRIVATE_KEY = "UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => sendNotification(...a) } }));

import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";

const password = "ein-sehr-langes-passwort";
const sub = (n: number) => ({
  endpoint: `https://push.example.test/chat/${n}`,
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
});

describe("Chat-Push", () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    const db = drizzle(new PGlite(), { schema });
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

  type U = { cookie: string; id: string };
  async function signup(name: string): Promise<U> {
    const email = `${name}@example.de`;
    const reg = await app.inject({ method: "POST", url: "/auth/register", payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true } });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: reg.json().id };
  }
  const req = (u: U, method: "GET" | "POST", url: string, payload?: object) => app.inject({ method, url, payload, headers: { cookie: u.cookie } });

  it("neue Nachricht loest Push an die anderen Mitglieder aus - ohne Absender und Inhalt, nicht an den Absender", async () => {
    const [vera, mia, ben] = [await signup("vera"), await signup("mia"), await signup("ben")];
    await req(vera, "POST", "/orgs", { name: "SV Push", category: "Sport", city: "Pushstadt" });
    for (const m of [mia, ben]) {
      await req(m, "POST", "/orgs/sv-push/membership");
      await req(vera, "POST", `/orgs/sv-push/members/${m.id}/decision`, { decision: "approve" });
    }
    await req(mia, "POST", "/push/subscribe", sub(1));
    await req(ben, "POST", "/push/subscribe", sub(2));
    sendNotification.mockResolvedValue({ statusCode: 201 });

    const dm = (await req(mia, "POST", "/chat/conversations", { kind: "direct", userId: ben.id })).json().id;
    const res = await req(mia, "POST", `/chat/conversations/${dm}/messages`, { body: "GEHEIMER NACHRICHTENTEXT" });
    expect(res.statusCode).toBe(201);
    await vi.waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1));
    const [subscription, body] = sendNotification.mock.calls[0];
    expect(subscription.endpoint).toBe(sub(2).endpoint); // nur Ben, nicht Mia (Absenderin)
    const payload = JSON.parse(body as string);
    expect(payload).toMatchObject({ title: "Neue Nachricht", url: "/chat", tag: `chat-${dm}` });
    expect(body as string).not.toContain("GEHEIMER");
    expect(body as string).not.toContain("mia");

    // Push-Fehler duerfen das Senden nie verhindern
    sendNotification.mockImplementation((...args: unknown[]) => (args[0] ? Promise.reject(Object.assign(new Error("kaputt"), { statusCode: 500 })) : Promise.resolve({ statusCode: 201 })));
    const again = await req(mia, "POST", `/chat/conversations/${dm}/messages`, { body: "noch eine" });
    expect(again.statusCode).toBe(201);
  });
});
