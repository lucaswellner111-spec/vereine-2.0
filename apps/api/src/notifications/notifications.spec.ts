import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { createTestDb } from "../testing/test-db";
import { NotificationsService } from "./notifications.service";

describe("Benachrichtigungen: Paging und einzeln gelesen", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const password = "ein-sehr-langes-passwort";

  beforeAll(async () => {
    db = await createTestDb();
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
  const req = (u: U, method: "GET" | "POST", url: string, payload?: object) =>
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });

  let nora: U, olaf: U;
  beforeAll(async () => {
    [nora, olaf] = [await signup("nora"), await signup("olaf")];
    const svc = app.get(NotificationsService);
    for (let i = 0; i < 5; i++) await svc.notify([nora.id], "new_follower", { name: `Person ${i}`, handle: `p${i}` });
    await svc.notify([olaf.id], "new_follower", { name: "Fremd", handle: "fremd" });
    // eindeutige, absteigende Zeitstempel (Person 4 = neueste)
    await db.execute(sql`update social.notifications set created_at = now() - (10 - substr(data->>'handle', 2)::int) * interval '1 minute' where data->>'handle' like 'p%'`);
  });

  it("liefert Seiten mit Cursor, neueste zuerst, ohne Ueberschneidung", async () => {
    const first = (await req(nora, "GET", "/notifications?limit=2")).json();
    expect(first.items).toHaveLength(2);
    expect(first.unread).toBe(5);
    expect(first.nextCursor).toBeTruthy();
    const second = (await req(nora, "GET", `/notifications?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`)).json();
    const third = (await req(nora, "GET", `/notifications?limit=2&cursor=${encodeURIComponent(second.nextCursor)}`)).json();
    expect(third.items).toHaveLength(1);
    expect(third.nextCursor).toBeNull();
    const all = [...first.items, ...second.items, ...third.items];
    expect(new Set(all.map((n: { id: string }) => n.id)).size).toBe(5);
    const times = all.map((n: { createdAt: string }) => n.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(all.every((n: { data: { name: string } }) => n.data.name !== "Fremd")).toBe(true);
    expect((await req(nora, "GET", "/notifications?cursor=kaputt")).statusCode).toBe(400);
  });

  it("markiert einzelne Eintraege als gelesen, fremde bleiben unberuehrt", async () => {
    const list = (await req(nora, "GET", "/notifications")).json();
    const target = list.items[0].id;
    const foreign = (await req(olaf, "GET", "/notifications")).json().items[0].id;
    expect((await req(nora, "POST", "/notifications/read", { ids: [target, foreign] })).statusCode).toBe(204);
    const after = (await req(nora, "GET", "/notifications")).json();
    expect(after.unread).toBe(4);
    expect(after.items.find((n: { id: string }) => n.id === target).readAt).not.toBeNull();
    expect((await req(olaf, "GET", "/notifications")).json().unread).toBe(1);
    expect((await req(nora, "POST", "/notifications/read", { ids: ["kein-uuid"] })).statusCode).toBe(400);
  });
});
