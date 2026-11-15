"use client";

import type { OrgDashboard } from "@vereine/shared";
import { eurCents } from "@/lib/money";
import { useApi } from "@/lib/use-api";
import { Card, CardSkeletons, ErrorState } from "./ui";

// --- Übersicht -------------------------------------------------------------------------

/** Ladefehler erscheinen lokal (ErrorState); onError bleibt fuer Aktionsfehler (hier keine). */
export function DashboardPanel({ slug }: { slug: string; onError?: (m: string | null) => void }) {
  const dash = useApi<OrgDashboard>(`/orgs/${slug}/dashboard`);
  const d = dash.data;
  if (dash.error && !d) return <ErrorState message={dash.error} onRetry={dash.reload} />;
  if (!d) return <CardSkeletons count={2} />;
  const maxJoins = Math.max(1, ...d.joinsByMonth.map((m) => m.joins));
  const stat = (label: string, value: string, hint?: string) => (
    <Card key={label}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stat("Mitglieder", String(d.members), `${d.newMembers30d} neu in 30 Tagen`)}
        {stat("Offene Anträge", String(d.pendingRequests))}
        {d.invoices && stat("Offene Rechnungen", String(d.invoices.open), `${eurCents(d.invoices.openCents)} · ${d.invoices.overdue} überfällig`)}
        {d.invoices && stat("Bezahlt (dieses Jahr)", eurCents(d.invoices.paidThisYearCents))}
        {d.minors !== null && stat("Minderjährige", String(d.minors), "nach hinterlegtem Geburtsdatum")}
        {stat(
          "Anwesenheitsquote (90 Tage)",
          d.attendance.rate === null ? "–" : `${Math.round(d.attendance.rate * 100)} %`,
          d.attendance.events ? `aus ${d.attendance.events} erfassten ${d.attendance.events === 1 ? "Termin" : "Terminen"}` : "noch keine Anwesenheit erfasst",
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Eintritte je Monat</h2>
          <div className="flex h-24 items-end gap-1" role="img" aria-label="Eintritte der letzten 12 Monate">
            {d.joinsByMonth.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${m.month}: ${m.joins}`}>
                <div className="w-full rounded-t bg-brand/70" style={{ height: `${(m.joins / maxJoins) * 100}%`, minHeight: m.joins ? 4 : 1 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted"><span>{d.joinsByMonth[0]?.month}</span><span>{d.joinsByMonth[11]?.month}</span></div>
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Mitglieder nach Beitragsklasse</h2>
          <ul className="space-y-1 text-sm">
            {d.byFeeClass.length === 0 && <li className="text-muted">Noch keine Daten.</li>}
            {d.byFeeClass.map((c) => (
              <li key={c.name} className="flex justify-between"><span>{c.name}</span><span className="text-muted">{c.members}</span></li>
            ))}
          </ul>
        </Card>
      </div>
      <Card>
        <h2 className="mb-3 text-sm font-semibold">Nächste Termine</h2>
        {d.upcomingEvents.length === 0 ? (
          <p className="text-sm text-muted">Keine anstehenden Termine.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {d.upcomingEvents.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 py-1.5">
                <span className="truncate">{e.title}</span>
                <span className="shrink-0 text-muted">{new Date(e.startsAt).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {e.yes} Zusagen</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
