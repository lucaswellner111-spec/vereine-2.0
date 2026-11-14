import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { DB } from "../db/db.module";
import { createTestDb } from "../testing/test-db";
import { BounceWebhookService, classifyEvent, extractEvents, WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TIMESTAMP_HEADER, WEBHOOK_TOLERANCE_S } from "./bounce-webhook.service";
import { addressHash } from "./mail-limits";
import { SuppressionsService } from "./suppressions.service";

const SECRET = "s".repeat(40);

describe("classifyEvent: nur harte Bounces und Beschwerden sperren", () => {
  it("harte Bounces", () => {
    expect(classifyEvent({ type: "email_bounced", bounce_type: "hard", email: "A@Example.de" })).toEqual({ email: "a@example.de", reason: "bounce" });
    expect(classifyEvent({ event: "hard_bounce", recipient: "b@example.de" })).toEqual({ email: "b@example.de", reason: "bounce" });
    expect(classifyEvent({ type: "email_bounce", subtype: "Permanent", to: "c@example.de" })).toMatchObject({ reason: "bounce" });
  });
  it("Beschwerden", () => {
    expect(classifyEvent({ type: "email_complaint", email: "d@example.de" })).toEqual({ email: "d@example.de", reason: "complaint" });
    expect(classifyEvent({ type: "spam_report", email: "d@example.de" })).toMatchObject({ reason: "complaint" });
  });
  it("weiche Bounces, Zustellungen, Verzoegerungen, Muell werden ignoriert", () => {
    expect(classifyEvent({ type: "email_bounced", bounce_type: "soft", email: "e@example.de" })).toBeNull();
    expect(classifyEvent({ type: "email_bounced", bounce_type: "transient", email: "e@example.de" })).toBeNull();
    expect(classifyEvent({ type: "email_bounced", email: "e@example.de" })).toBeNull(); // Art unbekannt: lieber nicht sperren
    expect(classifyEvent({ type: "email_delivered", email: "e@example.de" })).toBeNull();
    expect(classifyEvent({ type: "email_delayed", email: "e@example.de" })).toBeNull();
    expect(classifyEvent({ type: "hard_bounce", email: "kein-mail" })).toBeNull();
    for (const j of [null, "x", 4, []]) expect(classifyEvent(j)).toBeNull();
  });
  it("Ereignislisten in drei Formen", () => {
    expect(extractEvents([1, 2])).toEqual([1, 2]);
    expect(extractEvents({ events: [1] })).toEqual([1]);
    expect(extractEvents({ a: 1 })).toEqual([{ a: 1 }]);
    expect(extractEvents("x")).toEqual([]);
  });
});

describe("Bounce-Webhook", () => {
  let app: NestFastifyApplication;
  let suppressions: SuppressionsService;

  beforeAll(async () => {
    const db = await createTestDb();
    const ref = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(db).compile();
    app = ref.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, { rateLimit: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    suppressions = app.get(SuppressionsService);
  });
  afterAll(() => app.close());
  afterEach(() => {
    delete process.env.MAIL_WEBHOOK_SECRET;
  });

  const nowS = () => String(Math.floor(Date.now() / 1000));
  const send = (body: unknown, opts: { ts?: string; secret?: string; signature?: string; raw?: string } = {}) => {
    const raw = opts.raw ?? JSON.stringify(body);
    const ts = opts.ts ?? nowS();
    const sig = opts.signature ?? BounceWebhookService.sign(opts.secret ?? SECRET, ts, raw);
    return app.inject({ method: "POST", url: "/mail/webhook/scaleway", payload: raw, headers: { "content-type": "application/json", [WEBHOOK_TIMESTAMP_HEADER]: ts, [WEBHOOK_SIGNATURE_HEADER]: sig } });
  };
  const blocked = (email: string) => suppressions.isSuppressed(addressHash(email), ["all"]);

  it("ohne konfiguriertes Geheimnis: Endpunkt aus (404)", async () => {
    expect((await send({ events: [] })).statusCode).toBe(404);
    process.env.MAIL_WEBHOOK_SECRET = "zu-kurz";
    expect((await send({ events: [] })).statusCode).toBe(404);
  });

  it("gueltig signiert: harter Bounce und Beschwerde sperren, weiche Bounces nicht", async () => {
    process.env.MAIL_WEBHOOK_SECRET = SECRET;
    const res = await send({
      events: [
        { id: "1", type: "email_bounced", bounce_type: "hard", email: "hart@example.de" },
        { id: "2", type: "email_complaint", email: "spam@example.de" },
        { id: "3", type: "email_bounced", bounce_type: "soft", email: "weich@example.de" },
        { id: "4", type: "email_delivered", email: "ok@example.de" },
      ],
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 2, ignored: 2 });
    expect(await blocked("hart@example.de")).toBe(true);
    expect(await blocked("spam@example.de")).toBe(true);
    expect(await blocked("weich@example.de")).toBe(false);
    expect(await blocked("ok@example.de")).toBe(false);
  });

  it("falsche Signatur, falsches Geheimnis, veraenderter Koerper, fehlende Header: 401 und nichts gesperrt", async () => {
    process.env.MAIL_WEBHOOK_SECRET = SECRET;
    const body = { events: [{ type: "hard_bounce", email: "nein@example.de" }] };
    expect((await send(body, { signature: "0".repeat(64) })).statusCode).toBe(401);
    expect((await send(body, { secret: "x".repeat(40) })).statusCode).toBe(401);
    const ts = nowS();
    const sig = BounceWebhookService.sign(SECRET, ts, JSON.stringify(body));
    expect((await send({ events: [{ type: "hard_bounce", email: "anders@example.de" }] }, { ts, signature: sig })).statusCode).toBe(401);
    const bare = await app.inject({ method: "POST", url: "/mail/webhook/scaleway", payload: body });
    expect(bare.statusCode).toBe(401);
    expect(await blocked("nein@example.de")).toBe(false);
    expect(await blocked("anders@example.de")).toBe(false);
  });

  it("Replay: dieselbe gueltige Anfrage nur einmal; zu alter oder zu neuer Zeitstempel wird abgelehnt", async () => {
    process.env.MAIL_WEBHOOK_SECRET = SECRET;
    const body = { events: [{ type: "hard_bounce", email: "replay@example.de" }] };
    const ts = nowS();
    const raw = JSON.stringify(body);
    expect((await send(body, { ts, raw })).statusCode).toBe(202);
    expect((await send(body, { ts, raw })).statusCode).toBe(401);
    const old = String(Math.floor(Date.now() / 1000) - WEBHOOK_TOLERANCE_S - 30);
    expect((await send({ events: [{ type: "hard_bounce", email: "alt@example.de" }] }, { ts: old })).statusCode).toBe(401);
    const future = String(Math.floor(Date.now() / 1000) + WEBHOOK_TOLERANCE_S + 30);
    expect((await send({ events: [{ type: "hard_bounce", email: "zukunft@example.de" }] }, { ts: future })).statusCode).toBe(401);
    expect(await blocked("alt@example.de")).toBe(false);
  });

  it("Signatur mit Praefix sha256= und Grossbuchstaben wird akzeptiert; kaputtes JSON sperrt nichts", async () => {
    process.env.MAIL_WEBHOOK_SECRET = SECRET;
    const ts = nowS();
    const raw = JSON.stringify([{ type: "hard_bounce", email: "praefix@example.de" }]);
    const sig = "sha256=" + BounceWebhookService.sign(SECRET, ts, raw).toUpperCase();
    expect((await send(null, { ts, raw, signature: sig })).statusCode).toBe(202);
    expect(await blocked("praefix@example.de")).toBe(true);
    const ts2 = String(Number(ts) + 1);
    const broken = await send(null, { ts: ts2, raw: "{kaputt" });
    expect([202, 400]).toContain(broken.statusCode);
  });
});
