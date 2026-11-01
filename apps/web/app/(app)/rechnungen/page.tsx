"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { InvoiceDetail, InvoiceSummary } from "@vereine/shared";
import { InvoiceStatusBadge } from "@/components/invoice-status";
import { SettingsTabs } from "@/components/settings-tabs";
import { Alert, Button, Card, PageHeader } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { dateDe, eurCents } from "@/lib/money";

export default function MyInvoicesPage() {
  const [rows, setRows] = useState<InvoiceSummary[] | null>(null);
  const [open, setOpen] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<InvoiceSummary[]>("/billing/mine").then(setRows).catch((e) => setError(describeError(e)));
  }, []);

  async function show(id: string) {
    setError(null);
    try {
      setOpen(await api<InvoiceDetail>(`/invoices/${id}`));
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <>
      <PageHeader title="Meine Rechnungen" subtitle="Rechnungen, die dir deine Vereine gestellt haben." />
      <SettingsTabs active="/rechnungen" />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {rows === null ? (
        <p className="text-sm text-muted" role="status">Lade …</p>
      ) : rows.length === 0 ? (
        <Card><p className="text-sm text-muted">Du hast keine Rechnungen. <Link href="/vereine" className="text-brand hover:underline">Vereine entdecken →</Link></p></Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {rows.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.orgName} · <span className="font-mono text-xs">{i.number}</span></p>
                <p className="text-xs text-muted">Fällig am {dateDe(i.dueDate)}</p>
              </div>
              <span className="text-sm font-medium">{eurCents(i.totalCents)}</span>
              <InvoiceStatusBadge status={i.displayStatus} />
              <Button size="sm" variant="secondary" onClick={() => (open?.id === i.id ? setOpen(null) : show(i.id))}>{open?.id === i.id ? "Schließen" : "Ansehen"}</Button>
              <a href={`/api/invoices/${i.id}/pdf`} className="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-3 text-xs hover:bg-surface-2">PDF</a>
              {open?.id === i.id && (
                <div className="w-full rounded-lg bg-surface-2 p-3 text-sm">
                  <ul className="space-y-1">
                    {open.items.map((it, n) => (
                      <li key={n} className="flex justify-between gap-3">
                        <span>{it.quantity} × {it.description}</span>
                        <span>{eurCents(it.quantity * it.unitCents)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t border-border pt-2 text-xs text-muted">
                    Netto {eurCents(open.netCents)} · USt {eurCents(open.vatCents)} · Gesamt {eurCents(open.totalCents)}
                  </p>
                  {open.vatNote && <p className="mt-1 text-xs text-muted">{open.vatNote}</p>}
                  {open.note && <p className="mt-1 text-xs text-muted">{open.note}</p>}
                  {open.voidReason && <p className="mt-1 text-xs text-danger">Storniert: {open.voidReason}</p>}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
