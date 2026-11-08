"use client";

import { useState, type ChangeEvent } from "react";
import { EVENT_KINDS, type EventItem, type TeamItem } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { EVENT_KIND_LABEL } from "@/lib/events";
import { useBusy } from "@/lib/use-api";
import { Alert, Button, Field, SelectField, TextareaField } from "./ui";
import { ask } from "./ui-hosts";

/** ISO-Zeitpunkt als Wert fuer <input type="datetime-local"> (Ortszeit des Geraets). */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

type FormState = {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  description: string;
  teamId: string;
  visibility: string;
  kind: string;
  capacity: string;
  repeat: string;
  count: string;
};

const empty: FormState = { title: "", startsAt: "", endsAt: "", location: "", description: "", teamId: "", visibility: "members", kind: "other", capacity: "", repeat: "none", count: "8" };

function fromEvent(e: EventItem): FormState {
  return {
    ...empty,
    title: e.title,
    startsAt: toLocalInput(e.startsAt),
    endsAt: toLocalInput(e.endsAt),
    location: e.location,
    description: e.description,
    teamId: e.teamId ?? "",
    visibility: e.visibility,
    kind: e.kind,
    capacity: e.capacity === null ? "" : String(e.capacity),
  };
}

/**
 * Termin anlegen (slug + teams) oder bearbeiten (event). Beim Bearbeiten einer Serie fragt das Formular, ob die
 * Aenderung auch fuer die folgenden Termine gilt; Datum und Uhrzeit aendern sich immer nur bei diesem Termin.
 */
export function EventForm({
  slug,
  teams = [],
  event,
  onSaved,
  onCancel,
  idPrefix = "ev",
}: {
  slug?: string;
  teams?: TeamItem[];
  event?: EventItem;
  onSaved: (e: EventItem) => void;
  onCancel?: () => void;
  idPrefix?: string;
}) {
  const editing = !!event;
  const [form, setForm] = useState<FormState>(() => (event ? fromEvent(event) : empty));
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const id = (k: string) => `${idPrefix}-${k}`;
  const set = (k: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const capacity = form.capacity.trim() ? Number(form.capacity) : null;

  async function submit() {
    setError(null);
    try {
      if (event) {
        let scope: "single" | "series" = "single";
        if (event.seriesId) {
          const all = await ask("Gilt die Änderung auch für alle folgenden Termine der Serie? Datum und Uhrzeit ändern sich nur bei diesem Termin.", {
            title: "Serie bearbeiten",
            confirmLabel: "Auch folgende Termine",
            cancelLabel: "Nur diesen Termin",
          });
          scope = all ? "series" : "single";
        }
        const saved = await api<EventItem>(`/events/${event.id}`, {
          method: "PUT",
          body: {
            title: form.title,
            description: form.description,
            location: form.location,
            startsAt: new Date(form.startsAt).toISOString(),
            endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
            visibility: form.visibility,
            kind: form.kind,
            capacity,
            scope,
          },
        });
        onSaved(saved);
      } else {
        const saved = await api<EventItem>(`/orgs/${slug}/events`, {
          method: "POST",
          body: {
            title: form.title,
            description: form.description,
            location: form.location,
            startsAt: new Date(form.startsAt).toISOString(),
            endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
            teamId: form.teamId || undefined,
            visibility: form.visibility,
            kind: form.kind,
            capacity: capacity ?? undefined,
            repeat: form.repeat === "none" ? undefined : { freq: form.repeat, count: Number(form.count) },
          },
        });
        setForm(empty);
        onSaved(saved);
      }
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(submit);
      }}
    >
      <div className="sm:col-span-2">
        <Field id={id("title")} label="Titel" required minLength={3} maxLength={120} value={form.title} onChange={set("title")} />
      </div>
      <Field id={id("start")} label="Beginn" type="datetime-local" required value={form.startsAt} onChange={set("startsAt")} />
      <Field id={id("end")} label="Ende (optional)" type="datetime-local" value={form.endsAt} onChange={set("endsAt")} />
      <Field id={id("loc")} label="Ort" maxLength={120} value={form.location} onChange={set("location")} />
      <SelectField id={id("kind")} label="Art" value={form.kind} onChange={set("kind")}>
        {EVENT_KINDS.map((k) => (
          <option key={k} value={k}>{EVENT_KIND_LABEL[k]}</option>
        ))}
      </SelectField>
      {!editing && (
        <SelectField id={id("team")} label="Für" value={form.teamId} onChange={set("teamId")}>
          <option value="">Alle Mitglieder</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </SelectField>
      )}
      <SelectField id={id("vis")} label="Sichtbarkeit" value={form.visibility} onChange={set("visibility")}>
        <option value="members">Intern (nur Mitglieder / Team)</option>
        <option value="public">Öffentlich (auch Follower)</option>
      </SelectField>
      <Field
        id={id("cap")}
        label="Teilnehmerlimit (optional)"
        type="number"
        inputMode="numeric"
        min={1}
        max={10000}
        value={form.capacity}
        onChange={set("capacity")}
        hint={editing ? "Leer = unbegrenzt. Mehr Plätze holen Wartende automatisch nach." : "Leer = unbegrenzt. Ist der Termin voll, kommen weitere Zusagen auf die Warteliste."}
      />
      {!editing && (
        <SelectField id={id("repeat")} label="Wiederholung" value={form.repeat} onChange={set("repeat")}>
          <option value="none">Einmalig</option>
          <option value="weekly">Jede Woche</option>
          <option value="biweekly">Alle 2 Wochen</option>
          <option value="monthly">Jeden Monat</option>
        </SelectField>
      )}
      {!editing && form.repeat !== "none" && (
        <Field id={id("count")} label="Anzahl Termine (2–52)" type="number" min={2} max={52} required value={form.count} onChange={set("count")} />
      )}
      <TextareaField id={id("desc")} label="Beschreibung" rows={2} maxLength={1000} value={form.description} onChange={set("description")} className="sm:col-span-2" />
      {error && (
        <div className="sm:col-span-2">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" busy={busy}>{editing ? "Änderungen speichern" : "Termin anlegen"}</Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>Abbrechen</Button>
        )}
      </div>
    </form>
  );
}
