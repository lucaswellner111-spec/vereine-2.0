"use client";

import { HandHelping, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { EventItem, ShiftItem } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useApi, useBusy } from "@/lib/use-api";
import { toLocalInput } from "./event-form";
import { Avatar, Badge, Button, Card, Field, ListSkeleton, SectionTitle } from "./ui";
import { Dialog } from "./ui-client";
import { ask, toast } from "./ui-hosts";

const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const ended = (e: EventItem) => (e.endsAt ? new Date(e.endsAt) : new Date(new Date(e.startsAt).getTime() + 3 * 3600_000)) < new Date();

type Draft = { id?: string; title: string; slots: string; startsAt: string; endsAt: string };
const emptyDraft: Draft = { title: "", slots: "2", startsAt: "", endsAt: "" };

/**
 * Helferliste am Termin. Mitglieder tragen sich selbst ein (bei Team-Terminen nur das Team), Namen sehen nur
 * aktive Mitglieder. Vorstand/Moderation legen Dienste an, aendern, loeschen und tragen Personen aus.
 */
export function EventShifts({ event }: { event: EventItem }) {
  const shifts = useApi<ShiftItem[]>(`/events/${event.id}/shifts`);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, run] = useBusy();
  const list = shifts.data;
  const open = !event.canceled && !ended(event);

  const act = (fn: () => Promise<ShiftItem[] | void>) =>
    run(async () => {
      try {
        const next = await fn();
        if (next) shifts.setData(next);
        else shifts.reload();
      } catch (e) {
        toast.error(describeError(e));
      }
    });

  if (!list) return shifts.error ? null : <ListSkeleton rows={2} />;
  if (list.length === 0 && !event.canManage) return null;

  const save = () =>
    act(async () => {
      if (!draft) return;
      const body = {
        title: draft.title,
        slots: Number(draft.slots),
        startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
        endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      };
      const next = draft.id
        ? await api<ShiftItem[]>(`/shifts/${draft.id}`, { method: "PATCH", body })
        : await api<ShiftItem[]>(`/events/${event.id}/shifts`, { method: "POST", body });
      setDraft(null);
      return next;
    });

  return (
    <Card className="mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={HandHelping}>Helferliste</SectionTitle>
        {event.canManage && !event.canceled && (
          <Button size="sm" variant="secondary" onClick={() => setDraft(emptyDraft)}>
            <Plus size={14} aria-hidden /> Dienst hinzufügen
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Dienste. Lege fest, wobei Hilfe gebraucht wird, z. B. Aufbau oder Kuchenstand.</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((s) => {
            const full = s.taken >= s.slots;
            const canJoin = s.people !== undefined && open;
            return (
              <li key={s.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{s.title}</p>
                    <p className="text-xs text-muted">
                      {s.startsAt && `${timeFmt.format(new Date(s.startsAt))}${s.endsAt ? `–${timeFmt.format(new Date(s.endsAt))}` : ""} Uhr · `}
                      {s.taken}/{s.slots} belegt
                      {full && <> · <Badge>voll</Badge></>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canJoin &&
                      (s.mine ? (
                        <Button size="sm" variant="secondary" busy={busy} onClick={() => act(() => api<ShiftItem[]>(`/shifts/${s.id}/signup`, { method: "DELETE" }))}>
                          Austragen
                        </Button>
                      ) : (
                        <Button size="sm" disabled={full} busy={busy} onClick={() => act(() => api<ShiftItem[]>(`/shifts/${s.id}/signup`, { method: "PUT" }))}>
                          Eintragen
                        </Button>
                      ))}
                    {event.canManage && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Dienst ${s.title} bearbeiten`}
                          onClick={() => setDraft({ id: s.id, title: s.title, slots: String(s.slots), startsAt: toLocalInput(s.startsAt), endsAt: toLocalInput(s.endsAt) })}
                        >
                          <Pencil size={14} aria-hidden />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Dienst ${s.title} löschen`}
                          onClick={async () =>
                            (await ask(`Dienst „${s.title}“ löschen? Alle Eintragungen gehen verloren.`, { title: "Dienst löschen?", confirmLabel: "Löschen", danger: true })) &&
                            act(async () => void (await api(`/shifts/${s.id}`, { method: "DELETE" })))
                          }
                        >
                          <Trash2 size={14} aria-hidden />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {s.people && s.people.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Eingetragen bei ${s.title}`}>
                    {s.people.map((p) => (
                      <li key={p.userId} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pl-0.5 pr-2 text-sm">
                        <Avatar name={p.name} mediaId={p.avatarId} size={22} />
                        <span className="max-w-32 truncate">{p.name}</span>
                        {event.canManage && (
                          <button
                            type="button"
                            className="hit-area -mr-1 rounded-full p-0.5 text-muted hover:text-text"
                            aria-label={`${p.name} austragen`}
                            onClick={async () =>
                              (await ask(`${p.name} aus „${s.title}“ austragen?`, { title: "Austragen?", confirmLabel: "Austragen" })) &&
                              act(async () => void (await api(`/shifts/${s.id}/signups/${p.userId}`, { method: "DELETE" })))
                            }
                          >
                            <X size={12} aria-hidden />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Dienst bearbeiten" : "Dienst hinzufügen"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>Abbrechen</Button>
            <Button type="submit" form="shift-form" busy={busy}>Speichern</Button>
          </>
        }
      >
        {draft && (
          <form
            id="shift-form"
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field id="shift-title" label="Was ist zu tun?" required minLength={2} maxLength={80} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="sm:col-span-2" />
            <Field id="shift-slots" label="Plätze" type="number" required min={1} max={100} value={draft.slots} onChange={(e) => setDraft({ ...draft, slots: e.target.value })} />
            <span aria-hidden className="max-sm:hidden" />
            <Field id="shift-start" label="Von (optional)" type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
            <Field id="shift-end" label="Bis (optional)" type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} />
          </form>
        )}
      </Dialog>
    </Card>
  );
}
