"use client";

import { useState, type FormEvent } from "react";
import type { FeeClassItem, FeeInterval } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { eurCents, parseEuroToCents } from "@/lib/money";
import { useApi, useBusy } from "@/lib/use-api";
import { Alert, Badge, Button, Card, CardSkeletons, EmptyState, ErrorState, Field, SelectField, TextareaField } from "./ui";
import { Dialog } from "./ui-client";
import { ask, toast } from "./ui-hosts";

const intervalLabel: Record<FeeInterval, string> = { monthly: "monatlich", quarterly: "vierteljährlich", halfyearly: "halbjährlich", yearly: "jährlich" };

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
