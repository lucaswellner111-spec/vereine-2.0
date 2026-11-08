"use client";

import { Check, CircleHelp, Hourglass, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { EventItem, RsvpItem, RsvpState, TeamItem } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { capacityText, EVENT_KIND_LABEL, RSVP_STATUS_LABEL } from "@/lib/events";
import { useApi } from "@/lib/use-api";
import { EventForm } from "./event-form";
import { Badge, Button, Card, CardSkeletons, EmptyState, ErrorState, LinkButton } from "./ui";
import { ask } from "./ui-hosts";

const dateFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const RSVP_ICON: Record<RsvpState, typeof Check> = { yes: Check, maybe: CircleHelp, no: X, waitlist: Hourglass };

export function EventsAdmin({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const list = useApi<EventItem[]>(`/orgs/${slug}/events`);
  const events = list.data;
  const teamList = useApi<TeamItem[]>(`/orgs/${slug}/teams`);
  const teams = teamList.data ?? [];
  const [people, setPeople] = useState<{ id: string; list: RsvpItem[] } | null>(null);
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

  return (
    <div className="space-y-4">
      <Card>
        <EventForm key={slug} slug={slug} teams={teams} onSaved={() => load()} />
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
                      {ev.location && ` · ${ev.location}`} · {capacityText(ev)}, {ev.counts.maybe} vielleicht, {ev.counts.no} Absagen
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      <Badge>{EVENT_KIND_LABEL[ev.kind]}</Badge>
                      {ev.teamName && <Badge tone="brand">{ev.teamName}</Badge>}
                      {ev.visibility === "public" && <Badge>öffentlich</Badge>}
                      {ev.seriesId && <Badge>Serie</Badge>}
                      {ev.canceled && <Badge tone="danger">abgesagt</Badge>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <LinkButton size="sm" variant="secondary" href={`/kalender/${ev.id}`}>
                      Details
                    </LinkButton>
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
