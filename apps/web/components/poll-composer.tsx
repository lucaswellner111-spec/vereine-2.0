"use client";

import { Plus, X } from "lucide-react";
import { POLL_MAX_DAYS, POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, type PollInput } from "@vereine/shared";
import { Button, Field, Input } from "./ui";

export type PollDraft = { question: string; options: string[]; closesOn: string };
export const emptyPollDraft = (): PollDraft => ({ question: "", options: ["", ""], closesOn: "" });

/** Lokales Datum JJJJ-MM-TT (fuer input[type=date] min/max). */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Spaetestes Enddatum: so, dass "Ende des Tages" sicher innerhalb der 90 Tage liegt. */
export const pollMaxDate = (now = new Date()) => ymd(new Date(now.getTime() + (POLL_MAX_DAYS - 1) * 86400_000));
export const pollMinDate = (now = new Date()) => ymd(now);

/**
 * Entwurf -> API-Eingabe oder Fehlertext (gleiche Regeln wie die API: 2-6 Antworten, keine Doppelten,
 * Ende in der Zukunft, hoechstens 90 Tage). Leere Antwortzeilen werden ignoriert; Ende = 23:59 Uhr des Tages.
 */
export function pollDraftToInput(d: PollDraft, now = new Date()): { input: PollInput } | { error: string } {
  const question = d.question.trim();
  const options = d.options.map((o) => o.trim()).filter(Boolean);
  if (question.length < 3) return { error: "Die Frage braucht mindestens 3 Zeichen." };
  if (options.length < POLL_MIN_OPTIONS) return { error: "Mindestens zwei Antworten angeben." };
  if (new Set(options.map((o) => o.toLocaleLowerCase("de"))).size !== options.length) return { error: "Antworten dürfen sich nicht wiederholen." };
  if (!d.closesOn) return { input: { question, options } };
  const end = new Date(`${d.closesOn}T23:59:00`);
  if (Number.isNaN(end.getTime()) || end <= now) return { error: "Das Ende muss in der Zukunft liegen." };
  if (end.getTime() > now.getTime() + POLL_MAX_DAYS * 86400_000) return { error: `Höchstens ${POLL_MAX_DAYS} Tage Laufzeit.` };
  return { input: { question, options, closesAt: end.toISOString() } };
}

/** Eingabe einer Umfrage im Beitragsfeld (Frage, 2-6 Antworten, optionales Enddatum). */
export function PollComposer({ value, onChange, error }: { value: PollDraft; onChange: (d: PollDraft) => void; error?: string | null }) {
  const setOption = (i: number, v: string) => onChange({ ...value, options: value.options.map((o, j) => (j === i ? v : o)) });
  return (
    <fieldset className="mt-3 space-y-2 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-semibold">Umfrage</legend>
      <Field id="poll-question" label="Frage" value={value.question} maxLength={200} onChange={(e) => onChange({ ...value, question: e.target.value })} placeholder="Wann sollen wir grillen?" />
      <ol className="space-y-2" aria-label="Antworten">
        {value.options.map((o, i) => (
          <li key={i} className="flex items-center gap-2">
            <label htmlFor={`poll-option-${i}`} className="sr-only">Antwort {i + 1}</label>
            <Input id={`poll-option-${i}`} value={o} maxLength={80} onChange={(e) => setOption(i, e.target.value)} placeholder={`Antwort ${i + 1}`} className="min-w-0 flex-1" />
            {value.options.length > POLL_MIN_OPTIONS && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Antwort ${i + 1} entfernen`}
                onClick={() => onChange({ ...value, options: value.options.filter((_, j) => j !== i) })}
                className="w-10 px-0"
              >
                <X size={14} aria-hidden />
              </Button>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-end gap-3">
        {value.options.length < POLL_MAX_OPTIONS && (
          <Button variant="secondary" size="sm" onClick={() => onChange({ ...value, options: [...value.options, ""] })}>
            <Plus size={14} aria-hidden /> Antwort
          </Button>
        )}
        <Field
          id="poll-closes"
          type="date"
          size="sm"
          label="Endet am (optional)"
          value={value.closesOn}
          min={pollMinDate()}
          max={pollMaxDate()}
          onChange={(e) => onChange({ ...value, closesOn: e.target.value })}
          className="ml-auto w-44"
        />
      </div>
      <p className="text-xs text-muted">Eine Stimme je Person, bis zum Ende änderbar. Abstimmungen sind anonym: Es werden nur Zahlen angezeigt.</p>
      {error && <p className="text-xs text-danger">{error}</p>}
    </fieldset>
  );
}
