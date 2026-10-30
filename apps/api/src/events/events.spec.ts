import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { EventsService } from "./events.service";

const password = "ein-sehr-langes-passwort";
const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

describe("Termine, Teams, RSVP, Erinnerungen, ICS", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let events: EventsService;

  beforeAll(async () => {
    db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, "..", "..", "drizzle") });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    events = app.get(EventsService);
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
  const req = (u: U, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie: u.cookie } });
  const titles = async (u: U) => ((await req(u, "GET", "/events")).json() as { title: string }[]).map((e) => e.title).sort();

  let vera: U, mia: U, ben: U, tom: U, nina: U;
  const org = "sv-events";
  let teamId: string;

  beforeAll(async () => {
    [vera, mia, ben, tom, nina] = [await signup("vera"), await signup("mia"), await signup("ben"), await signup("tom"), await signup("nina")];
    await req(vera, "POST", "/orgs", { name: "SV Events", category: "Sport", city: "Eventstadt" });
    for (const m of [mia, ben]) {
      await req(m, "POST", `/orgs/${org}/membership`);
      await req(vera, "POST", `/orgs/${org}/members/${m.id}/decision`, { decision: "approve" });
    }
    await req(tom, "POST", `/orgs/${org}/follow`); // nur Follower
  });

  it("Teams: nur Vorstand verwaltet, nur aktive Mitglieder koennen hinein", async () => {
    expect((await req(mia, "POST", `/orgs/${org}/teams`, { name: "Herren" })).statusCode).toBe(403);
    const created = await req(vera, "POST", `/orgs/${org}/teams`, { name: "Herren", description: "1. Mannschaft" });
    expect(created.statusCode).toBe(201);
    teamId = created.json().id;
    expect((await req(vera, "POST", `/orgs/${org}/teams`, { name: "Herren" })).statusCode).toBe(409);

    expect((await req(vera, "PUT", `/orgs/${org}/teams/${teamId}/members/${mia.id}`)).statusCode).toBe(204);
    expect((await req(vera, "PUT", `/orgs/${org}/teams/${teamId}/members/${tom.id}`)).statusCode).toBe(404); // nur Follower
    expect((await req(mia, "PUT", `/orgs/${org}/teams/${teamId}/members/${ben.id}`)).statusCode).toBe(403);

    const list = (await req(mia, "GET", `/orgs/${org}/teams`)).json();
    expect(list).toEqual([expect.objectContaining({ name: "Herren", members: 1, isMember: true })]);
    expect((await req(ben, "GET", `/orgs/${org}/teams`)).json()[0].isMember).toBe(false);
    expect((await req(nina, "GET", `/orgs/${org}/teams`)).statusCode).toBe(403);
    expect((await req(vera, "GET", `/orgs/${org}/teams/${teamId}/members`)).json()).toEqual([{ userId: mia.id, name: "mia" }]);
  });

  it("Termine anlegen: Rechte und Validierung", async () => {
    const body = { title: "Training", startsAt: inHours(48) };
    expect((await req(mia, "POST", `/orgs/${org}/events`, body)).statusCode).toBe(403);
    expect((await req(vera, "POST", `/orgs/${org}/events`, { title: "x", startsAt: inHours(1) })).statusCode).toBe(400);
    expect((await req(vera, "POST", `/orgs/${org}/events`, { title: "Falsch", startsAt: "morgen" })).statusCode).toBe(400);
    expect((await req(vera, "POST", `/orgs/${org}/events`, { ...body, endsAt: inHours(24) })).statusCode).toBe(400); // Ende vor Beginn

    await req(vera, "POST", "/orgs", { name: "Anderer Verein", category: "Kultur", city: "Woanders" });
    const other = (await req(vera, "POST", `/orgs/anderer-verein/teams`, { name: "Fremd" })).json().id;
    expect((await req(vera, "POST", `/orgs/${org}/events`, { ...body, teamId: other })).statusCode).toBe(400); // Team gehoert zu anderem Verein
  });

  let internalId: string, teamEventId: string, publicId: string;

  it("Sichtbarkeit: oeffentlich / intern / Team / Staff", async () => {
    const internal = await req(vera, "POST", `/orgs/${org}/events`, { title: "Mitgliederversammlung", startsAt: inHours(72), location: "Vereinsheim, Hauptstr. 1" });
    const team = await req(vera, "POST", `/orgs/${org}/events`, { title: "Herren-Training", startsAt: inHours(30), teamId });
    const pub = await req(vera, "POST", `/orgs/${org}/events`, { title: "Sommerfest", startsAt: inHours(100), visibility: "public" });
    expect([internal.statusCode, team.statusCode, pub.statusCode]).toEqual([201, 201, 201]);
    [internalId, teamEventId, publicId] = [internal.json().id, team.json().id, pub.json().id];
    expect(team.json()).toMatchObject({ teamName: "Herren", canManage: true });

    expect(await titles(vera)).toEqual(["Herren-Training", "Mitgliederversammlung", "Sommerfest"]); // Staff sieht alles
    expect(await titles(mia)).toEqual(["Herren-Training", "Mitgliederversammlung", "Sommerfest"]); // Mitglied + Team
    expect(await titles(ben)).toEqual(["Mitgliederversammlung", "Sommerfest"]); // Mitglied ohne Team
    expect(await titles(tom)).toEqual(["Sommerfest"]); // Follower: nur oeffentlich
    expect(await titles(nina)).toEqual([]); // Fremde: nichts

    expect((await req(tom, "GET", `/events/${internalId}`)).statusCode).toBe(404);
    expect((await req(ben, "GET", `/events/${teamEventId}`)).statusCode).toBe(404);
    expect((await req(nina, "GET", `/events/${publicId}`)).statusCode).toBe(404); // nicht mal oeffentliche ohne Follow
    expect((await req(tom, "GET", `/orgs/${org}/events`)).json()).toHaveLength(1);
  });

  it("Benachrichtigung bei neuem Termin: Vereinsmitglieder bzw. nur das Team", async () => {
    const kinds = async (u: U) =>
      ((await req(u, "GET", "/notifications?limit=50")).json().items as { type: string; data: { title: string } }[])
        .filter((n) => n.type === "event_created")
        .map((n) => n.data.title)
        .sort();
    expect(await kinds(mia)).toEqual(["Herren-Training", "Mitgliederversammlung", "Sommerfest"]);
    expect(await kinds(ben)).toEqual(["Mitgliederversammlung", "Sommerfest"]); // Team-Termin nicht
    expect(await kinds(tom)).toEqual([]);
    expect(await kinds(vera)).toEqual([]); // Ersteller wird nicht benachrichtigt
  });

  it("Kalender-Zeitraum", async () => {
    const from = encodeURIComponent(inHours(60));
    expect(((await req(vera, "GET", `/events?from=${from}`)).json() as unknown[]).length).toBe(2);
    const to = encodeURIComponent(inHours(40));
    expect(((await req(vera, "GET", `/events?to=${to}`)).json() as unknown[]).length).toBe(1);
    expect((await req(vera, "GET", "/events?from=kaputt")).statusCode).toBe(400);
  });

  it("RSVP: zu-/absagen, aendern, Zaehler; Sichtbarkeit wird respektiert", async () => {
    let e = (await req(mia, "PUT", `/events/${teamEventId}/rsvp`, { status: "yes" })).json();
    expect(e.counts).toEqual({ yes: 1, maybe: 0, no: 0 });
    expect(e.myStatus).toBe("yes");
    e = (await req(mia, "PUT", `/events/${teamEventId}/rsvp`, { status: "maybe" })).json();
    expect(e.counts).toEqual({ yes: 0, maybe: 1, no: 0 }); // ersetzt, nicht addiert
    await req(vera, "PUT", `/events/${teamEventId}/rsvp`, { status: "yes" });

    expect((await req(mia, "PUT", `/events/${teamEventId}/rsvp`, { status: "vielleicht" })).statusCode).toBe(400);
    expect((await req(ben, "PUT", `/events/${teamEventId}/rsvp`, { status: "yes" })).statusCode).toBe(404); // kein Teammitglied
    expect((await req(tom, "PUT", `/events/${publicId}/rsvp`, { status: "yes" })).statusCode).toBe(200); // Follower, oeffentlich

    // Teilnehmerliste nur fuer Vorstand/Moderation
    const list = (await req(vera, "GET", `/events/${teamEventId}/participants`)).json();
    expect(list.map((p: { name: string; status: string }) => `${p.name}:${p.status}`)).toEqual(["mia:maybe", "vera:yes"]);
    expect((await req(mia, "GET", `/events/${teamEventId}/participants`)).statusCode).toBe(403);
  });

  it("Vergangene Termine: keine Zu-/Absage mehr", async () => {
    const past = await req(vera, "POST", `/orgs/${org}/events`, { title: "Altes Training", startsAt: "2020-01-01T18:00:00Z" });
    expect(past.statusCode).toBe(201);
    expect((await req(mia, "PUT", `/events/${past.json().id}/rsvp`, { status: "yes" })).statusCode).toBe(400);
  });

  it("Erinnerung: 24 h vor Beginn, genau einmal, nur Zusagen/Vielleicht", async () => {
    const soon = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Abendtraining", startsAt: inHours(3) })).json();
    await req(mia, "PUT", `/events/${soon.id}/rsvp`, { status: "yes" });
    await req(ben, "PUT", `/events/${soon.id}/rsvp`, { status: "no" });
    await req(vera, "POST", `/orgs/${org}/events`, { title: "Weit weg", startsAt: inHours(200) });

    const reminders = async (u: U) =>
      ((await req(u, "GET", "/notifications?limit=50")).json().items as { type: string; data: { title: string } }[])
        .filter((n) => n.type === "event_reminder")
        .map((n) => n.data.title);

    expect(await events.sendDueReminders()).toBe(1); // nur Abendtraining (3 h); Herren-Training liegt 30 h entfernt
    expect(await reminders(mia)).toEqual(["Abendtraining"]);
    expect(await reminders(ben)).toEqual([]); // hat abgesagt
    expect(await reminders(tom)).toEqual([]);

    expect(await events.sendDueReminders()).toBe(0); // atomarer Claim: kein zweites Mal

    // 10 h spaeter rueckt das Herren-Training ins 24-h-Fenster (mia: "vielleicht"), "Weit weg" nicht
    expect(await events.sendDueReminders(new Date(Date.now() + 10 * 3600_000))).toBe(1);
    expect((await reminders(mia)).sort()).toEqual(["Abendtraining", "Herren-Training"]);
  });

  it("ICS-Export", async () => {
    const res = await req(mia, "GET", `/events/${internalId}/ics`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/calendar/);
    const body = res.body;
    expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(body).toContain("SUMMARY:Mitgliederversammlung");
    expect(body).toContain("LOCATION:Vereinsheim\\, Hauptstr. 1"); // Komma maskiert
    expect(body).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(body).toContain("STATUS:CONFIRMED");
    expect(body.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect((await req(tom, "GET", `/events/${internalId}/ics`)).statusCode).toBe(404);
  });

  it("Absagen: nur Staff, benachrichtigt Zusagen, blockiert weitere Zusagen", async () => {
    expect((await req(mia, "POST", `/events/${teamEventId}/cancel`)).statusCode).toBe(403);
    expect((await req(vera, "POST", `/events/${teamEventId}/cancel`)).statusCode).toBe(204);

    const e = (await req(mia, "GET", `/events/${teamEventId}`)).json();
    expect(e.canceled).toBe(true);
    expect((await req(mia, "PUT", `/events/${teamEventId}/rsvp`, { status: "yes" })).statusCode).toBe(400);

    const notes = (await req(mia, "GET", "/notifications?limit=50")).json().items as { type: string; data: { title: string } }[];
    expect(notes.some((n) => n.type === "event_canceled" && n.data.title === "Herren-Training")).toBe(true);
    expect((await req(mia, "GET", `/events/${teamEventId}/ics`)).body).toContain("STATUS:CANCELLED");
  });

  it("Team verlassen/entfernen: Termine des Teams verschwinden", async () => {
    const t2 = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Nur Team", startsAt: inHours(40), teamId })).json().id;
    expect(await titles(mia)).toContain("Nur Team");
    expect((await req(mia, "DELETE", `/orgs/${org}/teams/${teamId}/members/${mia.id}`)).statusCode).toBe(204); // Austritt
    expect(await titles(mia)).not.toContain("Nur Team");
    expect((await req(mia, "GET", `/events/${t2}`)).statusCode).toBe(404);
    expect((await req(vera, "DELETE", `/orgs/${org}/teams/${teamId}`)).statusCode).toBe(204); // Team loeschen entfernt Termine
    expect((await req(vera, "GET", `/events/${t2}`)).statusCode).toBe(404);
  });
});
