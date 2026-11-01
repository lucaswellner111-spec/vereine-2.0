"use client";

import { useCallback, useEffect, useState } from "react";
import type { InvoiceRecipient, InvoiceSummary } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { dateDe, eurCents, parseEuroToCents } from "@/lib/money";
import { InvoiceStatusBadge } from "./invoice-status";
import { Button, Card, ConceptNote, Field } from "./ui";

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
  const [rows, setRows] = useState<InvoiceSummary[] | null>(null);
  const [recipients, setRecipients] = useState<InvoiceRecipient[]>([]);
  const [status, setStatus] = useState("");
  const [year, setYear] = useState("");
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (year) q.set("year", year);
    api<InvoiceSummary[]>(`/orgs/${slug}/invoices?${q}`).then(setRows).catch((e) => onError(describeError(e)));
  }, [slug, status, year, onError]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);
  useEffect(() => {
    api<InvoiceRecipient[]>(`/orgs/${slug}/invoice-recipients`).then(setRecipients).catch(() => setRecipients([]));
  }, [slug]);

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
      <ConceptNote>SEPA-Lastschrift, Online-Zahlung, E-Rechnung (XRechnung/ZUGFeRD) und Mahnstufen folgen. Rechnungen sind nach dem Finalisieren unveränderlich; Korrekturen laufen über Storno und neue Rechnung.</ConceptNote>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="inv-status" className="sr-only">Status</label>
        <select id="inv-status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm">
          {STATUS_FILTERS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <label htmlFor="inv-year" className="sr-only">Jahr</label>
        <select id="inv-year" value={year} onChange={(e) => setYear(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm">
          <option value="">Alle Jahre</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <a href={`/api/orgs/${slug}/invoices.csv?year=${csvYear}`} className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm hover:bg-surface-2">
            CSV-Export {csvYear}
          </a>
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

      {rows === null ? (
        <p className="text-sm text-muted" role="status">Lade …</p>
      ) : rows.length === 0 ? (
        <Card><p className="text-sm text-muted">Keine Rechnungen gefunden.</p></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="p-3 font-medium">Nr.</th>
                <th className="p-3 font-medium">An</th>
                <th className="p-3 font-medium">Fällig</th>
                <th className="p-3 font-medium">Betrag</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium"><span className="sr-only">Aktionen</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="border-b border-border align-top last:border-0">
                  <td className="p-3 font-mono text-xs">{i.number ?? "Entwurf"}</td>
                  <td className="p-3">{i.recipientName}</td>
                  <td className="p-3">{dateDe(i.dueDate)}</td>
                  <td className="p-3">{eurCents(i.totalCents)}</td>
                  <td className="p-3"><InvoiceStatusBadge status={i.displayStatus} /></td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <a href={`/api/invoices/${i.id}/pdf`} className="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-3 text-xs hover:bg-surface-2">PDF</a>
                      {i.status === "draft" && (
                        <>
                          <Button size="sm" onClick={() => confirm("Rechnung finalisieren? Danach ist sie unveränderlich und der Empfänger wird benachrichtigt.") && run(() => api(`/invoices/${i.id}/finalize`, { method: "POST" }))}>Finalisieren</Button>
                          <Button size="sm" variant="ghost" onClick={() => confirm("Entwurf löschen?") && run(() => api(`/invoices/${i.id}`, { method: "DELETE" }))}>Löschen</Button>
                        </>
                      )}
                      {i.status === "open" && <Button size="sm" onClick={() => run(() => api(`/invoices/${i.id}/paid`, { method: "POST" }))}>Bezahlt</Button>}
                      {(i.status === "open" || i.status === "paid") && <Button size="sm" variant="ghost" onClick={() => setVoiding(voiding === i.id ? null : i.id)}>Stornieren</Button>}
                    </div>
                    {voiding === i.id && (
                      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                        <label htmlFor={`void-${i.id}`} className="sr-only">Grund</label>
                        <input id={`void-${i.id}`} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Grund (mind. 5 Zeichen)" maxLength={300} className="h-8 w-56 rounded-lg border border-border bg-bg px-2 text-xs" />
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
          <div className="space-y-1.5">
            <label htmlFor="inv-rcpt" className="text-sm font-medium">Empfänger (aktives Mitglied)</label>
            <select id="inv-rcpt" required value={recipientUserId} onChange={(e) => setRecipient(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm">
              <option value="">Bitte wählen …</option>
              {recipients.map((r) => (
                <option key={r.userId} value={r.userId}>{r.name}</option>
              ))}
            </select>
          </div>
          <Field id="inv-due" label="Fällig am" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="inv-addr" className="text-sm font-medium">Anschrift des Empfängers (optional)</label>
            <textarea id="inv-addr" rows={2} maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} className="w-full resize-none rounded-lg border border-border bg-bg p-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]" />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Positionen</legend>
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_5rem_7rem_6rem_auto]">
              <input aria-label={`Beschreibung ${i + 1}`} placeholder="Beschreibung, z. B. Jahresbeitrag 2026" required minLength={2} maxLength={200} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} className="h-10 rounded-lg border border-border bg-bg px-3 text-sm" />
              <input aria-label={`Menge ${i + 1}`} type="number" min={1} max={10000} required value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className="h-10 rounded-lg border border-border bg-bg px-3 text-sm" />
              <input aria-label={`Einzelpreis netto ${i + 1}`} inputMode="decimal" placeholder="Preis netto" required value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} className="h-10 rounded-lg border border-border bg-bg px-3 text-sm" />
              <select aria-label={`USt ${i + 1}`} value={l.vatRate} onChange={(e) => setLine(i, { vatRate: e.target.value })} className="h-10 rounded-lg border border-border bg-bg px-2 text-sm">
                <option value="0">0 % USt</option>
                <option value="7">7 % USt</option>
                <option value="19">19 % USt</option>
              </select>
              <Button type="button" variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} aria-label={`Position ${i + 1} entfernen`}>✕</Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" disabled={lines.length >= 30} onClick={() => setLines((ls) => [...ls, { ...emptyLine }])}>+ Position</Button>
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor="inv-note" className="text-sm font-medium">Hinweis auf der Rechnung (optional)</label>
          <textarea id="inv-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="w-full resize-none rounded-lg border border-border bg-bg p-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Netto {eurCents(net)} · USt {eurCents(vat)} · <strong className="text-text">Gesamt {eurCents(net + vat)}</strong>
          </p>
          <Button type="submit" disabled={busy || !valid || !recipientUserId}>Als Entwurf speichern</Button>
        </div>
      </form>
    </Card>
  );
}
