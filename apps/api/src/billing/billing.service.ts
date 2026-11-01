import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import type {
  CreateInvoiceInput,
  InvoiceDetail,
  InvoiceRecipient,
  InvoiceStatus,
  InvoiceSummary,
  OrgRole,
  PublicUser,
} from "@vereine/shared";
import { AuditService } from "../auth/audit.service";
import { UsersDirectory } from "../auth/users-directory.service";
import { DB, type Database } from "../db/db.module";
import { invoiceCounters, invoiceItems, invoices } from "../db/schema";
import { JobsService } from "../jobs/jobs.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrgsService } from "../orgs/orgs.service";
import { buildInvoicePdf, formatEur } from "./invoice-pdf";

const BILLERS: OrgRole[] = ["admin", "treasurer"];
const OVERDUE_INTERVAL_MS = 6 * 3600_000;
const DEFAULT_VAT_NOTE = "Mitgliedsbeitrag bzw. Leistung ohne Umsatzsteuerausweis (nicht steuerbar bzw. steuerbefreit).";
const DELETED_NAME = "Gelöschtes Mitglied";

type InvoiceRow = typeof invoices.$inferSelect;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Rechnungen eines Vereins an seine Mitglieder (Bereich `billing`, keine Fremdschluessel).
 * Nur Vorstand und Kassenwart stellen aus; Mitglieder sehen ihre eigenen, finalisierten Rechnungen.
 * GoBD: Nach dem Finalisieren sind Rechnungen unveraenderlich (nur Storno); der Nummernkreis ist je Verein
 * und Jahr lueckenlos (atomarer Zaehler).
 * SKALIERUNG: Listen sind auf 500 Zeilen begrenzt (Index org_id, created_at); PDF wird je Anfrage erzeugt -
 * fuer Serienrechnungen (>1000) spaeter als Worker-Job.
 */
@Injectable()
export class BillingService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OrgsService) private readonly orgs: OrgsService,
    @Inject(UsersDirectory) private readonly directory: UsersDirectory,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    // Atomarer Claim (overdue_notified_at) macht mehrere Worker gefahrlos.
    this.jobs.define("billing.overdue", async () => void (await this.notifyOverdue()));
    this.jobs.every("billing.overdue", OVERDUE_INTERVAL_MS);
  }

  // --- Zugriff ----------------------------------------------------------------

  private async requireBiller(user: PublicUser, slug: string) {
    const org = await this.orgs.requireBySlug(slug);
    const role = await this.orgs.activeRole(org.id, user.id);
    if (!role || !BILLERS.includes(role)) throw new ForbiddenException("Nur Vorstand und Kassenwart verwalten Rechnungen.");
    return org;
  }

  private async rowFor(id: string): Promise<InvoiceRow> {
    const [row] = await this.db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!row) throw new NotFoundException("Rechnung nicht gefunden.");
    return row;
  }

  /** Zugriff auf eine Rechnung: Aussteller-Rollen immer, Empfaenger nur nach dem Finalisieren. */
  private async access(user: PublicUser, id: string): Promise<{ row: InvoiceRow; biller: boolean }> {
    const row = await this.rowFor(id);
    const role = await this.orgs.activeRole(row.orgId, user.id);
    const biller = !!role && BILLERS.includes(role);
    const recipient = row.recipientUserId === user.id && row.status !== "draft";
    if (!biller && !recipient) throw new NotFoundException("Rechnung nicht gefunden.");
    return { row, biller };
  }

  // --- Lesen ------------------------------------------------------------------

  async recipients(user: PublicUser, slug: string): Promise<InvoiceRecipient[]> {
    const org = await this.requireBiller(user, slug);
    const ids = await this.orgs.allActiveMemberIds(org.id);
    const names = await this.directory.names(ids);
    return ids
      .map((userId) => ({ userId, name: names.get(userId) ?? DELETED_NAME }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  async list(user: PublicUser, slug: string, filter: { status?: string; year?: string }): Promise<InvoiceSummary[]> {
    const org = await this.requireBiller(user, slug);
    const conds: SQL[] = [eq(invoices.orgId, org.id)];
    if (filter.status && ["draft", "open", "paid", "void"].includes(filter.status)) conds.push(eq(invoices.status, filter.status));
    if (filter.year && /^\d{4}$/.test(filter.year)) {
      conds.push(sql`coalesce(extract(year from ${invoices.issueDate}), extract(year from ${invoices.createdAt})) = ${Number(filter.year)}`);
    }
    const rows = await this.db.select().from(invoices).where(and(...conds)).orderBy(desc(invoices.createdAt)).limit(500);
    return this.summaries(rows);
  }

  /** Eigene (finalisierte) Rechnungen des Nutzers ueber alle Vereine. */
  async mine(user: PublicUser): Promise<InvoiceSummary[]> {
    const rows = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.recipientUserId, user.id), sql`${invoices.status} <> 'draft'`))
      .orderBy(desc(invoices.finalizedAt))
      .limit(200);
    return this.summaries(rows);
  }

  async get(user: PublicUser, id: string): Promise<InvoiceDetail> {
    const { row } = await this.access(user, id);
    return this.detail(row);
  }

  async pdf(user: PublicUser, id: string): Promise<{ bytes: Uint8Array; filename: string }> {
    const { row } = await this.access(user, id);
    const detail = await this.detail(row);
    return { bytes: await buildInvoicePdf(detail), filename: `rechnung-${(row.number ?? "entwurf").replace(/[^0-9A-Za-z-]/g, "")}.pdf` };
  }

  /** DATEV-nahe CSV (Semikolon, UTF-8 mit BOM, Dezimalkomma) aller finalisierten Rechnungen eines Jahres. */
  async csv(user: PublicUser, slug: string, year?: string): Promise<string> {
    const org = await this.requireBiller(user, slug);
    const y = year && /^\d{4}$/.test(year) ? Number(year) : new Date().getFullYear();
    const rows = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, org.id), sql`${invoices.status} <> 'draft'`, sql`extract(year from ${invoices.issueDate}) = ${y}`))
      .orderBy(asc(invoices.number))
      .limit(5000);
    const num = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
    // CSV-Injection (Excel-Formeln) verhindern: Zellen, die mit =,+,-,@ beginnen, werden entschaerft.
    const cell = (v: string) => {
      const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["Rechnungsnummer", "Rechnungsdatum", "Faelligkeit", "Empfaenger", "Netto", "USt", "Brutto", "Status", "Bezahlt am"].join(";")];
    for (const r of rows) {
      lines.push(
        [
          r.number ?? "",
          r.issueDate ?? "",
          r.dueDate,
          cell(r.recipientName),
          num(r.netCents),
          num(r.vatCents),
          num(r.totalCents),
          r.status === "void" ? "storniert" : r.status === "paid" ? "bezahlt" : "offen",
          r.paidAt ? r.paidAt.toISOString().slice(0, 10) : "",
        ].join(";"),
      );
    }
    return "﻿" + lines.join("\r\n") + "\r\n";
  }

  // --- Schreiben --------------------------------------------------------------

  async create(user: PublicUser, slug: string, input: CreateInvoiceInput): Promise<InvoiceDetail> {
    const org = await this.requireBiller(user, slug);
    if (!(await this.orgs.activeRole(org.id, input.recipientUserId))) {
      throw new BadRequestException("Der Empfaenger ist kein aktives Mitglied des Vereins.");
    }
    const names = await this.directory.names([input.recipientUserId]);
    const recipientName = names.get(input.recipientUserId);
    if (!recipientName) throw new BadRequestException("Empfaenger nicht gefunden.");

    const totals = this.totals(input.items);
    if (totals.totalCents > 2_000_000_000) throw new BadRequestException("Der Gesamtbetrag ist zu gross.");
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(invoices)
        .values({
          orgId: org.id,
          recipientUserId: input.recipientUserId,
          recipientName,
          recipientAddress: input.recipientAddress,
          issuerName: org.name,
          issuerCity: org.city,
          issuerAddress: org.address,
          issuerIban: org.iban,
          issuerTaxInfo: org.taxInfo,
          dueDate: input.dueDate,
          note: input.note,
          ...totals,
          createdBy: user.id,
        })
        .returning({ id: invoices.id });
      await tx.insert(invoiceItems).values(input.items.map((it, position) => ({ invoiceId: row.id, position, ...it })));
      return row.id;
    });
    return this.detail(await this.rowFor(id));
  }

  async finalize(user: PublicUser, id: string): Promise<InvoiceDetail> {
    const { row, biller } = await this.access(user, id);
    if (!biller) throw new ForbiddenException("Nur Vorstand und Kassenwart verwalten Rechnungen.");
    if (row.status !== "draft") throw new BadRequestException("Nur Entwuerfe koennen finalisiert werden.");

    const year = new Date().getFullYear();
    const items = await this.db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    const vatNote = items.some((i) => i.vatRate > 0) ? "" : DEFAULT_VAT_NOTE;

    const finalized = await this.db.transaction(async (tx) => {
      // Atomarer, lueckenloser Zaehler: bei Fehlern rollt die Transaktion die Nummer mit zurueck.
      const [counter] = await tx
        .insert(invoiceCounters)
        .values({ orgId: row.orgId, year, lastNo: 1 })
        .onConflictDoUpdate({ target: [invoiceCounters.orgId, invoiceCounters.year], set: { lastNo: sql`${invoiceCounters.lastNo} + 1` } })
        .returning({ lastNo: invoiceCounters.lastNo });
      const number = `${year}-${String(counter.lastNo).padStart(4, "0")}`;
      // Bedingung status='draft' schuetzt vor doppeltem Finalisieren (parallele Anfragen).
      const [updated] = await tx
        .update(invoices)
        .set({ status: "open", number, issueDate: today(), finalizedAt: new Date(), vatNote })
        .where(and(eq(invoices.id, id), eq(invoices.status, "draft")))
        .returning();
      if (!updated) throw new BadRequestException("Die Rechnung wurde bereits finalisiert.");
      return updated;
    });

    await this.audit.record(user.id, "invoice.finalized", { invoiceId: id, number: finalized.number, orgId: row.orgId });
    if (row.recipientUserId) {
      await this.notifications.notify([row.recipientUserId], "invoice_new", {
        invoiceId: id,
        number: finalized.number ?? "",
        orgName: row.issuerName,
        amount: formatEur(finalized.totalCents),
      });
    }
    return this.detail(finalized);
  }

  async deleteDraft(user: PublicUser, id: string): Promise<void> {
    const { row, biller } = await this.access(user, id);
    if (!biller) throw new ForbiddenException("Nur Vorstand und Kassenwart verwalten Rechnungen.");
    if (row.status !== "draft") throw new BadRequestException("Nur Entwuerfe koennen geloescht werden; finalisierte Rechnungen werden storniert.");
    await this.db.delete(invoices).where(and(eq(invoices.id, id), eq(invoices.status, "draft")));
  }

  async markPaid(user: PublicUser, id: string): Promise<InvoiceDetail> {
    const { row, biller } = await this.access(user, id);
    if (!biller) throw new ForbiddenException("Nur Vorstand und Kassenwart verwalten Rechnungen.");
    if (row.status !== "open") throw new BadRequestException("Nur offene Rechnungen koennen als bezahlt markiert werden.");
    const [updated] = await this.db
      .update(invoices)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(invoices.id, id), eq(invoices.status, "open")))
      .returning();
    if (!updated) throw new BadRequestException("Die Rechnung wurde bereits geaendert.");
    await this.audit.record(user.id, "invoice.paid", { invoiceId: id, number: row.number, orgId: row.orgId });
    return this.detail(updated);
  }

  async voidInvoice(user: PublicUser, id: string, reason: string): Promise<InvoiceDetail> {
    const { row, biller } = await this.access(user, id);
    if (!biller) throw new ForbiddenException("Nur Vorstand und Kassenwart verwalten Rechnungen.");
    if (row.status !== "open" && row.status !== "paid") throw new BadRequestException("Nur finalisierte Rechnungen koennen storniert werden.");
    const [updated] = await this.db
      .update(invoices)
      .set({ status: "void", voidedAt: new Date(), voidReason: reason })
      .where(and(eq(invoices.id, id), inArray(invoices.status, ["open", "paid"])))
      .returning();
    if (!updated) throw new BadRequestException("Die Rechnung wurde bereits geaendert.");
    await this.audit.record(user.id, "invoice.voided", { invoiceId: id, number: row.number, orgId: row.orgId });
    return this.detail(updated);
  }

  // --- Datenschutz --------------------------------------------------------------

  /**
   * Kontoloeschung: Rechnungen sind Aufbewahrungsdaten (GoBD) und bleiben erhalten, verlieren aber den
   * Personenbezug (Name, Anschrift, Konto-ID).
   */
  async anonymizeRecipient(userId: string): Promise<void> {
    await this.db
      .update(invoices)
      .set({ recipientUserId: null, recipientName: DELETED_NAME, recipientAddress: "" })
      .where(eq(invoices.recipientUserId, userId));
  }

  /** Auskunft (Art. 15): Rechnungen, die der Nutzer als Empfaenger erhalten hat. */
  async exportFor(userId: string) {
    const rows = await this.db.select().from(invoices).where(eq(invoices.recipientUserId, userId)).limit(1000);
    return rows
      .filter((r) => r.status !== "draft")
      .map((r) => ({
        number: r.number,
        issuer: r.issuerName,
        issueDate: r.issueDate,
        dueDate: r.dueDate,
        totalCents: r.totalCents,
        status: r.status,
        recipientAddress: r.recipientAddress,
      }));
  }

  // --- Job ----------------------------------------------------------------------

  /** Benachrichtigt Empfaenger einmalig, wenn eine offene Rechnung faellig war (Faelligkeitsdatum < heute). */
  async notifyOverdue(): Promise<number> {
    const claimed = await this.db
      .update(invoices)
      .set({ overdueNotifiedAt: new Date() })
      .where(and(eq(invoices.status, "open"), lt(invoices.dueDate, today()), isNull(invoices.overdueNotifiedAt)))
      .returning({ id: invoices.id, userId: invoices.recipientUserId, number: invoices.number, orgName: invoices.issuerName });
    for (const c of claimed) {
      if (c.userId) {
        await this.notifications.notify([c.userId], "invoice_overdue", { invoiceId: c.id, number: c.number ?? "", orgName: c.orgName });
      }
    }
    return claimed.length;
  }

  // --- intern -------------------------------------------------------------------

  private totals(items: CreateInvoiceInput["items"]) {
    let netCents = 0;
    let vatCents = 0;
    for (const it of items) {
      const net = it.quantity * it.unitCents;
      netCents += net;
      vatCents += Math.round((net * it.vatRate) / 100);
    }
    return { netCents, vatCents, totalCents: netCents + vatCents };
  }

  private async summaries(rows: InvoiceRow[]): Promise<InvoiceSummary[]> {
    const orgs = await this.orgs.lookupByIds(rows.map((r) => r.orgId));
    return rows.map((r) => this.summary(r, orgs.get(r.orgId)?.slug ?? ""));
  }

  private summary(r: InvoiceRow, orgSlug: string): InvoiceSummary {
    const status = r.status as InvoiceStatus;
    return {
      id: r.id,
      orgSlug,
      orgName: r.issuerName,
      number: r.number,
      status,
      displayStatus: status === "open" && r.dueDate < today() ? "overdue" : status,
      recipientName: r.recipientName,
      recipientUserId: r.recipientUserId,
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      totalCents: r.totalCents,
      paidAt: r.paidAt?.toISOString() ?? null,
    };
  }

  private async detail(r: InvoiceRow): Promise<InvoiceDetail> {
    const [items, orgs] = await Promise.all([
      this.db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, r.id)).orderBy(asc(invoiceItems.position)),
      this.orgs.lookupByIds([r.orgId]),
    ]);
    return {
      ...this.summary(r, orgs.get(r.orgId)?.slug ?? ""),
      recipientAddress: r.recipientAddress,
      issuerName: r.issuerName,
      issuerCity: r.issuerCity,
      issuerAddress: r.issuerAddress,
      issuerIban: r.issuerIban,
      issuerTaxInfo: r.issuerTaxInfo,
      note: r.note,
      vatNote: r.vatNote,
      netCents: r.netCents,
      vatCents: r.vatCents,
      items: items.map((i) => ({ description: i.description, quantity: i.quantity, unitCents: i.unitCents, vatRate: i.vatRate })),
      voidReason: r.voidReason,
    };
  }
}
