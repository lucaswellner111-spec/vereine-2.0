import "reflect-metadata";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test } from "@nestjs/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CACHE, CacheModule, MemoryCache } from "../cache/cache.module";
import { DB, DbModule } from "../db/db.module";
import { JobsModule } from "../jobs/jobs.module";
import { MailModule } from "../mail/mail.module";
import { MemoryMailDriver } from "../mail/mail.drivers";
import { MAIL_DRIVER } from "../mail/mail.service";
import { createTestDb, type TestDb } from "../testing/test-db";
import { evaluateAlerts, opsConfigFromEnv, OpsService, type OpsSnapshot } from "./ops.service";
import { OpsModule } from "./ops.module";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});

const cfg = opsConfigFromEnv({ OPERATOR_ALERT_EMAIL: "betreiber@example.de" } as NodeJS.ProcessEnv);
const calm: OpsSnapshot = {
  worker: "up",
  jobs: { waiting: 0, active: 0, delayed: 0, failed: 0 },
  mailPercent: 10,
  diskPercent: 40,
  backup: { configured: true, ageHours: 3, ok: true, bytes: 1000 },
};

describe("Betriebsalarme: Bewertung", () => {
  it("meldet nichts, solange alles in Ordnung ist", () => {
    expect(evaluateAlerts(calm, cfg)).toEqual([]);
  });

  it("jede Ursache loest genau ihren Alarm aus", () => {
    const kinds = (s: Partial<OpsSnapshot>) => evaluateAlerts({ ...calm, ...s }, cfg).map((a) => a.kind);
    expect(kinds({ worker: "down" })).toEqual(["worker"]);
    expect(kinds({ worker: "inline" })).toEqual([]);
    expect(kinds({ jobs: { waiting: 0, active: 0, delayed: 0, failed: 5 } })).toEqual(["jobs-failed"]);
    expect(kinds({ jobs: { waiting: 600, active: 0, delayed: 0, failed: 0 } })).toEqual(["jobs-backlog"]);
    expect(kinds({ mailPercent: 80 })).toEqual(["mail-quota"]);
    expect(kinds({ mailPercent: 79 })).toEqual([]);
    expect(kinds({ diskPercent: 81 })).toEqual(["disk"]);
    expect(kinds({ diskPercent: 80 })).toEqual(["disk"]);
    expect(kinds({ backup: { configured: true, ageHours: 31, ok: true, bytes: 1 } })).toEqual(["backup"]);
    expect(kinds({ backup: { configured: true, ageHours: 2, ok: false, bytes: 1 } })).toEqual(["backup"]);
    expect(kinds({ backup: { configured: true, ageHours: null, ok: null, bytes: null } })).toEqual(["backup"]);
    expect(kinds({ backup: { configured: false, ageHours: null, ok: null, bytes: null } })).toEqual([]);
  });

  it("Schwellen sind per Umgebung einstellbar, ungueltige Werte fallen auf den Standard zurueck", () => {
    const c = opsConfigFromEnv({ OPS_DISK_PERCENT: "90", OPS_BACKUP_MAX_AGE_HOURS: "abc" } as NodeJS.ProcessEnv);
    expect(c.diskPercent).toBe(90);
    expect(c.backupMaxAgeHours).toBe(30);
    expect(c.alertEmail).toBeNull();
  });

  it("Alarmtexte enthalten keine Adressen oder Namen", () => {
    const all = evaluateAlerts(
      { worker: "down", jobs: { waiting: 900, active: 1, delayed: 0, failed: 9 }, mailPercent: 95, diskPercent: 90, backup: { configured: true, ageHours: 50, ok: true, bytes: 1 } },
      cfg,
    );
    expect(all).toHaveLength(6);
    for (const a of all) expect(`${a.title} ${a.detail}`).not.toMatch(/@|\bhttps?:/);
  });
});

describe("Betriebsalarme: Dienst", () => {
  const saved = { ...process.env };
  let dir: string;
  let driver: MemoryMailDriver;
  let cache: MemoryCache;
  let ref: Awaited<ReturnType<typeof build>>;

  async function build() {
    const r = await Test.createTestingModule({ imports: [DbModule, CacheModule, JobsModule, MailModule, OpsModule] })
      .overrideProvider(DB)
      .useValue(db)
      .overrideProvider(MAIL_DRIVER)
      .useValue(driver)
      .overrideProvider(CACHE)
      .useValue(cache)
      .compile();
    await r.init();
    return r;
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ops-"));
    process.env.OPERATOR_ALERT_EMAIL = "betreiber@example.de";
    process.env.BACKUP_STATUS_FILE = join(dir, "status.json");
    process.env.OPS_DISK_PATH = dir;
    process.env.APP_URL = "https://klubnest.de";
    driver = new MemoryMailDriver();
    cache = new MemoryCache();
  });
  afterEach(async () => {
    await ref?.close();
    await rm(dir, { recursive: true, force: true });
    for (const k of ["OPERATOR_ALERT_EMAIL", "BACKUP_STATUS_FILE", "OPS_DISK_PATH", "APP_URL"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  afterAll(() => undefined);

  it("liest die Backup-Statusdatei: frisch = kein Alarm, alt oder fehlgeschlagen = Alarm", async () => {
    ref = await build();
    const ops = ref.get(OpsService);
    expect((await ops.status()).alerts.map((a) => a.kind)).toEqual(["backup"]); // Datei fehlt noch

    await writeFile(join(dir, "status.json"), JSON.stringify({ finishedAt: new Date().toISOString(), ok: true, bytes: 12345 }));
    const fresh = await ops.status();
    expect(fresh.alerts.filter((a) => a.kind === "backup")).toEqual([]);
    expect(fresh.backup).toMatchObject({ configured: true, ok: true, bytes: 12345 });

    await writeFile(join(dir, "status.json"), JSON.stringify({ finishedAt: new Date(Date.now() - 40 * 3_600_000).toISOString(), ok: true, bytes: 1 }));
    expect((await ops.status()).alerts.map((a) => a.kind)).toContain("backup");

    await writeFile(join(dir, "status.json"), JSON.stringify({ finishedAt: new Date().toISOString(), ok: false }));
    expect((await ops.status()).alerts.find((a) => a.kind === "backup")?.title).toMatch(/fehlgeschlagen/);
  });

  it("Mail-Alarm: einmal je Ereignisart und Tag, ohne Personendaten, Empfaenger nur der Betreiber", async () => {
    ref = await build();
    const ops = ref.get(OpsService);
    const status = await ops.status(); // Backup-Datei fehlt = ein Alarm
    expect(status.alerts).toHaveLength(1);

    expect(await ops.notify(status)).toBe(1);
    expect(await ops.notify(status)).toBe(0); // gleicher Tag, gleiche Ereignisart
    expect(await ops.notify(await ops.status())).toBe(0);
    await new Promise((r) => setTimeout(r, 50));

    expect(driver.sent).toHaveLength(1);
    const mail = driver.sent[0];
    expect(mail.to).toBe("betreiber@example.de");
    expect(mail.template).toBe("ops-alert");
    expect(mail.subject).toContain("Alarm");
    expect(mail.text).toContain("https://klubnest.de/plattform");
  });

  it("ohne OPERATOR_ALERT_EMAIL wird nichts verschickt", async () => {
    delete process.env.OPERATOR_ALERT_EMAIL;
    ref = await build();
    const ops = ref.get(OpsService);
    expect((await ops.status()).alertMail).toBe(false);
    expect(await ops.notify(await ops.status())).toBe(0);
    expect(driver.sent).toHaveLength(0);
  });

  it("Worker-Lebenszeichen: inline = kein Alarm; ohne Redis-Modus meldet der Status 'inline'", async () => {
    ref = await build();
    expect((await ref.get(OpsService).status()).worker).toBe("inline");
  });
});
