"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { FeeClassItem, FeeInterval, MemberRecord, MemberRegistryPage, OrgDashboard } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { dateDe, eurCents, parseEuroToCents } from "@/lib/money";
import { ROLE_LABEL } from "@/lib/labels";
import { useApi, useBusy } from "@/lib/use-api";
import clsx from "clsx";
import { Alert, Badge, Button, Card, CardSkeletons, CellLabel, EmptyState, ErrorState, Field, Input, LinkButton, Select, SelectField, stackTable, TextareaField } from "./ui";
import { Dialog } from "./ui-client";
import { ask, toast } from "./ui-hosts";

const intervalLabel: Record<FeeInterval, string> = { monthly: "monatlich", quarterly: "vierteljährlich", halfyearly: "halbjährlich", yearly: "jährlich" };
const PAGE = 50;

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

// --- Beitragsklassen ------------------------------------------------------------------------

/** onChanged: nach Anlegen/Bearbeiten/Loeschen (z. B. damit der Beitragslauf die Klassen neu laedt). */
export function FeeClassesAdmin({ slug, canEdit, onError, onChanged }: { slug: string; canEdit: boolean; onError: (m: string | null) => void; onChanged?: () => void }) {
  const list = useApi<FeeClassItem[]>(`/orgs/${slug}/fee-classes`);
  const rows = list.data;
  const [form, setForm] = useState({ name: "", amount: "", interval: "yearly" as FeeInterval, description: "" });
  const [adding, runAdd] = useBusy();
  const [editing, setEditing] = useState<{ id: string; name: string; amount: string; interval: FeeInterval; description: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, runSave] = useBusy();

  function openEdit(c: FeeClassItem) {
    setEditError(null);
    setEditing({ id: c.id, name: c.name, amount: (c.amountCents / 100).toFixed(2).replace(".", ","), interval: c.interval, description: c.description });
  }

  function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const cents = parseEuroToCents(editing.amount);
    if (cents === null) return setEditError("Bitte einen gültigen Betrag eingeben, z. B. 120 oder 12,50.");
    void runSave(async () => {
      setEditError(null);
      try {
        list.setData(await api<FeeClassItem[]>(`/orgs/${slug}/fee-classes/${editing.id}`, { method: "PUT", body: { name: editing.name, amountCents: cents, interval: editing.interval, description: editing.description } }));
        setEditing(null);
        onChanged?.();
        toast.success("Beitragsklasse gespeichert.");
      } catch (err) {
        setEditError(describeError(err));
      }
    });
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuroToCents(form.amount);
    if (cents === null) return onError("Bitte einen gültigen Betrag eingeben, z. B. 120 oder 12,50.");
    void runAdd(async () => {
      onError(null);
      try {
        list.setData(await api<FeeClassItem[]>(`/orgs/${slug}/fee-classes`, { method: "POST", body: { name: form.name, amountCents: cents, interval: form.interval, description: form.description } }));
        setForm({ name: "", amount: "", interval: "yearly", description: "" });
        onChanged?.();
      } catch (err) {
        onError(describeError(err));
      }
    });
  }

  async function remove(c: FeeClassItem) {
    if (!(await ask(`„${c.name}“ löschen? ${c.members} Mitglieder verlieren diese Zuordnung.`, { confirmLabel: "Endgültig löschen", danger: true }))) return;
    onError(null);
    try {
      await api(`/orgs/${slug}/fee-classes/${c.id}`, { method: "DELETE" });
      list.reload();
      onChanged?.();
    } catch (err) {
      onError(describeError(err));
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Betrag je Intervall.</p>
      {canEdit && (
        <Card>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_8rem_9rem_auto] sm:items-end">
            <Field id="fc-name" label="Name" required minLength={2} maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Erwachsene" />
            <Field id="fc-amount" label="Betrag (€)" required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <SelectField id="fc-int" label="Intervall" value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value as FeeInterval })}>
              {Object.entries(intervalLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectField>
            <Button type="submit" busy={adding}>Anlegen</Button>
          </form>
        </Card>
      )}
      {list.error && !rows ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : rows === null ? (
        <CardSkeletons count={2} />
      ) : rows.length === 0 ? (
        <EmptyState title="Noch keine Beitragsklassen." />
      ) : (
        <Card flush className="divide-y divide-border">
          {rows.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="min-w-0 flex-1 font-medium">{c.name}</span>
              <span>{eurCents(c.amountCents)} {intervalLabel[c.interval]}</span>
              <Badge>{c.members} {c.members === 1 ? "Mitglied" : "Mitglieder"}</Badge>
              {canEdit && (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(c)} aria-label={`${c.name} bearbeiten`}>Bearbeiten</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c)}>Löschen</Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Beitragsklasse bearbeiten"
        description="Neue Beträge gelten für künftige Rechnungen und Beitragsläufe; bestehende Rechnungen bleiben unverändert."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Abbrechen</Button>
            <Button type="submit" form="fc-edit-form" busy={saving}>Speichern</Button>
          </>
        }
      >
        {editing && (
          <form id="fc-edit-form" onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-2">
            <Field id="fce-name" label="Name" required minLength={2} maxLength={60} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="sm:col-span-2" />
            <Field id="fce-amount" label="Betrag (€)" required inputMode="decimal" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
            <SelectField id="fce-int" label="Intervall" value={editing.interval} onChange={(e) => setEditing({ ...editing, interval: e.target.value as FeeInterval })}>
              {Object.entries(intervalLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectField>
            <TextareaField id="fce-desc" label="Beschreibung (optional)" rows={2} maxLength={200} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="sm:col-span-2" />
            {editError && <div className="sm:col-span-2"><Alert>{editError}</Alert></div>}
          </form>
        )}
      </Dialog>
    </div>
  );
}

// --- Mitgliederliste ------------------------------------------------------------------------

export function MemberRegistry({ slug, isAdmin, onError }: { slug: string; isAdmin: boolean; onError: (m: string | null) => void }) {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<MemberRecord | null>(null);
  const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
  if (q.trim()) params.set("q", q.trim());
  if (cls) params.set("feeClassId", cls);
  const registry = useApi<MemberRegistryPage>(`/orgs/${slug}/member-registry?${params}`, { debounceMs: 250, keepPrevious: true });
  const page = registry.data;
  const load = registry.reload;
  const classList = useApi<FeeClassItem[]>(`/orgs/${slug}/fee-classes`);
  const classes = classList.data ?? [];
  useEffect(() => setOpen(null), [slug]);

  async function show(userId: string) {
    onError(null);
    try {
      setOpen(await api<MemberRecord>(`/orgs/${slug}/member-registry/${userId}`));
    } catch (e) {
      onError(describeError(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="mr-q" className="sr-only">Suche</label>
        <Input id="mr-q" size="sm" type="search" placeholder="Name, Nummer oder Ort" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} className="w-full sm:w-56" />
        <label htmlFor="mr-cls" className="sr-only">Beitragsklasse</label>
        <Select id="mr-cls" size="sm" value={cls} onChange={(e) => { setCls(e.target.value); setOffset(0); }} className="min-w-0 max-sm:flex-1">
          <option value="">Alle Beitragsklassen</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {isAdmin && <LinkButton native size="sm" variant="secondary" href={`/api/orgs/${slug}/member-registry.csv`} className="max-sm:w-full sm:ml-auto">CSV-Export</LinkButton>}
      </div>
      {isAdmin && <p className="text-xs text-muted">Der Export wird protokolliert. Gib Mitgliederdaten nur an Personen weiter, die sie für Vereinszwecke brauchen.</p>}

      {registry.error && !page ? (
        <ErrorState message={registry.error} onRetry={registry.reload} />
      ) : page === null ? (
        <CardSkeletons count={2} />
      ) : page.items.length === 0 ? (
        <EmptyState title="Keine Mitglieder gefunden." />
      ) : (
        <Card flush className="sm:overflow-x-auto">
          <table className={stackTable.table}>
            <thead className={stackTable.thead}>
              <tr><th className="p-3 font-medium">Nr.</th><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Rolle</th><th className="p-3 font-medium">Ort</th><th className="p-3 font-medium">Beitragsklasse</th><th className="p-3 font-medium">Eintritt</th><th className="p-3"><span className="sr-only">Aktionen</span></th></tr>
            </thead>
            <tbody className={stackTable.tbody}>
              {page.items.map((m) => (
                <tr key={m.userId} className={stackTable.tr}>
                  <td className={stackTable.td}><CellLabel>Nr.</CellLabel><span className="font-mono text-xs">{m.memberNo}</span></td>
                  <td className={stackTable.tdMain}>{m.name} {m.minor && <Badge tone="accent">minderjährig</Badge>}</td>
                  <td className={clsx(stackTable.td, "text-muted")}><CellLabel>Rolle</CellLabel>{ROLE_LABEL[m.role]}</td>
                  <td className={clsx(stackTable.td, "text-muted")}><CellLabel>Ort</CellLabel>{m.city || "–"}</td>
                  <td className={clsx(stackTable.td, "text-muted")}><CellLabel>Beitragsklasse</CellLabel>{m.feeClassName ?? "–"}</td>
                  <td className={clsx(stackTable.td, "text-muted")}><CellLabel>Eintritt</CellLabel>{dateDe(m.joinedOn)}</td>
                  <td className={clsx(stackTable.tdActions, "sm:text-right")}><Button size="sm" variant="secondary" className="max-sm:w-full" onClick={() => show(m.userId)}>{isAdmin ? "Bearbeiten" : "Ansehen"}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {page && page.total > PAGE && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{offset + 1}–{Math.min(offset + PAGE, page.total)} von {page.total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Zurück</Button>
            <Button size="sm" variant="secondary" disabled={offset + PAGE >= page.total} onClick={() => setOffset(offset + PAGE)}>Weiter</Button>
          </div>
        </div>
      )}

      {open && (
        <MemberEditor
          slug={slug}
          record={open}
          classes={classes}
          canEdit={isAdmin}
          onError={onError}
          onClose={() => setOpen(null)}
          onSaved={(r) => {
            setOpen(r);
            load();
          }}
        />
      )}
    </div>
  );
}

function MemberEditor({ slug, record, classes, canEdit, onError, onClose, onSaved }: { slug: string; record: MemberRecord; classes: FeeClassItem[]; canEdit: boolean; onError: (m: string | null) => void; onClose: () => void; onSaved: (r: MemberRecord) => void }) {
  const [f, setF] = useState(record);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setF(record);
    setSaved(false);
  }, [record]);
  const set = (k: keyof MemberRecord) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    onError(null);
    setSaved(false);
    try {
      const res = await api<MemberRecord>(`/orgs/${slug}/member-registry/${record.userId}`, {
        method: "PUT",
        body: { street: f.street, zip: f.zip, city: f.city, phone: f.phone, birthDate: f.birthDate, guardianName: f.guardianName, guardianEmail: f.guardianEmail, feeClassId: f.feeClassId || null, joinedOn: f.joinedOn, notes: f.notes },
      });
      setSaved(true);
      onSaved(res);
    } catch (err) {
      onError(describeError(err));
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{record.name} <span className="text-sm font-normal text-muted">· Nr. {record.memberNo}</span></h2>
        <Button size="sm" variant="ghost" onClick={onClose}>Schließen</Button>
      </div>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Field id="me-street" label="Straße und Nr." disabled={!canEdit} maxLength={120} value={f.street} onChange={set("street")} />
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field id="me-zip" label="PLZ" disabled={!canEdit} maxLength={10} value={f.zip} onChange={set("zip")} />
          <Field id="me-city" label="Ort" disabled={!canEdit} maxLength={60} value={f.city} onChange={set("city")} />
        </div>
        <Field id="me-phone" label="Telefon" disabled={!canEdit} maxLength={30} value={f.phone} onChange={set("phone")} />
        <Field id="me-birth" label="Geburtsdatum (optional)" type="date" disabled={!canEdit} value={f.birthDate} onChange={set("birthDate")} />
        {f.birthDate && record.minor !== false && (
          <>
            <Field id="me-gname" label="Erziehungsberechtigte(r)" disabled={!canEdit} maxLength={100} value={f.guardianName} onChange={set("guardianName")} />
            <Field id="me-gmail" label="E-Mail Erziehungsberechtigte(r)" type="email" disabled={!canEdit} value={f.guardianEmail} onChange={set("guardianEmail")} />
          </>
        )}
        <SelectField id="me-class" label="Beitragsklasse" disabled={!canEdit} value={f.feeClassId ?? ""} onChange={(e) => setF({ ...f, feeClassId: e.target.value || null })}>
          <option value="">Keine</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        <Field id="me-joined" label="Eintritt" type="date" required disabled={!canEdit} value={f.joinedOn} onChange={set("joinedOn")} />
        <TextareaField
          id="me-notes"
          label="Interne Notiz"
          rows={2}
          maxLength={500}
          disabled={!canEdit}
          value={f.notes}
          onChange={set("notes")}
          hint="Keine sensiblen Angaben (z. B. Gesundheit). Die Person darf ihre Daten inklusive Notiz per Auskunft einsehen."
          className="sm:col-span-2"
        />
        {canEdit ? (
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit">Speichern</Button>
            {saved && <Alert tone="success">Gespeichert.</Alert>}
          </div>
        ) : (
          <p className="text-xs text-muted sm:col-span-2">Nur der Vorstand kann Mitgliederdaten ändern.</p>
        )}
      </form>
    </Card>
  );
}
