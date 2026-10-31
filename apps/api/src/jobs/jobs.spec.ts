import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { JobsService } from "./jobs.service";

describe("JobsService (inline-Modus ohne Redis)", () => {
  it("fuehrt definierte Jobs sofort aus und meldet unbekannte Jobs", async () => {
    const jobs = new JobsService();
    expect(jobs.mode).toBe("inline");
    const seen: object[] = [];
    jobs.define("test.job", async (d) => void seen.push(d));
    await jobs.enqueue("test.job", { a: 1 });
    expect(seen).toEqual([{ a: 1 }]);
    await expect(jobs.enqueue("gibt.es.nicht")).rejects.toThrow(/Unbekannter Job/);
    await expect(jobs.startWorker()).rejects.toThrow(/QUEUE_REDIS_URL/);
    await jobs.onModuleDestroy();
  });

  it("wiederkehrende Jobs laufen per Timer", async () => {
    vi.useFakeTimers();
    try {
      const jobs = new JobsService();
      let runs = 0;
      jobs.define("tick", async () => void runs++);
      jobs.every("tick", 1000);
      await vi.advanceTimersByTimeAsync(3500);
      expect(runs).toBe(3);
      await jobs.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(3000);
      expect(runs).toBe(3); // nach Shutdown keine weiteren Laeufe
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Jobs im Zusammenspiel", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let jobs: JobsService;

  beforeAll(async () => {
    db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    jobs = app.get(JobsService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function signup(name: string) {
    const res = await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email: `${name}@example.de`, password: "ein-sehr-langes-passwort", displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    return res.json().id as string;
  }

  it("Module registrieren ihre Jobs (Worker findet sie nach dem Start)", async () => {
    // enqueue wirft bei unbekannten Namen; also sind alle drei Handler definiert
    await expect(jobs.enqueue("sessions.purge")).resolves.toBeUndefined();
    await expect(jobs.enqueue("events.reminders")).resolves.toBeUndefined();
    await expect(jobs.enqueue("notifications.insert", { userIds: [], type: "comment", data: {} })).resolves.toBeUndefined();
  });

  it("sessions.purge entfernt abgelaufene Sessions", async () => {
    const id = await signup("jobuser");
    await db.insert(schema.sessions).values({ tokenHash: "abgelaufen", userId: id, expiresAt: new Date(Date.now() - 1000) });
    await jobs.enqueue("sessions.purge");
    const left = await db.select().from(schema.sessions).where(eq(schema.sessions.tokenHash, "abgelaufen"));
    expect(left).toHaveLength(0);
  });

  it("Massen-Benachrichtigung: kleine Mengen sofort, grosse in Bloecken, alle kommen an", async () => {
    const notifications = app.get(NotificationsService);
    const target = await signup("empfaenger");
    await notifications.notify([target], "comment", { commenter: "x", excerpt: "y" });
    expect(await db.select().from(schema.notifications).where(eq(schema.notifications.userId, target))).toHaveLength(1);

    // 1.200 Empfaenger -> 3 Bloecke a 500 ueber die Job-Schnittstelle
    const ids: string[] = [];
    for (let i = 0; i < 1200; i++) ids.push(crypto.randomUUID());
    // Platzhalter-Nutzer direkt anlegen (Fremdschluessel)
    await db.insert(schema.users).values(ids.map((id, i) => ({ id, email: `bulk${i}@example.de`, passwordHash: "x", displayName: `bulk${i}` })));
    const calls: number[] = [];
    const original = jobs.enqueue.bind(jobs);
    jobs.enqueue = async (name, data) => {
      if (name === "notifications.insert") calls.push((data as { userIds: string[] }).userIds.length);
      return original(name, data);
    };
    await notifications.notify([...ids, ...ids], "event_created", { title: "T" }); // Duplikate werden entfernt
    jobs.enqueue = original;

    expect(calls).toEqual([500, 500, 200]);
    const stored = await db.select().from(schema.notifications).where(eq(schema.notifications.type, "event_created"));
    expect(stored).toHaveLength(1200);
  });
});
