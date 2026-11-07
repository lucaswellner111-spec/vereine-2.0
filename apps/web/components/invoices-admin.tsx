"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import type { InvoiceRecipient, InvoiceSummary } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { dateDe, eurCents, parseEuroToCents } from "@/lib/money";
import { InvoiceStatusBadge } from "./invoice-status";
import { useApi } from "@/lib/use-api";
import clsx from "clsx";
import { Button, Card, CardSkeletons, CellLabel, EmptyState, ErrorState, Field, Input, LinkButton, Select, SelectField, stackTable, TextareaField } from "./ui";
import { ask } from "./ui-hosts";

type Line = { description: string; quantity: string; price: string; vatRate: string };
const emptyLine: Line = { description: "", quantity: "1", price: "", vatRate: "0" };
const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);
const STATUS_FILTERS = [
  ["", "Alle"],
  ["draft", "Entwürfe"],
  ["open", "Offen"],
  ["paid", "Bezahlt"],
  ["void", "Storniert"],
] as const;

export function InvoicesAdmin({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const [status, setStatus] = useState("");
  const [year, setYear] = useState("");
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (year) q.set("year", year);
  const list = useApi<InvoiceSummary[]>(`/orgs/${slug}/invoices?${q}`);
  const rows = list.data;
  const load = list.reload;
  const recipientList = useApi<InvoiceRecipient[]>(`/orgs/${slug}/invoice-recipients`);
  const recipients = recipientList.data ?? [];
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");


  const run = async (fn: () => Promise<unknown>) => {
    onError(null);
    try {
      await fn();
      load();
    } catch (e) {
      onError(describeError(e));
    }
  };

  const years = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i));
  const csvYear = year || String(new Date().getFullYear());

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Finalisierte Rechnungen sind unveränderlich; Korrekturen laufen über Storno und neue Rechnung.</p>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="inv-status" className="sr-only">Status</label>
        <Select id="inv-status" size="sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <label htmlFor="inv-year" className="sr-only">Jahr</label>
        <Select id="inv-year" size="sm" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">Alle Jahre</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
        <div className="ml-auto flex gap-2">
          <LinkButton native size="sm" variant="secondary" href={`/api/orgs/${slug}/invoices.csv?year=${csvYear}`}>
            CSV-Export {csvYear}
          </LinkButton>
          <Button size="sm" onClick={() => setCreating((c) => !c)}>{creating ? "Schließen" : "Neue Rechnung"}</Button>
        </div>
      </div>

      {creating && (
        <NewInvoice
          slug={slug}
          recipients={recipients}
          onError={onError}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}

      {list.error && !rows ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : rows === null ? (
        <CardSkeletons count={2} />
      ) : rows.length === 0 ? (
        <EmptyState title="Keine Rechnungen gefunden." />
      ) : (
        <Card flush className="sm:overflow-x-auto">
          <table className={stackTable.table}>
            <thead className={stackTable.thead}>
              <tr>
                <th className="p-3 font-medium">Nr.</th>
                <th className="p-3 font-medium">An</th>
                <th className="p-3 font-medium">Fällig</th>
                <th className="p-3 font-medium">Betrag</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium"><span className="sr-only">Aktionen</span></th>
              </tr>
            </thead>
            <tbody className={stackTable.tbody}>
              {rows.map((i) => (
                <tr key={i.id} className={clsx(stackTable.tr, "align-top")}>
                  <td className={stackTable.td}><CellLabel>Nr.</CellLabel><span className="font-mono text-xs">{i.number ?? "Entwurf"}</span></td>
                  <td className={stackTable.tdMain}>
                    {/* Karte: Empfaenger und Status in der Titelzeile; Tabelle: Status in eigener Spalte */}
                    <span className="max-sm:flex max-sm:items-center max-sm:justify-between max-sm:gap-2">
                      <span className="min-w-0 max-sm:truncate">{i.recipientName}</span>
                      <span className="shrink-0 font-normal sm:hidden"><InvoiceStatusBadge status={i.displayStatus} /></span>
                    </span>
                  </td>
                  <td className={stackTable.td}><CellLabel>Fällig</CellLabel>{dateDe(i.dueDate)}</td>
                  <td className={stackTable.td}><CellLabel>Betrag</CellLabel>{eurCents(i.totalCents)}</td>
                  <td className={clsx(stackTable.td, "max-sm:hidden")}><InvoiceStatusBadge status={i.displayStatus} /></td>
                  <td className={stackTable.tdActions}>
                    <div className="flex flex-wrap justify-end gap-1.5 max-sm:justify-start">
                      <LinkButton native size="sm" variant="secondary" href={`/api/invoices/${i.id}/pdf`}>PDF</LinkButton>
                      {i.status === "draft" && (
                        <>
                          <Button
                            size="sm"
                            onClick={async () => {
                              if (!(await ask("Rechnung finalisieren? Danach ist sie unveränderlich und der Empfänger wird benachrichtigt.", { confirmLabel: "Finalisieren", danger: false }))) return;
                              await run(() => api(`/invoices/${i.id}/finalize`, { method: "POST" }));
                            }}
                          >
                            Finalisieren
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              if (!(await ask("Entwurf löschen?", { confirmLabel: "Löschen" }))) return;
                              await run(() => api(`/invoices/${i.id}`, { method: "DELETE" }));
                            }}
                          >
                            Löschen
                          </Button>
                        </>
                      )}
                      {i.status === "open" && (
                        <Button
                          size="sm"
                          onClick={async () => {
                            // "Bezahlt" laesst sich im Backend nicht zuruecknehmen
                            if (!(await ask(`Rechnung ${i.number ?? ""} als bezahlt markieren? Das lässt sich nicht zurücknehmen.`, { confirmLabel: "Als bezahlt markieren", danger: false }))) return;
                            await run(() => api(`/invoices/${i.id}/paid`, { method: "POST" }));
                          }}
                        >
                          Bezahlt
                        </Button>
                      )}
                      {(i.status === "open" || i.status === "paid") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setVoidReason("");
                            setVoiding(voiding === i.id ? null : i.id);
                          }}
                        >
                          Stornieren
                        </Button>
                      )}
                    </div>
                    {voiding === i.id && (
                      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 max-sm:justify-start">
                        <label htmlFor={`void-${i.id}`} className="sr-only">Grund</label>
                        <Input id={`void-${i.id}`} size="sm" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Grund (mind. 5 Zeichen)" maxLength={300} className="min-w-0 flex-1 sm:w-56 sm:flex-none" />
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={voidReason.trim().length < 5}
                          onClick={() =>
                            run(async () => {
                              await api(`/invoices/${i.id}/void`, { method: "POST", body: { reason: voidReason.trim() } });
                              setVoiding(null);
                              setVoidReason("");
                            })
                          }
                        >
                          Stornieren
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function NewInvoice({
  slug,
  recipients,
  onError,
  onCreated,
}: {
  slug: string;
  recipients: InvoiceRecipient[];
  onError: (m: string | null) => void;
  onCreated: () => void;
}) {
  const [recipientUserId, setRecipient] = useState("");
  const [address, setAddress] = useState("");
  const [dueDate, setDueDate] = useState(inDays(14));
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [busy, setBusy] = useState(false);

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const parsed = lines.map((l) => ({ cents: parseEuroToCents(l.price), qty: Number(l.quantity), vat: Number(l.vatRate) }));
  const valid = lines.every((l, i) => l.description.trim().length >= 2 && parsed[i].cents !== null && Number.isInteger(parsed[i].qty) && parsed[i].qty >= 1);
  const net = parsed.reduce((s, p) => s + (p.cents ?? 0) * (p.qty || 0), 0);
  const vat = parsed.reduce((s, p) => s + Math.round(((p.cents ?? 0) * (p.qty || 0) * p.vat) / 100), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !recipientUserId) return;
    setBusy(true);
    onError(null);
    try {
      await api(`/orgs/${slug}/invoices`, {
        method: "POST",
        body: {
          recipientUserId,
          recipientAddress: address,
          dueDate,
          note,
          items: lines.map((l, i) => ({ description: l.description.trim(), quantity: parsed[i].qty, unitCents: parsed[i].cents, vatRate: parsed[i].vat })),
        },
      });
      onCreated();
    } catch (err) {
      onError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField id="inv-rcpt" label="Empfänger (aktives Mitglied)" required value={recipientUserId} onChange={(e) => setRecipient(e.target.value)}>
            <option value="">Bitte wählen …</option>
            {recipients.map((r) => (
              <option key={r.userId} value={r.userId}>{r.name}</option>
            ))}
          </SelectField>
          <Field id="inv-due" label="Fällig am" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <TextareaField id="inv-addr" label="Anschrift des Empfängers (optional)" rows={2} maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} className="sm:col-span-2" />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Positionen</legend>
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_5rem_7rem_6rem_auto]">
              <Input aria-label={`Beschreibung ${i + 1}`} placeholder="Beschreibung, z. B. Jahresbeitrag 2026" required minLength={2} maxLength={200} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} className="min-w-0" />
              <Input aria-label={`Menge ${i + 1}`} type="number" min={1} max={10000} required value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className="min-w-0" />
              <Input aria-label={`Einzelpreis netto ${i + 1}`} inputMode="decimal" placeholder="Preis netto" required value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} className="min-w-0" />
              <Select aria-label={`USt ${i + 1}`} value={l.vatRate} onChange={(e) => setLine(i, { vatRate: e.target.value })} className="min-w-0">
                <option value="0">0 % USt</option>
                <option value="7">7 % USt</option>
                <option value="19">19 % USt</option>
              </Select>
              <Button type="button" variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} aria-label={`Position ${i + 1} entfernen`}><X size={14} aria-hidden /></Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" disabled={lines.length >= 30} onClick={() => setLines((ls) => [...ls, { ...emptyLine }])}><Plus size={14} aria-hidden /> Position</Button>
        </fieldset>

        <TextareaField id="inv-note" label="Hinweis auf der Rechnung (optional)" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Netto {eurCents(net)} · USt {eurCents(vat)} · <strong className="text-text">Gesamt {eurCents(net + vat)}</strong>
          </p>
          <Button type="submit" busy={busy} disabled={!valid || !recipientUserId}>Als Entwurf speichern</Button>
        </div>
      </form>
    </Card>
  );
}
