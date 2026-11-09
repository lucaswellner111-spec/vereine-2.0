import "reflect-metadata";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import * as schema from "../db/schema";
import { createTestDb } from "../testing/test-db";

const password = "ein-sehr-langes-passwort";
const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

/** P4c: Umfragen an Beitraegen (Einfachwahl, anonym, Zaehler per Trigger). */
describe("P4c: Umfragen", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const dir = mkdtempSync(join(tmpdir(), "vereine-polls-"));

  beforeAll(async () => {
    process.env.MEDIA_DIR = dir;
    db = await createTestDb();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.MEDIA_DIR;
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
    app.inject({ method, url, payload: method === "GET" ? undefined : payload ?? {}, headers: { cookie: u.cookie } });

  let vera: U, tom: U;
  const slug = "tsv-umfrage";
  beforeAll(async () => {
    [vera, tom] = [await signup("vera"), await signup("tom")];
    expect((await req(vera, "POST", "/orgs", { name: "TSV Umfrage", category: "Sport", city: "Musterstadt" })).statusCode).toBe(201);
  });

  const newPoll = async (options = ["Samstag", "Sonntag"], extra: object = {}) => {
    const res = await req(vera, "POST", "/posts", { body: "Wann grillen wir?", orgSlug: slug, poll: { question: "Welcher Tag?", options, ...extra } });
    expect(res.statusCode).toBe(201);
    return res.json();
  };

  it("Anlegen: 2-6 Optionen, keine Duplikate, Frist in der Zukunft und hoechstens 90 Tage", async () => {
    const bad = (poll: object) => req(vera, "POST", "/posts", { body: "x", orgSlug: slug, poll });
    expect((await bad({ question: "Nur eine?", options: ["A"] })).statusCode).toBe(400);
    expect((await bad({ question: "Zu viele?", options: ["1", "2", "3", "4", "5", "6", "7"] })).statusCode).toBe(400);
    expect((await bad({ question: "Doppelt?", options: ["Ja", "ja "] })).statusCode).toBe(400);
    expect((await bad({ question: "Leer?", options: ["Ja", ""] })).statusCode).toBe(400);
    expect((await bad({ question: "Vorbei?", options: ["A", "B"], closesAt: inDays(-1) })).statusCode).toBe(400);
    expect((await bad({ question: "Zu lang?", options: ["A", "B"], closesAt: inDays(91) })).statusCode).toBe(400);
    expect((await bad({ question: "?", options: ["A", "B"] })).statusCode).toBe(400);

    const post = await newPoll(["A", "B", "C", "D", "E", "F"], { closesAt: inDays(89) });
    expect(post.poll).toMatchObject({ question: "Welcher Tag?", total: 0, myOptionId: null, closed: false });
    expect(post.poll.options.map((o: { label: string }) => o.label)).toEqual(["A", "B", "C", "D", "E", "F"]);
    // Nur-Umfrage ohne Text ist erlaubt
    expect((await req(vera, "POST", "/posts", { body: "", poll: { question: "Nur Umfrage?", options: ["Ja", "Nein"] } })).statusCode).toBe(201);
  });

  it("20 parallele Stimmen werden alle gezaehlt (Trigger + Primaerschluessel)", async () => {
    const post = await newPoll();
    const [a, b] = post.poll.options;
    const voters: U[] = [];
    for (let i = 0; i < 20; i++) voters.push(await signup(`waehler${i}`));
    const res = await Promise.all(voters.map((v, i) => req(v, "PUT", `/posts/${post.id}/poll/vote`, { optionId: i % 4 === 0 ? b.id : a.id })));
    expect(res.map((r) => r.statusCode)).toEqual(Array(20).fill(200));
    const view = (await req(tom, "GET", `/posts/${post.id}`)).json().poll;
    expect(view.total).toBe(20);
    expect(view.options.map((o: { votes: number }) => o.votes)).toEqual([15, 5]);
    // Mehrfach abstimmen = keine zweite Zeile
    await Promise.all([1, 2, 3].map(() => req(voters[1], "PUT", `/posts/${post.id}/poll/vote`, { optionId: a.id })));
    expect((await req(tom, "GET", `/posts/${post.id}`)).json().poll.total).toBe(20);
    const rows = await db.select().from(schema.pollVotes).where(eq(schema.pollVotes.postId, post.id));
    expect(rows).toHaveLength(20);
  });

  it("Stimme aendern und zuruecknehmen, fremde Option 400, anonym (keine Namen)", async () => {
    const post = await newPoll();
    const other = await newPoll();
    const [a, b] = post.poll.options;
    let v = (await req(tom, "PUT", `/posts/${post.id}/poll/vote`, { optionId: a.id })).json();
    expect(v).toMatchObject({ total: 1, myOptionId: a.id });
    v = (await req(tom, "PUT", `/posts/${post.id}/poll/vote`, { optionId: b.id })).json();
    expect(v.total).toBe(1);
    expect(v.options.map((o: { votes: number }) => o.votes)).toEqual([0, 1]);
    expect((await req(tom, "PUT", `/posts/${post.id}/poll/vote`, { optionId: other.poll.options[0].id })).statusCode).toBe(400);
    expect((await req(tom, "PUT", `/posts/${post.id}/poll/vote`, { optionId: "nicht-uuid" })).statusCode).toBe(400);

    // Anonym: weder Ergebnis noch Beitrag enthalten Namen oder Nutzer-IDs der Abstimmenden
    const seenByVera = JSON.stringify((await req(vera, "GET", `/posts/${post.id}`)).json().poll);
    expect(seenByVera).not.toContain(tom.id);
    expect(seenByVera).not.toContain("tom");
    expect(JSON.parse(seenByVera).myOptionId).toBeNull();

    v = (await req(tom, "DELETE", `/posts/${post.id}/poll/vote`)).json();
    expect(v).toMatchObject({ total: 0, myOptionId: null });
    // Beitrag ohne Umfrage
    const plain = (await req(vera, "POST", "/posts", { body: "Ohne Umfrage" })).json();
    expect(plain.poll).toBeNull();
    expect((await req(tom, "PUT", `/posts/${plain.id}/poll/vote`, { optionId: a.id })).statusCode).toBe(404);
  });

  it("Nach der Frist: 400, Ergebnis bleibt sichtbar", async () => {
    const post = await newPoll(["A", "B"], { closesAt: inDays(1) });
    await req(tom, "PUT", `/posts/${post.id}/poll/vote`, { optionId: post.poll.options[0].id });
    await db.update(schema.polls).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(schema.polls.postId, post.id));
    expect((await req(tom, "PUT", `/posts/${post.id}/poll/vote`, { optionId: post.poll.options[1].id })).statusCode).toBe(400);
    expect((await req(tom, "DELETE", `/posts/${post.id}/poll/vote`)).statusCode).toBe(400);
    expect((await req(tom, "GET", `/posts/${post.id}`)).json().poll).toMatchObject({ closed: true, total: 1, myOptionId: post.poll.options[0].id });
  });

  it("Persoenlicher Beitrag eines privaten Profils: fuer Fremde 404", async () => {
    const mia = await signup("mia");
    const post = (await req(mia, "POST", "/posts", { body: "Privat", poll: { question: "Pizza oder Pasta?", options: ["Pizza", "Pasta"] } })).json();
    await req(mia, "PUT", "/profiles/me", { visibility: "private" });
    expect((await req(tom, "PUT", `/posts/${post.id}/poll/vote`, { optionId: post.poll.options[0].id })).statusCode).toBe(404);
    expect((await req(mia, "PUT", `/posts/${post.id}/poll/vote`, { optionId: post.poll.options[0].id })).statusCode).toBe(200);
  });

  it("Kontoloeschung senkt die Zaehler (Kaskade + Trigger), Auskunft enthaelt die eigene Stimme", async () => {
    const post = await newPoll();
    const leaver = await signup("leaver");
    await req(leaver, "PUT", `/posts/${post.id}/poll/vote`, { optionId: post.poll.options[1].id });
    await req(tom, "PUT", `/posts/${post.id}/poll/vote`, { optionId: post.poll.options[1].id });
    expect((await req(tom, "GET", `/posts/${post.id}`)).json().poll.total).toBe(2);
    const exp = (await req(leaver, "GET", "/privacy/export")).json();
    expect(exp.pollVotes).toEqual([expect.objectContaining({ postId: post.id, question: "Welcher Tag?", answer: "Sonntag" })]);
    expect((await req(leaver, "DELETE", "/privacy/account", { password })).statusCode).toBe(204);
    const view = (await req(tom, "GET", `/posts/${post.id}`)).json().poll;
    expect(view.total).toBe(1);
    expect(view.options[1].votes).toBe(1);
  });
});
