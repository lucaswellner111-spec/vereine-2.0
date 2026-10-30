"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import type { EventItem, RsvpItem, TeamItem } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { Badge, Button, Card, Field } from "./ui";

const dateFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const empty = { title: "", startsAt: "", endsAt: "", location: "", description: "", teamId: "", visibility: "members" };

export function EventsAdmin({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const [form, setForm] = useState(empty);
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [people, setPeople] = useState<{ id: string; list: RsvpItem[] } | null>(null);

  const load = useCallback(() => {
    api<EventItem[]>(`/orgs/${slug}/events`).then(setEvents).catch((e) => onError(describeError(e)));
    api<TeamItem[]>(`/orgs/${slug}/teams`).then(setTeams).catch(() => setTeams([]));
  }, [slug, onError]);

  useEffect(() => {
    setEvents(null);
    setPeople(null);
    load();
  }, [load]);

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
            void run(async () => {
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
                },
              });
              setForm(empty);
              load();
            });
          }}
        >
          <div className="sm:col-span-2">
            <Field id="ev-title" label="Titel" required minLength={3} maxLength={120} value={form.title} onChange={set("title")} />
          </div>
          <Field id="ev-start" label="Beginn" type="datetime-local" required value={form.startsAt} onChange={set("startsAt")} />
          <Field id="ev-end" label="Ende (optional)" type="datetime-local" value={form.endsAt} onChange={set("endsAt")} />
          <Field id="ev-loc" label="Ort" maxLength={120} value={form.location} onChange={set("location")} />
          <div className="space-y-1.5">
            <label htmlFor="ev-team" className="text-sm font-medium">Für</label>
            <select id="ev-team" value={form.teamId} onChange={set("teamId")} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm">
              <option value="">Alle Mitglieder</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ev-vis" className="text-sm font-medium">Sichtbarkeit</label>
            <select id="ev-vis" value={form.visibility} onChange={set("visibility")} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm">
              <option value="members">Intern (nur Mitglieder / Team)</option>
              <option value="public">Öffentlich (auch Follower)</option>
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="ev-desc" className="text-sm font-medium">Beschreibung</label>
            <textarea
              id="ev-desc"
              rows={2}
              maxLength={1000}
              value={form.description}
              onChange={set("description")}
              className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Termin anlegen</Button>
          </div>
        </form>
      </Card>

      {events === null ? (
        <p className="text-sm text-muted" role="status">Lade …</p>
      ) : events.length === 0 ? (
        <Card><p className="text-sm text-muted">Keine kommenden Termine.</p></Card>
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
                        onClick={() =>
                          confirm("Termin absagen? Alle Zusagen werden benachrichtigt.") &&
                          run(async () => {
                            await api(`/events/${ev.id}/cancel`, { method: "POST", body: {} });
                            load();
                          })
                        }
                      >
                        Absagen
                      </Button>
                    )}
                  </div>
                </div>
                {people?.id === ev.id && (
                  <ul className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3 text-sm">
                    {people.list.length === 0 && <li className="text-xs text-muted">Noch keine Rückmeldungen.</li>}
                    {people.list.map((p) => (
                      <li key={p.userId} className="rounded-full bg-surface-2 px-3 py-1">
                        {p.name}{" "}
                        <span className="text-xs text-muted">{p.status === "yes" ? "✓" : p.status === "maybe" ? "?" : "✗"}</span>
                      </li>
                    ))}
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
