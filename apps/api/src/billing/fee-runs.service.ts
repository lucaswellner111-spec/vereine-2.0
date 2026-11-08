import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import type { FeeRunInput, FeeRunItem, FeeRunPreview, FeeRunStatus, OrgRole, PublicUser } from "@vereine/shared";
import { UsersDirectory } from "../auth/users-directory.service";
import { berlinDate } from "../common/berlin-date";
import { isUniqueViolation } from "../common/pg-errors";
import { DB, type Database } from "../db/db.module";
import { feeRuns, invoiceItems, invoices } from "../db/schema";
import { JobsService } from "../jobs/jobs.service";
import { MembersService } from "../members/members.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrgEvents } from "../orgs/org-events";
import { OrgsService } from "../orgs/orgs.service";

const BILLERS: OrgRole[] = ["admin", "treasurer"];
const CHUNK = 200;
const JOB = "billing.fee-run";
const SWEEP_JOB = "billing.fee-run-sweep";
const SWEEP_INTERVAL_MS = 5 * 60_000;
/** Ab so vielen Versuchen keine automatische Wiederholung mehr (nur "Erneut versuchen"). */
export const FEE_RUN_MAX_ATTEMPTS = 5;
/** Ohne Lebenszeichen seit so langer Zeit gilt ein laufender Lauf als haengend. */
const STALE = sql`now() - interval '15 minutes'`;
/** Wartet ein Lauf so lange, ist sein Job verloren (z. B. enqueue fehlgeschlagen). */
const QUEUED_GRACE = sql`now() - interval '1 minute'`;
type RunRow = typeof feeRuns.$inferSelect;

/**
 * Beitragslauf: erzeugt Rechnungsentwuerfe fuer alle aktiven Mitglieder der gewaehlten Beitragsklassen.
 * Finalisieren bleibt manuell (Entscheidung 12). Anschrift/Namen nur ueber MembersService und UsersDirectory.
 * Idempotent: UNIQUE (fee_run_id, recipient_user_id) + onConflictDoNothing, Bloecke zu 200 je Transaktion.
 * Robust: Versuchszaehler, Lebenszeichen je Block und ein Sweep-Job (5 Min.) holen verlorene/haengende Laeufe nach.
 * SKALIERUNG: Kandidaten werden einmal ohne feste Grenze geladen (blockweise gelesen), Entwuerfe in 200er-Bloecken.
 */
@Injectable()
export class FeeRunsService implements OnModuleInit {
  private readonly log = new Logger("FeeRuns");

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(OrgEvents) private readonly orgEvents: OrgEvents,
  ) {}

  onModuleInit() {
    this.jobs.define(JOB, async (d: { runId: string }) => void (await this.execute(d.runId)));
    // Auffangnetz: verlorene Jobs (enqueue fehlgeschlagen, Worker abgestuerzt/Stall) werden nachgeholt.
    this.jobs.define(SWEEP_JOB, async () => void (await this.sweep()));
    this.jobs.every(SWEEP_JOB, SWEEP_INTERVAL_MS);
    // Verein geloescht: Laeufe entfernen (Rechnungen behalten ihre Kopie, fee_run_id wird NULL).
    this.orgEvents.onOrgDeleted("billing.fee-runs", (orgId) => this.deleteRunsOfOrg(orgId));
  }

  async deleteRunsOfOrg(orgId: string): Promise<void> {
    await this.db.delete(feeRuns).where(eq(feeRuns.orgId, orgId));
  }

  private async requireBiller(user: PublicUser, slug: string) {
    const org = await this.orgs.requireBySlug(slug);
    const role = await this.orgs.activeRole(org.id, user.id);
    if (!role || !BILLERS.includes(role)) throw new ForbiddenException("Nur Vorstand und Kassenwart verwalten Rechnungen.");
    return org;
  }

  private async classesFor(orgId: string, ids: string[]) {
    const classes = await this.members.feeClassesOf(orgId, ids);
    if (classes.length !== new Set(ids).size) throw new BadRequestException("Eine Beitragsklasse gehört nicht zum Verein.");
    return classes;
  }

  // --- Vorschau und Anlegen -------------------------------------------------------

  async preview(user: PublicUser, slug: string, input: FeeRunInput): Promise<FeeRunPreview> {
    const org = await this.requireBiller(user, slug);
    const classes = await this.classesFor(org.id, input.feeClassIds);
    const { candidates, withoutClass } = await this.members.feeRunCandidates(org.id, input.feeClassIds);
    const byClass = classes
      .map((c) => {
        const members = candidates.filter((m) => m.feeClassId === c.id).length;
        return { feeClassId: c.id, name: c.name, amountCents: c.amountCents, members, totalCents: members * c.amountCents };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    const [taken] = await this.db.select({ id: feeRuns.id }).from(feeRuns).where(and(eq(feeRuns.orgId, org.id), eq(feeRuns.periodLabel, input.periodLabel))).limit(1);
    return { count: candidates.length, totalCents: byClass.reduce((s, c) => s + c.totalCents, 0), byClass, withoutClass, periodTaken: !!taken };
  }

  async create(user: PublicUser, slug: string, input: FeeRunInput): Promise<FeeRunItem> {
    const org = await this.requireBiller(user, slug);
    await this.classesFor(org.id, input.feeClassIds);
    if (input.dueDate < berlinDate()) throw new BadRequestException("Die Fälligkeit darf nicht in der Vergangenheit liegen.");
    let row: RunRow;
    try {
      [row] = await this.db
        .insert(feeRuns)
        .values({ orgId: org.id, periodLabel: input.periodLabel, dueDate: input.dueDate, feeClassIds: input.feeClassIds, createdBy: user.id })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException("Für diesen Zeitraum gibt es schon einen Beitragslauf.");
      throw err;
    }
    try {
      await this.jobs.enqueue(JOB, { runId: row.id });
    } catch (err) {
      // Lauf ist angelegt: inline steht ein Fehler schon als "failed" am Lauf, sonst holt der Sweep "queued" nach.
      this.log.error(`Beitragslauf ${row.id}: ${(err as Error).message}`);
    }
    const [fresh] = await this.db.select().from(feeRuns).where(eq(feeRuns.id, row.id)).limit(1);
    return this.view(fresh ?? row);
  }

  async list(user: PublicUser, slug: string): Promise<FeeRunItem[]> {
    const org = await this.requireBiller(user, slug);
    const rows = await this.db.select().from(feeRuns).where(eq(feeRuns.orgId, org.id)).orderBy(desc(feeRuns.createdAt)).limit(50);
    return rows.map((r) => this.view(r));
  }

  /** Fehlgeschlagenen Lauf neu starten (Versuchszaehler zurueck); schon erzeugte Entwuerfe bleiben (idempotent). */
  async retry(user: PublicUser, slug: string, id: string): Promise<FeeRunItem> {
    const org = await this.requireBiller(user, slug);
    const [run] = await this.db.select().from(feeRuns).where(and(eq(feeRuns.id, id), eq(feeRuns.orgId, org.id))).limit(1);
    if (!run) throw new NotFoundException("Beitragslauf nicht gefunden.");
    const [reset] = await this.db
      .update(feeRuns)
      .set({ status: "queued", attempts: 0, finishedAt: null })
      .where(and(eq(feeRuns.id, id), eq(feeRuns.status, "failed")))
      .returning();
    if (!reset) throw new ConflictException("Nur fehlgeschlagene Beitragsläufe können neu gestartet werden.");
    try {
      await this.jobs.enqueue(JOB, { runId: id });
    } catch (err) {
      this.log.error(`Beitragslauf ${id}: ${(err as Error).message}`);
    }
    const [fresh] = await this.db.select().from(feeRuns).where(eq(feeRuns.id, id)).limit(1);
    return this.view(fresh ?? reset);
  }

  // --- Job ------------------------------------------------------------------------

  /**
   * Holt verlorene Laeufe nach: "queued" laenger als 1 Min. und "running" ohne Lebenszeichen seit 15 Min.
   * Haengende Laeufe mit ausgeschoepften Versuchen werden auf "failed" gesetzt. Liefert die Zahl gestarteter Laeufe.
   */
  async sweep(): Promise<number> {
    await this.db
      .update(feeRuns)
      .set({ status: "failed", finishedAt: sql`now()` })
      .where(and(eq(feeRuns.status, "running"), lt(feeRuns.heartbeatAt, STALE), gte(feeRuns.attempts, FEE_RUN_MAX_ATTEMPTS)));
    const due = await this.db
      .select({ id: feeRuns.id })
      .from(feeRuns)
      .where(
        and(
          lt(feeRuns.attempts, FEE_RUN_MAX_ATTEMPTS),
          or(and(eq(feeRuns.status, "queued"), lt(feeRuns.createdAt, QUEUED_GRACE)), and(eq(feeRuns.status, "running"), lt(feeRuns.heartbeatAt, STALE))),
        ),
      )
      .limit(20);
    let started = 0;
    for (const { id } of due) {
      try {
        if ((await this.execute(id)) !== null) started += 1;
      } catch (err) {
        this.log.error(`Beitragslauf ${id} (Nachholen): ${(err as Error).message}`);
      }
    }
    return started;
  }

  /**
   * Fuehrt einen Lauf aus. Atomarer Claim (zaehlt den Versuch): queued, failed oder running ohne Lebenszeichen
   * seit 15 Min., jeweils nur unter FEE_RUN_MAX_ATTEMPTS Versuchen.
   * Liefert die Zahl neu erzeugter Entwuerfe (null, wenn kein Claim moeglich war).
   */
  async execute(runId: string): Promise<number | null> {
    const [run] = await this.db
      .update(feeRuns)
      .set({ status: "running", heartbeatAt: sql`now()`, attempts: sql`${feeRuns.attempts} + 1` })
      .where(
        and(
          eq(feeRuns.id, runId),
          lt(feeRuns.attempts, FEE_RUN_MAX_ATTEMPTS),
          or(eq(feeRuns.status, "queued"), eq(feeRuns.status, "failed"), and(eq(feeRuns.status, "running"), lt(feeRuns.heartbeatAt, STALE))),
        ),
      )
      .returning();
    if (!run) return null;
    let created: number;
    try {
      created = await this.createDrafts(run);
    } catch (err) {
      await this.db.update(feeRuns).set({ status: "failed", finishedAt: sql`now()` }).where(and(eq(feeRuns.id, runId), eq(feeRuns.status, "running")));
      throw err; // BullMQ wiederholt (attempts 3); der Claim erlaubt "failed" bis FEE_RUN_MAX_ATTEMPTS
    }
    // Benachrichtigung ist Zusatz: ein Fehler darf den fertigen Lauf nicht auf "failed" setzen
    try {
      await this.notifyDone(run, created);
    } catch (err) {
      this.log.warn(`Beitragslauf ${runId}: Benachrichtigung fehlgeschlagen: ${(err as Error).message}`);
    }
    return created;
  }

  private async createDrafts(run: RunRow): Promise<number> {
    const classes = new Map((await this.members.feeClassesOf(run.orgId, run.feeClassIds)).map((c) => [c.id, c]));
    const { candidates } = await this.members.feeRunCandidates(run.orgId, [...classes.keys()]);
    const issuer = await this.orgs.issuerData(run.orgId);
    const names = await this.directory.names(candidates.map((c) => c.userId));

    for (let i = 0; i < candidates.length; i += CHUNK) {
      const block = candidates.slice(i, i + CHUNK).filter((c) => names.has(c.userId) && classes.has(c.feeClassId));
      if (block.length === 0) continue;
      await this.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(invoices)
          .values(
            block.map((c) => {
              const amount = classes.get(c.feeClassId)!.amountCents;
              return {
                orgId: run.orgId,
                recipientUserId: c.userId,
                recipientName: names.get(c.userId)!,
                recipientAddress: c.address,
                issuerName: issuer.name,
                issuerCity: issuer.city,
                issuerAddress: issuer.address,
                issuerIban: issuer.iban,
                issuerTaxInfo: issuer.taxInfo,
                dueDate: run.dueDate,
                netCents: amount,
                vatCents: 0,
                totalCents: amount,
                createdBy: run.createdBy,
                feeRunId: run.id,
              };
            }),
          )
          .onConflictDoNothing({ target: [invoices.feeRunId, invoices.recipientUserId] })
          .returning({ id: invoices.id, userId: invoices.recipientUserId });
        if (inserted.length === 0) return;
        const classOf = new Map(block.map((c) => [c.userId, classes.get(c.feeClassId)!]));
        await tx.insert(invoiceItems).values(
          inserted.map((r) => {
            const c = classOf.get(r.userId!)!;
            return { invoiceId: r.id, position: 0, description: `${c.name} ${run.periodLabel}`.slice(0, 200), quantity: 1, unitCents: c.amountCents, vatRate: 0 };
          }),
        );
      });
      // Lebenszeichen nach jedem Block: verhindert, dass der Sweep einen laufenden Lauf ein zweites Mal claimt
      await this.db.update(feeRuns).set({ heartbeatAt: sql`now()` }).where(and(eq(feeRuns.id, run.id), eq(feeRuns.status, "running")));
    }

    // Zahlen aus der Datenbank (richtig auch nach Wiederholungen): erzeugt = Entwuerfe dieses Laufs.
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(invoices).where(eq(invoices.feeRunId, run.id));
    await this.db
      .update(feeRuns)
      .set({ status: "done", createdCount: n, skippedCount: Math.max(0, candidates.length - n), finishedAt: sql`now()` })
      .where(and(eq(feeRuns.id, run.id), eq(feeRuns.status, "running")));
    return n;
  }

  private async notifyDone(run: RunRow, created: number) {
    const org = (await this.orgs.lookupByIds([run.orgId])).get(run.orgId);
    await this.notifications.notify([run.createdBy], "fee_run_done", {
      runId: run.id,
      periodLabel: run.periodLabel,
      created: String(created),
      orgName: org?.name ?? "",
      orgSlug: org?.slug ?? "",
    });
  }

  private view(r: RunRow): FeeRunItem {
    return {
      id: r.id,
      periodLabel: r.periodLabel,
      dueDate: r.dueDate,
      feeClassIds: r.feeClassIds,
      status: r.status as FeeRunStatus,
      createdCount: r.createdCount,
      attempts: r.attempts,
      skippedCount: r.skippedCount,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    };
  }
}
