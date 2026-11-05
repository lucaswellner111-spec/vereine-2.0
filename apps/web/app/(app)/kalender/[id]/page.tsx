"use client";

import clsx from "clsx";
import { ArrowLeft, CalendarPlus, Clock, MapPin, Share2, Users } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import type { EventItem, RsvpItem, RsvpStatus } from "@vereine/shared";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { api, ApiError, describeError } from "@/lib/api";
import { withRsvp } from "@/lib/events";
import { shareLink } from "@/lib/share";
import { ask } from "@/components/ui-hosts";

const rsvpOptions: { id: RsvpStatus; label: string }[] = [
  { id: "yes", label: "Zusagen" },
  { id: "maybe", label: "Vielleicht" },
  { id: "no", label: "Absagen" },
];
const groupLabel: Record<RsvpStatus, string> = { yes: "Zugesagt", maybe: "Vielleicht", no: "Abgesagt" };
const dateFmt = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [event, setEvent] = useState<EventItem | null>(null);
  const [people, setPeople] = useState<RsvpItem[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const e = await api<EventItem>(`/events/${id}`);
      setEvent(e);
      if (e.canManage) setPeople(await api<RsvpItem[]>(`/events/${id}/participants`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(describeError(err));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function rsvp(status: RsvpStatus) {
    setError(null);
    const before = event;
    if (event) setEvent(withRsvp(event, status)); // sofort sichtbar
    try {
      setEvent(await api<EventItem>(`/events/${id}/rsvp`, { method: "PUT", body: { status } }));
      if (event?.canManage) setPeople(await api<RsvpItem[]>(`/events/${id}/participants`));
    } catch (e) {
      setEvent(before);
      setError(describeError(e));
    }
  }

  async function cancel(scope: "single" | "series") {
    const msg = scope === "series" ? "Diesen und alle folgenden Termine der Serie absagen? Alle Zusagen werden benachrichtigt." : "Termin absagen? Alle Zusagen werden benachrichtigt.";
    if (!(await ask(msg, { confirmLabel: "Ja" }))) return;
    setError(null);
    try {
      await api(`/events/${id}/cancel`, { method: "POST", body: { scope } });
      await load();
    } catch (e) {
      setError(describeError(e));
    }
  }

  if (notFound) {
    return (
      <Card>
        <p className="text-sm">Dieser Termin existiert nicht oder ist für dich nicht sichtbar.</p>
        <Link href="/kalender" className="mt-2 inline-block text-sm text-brand hover:underline">Zum Kalender</Link>
      </Card>
    );
  }
  if (!event) return <p className="text-sm text-muted" role="status">{error ?? "Lade …"}</p>;

  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : null;

  return (
    <>
      <Link href="/kalender" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft size={15} aria-hidden /> Kalender
      </Link>

      <Card className={clsx("space-y-5", event.canceled && "opacity-80")}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={clsx("text-2xl font-semibold tracking-tight", event.canceled && "line-through")}>{event.title}</h1>
            {event.canceled && <Badge tone="danger">abgesagt</Badge>}
            {event.seriesId && <Badge>Serie</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">
            <Link href={`/vereine/${event.orgSlug}`} className="hover:underline">{event.orgName}</Link>
            {event.teamName && <> · <Badge tone="brand">{event.teamName}</Badge></>}
            {" · "}{event.visibility === "public" ? "öffentlich" : "nur Mitglieder"}
          </p>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex gap-3">
            <Clock size={18} aria-hidden className="mt-0.5 shrink-0 text-muted" />
            <div>
              <dt className="sr-only">Wann</dt>
              <dd>
                <span className="block font-medium capitalize">{dateFmt.format(start)}</span>
                <span className="text-muted">{timeFmt.format(start)}{end && ` – ${timeFmt.format(end)}`} Uhr</span>
              </dd>
            </div>
          </div>
          {event.location && (
            <div className="flex gap-3">
              <MapPin size={18} aria-hidden className="mt-0.5 shrink-0 text-muted" />
              <div>
                <dt className="sr-only">Wo</dt>
                <dd className="font-medium">{event.location}</dd>
              </div>
            </div>
          )}
        </dl>

        {event.description && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{event.description}</p>}

        {!event.canceled && (
          <div>
            <h2 className="mb-2 text-sm font-semibold">Kommst du?</h2>
            <div className="grid grid-cols-3 gap-2 sm:flex" role="group" aria-label="Teilnahme">
              {rsvpOptions.map((o) => (
                <Button key={o.id} variant={event.myStatus === o.id ? "primary" : "secondary"} aria-pressed={event.myStatus === o.id} onClick={() => rsvp(o.id)}>
                  {o.label}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {event.counts.yes} Zusagen · {event.counts.maybe} vielleicht · {event.counts.no} Absagen
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <a href={`/api/events/${event.id}/ics`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2">
            <CalendarPlus size={16} aria-hidden /> In Kalender übernehmen
          </a>
          <Button variant="secondary" onClick={() => shareLink(event.title, `/kalender/${event.id}`)}>
            <Share2 size={16} aria-hidden /> Teilen
          </Button>
          {event.canManage && !event.canceled && (
            <>
              <Button variant="secondary" onClick={() => cancel("single")}>Termin absagen</Button>
              {event.seriesId && <Button variant="ghost" onClick={() => cancel("series")}>Serie ab hier absagen</Button>}
            </>
          )}
        </div>
        {error && <Alert>{error}</Alert>}
      </Card>

      {event.canManage && people && (
        <Card className="mt-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users size={16} aria-hidden /> Teilnehmer</h2>
          {people.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Rückmeldungen.</p>
          ) : (
            <div className="space-y-3">
              {(["yes", "maybe", "no"] as const).map((s) => {
                const list = people.filter((p) => p.status === s);
                return (
                  list.length > 0 && (
                    <div key={s}>
                      <p className="mb-1.5 text-xs font-medium text-muted">{groupLabel[s]} ({list.length})</p>
                      <ul className="flex flex-wrap gap-1.5">
                        {list.map((p) => (
                          <li key={p.userId} className="rounded-full bg-surface-2 px-3 py-1 text-sm">{p.name}</li>
                        ))}
                      </ul>
                    </div>
                  )
                );
              })}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
