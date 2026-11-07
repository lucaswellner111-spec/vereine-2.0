"use client";

import { useState } from "react";
import type { InvoiceDetail, InvoiceSummary } from "@vereine/shared";
import { InvoiceStatusBadge } from "@/components/invoice-status";
import { SettingsTabs } from "@/components/settings-tabs";
import { Alert, ArrowLink, Button, Card, EmptyState, ErrorState, LinkButton, ListSkeleton, PageHeader } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { dateDe, eurCents } from "@/lib/money";

export default function MyInvoicesPage() {
  const list = useApi<InvoiceSummary[]>("/billing/mine");
  const rows = list.data;
  const [open, setOpen] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      {list.error && !rows ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : rows === null ? (
        <ListSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState title="Du hast keine Rechnungen." action={<ArrowLink href="/vereine">Vereine entdecken</ArrowLink>} />
      ) : (
        <Card flush className="divide-y divide-border">
          {rows.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.orgName} · <span className="font-mono text-xs">{i.number}</span></p>
                <p className="text-xs text-muted">Fällig am {dateDe(i.dueDate)}</p>
              </div>
              <span className="text-sm font-medium">{eurCents(i.totalCents)}</span>
              <InvoiceStatusBadge status={i.displayStatus} />
              <Button size="sm" variant="secondary" onClick={() => (open?.id === i.id ? setOpen(null) : show(i.id))}>{open?.id === i.id ? "Schließen" : "Ansehen"}</Button>
              <LinkButton native size="sm" variant="secondary" href={`/api/invoices/${i.id}/pdf`}>PDF</LinkButton>
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
