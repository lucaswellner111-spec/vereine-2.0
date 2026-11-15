"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { FeeClassItem, MemberRecord, MemberRegistryPage } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { dateDe } from "@/lib/money";
import { ROLE_LABEL } from "@/lib/labels";
import { useApi } from "@/lib/use-api";
import clsx from "clsx";
import { Alert, Badge, Button, Card, CardSkeletons, CellLabel, EmptyState, ErrorState, Field, Input, LinkButton, Select, SelectField, Skeleton, stackTable, TextareaField, UserNameLink } from "./ui";

import dynamic from "next/dynamic";

// CSV-Import erst beim Oeffnen nachladen
const MemberImport = dynamic(() => import("./member-import").then((m) => m.MemberImport), { loading: () => <Skeleton className="h-40 w-full" /> });

const PAGE = 50;

// --- Mitgliederliste ------------------------------------------------------------------------

export function MemberRegistry({ slug, isAdmin, onError }: { slug: string; isAdmin: boolean; onError: (m: string | null) => void }) {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<MemberRecord | null>(null);
  const [importOpen, setImportOpen] = useState(false);
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
        {isAdmin && (
          <div className="flex gap-2 max-sm:w-full sm:ml-auto">
            <Button size="sm" variant={importOpen ? "primary" : "secondary"} aria-expanded={importOpen} aria-controls="member-import" onClick={() => setImportOpen(!importOpen)} className="max-sm:flex-1">CSV-Import</Button>
            <LinkButton native size="sm" variant="secondary" href={`/api/orgs/${slug}/member-registry.csv`} className="max-sm:flex-1">CSV-Export</LinkButton>
          </div>
        )}
      </div>
      {isAdmin && importOpen && (
        <section id="member-import" aria-label="Mitglieder importieren">
          <MemberImport slug={slug} onImported={load} />
        </section>
      )}
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
                  <td className={stackTable.td}><CellLabel>Nr.</CellLabel><span className="tabular-nums text-muted">{m.memberNo}</span></td>
                  <td className={stackTable.tdMain}><UserNameLink handle={m.handle} name={m.name} /> {m.youth ? <Badge tone="brand">Jugend</Badge> : m.minor && <Badge tone="accent">minderjährig</Badge>}{m.youth && m.guardianName && <span className="block text-xs text-muted">Elternteil: {m.guardianName}</span>}</td>
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
