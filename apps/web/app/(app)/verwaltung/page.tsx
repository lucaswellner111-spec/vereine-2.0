"use client";

import clsx from "clsx";
import { useState } from "react";
import { Badge, Button, Card, ConceptNote, PageHeader } from "@/components/ui";
import { eur, invoices, members } from "@/lib/mock";

const tabs = ["Übersicht", "Mitglieder", "Rechnungen"] as const;

const statusTone = { bezahlt: "brand", offen: "accent", überfällig: "danger" } as const;

export default function AdminPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Übersicht");
  const open = invoices.filter((i) => i.status !== "bezahlt").reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <PageHeader title="Verwaltung" subtitle="TSV Musterstadt 1904" action={<Button variant="secondary">Verein wechseln</Button>} />
      <ConceptNote>
        Rollen (Vorstand, Kassenwart), Beitragslauf, SEPA, E-Rechnung (XRechnung/ZUGFeRD), Zuwendungsbestätigungen und DATEV-Export folgen im Modul „Verwaltung“.
      </ConceptNote>

      <div role="tablist" className="mb-4 inline-flex rounded-lg border border-border bg-surface p-1">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={clsx("rounded-md px-3 py-1.5 text-sm font-medium", tab === t ? "bg-brand text-brand-contrast" : "text-muted hover:text-text")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Übersicht" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><p className="text-xs text-muted">Mitglieder</p><p className="mt-1 text-2xl font-semibold">412</p></Card>
          <Card><p className="text-xs text-muted">Offene Beiträge</p><p className="mt-1 text-2xl font-semibold">{eur(open)}</p></Card>
          <Card><p className="text-xs text-muted">Spenden (Jahr)</p><p className="mt-1 text-2xl font-semibold">{eur(6400)}</p></Card>
        </div>
      )}

      {tab === "Mitglieder" && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Rolle</th><th className="p-3 font-medium">Beitrag</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Seit</th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium">{m.name}</td><td className="p-3">{m.role}</td><td className="p-3">{m.fee}</td>
                  <td className="p-3"><Badge tone={m.status === "aktiv" ? "brand" : "neutral"}>{m.status}</Badge></td><td className="p-3">{m.since}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "Rechnungen" && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr><th className="p-3 font-medium">Nr.</th><th className="p-3 font-medium">An</th><th className="p-3 font-medium">Leistung</th><th className="p-3 font-medium">Betrag</th><th className="p-3 font-medium">Status</th></tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-mono text-xs">{i.id}</td><td className="p-3">{i.to}</td><td className="p-3">{i.item}</td>
                  <td className="p-3">{eur(i.amount)}</td>
                  <td className="p-3"><Badge tone={statusTone[i.status as keyof typeof statusTone]}>{i.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
