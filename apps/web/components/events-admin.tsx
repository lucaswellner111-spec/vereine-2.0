"use client";

import { Check, CircleHelp, X } from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import type { EventItem, RsvpItem, RsvpStatus, TeamItem } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { RSVP_STATUS_LABEL } from "@/lib/events";
import { useApi, useBusy } from "@/lib/use-api";
import { Badge, Button, Card, CardSkeletons, EmptyState, ErrorState, Field, SelectField, TextareaField } from "./ui";
import { ask } from "./ui-hosts";

const dateFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const RSVP_ICON: Record<RsvpStatus, typeof Check> = { yes: Check, maybe: CircleHelp, no: X };
const empty = { title: "", startsAt: "", endsAt: "", location: "", description: "", teamId: "", visibility: "members", repeat: "none", count: "8" };

export function EventsAdmin({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const [form, setForm] = useState(empty);
  const list = useApi<EventItem[]>(`/orgs/${slug}/events`);
  const events = list.data;
  const teamList = useApi<TeamItem[]>(`/orgs/${slug}/teams`);
  const teams = teamList.data ?? [];
  const [people, setPeople] = useState<{ id: string; list: RsvpItem[] } | null>(null);
  const [creating, runCreate] = useBusy();
  const load = list.reload;

  useEffect(() => setPeople(null), [slug]);

  const run = async (fn: () => Promise<unknown>) => {
    onError(null);
    try {
      await fn();
    } catch (e) {
      onError(describeError(e));
    }
  };

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <Card>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runCreate(() => run(async () => {
              await api(`/orgs/${slug}/events`, {
                method: "POST",
                body: {
                  title: form.title,
                  description: form.description,
                  location: form.location,
                  startsAt: new Date(form.startsAt).toISOString(),
                  endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
                  teamId: form.teamId || undefined,
                  visibility: form.visibility,
                  repeat: form.repeat === "none" ? undefined : { freq: form.repeat, count: Number(form.count) },
                },
              });
              setForm(empty);
              load();
            }));
          }}
        >
          <div className="sm:col-span-2">
            <Field id="ev-title" label="Titel" required minLength={3} maxLength={120} value={form.title} onChange={set("title")} />
          </div>
          <Field id="ev-start" label="Beginn" type="datetime-local" required value={form.startsAt} onChange={set("startsAt")} />
          <Field id="ev-end" label="Ende (optional)" type="datetime-local" value={form.endsAt} onChange={set("endsAt")} />
          <Field id="ev-loc" label="Ort" maxLength={120} value={form.location} onChange={set("location")} />
          <SelectField id="ev-team" label="Für" value={form.teamId} onChange={set("teamId")}>
            <option value="">Alle Mitglieder</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </SelectField>
          <SelectField id="ev-vis" label="Sichtbarkeit" value={form.visibility} onChange={set("visibility")}>
            <option value="members">Intern (nur Mitglieder / Team)</option>
            <option value="public">Öffentlich (auch Follower)</option>
          </SelectField>
          <SelectField id="ev-repeat" label="Wiederholung" value={form.repeat} onChange={set("repeat")}>
            <option value="none">Einmalig</option>
            <option value="weekly">Jede Woche</option>
            <option value="biweekly">Alle 2 Wochen</option>
            <option value="monthly">Jeden Monat</option>
          </SelectField>
          {form.repeat !== "none" && <Field id="ev-count" label="Anzahl Termine (2–52)" type="number" min={2} max={52} required value={form.count} onChange={set("count")} />}
          <TextareaField id="ev-desc" label="Beschreibung" rows={2} maxLength={1000} value={form.description} onChange={set("description")} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <Button type="submit" busy={creating}>Termin anlegen</Button>
          </div>
        </form>
      </Card>

      {list.error && !events ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : events === null ? (
        <CardSkeletons count={2} />
      ) : events.length === 0 ? (
        <EmptyState title="Keine kommenden Termine." />
      ) : (
        <ul className="space-y-3">
          {events.map((ev) => (
            <li key={ev.id}>
              <Card className={ev.canceled ? "opacity-60" : ""}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={ev.canceled ? "font-medium line-through" : "font-medium"}>{ev.title}</p>
                    <p className="text-xs text-muted">
                      {dateFmt.format(new Date(ev.startsAt))}
                      {ev.location && ` · ${ev.location}`} · {ev.counts.yes} Zusagen, {ev.counts.maybe} vielleicht, {ev.counts.no} Absagen
                    </p>
                    <p className="mt-1 flex gap-1.5">
                      {ev.teamName && <Badge tone="brand">{ev.teamName}</Badge>}
                      {ev.visibility === "public" && <Badge>öffentlich</Badge>}
                      {ev.seriesId && <Badge>Serie</Badge>}
                      {ev.canceled && <Badge tone="danger">abgesagt</Badge>}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        run(async () =>
                          setPeople(people?.id === ev.id ? null : { id: ev.id, list: await api<RsvpItem[]>(`/events/${ev.id}/participants`) }),
                        )
                      }
                    >
                      Teilnehmer
                    </Button>
                    {!ev.canceled && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () =>
                          await ask(`„${ev.title}“ absagen? Alle Zusagen werden benachrichtigt.`, { title: "Termin absagen?", confirmLabel: "Termin absagen", cancelLabel: "Nicht absagen", danger: true }) &&
                          run(async () => {
                            await api(`/events/${ev.id}/cancel`, { method: "POST", body: {} });
                            load();
                          })
                        }
                      >
                        Absagen
                      </Button>
                    )}
                    {!ev.canceled && ev.seriesId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () =>
                          await ask("Diesen und alle folgenden Termine der Serie absagen? Alle Zusagen werden benachrichtigt.", { title: "Serie absagen?", confirmLabel: "Serie absagen", cancelLabel: "Nicht absagen", danger: true }) &&
                          run(async () => {
                            await api(`/events/${ev.id}/cancel`, { method: "POST", body: { scope: "series" } });
                            load();
                          })
                        }
                      >
                        Serie ab hier absagen
                      </Button>
                    )}
                  </div>
                </div>
                {people?.id === ev.id && (
                  <ul className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3 text-sm">
                    {people.list.length === 0 && <li className="text-xs text-muted">Noch keine Rückmeldungen.</li>}
                    {people.list.map((p) => {
                      const Icon = RSVP_ICON[p.status];
                      return (
                        <li key={p.userId} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1">
                          {p.name}
                          <Icon size={12} aria-hidden className="text-muted" />
                          <span className="sr-only">{RSVP_STATUS_LABEL[p.status]}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
