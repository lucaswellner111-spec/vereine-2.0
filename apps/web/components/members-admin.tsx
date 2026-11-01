"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { FeeClassItem, FeeInterval, MemberRecord, MemberRegistryPage, OrgDashboard } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { dateDe, eurCents, parseEuroToCents } from "@/lib/money";
import { Alert, Badge, Button, Card, ConceptNote, Field } from "./ui";

const intervalLabel: Record<FeeInterval, string> = { monthly: "monatlich", quarterly: "vierteljährlich", halfyearly: "halbjährlich", yearly: "jährlich" };
const roleLabel = { admin: "Vorstand", treasurer: "Kassenwart", moderator: "Moderation", member: "Mitglied" } as const;
const PAGE = 50;

// --- Übersicht -------------------------------------------------------------------------

export function DashboardPanel({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const [d, setD] = useState<OrgDashboard | null>(null);
  useEffect(() => {
    setD(null);
    api<OrgDashboard>(`/orgs/${slug}/dashboard`).then(setD).catch((e) => onError(describeError(e)));
  }, [slug, onError]);
  if (!d) return <p className="text-sm text-muted" role="status">Lade …</p>;
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
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Eintritte je Monat</h3>
          <div className="flex h-24 items-end gap-1" role="img" aria-label="Eintritte der letzten 12 Monate">
            {d.joinsByMonth.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${m.month}: ${m.joins}`}>
                <div className="w-full rounded-t bg-brand/70" style={{ height: `${(m.joins / maxJoins) * 100}%`, minHeight: m.joins ? 4 : 1 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted"><span>{d.joinsByMonth[0]?.month}</span><span>{d.joinsByMonth[11]?.month}</span></div>
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Mitglieder nach Beitragsklasse</h3>
          <ul className="space-y-1 text-sm">
            {d.byFeeClass.length === 0 && <li className="text-muted">Noch keine Daten.</li>}
            {d.byFeeClass.map((c) => (
              <li key={c.name} className="flex justify-between"><span>{c.name}</span><span className="text-muted">{c.members}</span></li>
            ))}
          </ul>
        </Card>
      </div>
      <Card>
        <h3 className="mb-3 text-sm font-semibold">Nächste Termine</h3>
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

export function FeeClassesAdmin({ slug, canEdit, onError }: { slug: string; canEdit: boolean; onError: (m: string | null) => void }) {
  const [rows, setRows] = useState<FeeClassItem[] | null>(null);
  const [form, setForm] = useState({ name: "", amount: "", interval: "yearly" as FeeInterval, description: "" });

  const load = useCallback(() => {
    api<FeeClassItem[]>(`/orgs/${slug}/fee-classes`).then(setRows).catch((e) => onError(describeError(e)));
  }, [slug, onError]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuroToCents(form.amount);
    if (cents === null) return onError("Bitte einen gültigen Betrag eingeben, z. B. 120 oder 12,50.");
    onError(null);
    try {
      setRows(await api<FeeClassItem[]>(`/orgs/${slug}/fee-classes`, { method: "POST", body: { name: form.name, amountCents: cents, interval: form.interval, description: form.description } }));
      setForm({ name: "", amount: "", interval: "yearly", description: "" });
    } catch (err) {
      onError(describeError(err));
    }
  }

  async function remove(c: FeeClassItem) {
    if (!confirm(`„${c.name}“ löschen? ${c.members} Mitglieder verlieren diese Zuordnung.`)) return;
    onError(null);
    try {
      await api(`/orgs/${slug}/fee-classes/${c.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      onError(describeError(err));
    }
  }

  return (
    <div className="space-y-4">
      <ConceptNote>Beitragsklassen sind die Grundlage für den Beitragslauf (Serienrechnungen), der als Nächstes folgt. Betrag je Intervall.</ConceptNote>
      {canEdit && (
        <Card>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_8rem_9rem_auto] sm:items-end">
            <Field id="fc-name" label="Name" required minLength={2} maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Erwachsene" />
            <Field id="fc-amount" label="Betrag (€)" required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <div className="space-y-1.5">
              <label htmlFor="fc-int" className="text-sm font-medium">Intervall</label>
              <select id="fc-int" value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value as FeeInterval })} className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm">
                {Object.entries(intervalLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <Button type="submit">Anlegen</Button>
          </form>
        </Card>
      )}
      {rows === null ? (
        <p className="text-sm text-muted" role="status">Lade …</p>
      ) : rows.length === 0 ? (
        <Card><p className="text-sm text-muted">Noch keine Beitragsklassen.</p></Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {rows.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="min-w-0 flex-1 font-medium">{c.name}</span>
              <span>{eurCents(c.amountCents)} {intervalLabel[c.interval]}</span>
              <Badge>{c.members} {c.members === 1 ? "Mitglied" : "Mitglieder"}</Badge>
              {canEdit && <Button size="sm" variant="ghost" onClick={() => remove(c)}>Löschen</Button>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// --- Mitgliederliste ------------------------------------------------------------------------

export function MemberRegistry({ slug, isAdmin, onError }: { slug: string; isAdmin: boolean; onError: (m: string | null) => void }) {
  const [page, setPage] = useState<MemberRegistryPage | null>(null);
  const [classes, setClasses] = useState<FeeClassItem[]>([]);
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<MemberRecord | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (q.trim()) p.set("q", q.trim());
    if (cls) p.set("feeClassId", cls);
    api<MemberRegistryPage>(`/orgs/${slug}/member-registry?${p}`).then(setPage).catch((e) => onError(describeError(e)));
  }, [slug, q, cls, offset, onError]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    api<FeeClassItem[]>(`/orgs/${slug}/fee-classes`).then(setClasses).catch(() => setClasses([]));
  }, [slug]);

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
        <input id="mr-q" type="search" placeholder="Name, Nummer oder Ort" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} className="h-9 w-56 rounded-lg border border-border bg-surface px-3 text-sm" />
        <label htmlFor="mr-cls" className="sr-only">Beitragsklasse</label>
        <select id="mr-cls" value={cls} onChange={(e) => { setCls(e.target.value); setOffset(0); }} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm">
          <option value="">Alle Beitragsklassen</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {isAdmin && <a href={`/api/orgs/${slug}/member-registry.csv`} className="ml-auto inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm hover:bg-surface-2">CSV-Export</a>}
      </div>
      {isAdmin && <p className="text-xs text-muted">Der Export wird protokolliert. Gib Mitgliederdaten nur an Personen weiter, die sie für Vereinszwecke brauchen.</p>}

      {page === null ? (
        <p className="text-sm text-muted" role="status">Lade …</p>
      ) : page.items.length === 0 ? (
        <Card><p className="text-sm text-muted">Keine Mitglieder gefunden.</p></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr><th className="p-3 font-medium">Nr.</th><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Rolle</th><th className="p-3 font-medium">Ort</th><th className="p-3 font-medium">Beitragsklasse</th><th className="p-3 font-medium">Eintritt</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {page.items.map((m) => (
                <tr key={m.userId} className="border-b border-border last:border-0">
                  <td className="p-3 font-mono text-xs">{m.memberNo}</td>
                  <td className="p-3">{m.name} {m.minor && <Badge tone="accent">minderjährig</Badge>}</td>
                  <td className="p-3 text-muted">{roleLabel[m.role]}</td>
                  <td className="p-3 text-muted">{m.city || "–"}</td>
                  <td className="p-3 text-muted">{m.feeClassName ?? "–"}</td>
                  <td className="p-3 text-muted">{dateDe(m.joinedOn)}</td>
                  <td className="p-3 text-right"><Button size="sm" variant="secondary" onClick={() => show(m.userId)}>{isAdmin ? "Bearbeiten" : "Ansehen"}</Button></td>
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
        <h3 className="font-semibold">{record.name} <span className="text-sm font-normal text-muted">· Nr. {record.memberNo}</span></h3>
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
        <div className="space-y-1.5">
          <label htmlFor="me-class" className="text-sm font-medium">Beitragsklasse</label>
          <select id="me-class" disabled={!canEdit} value={f.feeClassId ?? ""} onChange={(e) => setF({ ...f, feeClassId: e.target.value || null })} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm disabled:opacity-60">
            <option value="">Keine</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <Field id="me-joined" label="Eintritt" type="date" required disabled={!canEdit} value={f.joinedOn} onChange={set("joinedOn")} />
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="me-notes" className="text-sm font-medium">Interne Notiz</label>
          <textarea id="me-notes" rows={2} maxLength={500} disabled={!canEdit} value={f.notes} onChange={set("notes")} className="w-full resize-none rounded-lg border border-border bg-bg p-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60" />
          <p className="text-xs text-muted">Keine sensiblen Angaben (z. B. Gesundheit). Die Person darf ihre Daten inklusive Notiz per Auskunft einsehen.</p>
        </div>
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
