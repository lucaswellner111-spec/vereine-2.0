import "reflect-metadata";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
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

describe("Termine P4b: Bearbeiten, Limit/Warteliste, Helferlisten, Anwesenheit, Vergangene", () => {
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

  type U = { cookie: string; id: string; name: string };
  async function signup(name: string): Promise<U> {
    const email = `${name}@example.de`;
    const reg = await app.inject({
      method: "POST", url: "/auth/register",
      payload: { email, password, displayName: name, confirmAge16: true, acceptTerms: true, acceptPrivacy: true },
    });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
    return { cookie: String(login.headers["set-cookie"]).split(";")[0], id: reg.json().id, name };
  }
  const req = (u: U, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie: u.cookie } });
  const join_ = async (u: U, slug: string, admin: U) => {
    await req(u, "POST", `/orgs/${slug}/membership`);
    await req(admin, "POST", `/orgs/${slug}/members/${u.id}/decision`, { decision: "approve" });
  };
  const notes = async (u: U, type: string) =>
    ((await req(u, "GET", "/notifications?limit=50")).json().items as { type: string; data: Record<string, string> }[]).filter((n) => n.type === type);
  const status = async (u: U, id: string) => (await req(u, "GET", `/events/${id}`)).json();

  const org = "sv-limit";
  let vera: U, mod: U, mia: U, ben: U, tom: U, nina: U;
  const crowd: U[] = [];

  beforeAll(async () => {
    [vera, mod, mia, ben, tom, nina] = await Promise.all(["vera", "mod", "mia", "ben", "tom", "nina"].map((n) => signup(n)));
    await req(vera, "POST", "/orgs", { name: "SV Limit", category: "Sport", city: "Limitstadt" });
    for (const m of [mod, mia, ben]) await join_(m, org, vera);
    await req(vera, "PUT", `/orgs/${org}/members/${mod.id}/role`, { role: "moderator" });
    await req(tom, "POST", `/orgs/${org}/follow`); // nur Follower
    for (let i = 0; i < 20; i++) crowd.push(await signup(`p${String(i).padStart(2, "0")}`));
    for (const p of crowd) await join_(p, org, vera);
  });

  it("Moderator-Rolle wurde vergeben", async () => {
    const res = await req(mod, "POST", `/orgs/${org}/events`, { title: "Mod-Termin", startsAt: inHours(10) });
    expect(res.statusCode).toBe(201);
  });

  // --- Termin anlegen und bearbeiten ---

  it("Anlegen mit Art und Limit; Standard-Art other", async () => {
    const a = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Spiel", startsAt: inHours(30), kind: "match", capacity: 11 })).json();
    expect(a).toMatchObject({ kind: "match", capacity: 11, counts: { yes: 0, maybe: 0, no: 0, waitlist: 0 }, waitlistPosition: null });
    const b = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Ohne Art", startsAt: inHours(30) })).json();
    expect(b).toMatchObject({ kind: "other", capacity: null });
    expect((await req(vera, "POST", `/orgs/${org}/events`, { title: "Falsch", startsAt: inHours(30), kind: "grillen" })).statusCode).toBe(400);
    expect((await req(vera, "POST", `/orgs/${org}/events`, { title: "Falsch", startsAt: inHours(30), capacity: 0 })).statusCode).toBe(400);
  });

  it("PUT /events/:id: Rechte, abgesagt/vorbei, Benachrichtigung nur bei Zeit/Ort/Titel, reminded_at", async () => {
    const ev = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Training Di", startsAt: inHours(20), location: "Halle 1" })).json();
    await req(mia, "PUT", `/events/${ev.id}/rsvp`, { status: "yes" });
    await req(ben, "PUT", `/events/${ev.id}/rsvp`, { status: "no" });
    expect((await req(mia, "PUT", `/events/${ev.id}`, { title: "Gekapert" })).statusCode).toBe(403);
    expect((await req(tom, "PUT", `/events/${ev.id}`, { title: "Gekapert" })).statusCode).toBe(404);
    expect((await req(vera, "PUT", `/events/${ev.id}`, { endsAt: inHours(19) })).statusCode).toBe(400); // Ende vor Beginn

    // nur Beschreibung/Art: keine Benachrichtigung
    let res = await req(mod, "PUT", `/events/${ev.id}`, { description: "Bitte Hallenschuhe", kind: "training" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ description: "Bitte Hallenschuhe", kind: "training", teamId: null });
    expect(await notes(mia, "event_updated")).toHaveLength(0);

    // Erinnerung wurde schon verschickt; neue Startzeit setzt sie zurueck
    expect(await events.sendDueReminders()).toBeGreaterThanOrEqual(1);
    res = await req(vera, "PUT", `/events/${ev.id}`, { startsAt: inHours(22), location: "Halle 2" });
    expect(res.json()).toMatchObject({ location: "Halle 2" });
    const [row] = await db.select().from(schema.events).where(eq(schema.events.id, ev.id));
    expect(row.remindedAt).toBeNull();
    const upd = await notes(mia, "event_updated");
    expect(upd).toHaveLength(1);
    expect(upd[0].data).toMatchObject({ eventId: ev.id, title: "Training Di" });
    expect(await notes(ben, "event_updated")).toHaveLength(0); // abgesagt: keine Benachrichtigung
    expect(await notes(vera, "event_updated")).toHaveLength(0); // eigene Aenderung

    // abgesagt bzw. vorbei: 400
    await req(vera, "POST", `/events/${ev.id}/cancel`);
    expect((await req(vera, "PUT", `/events/${ev.id}`, { title: "Neu" })).statusCode).toBe(400);
    const old = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Vorbei", startsAt: "2020-01-01T10:00:00Z" })).json();
    expect((await req(vera, "PUT", `/events/${old.id}`, { title: "Neu" })).statusCode).toBe(400);
  });

  it("PUT mit scope series: Felder fuer diesen und spaetere, Datum/Uhrzeit nur einzeln", async () => {
    const first = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Serie", startsAt: inHours(48), repeat: { freq: "weekly", count: 3 } })).json();
    const list = ((await req(vera, "GET", `/orgs/${org}/events`)).json() as { id: string; seriesId: string; startsAt: string }[])
      .filter((e) => e.seriesId === first.seriesId)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    expect(list).toHaveLength(3);
    const second = list[1];
    const newStart = new Date(new Date(second.startsAt).getTime() + 3600_000).toISOString();
    const res = await req(vera, "PUT", `/events/${second.id}`, { title: "Serie neu", capacity: 30, startsAt: newStart, scope: "series" });
    expect(res.statusCode).toBe(200);
    const after = await Promise.all(list.map((e) => status(vera, e.id)));
    expect(after.map((e) => e.title)).toEqual(["Serie", "Serie neu", "Serie neu"]);
    expect(after.map((e) => e.capacity)).toEqual([null, 30, 30]);
    expect(after[1].startsAt).toBe(newStart);
    expect(after[2].startsAt).toBe(list[2].startsAt); // Uhrzeit nur einzeln
  });

  // --- Limit und Warteliste ---

  let limited: string;

  it("20 parallele Zusagen bei Limit 5: genau 5 Zusagen, 15 auf der Warteliste", async () => {
    limited = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Ausflug", startsAt: inHours(72), capacity: 5 })).json().id;
    const results = await Promise.all(crowd.map((p) => req(p, "PUT", `/events/${limited}/rsvp`, { status: "yes" })));
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const states = results.map((r) => r.json().myStatus);
    expect(states.filter((s) => s === "yes")).toHaveLength(5);
    expect(states.filter((s) => s === "waitlist")).toHaveLength(15);
    const e = await status(vera, limited);
    expect(e.counts).toMatchObject({ yes: 5, waitlist: 15 });
    const [row] = await db.select().from(schema.events).where(eq(schema.events.id, limited));
    expect(row.yesCount).toBe(5);
    // Positionen 1..15 ohne Luecken
    const positions = (await Promise.all(crowd.map((p) => status(p, limited)))).map((x) => x.waitlistPosition).filter((x) => x !== null).sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    // nochmals "Zusagen" auf der Warteliste: bleibt auf der Warteliste
    const waiting = crowd.find((_, i) => states[i] === "waitlist")!;
    expect((await req(waiting, "PUT", `/events/${limited}/rsvp`, { status: "yes" })).json().myStatus).toBe("waitlist");
  });

  async function waitlistOrder(): Promise<string[]> {
    const rows = await db
      .select({ userId: schema.eventRsvps.userId, w: schema.eventRsvps.waitlistedAt })
      .from(schema.eventRsvps)
      .where(eq(schema.eventRsvps.eventId, limited));
    return rows.filter((r) => r.w).sort((a, b) => a.w!.getTime() - b.w!.getTime() || a.userId.localeCompare(b.userId)).map((r) => r.userId);
  }
  const yesUsers = async () =>
    (await db.select({ userId: schema.eventRsvps.userId, s: schema.eventRsvps.status }).from(schema.eventRsvps).where(eq(schema.eventRsvps.eventId, limited)))
      .filter((r) => r.s === "yes")
      .map((r) => r.userId);
  const byId = (id: string) => crowd.find((p) => p.id === id)!;

  it("Absage zieht die aelteste Person der Warteliste nach und benachrichtigt sie", async () => {
    const [first] = await waitlistOrder();
    const leaver = byId((await yesUsers())[0]);
    const res = await req(leaver, "PUT", `/events/${limited}/rsvp`, { status: "no" });
    expect(res.json()).toMatchObject({ myStatus: "no", counts: { yes: 5, waitlist: 14 } });
    expect((await status(byId(first), limited)).myStatus).toBe("yes");
    const promoted = await notes(byId(first), "event_waitlist_promoted");
    expect(promoted).toHaveLength(1);
    expect(promoted[0].data).toMatchObject({ eventId: limited, title: "Ausflug" });
  });

  it("Kontoloeschung senkt yes_count (Trigger), der Job zieht nach", async () => {
    const victim = byId((await yesUsers())[0]);
    const [next] = await waitlistOrder();
    // Kaskade direkt in der DB (ohne den Loeschablauf, der den Job selbst anstoesst)
    await db.delete(schema.users).where(eq(schema.users.id, victim.id));
    let [row] = await db.select().from(schema.events).where(eq(schema.events.id, limited));
    expect(row.yesCount).toBe(4);
    expect(await events.fillAllWaitlists()).toBe(1);
    [row] = await db.select().from(schema.events).where(eq(schema.events.id, limited));
    expect(row.yesCount).toBe(5);
    expect((await status(byId(next), limited)).myStatus).toBe("yes");
    expect(await events.fillAllWaitlists()).toBe(0); // nichts mehr frei
  });

  it("Kontoloeschung ueber den Loeschablauf rueckt sofort nach", async () => {
    const victim = byId((await yesUsers())[0]);
    const [next] = await waitlistOrder();
    expect((await req(victim, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);
    expect((await status(byId(next), limited)).myStatus).toBe("yes");
    expect((await status(vera, limited)).counts.yes).toBe(5);
  });

  it("Austritt senkt yes_count und zieht nach", async () => {
    const leaver = byId((await yesUsers())[0]);
    const [next] = await waitlistOrder();
    expect((await req(leaver, "DELETE", `/orgs/${org}/members/${leaver.id}`)).statusCode).toBe(204);
    expect((await status(byId(next), limited)).myStatus).toBe("yes");
    const [row] = await db.select().from(schema.events).where(eq(schema.events.id, limited));
    expect(row.yesCount).toBe(5);
  });

  it("Limit unter Zusagen 400, Erhoehung zieht nach, kein Limit nimmt alle", async () => {
    expect((await req(vera, "PUT", `/events/${limited}`, { capacity: 4 })).statusCode).toBe(400);
    const waitingBefore = (await status(vera, limited)).counts.waitlist;
    let e = (await req(vera, "PUT", `/events/${limited}`, { capacity: 7 })).json();
    expect(e.counts).toMatchObject({ yes: 7, waitlist: waitingBefore - 2 });
    e = (await req(vera, "PUT", `/events/${limited}`, { capacity: null })).json();
    expect(e).toMatchObject({ capacity: null, counts: { waitlist: 0, yes: 5 + waitingBefore } });
  });

  // --- Helferlisten ---

  let fest: string, shiftId: string;

  it("Helferliste: nur Verwaltung legt an, Mitglieder tragen sich ein, Follower nicht", async () => {
    fest = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Sommerfest", startsAt: inHours(100), visibility: "public", kind: "party" })).json().id;
    expect((await req(mia, "POST", `/events/${fest}/shifts`, { title: "Kuchen", slots: 2 })).statusCode).toBe(403);
    expect((await req(vera, "POST", `/events/${fest}/shifts`, { title: "K", slots: 2 })).statusCode).toBe(400);
    expect((await req(vera, "POST", `/events/${fest}/shifts`, { title: "Kuchen", slots: 0 })).statusCode).toBe(400);
    const list = (await req(vera, "POST", `/events/${fest}/shifts`, { title: "Kuchen", slots: 1, startsAt: inHours(100), endsAt: inHours(102) })).json();
    expect(list).toEqual([expect.objectContaining({ title: "Kuchen", slots: 1, taken: 0, mine: false, people: [] })]);
    shiftId = list[0].id;
    // Follower sieht den oeffentlichen Termin und die Dienste, aber keine Namen und darf sich nicht eintragen
    const seen = (await req(tom, "GET", `/events/${fest}/shifts`)).json();
    expect(seen[0]).not.toHaveProperty("people");
    expect((await req(tom, "PUT", `/shifts/${shiftId}/signup`)).statusCode).toBe(403);
    expect((await req(nina, "PUT", `/shifts/${shiftId}/signup`)).statusCode).toBe(404); // Termin nicht sichtbar
  });

  it("Helferliste: parallel um den letzten Platz gewinnt genau eine Person, sonst 409", async () => {
    const res = await Promise.all([mia, ben, mod].map((u) => req(u, "PUT", `/shifts/${shiftId}/signup`)));
    const codes = res.map((r) => r.statusCode).sort();
    expect(codes).toEqual([200, 409, 409]);
    expect(res.find((r) => r.statusCode === 409)!.json().message).toBe("Dienst ist voll.");
    const winner = [mia, ben, mod][res.findIndex((r) => r.statusCode === 200)];
    const list = (await req(winner, "GET", `/events/${fest}/shifts`)).json();
    expect(list[0]).toMatchObject({ taken: 1, mine: true, people: [expect.objectContaining({ userId: winner.id })] });
    // erneut eintragen ist idempotent
    expect((await req(winner, "PUT", `/shifts/${shiftId}/signup`)).statusCode).toBe(200);

    // Plaetze unter Eintragungen: 400; mehr Plaetze ok
    expect((await req(vera, "PATCH", `/shifts/${shiftId}`, { slots: 0 })).statusCode).toBe(400);
    const s2 = await req(vera, "PATCH", `/shifts/${shiftId}`, { slots: 3, title: "Kuchenstand" });
    expect(s2.json()[0]).toMatchObject({ title: "Kuchenstand", slots: 3, taken: 1 });
    // Austragen senkt taken
    const out = (await req(winner, "DELETE", `/shifts/${shiftId}/signup`)).json();
    expect(out[0]).toMatchObject({ taken: 0, mine: false });
    // Verwaltung traegt aus
    await req(mia, "PUT", `/shifts/${shiftId}/signup`);
    expect((await req(ben, "DELETE", `/shifts/${shiftId}/signups/${mia.id}`)).statusCode).toBe(403);
    expect((await req(vera, "DELETE", `/shifts/${shiftId}/signups/${mia.id}`)).statusCode).toBe(204);
    expect((await req(vera, "GET", `/events/${fest}/shifts`)).json()[0].taken).toBe(0);
  });

  it("Helferliste bei Team-Terminen nur fuer das Team; Dienst loeschen nur Verwaltung", async () => {
    const team = (await req(vera, "POST", `/orgs/${org}/teams`, { name: "Erste" })).json().id;
    await req(vera, "PUT", `/orgs/${org}/teams/${team}/members/${mia.id}`);
    const ev = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Teamabend", startsAt: inHours(50), teamId: team })).json().id;
    const sid = (await req(vera, "POST", `/events/${ev}/shifts`, { title: "Grill", slots: 2 })).json()[0].id;
    expect((await req(mod, "PUT", `/shifts/${sid}/signup`)).statusCode).toBe(403); // Moderation sieht, ist aber nicht im Team
    expect((await req(ben, "PUT", `/shifts/${sid}/signup`)).statusCode).toBe(404); // sieht den Team-Termin nicht
    expect((await req(mia, "PUT", `/shifts/${sid}/signup`)).statusCode).toBe(200);
    expect((await req(mia, "DELETE", `/shifts/${sid}`)).statusCode).toBe(403);
    expect((await req(mod, "DELETE", `/shifts/${sid}`)).statusCode).toBe(204);
    expect((await req(vera, "GET", `/events/${ev}/shifts`)).json()).toEqual([]);
  });

  // --- Anwesenheit ---

  it("Anwesenheit: nur Verwaltung, vor Beginn 400, Fremde 400, null loescht, Quote", async () => {
    const future = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Spaeter", startsAt: inHours(5) })).json().id;
    expect((await req(vera, "PUT", `/events/${future}/attendance`, { entries: [{ userId: mia.id, status: "present" }] })).statusCode).toBe(400);

    const ev = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Gleich", startsAt: inHours(0.5) })).json().id;
    await req(mia, "PUT", `/events/${ev}/rsvp`, { status: "yes" });
    expect((await req(mia, "GET", `/events/${ev}/attendance`)).statusCode).toBe(403);
    expect((await req(mia, "PUT", `/events/${ev}/attendance`, { entries: [{ userId: mia.id, status: "present" }] })).statusCode).toBe(403);
    expect((await req(tom, "GET", `/events/${ev}/attendance`)).statusCode).toBe(404);
    expect((await req(vera, "PUT", `/events/${ev}/attendance`, { entries: [{ userId: tom.id, status: "present" }] })).statusCode).toBe(400); // Follower
    expect((await req(vera, "PUT", `/events/${ev}/attendance`, { entries: [{ userId: mia.id, status: "krank" }] })).statusCode).toBe(400);
    expect((await req(vera, "PUT", `/events/${ev}/attendance`, { entries: [{ userId: mia.id, status: "present" }, { userId: mia.id, status: "absent" }] })).statusCode).toBe(400);

    const list = (await req(mod, "GET", `/events/${ev}/attendance`)).json();
    const mias = list.entries.find((x: { userId: string }) => x.userId === mia.id);
    expect(mias).toEqual({ userId: mia.id, name: "mia", status: null, rsvp: "yes" });
    expect(list.entries.some((x: { userId: string }) => x.userId === tom.id)).toBe(false);

    const saved = (await req(mod, "PUT", `/events/${ev}/attendance`, {
      entries: [
        { userId: mia.id, status: "present" },
        { userId: ben.id, status: "absent" },
        { userId: mod.id, status: "excused" },
        { userId: vera.id, status: "present" },
      ],
    })).json();
    const st = (u: U) => saved.entries.find((x: { userId: string }) => x.userId === u.id).status;
    expect([st(mia), st(ben), st(mod), st(vera)]).toEqual(["present", "absent", "excused", "present"]);
    const [marked] = await db.select().from(schema.eventAttendance).where(eq(schema.eventAttendance.userId, mia.id));
    expect(marked.markedBy).toBe(mod.id);

    // null loescht
    const cleared = (await req(vera, "PUT", `/events/${ev}/attendance`, { entries: [{ userId: mod.id, status: null }] })).json();
    expect(cleared.entries.find((x: { userId: string }) => x.userId === mod.id).status).toBeNull();

    // Quote: 2 von 3 da (Termin hat schon begonnen? Beginn in 30 min -> zaehlt erst ab Beginn)
    await db.update(schema.events).set({ startsAt: new Date(Date.now() - 3600_000) }).where(eq(schema.events.id, ev));
    const dash = (await req(vera, "GET", `/orgs/${org}/dashboard`)).json();
    expect(dash.attendance).toEqual({ rate: 0.667, events: 1 });
    expect((await req(mod, "GET", `/orgs/${org}/dashboard`)).statusCode).toBe(403);
  });

  it("Anwesenheit bei oeffentlichen Terminen: Kandidaten sind die Zusagen aktiver Mitglieder", async () => {
    const ev = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Tag der offenen Tuer", startsAt: inHours(0.5), visibility: "public" })).json().id;
    await req(ben, "PUT", `/events/${ev}/rsvp`, { status: "yes" });
    await req(tom, "PUT", `/events/${ev}/rsvp`, { status: "yes" }); // Follower
    const list = (await req(vera, "GET", `/events/${ev}/attendance`)).json();
    expect(list.entries.map((e: { name: string }) => e.name)).toEqual(["ben"]);
  });

  it("Austritt loescht Anwesenheit und Helfer-Eintraege kuenftiger Termine des Vereins", async () => {
    const sid = (await req(vera, "POST", `/events/${fest}/shifts`, { title: "Aufbau", slots: 5 })).json().find((s: { title: string }) => s.title === "Aufbau").id;
    expect((await req(ben, "PUT", `/shifts/${sid}/signup`)).statusCode).toBe(200);
    const before = await db.select().from(schema.eventAttendance).where(eq(schema.eventAttendance.userId, ben.id));
    expect(before.length).toBeGreaterThan(0);
    expect((await req(ben, "DELETE", `/orgs/${org}/members/${ben.id}`)).statusCode).toBe(204);
    expect(await db.select().from(schema.eventAttendance).where(eq(schema.eventAttendance.userId, ben.id))).toEqual([]);
    expect(await db.select().from(schema.eventShiftSignups).where(eq(schema.eventShiftSignups.userId, ben.id))).toEqual([]);
    const shifts = (await req(vera, "GET", `/events/${fest}/shifts`)).json();
    expect(shifts.find((s: { id: string }) => s.id === sid).taken).toBe(0);
  });

  it("PUT: neuer Beginn in der Vergangenheit 400; Helferliste an vergangenen Terminen 400", async () => {
    const ev = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Verschieben", startsAt: inHours(10) })).json().id;
    expect((await req(vera, "PUT", `/events/${ev}`, { startsAt: inHours(-5) })).statusCode).toBe(400);
    expect((await req(vera, "PUT", `/events/${ev}`, { startsAt: inHours(12) })).statusCode).toBe(200);
    const old = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Vorbei Dienst", startsAt: "2020-05-01T10:00:00Z" })).json().id;
    expect((await req(vera, "POST", `/events/${old}/shifts`, { title: "Abbau", slots: 2 })).statusCode).toBe(400);
  });

  it("PUT oeffentlich -> intern entfernt Nicht-Mitglieder aus Zusagen, Warteliste und Helferliste und zieht nach", async () => {
    const [fan1, fan2] = [await signup("fan1"), await signup("fan2")];
    for (const f of [fan1, fan2]) await req(f, "POST", `/orgs/${org}/follow`);
    const ev = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Offenes Training", startsAt: inHours(60), visibility: "public", capacity: 2 })).json().id;
    await req(fan1, "PUT", `/events/${ev}/rsvp`, { status: "yes" });
    await req(fan2, "PUT", `/events/${ev}/rsvp`, { status: "yes" });
    await req(mia, "PUT", `/events/${ev}/rsvp`, { status: "yes" }); // voll: Warteliste
    expect((await status(mia, ev)).myStatus).toBe("waitlist");
    await req(fan1, "PUT", `/events/${ev}/rsvp`, { status: "maybe" }); // mia rueckt nach
    await req(fan1, "PUT", `/events/${ev}/rsvp`, { status: "yes" }); // fan1 jetzt auf der Warteliste
    const sid = (await req(vera, "POST", `/events/${ev}/shifts`, { title: "Ball", slots: 3 })).json()[0].id;
    await req(mia, "PUT", `/shifts/${sid}/signup`);

    const e = (await req(vera, "PUT", `/events/${ev}`, { visibility: "members" })).json();
    expect(e.counts).toMatchObject({ yes: 1, waitlist: 0 });
    const rows = await db.select().from(schema.eventRsvps).where(eq(schema.eventRsvps.eventId, ev));
    expect(rows.map((r) => r.userId)).toEqual([mia.id]);
    const [row] = await db.select().from(schema.events).where(eq(schema.events.id, ev));
    expect(row.yesCount).toBe(1);
    expect((await req(vera, "GET", `/events/${ev}/shifts`)).json()[0].taken).toBe(1); // Mitglied bleibt
    expect((await req(fan2, "GET", `/events/${ev}`)).statusCode).toBe(404);

    // Datenauskunft nennt Termintitel und Beginn
    const exp = (await req(mia, "GET", "/privacy/export")).json();
    const mine = exp.events.responses.find((r: { eventId: string }) => r.eventId === ev);
    expect(mine).toMatchObject({ eventTitle: "Offenes Training", status: "yes", waitlistedAt: null });
    expect(exp.events.helperShifts.find((s: { shiftId: string }) => s.shiftId === sid)).toMatchObject({ shiftTitle: "Ball", eventId: ev });
  });

  it("Wartende ruecken nach, wenn Nicht-Mitglieder beim Umstellen Plaetze freimachen", async () => {
    const fan = await signup("fan3");
    await req(fan, "POST", `/orgs/${org}/follow`);
    const ev = (await req(vera, "POST", `/orgs/${org}/events`, { title: "Kleiner Kurs", startsAt: inHours(70), visibility: "public", capacity: 1 })).json().id;
    await req(fan, "PUT", `/events/${ev}/rsvp`, { status: "yes" });
    await req(mia, "PUT", `/events/${ev}/rsvp`, { status: "yes" });
    expect((await status(mia, ev)).myStatus).toBe("waitlist");
    await req(vera, "PUT", `/events/${ev}`, { visibility: "members" });
    expect((await status(mia, ev)).myStatus).toBe("yes");
    expect((await notes(mia, "event_waitlist_promoted")).some((n) => n.data.eventId === ev)).toBe(true);
  });

  // --- Vergangene Termine und Monatsabfrage ---

  it("past=1: absteigend, nur vergangene, Seiten per to + before", async () => {
    const o2 = "sv-alt";
    await req(nina, "POST", "/orgs", { name: "SV Alt", category: "Sport", city: "Altstadt" });
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      ids.push((await req(nina, "POST", `/orgs/${o2}/events`, { title: `Alt ${i}`, startsAt: `2024-0${i}-01T10:00:00Z` })).json().id);
    }
    await req(nina, "POST", `/orgs/${o2}/events`, { title: "Kommt noch", startsAt: inHours(10) });
    const past = (await req(nina, "GET", `/orgs/${o2}/events?past=1`)).json() as { title: string; id: string; startsAt: string }[];
    expect(past.map((e) => e.title)).toEqual(["Alt 5", "Alt 4", "Alt 3", "Alt 2", "Alt 1"]);
    // naechste Seite ab "Alt 3"
    const cur = past[2];
    const page = (await req(nina, "GET", `/events?past=1&to=${encodeURIComponent(cur.startsAt)}&before=${cur.id}`)).json() as { title: string }[];
    expect(page.map((e) => e.title)).toEqual(["Alt 2", "Alt 1"]);
    expect((await req(nina, "GET", `/events?past=1&to=${encodeURIComponent(cur.startsAt)}&before=kaputt`)).statusCode).toBe(400);
    expect((await req(nina, "GET", `/events?before=${cur.id}`)).statusCode).toBe(400);
  });

  it("Monatsabfrage: bis 42 Tage bis zu 300 Termine", async () => {
    const o3 = "sv-viel";
    await req(nina, "POST", "/orgs", { name: "SV Viel", category: "Sport", city: "Vielstadt" });
    const base = Date.now() + 2 * 86400_000;
    // 150 Termine im Abstand von 5 h (ca. 31 Tage)
    const rows = Array.from({ length: 150 }, (_, i) => ({
      orgId: "",
      title: `T${i}`,
      startsAt: new Date(base + i * 3600_000 * 5),
    }));
    const [org3] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, o3));
    await db.insert(schema.events).values(rows.map((r) => ({ ...r, orgId: org3.id })));
    const from = new Date(base - 3600_000).toISOString();
    const to = new Date(base + 40 * 86400_000).toISOString();
    const month = (await req(nina, "GET", `/orgs/${o3}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).json();
    expect(month).toHaveLength(150);
    const normal = (await req(nina, "GET", `/orgs/${o3}/events`)).json();
    expect(normal).toHaveLength(100);
  });
});
