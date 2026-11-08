"use client";

import { useEffect, useState, type FormEvent } from "react";
import clsx from "clsx";
import type { FeeClassItem, FeeRunItem, FeeRunPreview, FeeRunStatus } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { dateDe, eurCents } from "@/lib/money";
import { useApi, useBusy } from "@/lib/use-api";
import { usePollWhile } from "@/lib/use-poll";
import { Alert, ArrowLink, Badge, Button, Card, CardSkeletons, CellLabel, Checkbox, EmptyState, ErrorState, Field, SectionTitle, stackTable } from "./ui";
import { ask, toast } from "./ui-hosts";

const STATUS: Record<FeeRunStatus, { label: string; tone: "neutral" | "brand" | "accent" | "danger" }> = {
  queued: { label: "wartet", tone: "neutral" },
  running: { label: "läuft", tone: "accent" },
  done: { label: "fertig", tone: "brand" },
  failed: { label: "fehlgeschlagen", tone: "danger" },
};

/** Standard: Kalenderjahr als Zeitraum (ab Oktober das Folgejahr), Faelligkeit in 30 Tagen. */
export function feeRunDefaults(now = new Date()) {
  const d = new Date(now.getTime() + 30 * 86400_000);
  const year = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
  return { periodLabel: String(year), dueDate: d.toISOString().slice(0, 10) };
}

/**
 * Beitragslauf: erzeugt Rechnungsentwuerfe fuer alle aktiven Mitglieder der gewaehlten Beitragsklassen.
 * Ablauf: Eingaben -> Vorschau -> Rueckfrage -> Job. Finalisieren passiert danach einzeln unter Rechnungen.
 */
/** classesVersion: steigt, wenn Beitragsklassen auf der Seite geaendert wurden (neu laden, Vorschau verwerfen). */
export function FeeRunAdmin({ slug, classesVersion = 0 }: { slug: string; classesVersion?: number }) {
  const classes = useApi<FeeClassItem[]>(`/orgs/${slug}/fee-classes`);
  const runs = useApi<FeeRunItem[]>(`/orgs/${slug}/fee-runs`);
  const [form, setForm] = useState(() => feeRunDefaults());
  const [picked, setPicked] = useState<string[]>([]);
  const [preview, setPreview] = useState<FeeRunPreview | null>(null);
  const [loadingPreview, runPreview] = useBusy();
  const [creating, runCreate] = useBusy();

  useEffect(() => {
    setPicked([]);
    setPreview(null);
  }, [slug]);

  // Beitragsklasse geaendert: Liste neu laden, alte Vorschau ist ungueltig
  const reloadClasses = classes.reload;
  useEffect(() => {
    if (classesVersion === 0) return;
    reloadClasses();
    setPreview(null);
  }, [classesVersion, reloadClasses]);

  // Laufende Laeufe nachladen, bis sie fertig sind (3 s, nach 10 Min. 30 s, pausiert im Hintergrund-Tab)
  const active = (runs.data ?? []).some((r) => r.status === "queued" || r.status === "running");
  usePollWhile(active, runs.reload);
  const [retrying, runRetry] = useBusy();

  const input = { periodLabel: form.periodLabel.trim(), dueDate: form.dueDate, feeClassIds: picked };
  const change = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setPreview(null);
  };
  const toggle = (id: string, on: boolean) => {
    setPicked(on ? [...picked, id] : picked.filter((p) => p !== id));
    setPreview(null);
  };

  function showPreview(e: FormEvent) {
    e.preventDefault();
    if (picked.length === 0) return void toast.error("Bitte mindestens eine Beitragsklasse wählen.");
    void runPreview(async () => {
      try {
        setPreview(await api<FeeRunPreview>(`/orgs/${slug}/fee-runs/preview`, { method: "POST", body: input }));
      } catch (err) {
        toast.error(describeError(err));
      }
    });
  }

  async function create() {
    if (!preview) return;
    const ok = await ask(
      `${preview.count} Rechnungsentwürfe über zusammen ${eurCents(preview.totalCents)} für „${input.periodLabel}“ erzeugen? Sie werden erst verschickt, wenn du sie einzeln finalisierst.`,
      { confirmLabel: "Entwürfe erzeugen", title: "Beitragslauf starten" },
    );
    if (!ok) return;
    await runCreate(async () => {
      try {
        const run = await api<FeeRunItem>(`/orgs/${slug}/fee-runs`, { method: "POST", body: input });
        toast.success(run.status === "done" ? `${run.createdCount} Entwürfe erzeugt.` : "Beitragslauf gestartet. Du bekommst eine Benachrichtigung, wenn er fertig ist.");
        setPreview(null);
        runs.reload();
      } catch (err) {
        toast.error(describeError(err));
      }
    });
  }

  function retry(r: FeeRunItem) {
    void runRetry(async () => {
      try {
        const run = await api<FeeRunItem>(`/orgs/${slug}/fee-runs/${r.id}/retry`, { method: "POST" });
        toast.success(run.status === "done" ? `${run.createdCount} Entwürfe erzeugt.` : "Beitragslauf neu gestartet.");
        runs.reload();
      } catch (err) {
        toast.error(describeError(err));
      }
    });
  }

  const classList = classes.data ?? [];
  return (
    <div className="space-y-4">
      <SectionTitle>Beitragslauf</SectionTitle>
      <p className="text-xs text-muted">Erzeugt je aktivem Mitglied der gewählten Klassen einen Rechnungsentwurf. Ausgetretene werden übersprungen. Finalisieren und Versand bleiben bei dir.</p>

      {classes.error && !classes.data ? (
        <ErrorState message={classes.error} onRetry={classes.reload} />
      ) : classes.data === null ? (
        <CardSkeletons count={1} />
      ) : classList.length === 0 ? (
        <EmptyState title="Lege zuerst Beitragsklassen an und ordne Mitglieder zu." />
      ) : (
        <Card>
          <form onSubmit={showPreview} className="grid gap-3 sm:grid-cols-2">
            <Field id="fr-period" label="Zeitraum" required minLength={1} maxLength={40} value={form.periodLabel} onChange={(e) => change({ periodLabel: e.target.value })} hint="z. B. 2027 oder 1. Halbjahr 2027" />
            <Field id="fr-due" label="Fällig am" type="date" required value={form.dueDate} onChange={(e) => change({ dueDate: e.target.value })} />
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">Beitragsklassen</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {classList.map((c) => (
                  <Checkbox key={c.id} id={`fr-c-${c.id}`} checked={picked.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)}>
                    {c.name} <span className="text-muted">· {eurCents(c.amountCents)} · {c.members} {c.members === 1 ? "Mitglied" : "Mitglieder"}</span>
                  </Checkbox>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary" busy={loadingPreview} className="max-sm:w-full">Vorschau</Button>
            </div>
          </form>
        </Card>
      )}

      {preview && (
        <Card flush>
          <div className="p-3 text-sm">
            <span className="font-medium">{preview.count} Entwürfe</span> · zusammen {eurCents(preview.totalCents)}
          </div>
          <table className={stackTable.table}>
            <thead className={stackTable.thead}>
              <tr><th className="p-3 font-medium">Beitragsklasse</th><th className="p-3 font-medium">Betrag</th><th className="p-3 font-medium">Mitglieder</th><th className="p-3 font-medium">Summe</th></tr>
            </thead>
            <tbody className={stackTable.tbody}>
              {preview.byClass.map((c) => (
                <tr key={c.feeClassId} className={stackTable.tr}>
                  <td className={stackTable.tdMain}>{c.name}</td>
                  <td className={clsx(stackTable.td, "text-muted")}><CellLabel>Betrag</CellLabel>{eurCents(c.amountCents)}</td>
                  <td className={clsx(stackTable.td, "text-muted")}><CellLabel>Mitglieder</CellLabel>{c.members}</td>
                  <td className={stackTable.td}><CellLabel>Summe</CellLabel>{eurCents(c.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-3 p-3">
            {preview.periodTaken && <Alert>Für „{input.periodLabel}“ gibt es schon einen Beitragslauf. Wähle einen anderen Zeitraum.</Alert>}
            {preview.byClass.some((c) => c.amountCents === 0 && c.members > 0) && (
              <Alert tone="info">Mindestens eine Klasse kostet 0 €; dafür entstehen Entwürfe über 0 €.</Alert>
            )}
            {preview.withoutClass > 0 && (
              <Alert tone="info">{preview.withoutClass} {preview.withoutClass === 1 ? "aktives Mitglied hat" : "aktive Mitglieder haben"} keine Beitragsklasse und {preview.withoutClass === 1 ? "bekommt" : "bekommen"} keine Rechnung.</Alert>
            )}
            <Button onClick={create} busy={creating} disabled={preview.count === 0 || preview.periodTaken} className="max-sm:w-full">Entwürfe erzeugen</Button>
          </div>
        </Card>
      )}

      <SectionTitle>Bisherige Läufe</SectionTitle>
      {runs.error && !runs.data ? (
        <ErrorState message={runs.error} onRetry={runs.reload} />
      ) : runs.data === null ? (
        <CardSkeletons count={1} />
      ) : runs.data.length === 0 ? (
        <EmptyState title="Noch keine Beitragsläufe." />
      ) : (
        <Card flush className="sm:overflow-x-auto">
          <table className={stackTable.table}>
            <thead className={stackTable.thead}>
              <tr><th className="p-3 font-medium">Zeitraum</th><th className="p-3 font-medium">Fällig</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Entwürfe</th><th className="p-3 font-medium">Übersprungen</th><th className="p-3"><span className="sr-only">Aktionen</span></th></tr>
            </thead>
            <tbody className={stackTable.tbody}>
              {runs.data.map((r) => (
                <tr key={r.id} className={stackTable.tr}>
                  <td className={stackTable.tdMain}>{r.periodLabel}</td>
                  <td className={clsx(stackTable.td, "text-muted")}><CellLabel>Fällig</CellLabel>{dateDe(r.dueDate)}</td>
                  <td className={stackTable.td}><CellLabel>Status</CellLabel><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
                  <td className={clsx(stackTable.td, "text-muted")}><CellLabel>Entwürfe</CellLabel>{r.status === "done" ? r.createdCount : "–"}</td>
                  <td className={clsx(stackTable.td, "text-muted")}><CellLabel>Übersprungen</CellLabel>{r.status === "done" ? r.skippedCount : "–"}</td>
                  <td className={clsx(stackTable.tdActions, "sm:text-right")}>
                    {r.status === "failed" && (
                      <Button size="sm" variant="secondary" busy={retrying} className="max-sm:w-full" onClick={() => retry(r)}>Erneut versuchen</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {runs.data && runs.data.some((r) => r.status === "done") && <ArrowLink href="/verwaltung/rechnungen">Entwürfe prüfen und finalisieren</ArrowLink>}
    </div>
  );
}
