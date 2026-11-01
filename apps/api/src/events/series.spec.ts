import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { occurrences } from "./recurrence";

const password = "ein-sehr-langes-passwort";
const berlin = (d: Date) => d.toLocaleString("sv-SE", { timeZone: "Europe/Berlin" });

describe("Wiederholung: Terminberechnung", () => {
  it("haelt die Ortszeit ueber die Zeitumstellung stabil (Ende der Sommerzeit 25.10.2026)", () => {
    const start = new Date("2026-10-20T16:00:00Z"); // 18:00 Berlin (MESZ)
    const list = occurrences(start, { freq: "weekly", count: 3 });
    expect(list.map(berlin)).toEqual(["2026-10-20 18:00:00", "2026-10-27 18:00:00", "2026-11-03 18:00:00"]);
    expect(list[1].toISOString()).toBe("2026-10-27T17:00:00.000Z"); // jetzt MEZ
  });

  it("14-taegig und monatlich (Monatsende wird begrenzt, Jahreswechsel)", () => {
    expect(occurrences(new Date("2026-03-01T09:00:00Z"), { freq: "biweekly", count: 3 }).map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-03-01", "2026-03-15", "2026-03-29"]);
    const monthly = occurrences(new Date("2026-01-31T18:00:00Z"), { freq: "monthly", count: 14 });
    expect(monthly.slice(0, 4).map((d) => berlin(d).slice(0, 10))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(berlin(monthly[13]).slice(0, 10)).toBe("2027-02-28");
  });
});

describe("Terminserien und Kalender-Abo", () => {
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
  const req = (u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: u ? { cookie: u.cookie } : {} });

  let vera: U, mia: U, tom: U;
  const org = "sv-serie";
  const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();
  let seriesIds: string[] = [];

  beforeAll(async () => {
    [vera, mia, tom] = [await signup("vera"), await signup("mia"), await signup("tom")];
    await req(vera, "POST", "/orgs", { name: "SV Serie", category: "Sport", city: "Serienstadt" });
    await req(mia, "POST", `/orgs/${org}/membership`);
    await req(vera, "POST", `/orgs/${org}/members/${mia.id}/decision`, { decision: "approve" });
    await req(tom, "POST", `/orgs/${org}/follow`);
  });

  it("legt eine woechentliche Serie an: gleiche Serie, getrennte Termine, nur eine Benachrichtigung", async () => {
    const res = await req(vera, "POST", `/orgs/${org}/events`, {
      title: "Dienstagstraining", startsAt: inDays(3), endsAt: new Date(Date.now() + 3 * 86400_000 + 5400_000).toISOString(),
      visibility: "public", repeat: { freq: "weekly", count: 4 },
    });
    expect(res.statusCode).toBe(201);
    const list = (await req(vera, "GET", `/orgs/${org}/events`)).json() as { id: string; seriesId: string; startsAt: string; endsAt: string }[];
    expect(list).toHaveLength(4);
    expect(new Set(list.map((e) => e.seriesId)).size).toBe(1);
    expect(list[0].seriesId).toBeTruthy();
    for (const e of list) expect(new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime()).toBe(5400_000); // Dauer bleibt
    seriesIds = list.map((e) => e.id);
    const notes = (await req(mia, "GET", "/notifications?limit=50")).json().items as { type: string; data: Record<string, string> }[];
    const created = notes.filter((n) => n.type === "event_created");
    expect(created).toHaveLength(1);
    expect(created[0].data.series).toBe("4");
  });

  it("Zusagen gelten je Termin; Einzel- und Serien-Absage", async () => {
    await req(mia, "PUT", `/events/${seriesIds[0]}/rsvp`, { status: "yes" });
    await req(mia, "PUT", `/events/${seriesIds[2]}/rsvp`, { status: "yes" });
    expect((await req(mia, "GET", `/events/${seriesIds[1]}`)).json().myStatus).toBeNull();

    expect((await req(mia, "POST", `/events/${seriesIds[1]}/cancel`, {})).statusCode).toBe(403);
    expect((await req(vera, "POST", `/events/${seriesIds[1]}/cancel`, {})).statusCode).toBe(204);
    const afterSingle = (await req(vera, "GET", `/orgs/${org}/events`)).json() as { canceled: boolean }[];
    expect(afterSingle.map((e) => e.canceled)).toEqual([false, true, false, false]);

    // Serie ab dem dritten Termin absagen: dritter + vierter, nicht die frueheren
    expect((await req(vera, "POST", `/events/${seriesIds[2]}/cancel`, { scope: "series" })).statusCode).toBe(204);
    const afterSeries = (await req(vera, "GET", `/orgs/${org}/events`)).json() as { canceled: boolean }[];
    expect(afterSeries.map((e) => e.canceled)).toEqual([false, true, true, true]);
    expect((await req(vera, "POST", `/events/${seriesIds[0]}/cancel`, { scope: "bogus" })).statusCode).toBe(400);

    // Mia (Zusage fuer Termin 3) wurde genau einmal ueber die Serien-Absage informiert
    const notes = (await req(mia, "GET", "/notifications?limit=50")).json().items as { type: string; data: Record<string, string> }[];
    expect(notes.filter((n) => n.type === "event_canceled" && n.data.series === "2")).toHaveLength(1);
  });

  it("Validierung der Serie", async () => {
    const base = { title: "Test", startsAt: inDays(5) };
    for (const repeat of [{ freq: "daily", count: 3 }, { freq: "weekly", count: 1 }, { freq: "weekly", count: 53 }]) {
      expect((await req(vera, "POST", `/orgs/${org}/events`, { ...base, repeat })).statusCode).toBe(400);
    }
  });

  let token: string;
  it("Kalender-Abo: Token nur einmal, Hash in der Datenbank, Feed zeigt nur sichtbare Termine", async () => {
    await req(vera, "POST", `/orgs/${org}/events`, { title: "Interne Sitzung", startsAt: inDays(10), visibility: "members" });
    expect((await req(null, "GET", "/calendar-feed")).statusCode).toBe(401);
    expect((await req(tom, "GET", "/calendar-feed")).json()).toEqual({ enabled: false, createdAt: null });
    const made = await req(tom, "POST", "/calendar-feed");
    expect(made.statusCode).toBe(201);
    token = made.json().token;
    expect(token.length).toBeGreaterThanOrEqual(40);
    const [row] = await db.select().from(schema.calendarTokens).where(eq(schema.calendarTokens.userId, tom.id));
    expect(row.tokenHash).not.toBe(token);
    expect((await req(tom, "GET", "/calendar-feed")).json().enabled).toBe(true);

    const feed = await req(null, "GET", `/calendar/${token}.ics`); // ohne Sitzung
    expect(feed.statusCode).toBe(200);
    expect(feed.headers["content-type"]).toContain("text/calendar");
    expect(feed.headers["x-robots-tag"]).toBe("noindex");
    expect(feed.body.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(feed.body).toContain("X-WR-CALNAME:Klubnest");
    expect(feed.body).toContain("SUMMARY:Dienstagstraining"); // oeffentlich, Tom folgt
    expect(feed.body).not.toContain("Interne Sitzung"); // intern: nur Mitglieder
    expect(feed.body.match(/BEGIN:VEVENT/g)?.length).toBe(4);
    expect(feed.body).toContain("STATUS:CANCELLED");

    const miaToken = (await req(mia, "POST", "/calendar-feed")).json().token;
    const miaFeed = (await req(null, "GET", `/calendar/${miaToken}`)).body;
    expect(miaFeed).toContain("SUMMARY:Interne Sitzung"); // Mitglied sieht intern
  });

  it("Neuer Token macht den alten ungueltig; Deaktivieren entfernt den Feed; falscher Token 404", async () => {
    const second = (await req(tom, "POST", "/calendar-feed")).json().token;
    expect(second).not.toBe(token);
    expect((await req(null, "GET", `/calendar/${token}.ics`)).statusCode).toBe(404);
    expect((await req(null, "GET", `/calendar/${second}.ics`)).statusCode).toBe(200);
    expect((await req(null, "GET", "/calendar/falsch.ics")).statusCode).toBe(404);
    expect((await req(tom, "DELETE", "/calendar-feed")).statusCode).toBe(204);
    expect((await req(null, "GET", `/calendar/${second}.ics`)).statusCode).toBe(404);
    expect((await req(tom, "GET", "/calendar-feed")).json().enabled).toBe(false);
  });
});
