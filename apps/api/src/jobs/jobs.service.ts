import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";

export type JobHandler = (data: any) => Promise<void>;

/** Abweichende Zustell-Optionen je Job (z. B. Mail: mehr Versuche, Daten nach Erfolg sofort aus Redis entfernen). */
export type EnqueueOptions = { attempts?: number; backoffMs?: number; removeOnComplete?: boolean | number; removeOnFail?: boolean | number; delayMs?: number };

const QUEUE = "jobs";

/**
 * Hintergrundarbeit (Erinnerungen, Aufraeumen, Massen-Benachrichtigungen).
 *
 * - Mit `QUEUE_REDIS_URL` (Produktion, sonst `REDIS_URL`): BullMQ. Die Queue braucht ein EIGENES Redis mit
 *   `maxmemory-policy noeviction` und Persistenz (AOF), getrennt vom Cache-Redis (allkeys-lru). Die API legt Jobs nur in die Warteschlange; der eigene
 *   `worker`-Prozess (src/worker.ts, eigener Container) fuehrt sie aus und plant Wiederholungen.
 *   Der Worker kann auf einen anderen Server ziehen und beliebig oft laufen (Jobs sind idempotent).
 * - Ohne Redis (lokal, Tests): "inline" - Jobs laufen sofort im selben Prozess, Wiederholungen per Timer.
 */
@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly log = new Logger("Jobs");
  readonly mode: "bullmq" | "inline";
  private readonly handlers = new Map<string, JobHandler>();
  private readonly schedules: { name: string; everyMs: number }[] = [];
  private readonly timers: NodeJS.Timeout[] = [];
  private queue?: Queue;
  private worker?: Worker;
  private connections: Redis[] = [];
  private readonly url?: string;

  constructor(@Optional() @Inject("JOBS_REDIS_URL") redisUrl?: string) {
    const url = redisUrl ?? process.env.QUEUE_REDIS_URL ?? process.env.REDIS_URL;
    this.url = url;
    this.mode = url ? "bullmq" : "inline";
    if (url) {
      const connection = this.connect(url);
      this.queue = new Queue(QUEUE, { connection: connection as never });
    }
  }

  private connect(url: string): Redis {
    const c = new Redis(url, { maxRetriesPerRequest: null }); // von BullMQ verlangt
    c.on("error", (err) => this.log.warn(`Redis: ${err.message}`));
    this.connections.push(c);
    return c;
  }

  /** Registriert den Code eines Jobs. Muss in jedem Prozess passieren (API und Worker laden dieselben Module). */
  define(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  /** Wiederkehrender Job. Inline: Timer; BullMQ: wird vom Worker als Scheduler eingetragen (idempotent). */
  every(name: string, everyMs: number): void {
    this.schedules.push({ name, everyMs });
    if (this.mode === "inline") {
      const t = setInterval(() => void this.run(name, {}).catch((e) => this.log.error(`${name}: ${e.message}`)), everyMs);
      t.unref();
      this.timers.push(t);
    }
  }

  /** Einmaliger Job. Inline sofort und abgewartet (deterministisch fuer Tests), BullMQ asynchron mit Wiederholungen. */
  async enqueue(name: string, data: object = {}, opts: EnqueueOptions = {}): Promise<void> {
    if (this.mode === "inline") {
      if (!opts.delayMs) return this.run(name, data);
      // Verzoegert (z. B. Mail auf morgen verschoben): Timer im selben Prozess, geht beim Neustart verloren (nur lokal/Tests).
      const t = setTimeout(() => void this.run(name, data).catch((e) => this.log.error(`${name}: ${e.message}`)), opts.delayMs);
      t.unref();
      this.timers.push(t as unknown as NodeJS.Timeout);
      return;
    }
    await this.queue!.add(name, data, {
      ...(opts.delayMs ? { delay: opts.delayMs } : {}),
      attempts: opts.attempts ?? 3,
      backoff: { type: "exponential", delay: opts.backoffMs ?? 5_000 },
      removeOnComplete: opts.removeOnComplete ?? 1_000,
      removeOnFail: opts.removeOnFail ?? 5_000,
    });
  }

  /** Nur im Worker-Prozess aufrufen, nachdem alle Module initialisiert (und Handler definiert) sind. */
  async startWorker(): Promise<void> {
    if (this.mode !== "bullmq") throw new Error("Worker braucht QUEUE_REDIS_URL (oder REDIS_URL).");
    for (const s of this.schedules) {
      await this.queue!.upsertJobScheduler(`schedule:${s.name}`, { every: s.everyMs }, { name: s.name, data: {} });
    }
    this.worker = new Worker(QUEUE, (job) => this.run(job.name, job.data), {
      connection: this.connect(this.url!) as never,
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
    });
    this.worker.on("failed", (job, err) => this.log.error(`Job ${job?.name} fehlgeschlagen: ${err.message}`));
    this.worker.on("completed", (job) => this.log.debug(`Job ${job.name} fertig`));
    this.log.log(`Worker bereit: ${[...this.handlers.keys()].join(", ")}`);
  }

  private async run(name: string, data: object): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`Unbekannter Job: ${name}`);
    await handler(data);
  }

  /** Fuer Health/Monitoring: Warteschlangen-Zaehler (nur BullMQ). */
  async stats() {
    return this.queue ? this.queue.getJobCounts("waiting", "active", "delayed", "failed") : null;
  }

  async onModuleDestroy() {
    this.timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
    await this.worker?.close();
    await this.queue?.close();
    this.connections.forEach((c) => c.disconnect());
  }
}
