"use client";

import clsx from "clsx";
import { CalendarPlus, CalendarX2, Clock, ExternalLink, MapPin, Share2, Users } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import type { EventAttendees, EventItem, RsvpItem, RsvpStatus } from "@vereine/shared";
import { Alert, ArrowLink, Avatar, BackLink, Badge, Button, Card, CardSkeletons, DetailHeader, EmptyState, ErrorState, LinkButton, SectionTitle } from "@/components/ui";
import { api, ApiError, describeError } from "@/lib/api";
import { RSVP_OPTIONS, RSVP_STATUS_LABEL, withRsvp } from "@/lib/events";
import { shareLink } from "@/lib/share";
import { ask, toast } from "@/components/ui-hosts";
import { usePageTitle } from "@/lib/use-page-title";

/** Reiner Link zur OpenStreetMap-Suche (nichts eingebettet, kein Request beim Laden). */
const mapUrl = (place: string) => `https://www.openstreetmap.org/search?query=${encodeURIComponent(place)}`;
const MAX_FACES = 12;

const dateFmt = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [event, setEvent] = useState<EventItem | null>(null);
  const [people, setPeople] = useState<RsvpItem[] | null>(null);
  const [attendees, setAttendees] = useState<EventAttendees | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const e = await api<EventItem>(`/events/${id}`);
      setEvent(e);
      const [list, att] = await Promise.all([
        e.canManage ? api<RsvpItem[]>(`/events/${id}/participants`) : Promise.resolve(null),
        api<EventAttendees>(`/events/${id}/attendees`).catch(() => null),
      ]);
      setPeople(list);
      setAttendees(att);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setLoadError(describeError(err));
    }
  }, [id]);
  usePageTitle(event?.title ?? null);
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
      setAttendees(await api<EventAttendees>(`/events/${id}/attendees`).catch(() => null));
    } catch (e) {
      setEvent(before);
      setError(describeError(e));
    }
  }

  async function cancel(scope: "single" | "series") {
    const msg = scope === "series" ? "Diesen und alle folgenden Termine der Serie absagen? Alle Zusagen werden benachrichtigt." : "Termin absagen? Alle Zusagen werden benachrichtigt.";
    const label = scope === "series" ? "Serie absagen" : "Termin absagen";
    if (!(await ask(msg, { title: `${label}?`, confirmLabel: label, cancelLabel: "Nicht absagen", danger: true }))) return;
    setError(null);
    try {
      await api(`/events/${id}/cancel`, { method: "POST", body: { scope } });
      toast.success(scope === "series" ? "Serie abgesagt." : "Termin abgesagt.");
      await load();
    } catch (e) {
      setError(describeError(e));
    }
  }

  if (notFound) {
    return (
      <EmptyState icon={CalendarX2} title="Diesen Termin gibt es nicht." action={<ArrowLink href="/kalender">Zum Kalender</ArrowLink>}>
        Er wurde gelöscht oder ist für dich nicht sichtbar.
      </EmptyState>
    );
  }
  if (!event) return loadError ? <ErrorState message={loadError} onRetry={() => void load()} /> : <CardSkeletons count={1} />;

  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : null;

  return (
    <>
      <BackLink href="/kalender">Kalender</BackLink>

      <Card className={clsx("space-y-5", event.canceled && "opacity-80")}>
        <DetailHeader
          title={event.title}
          titleClassName={event.canceled ? "line-through" : undefined}
          badges={
            <>
              {event.canceled && <Badge tone="danger">abgesagt</Badge>}
              {event.seriesId && <Badge>Serie</Badge>}
            </>
          }
          subtitle={
            <>
              <Link href={`/vereine/${event.orgSlug}`} className="hover:underline">{event.orgName}</Link>
              {event.teamName && <> · <Badge tone="brand">{event.teamName}</Badge></>}
              {" · "}{event.visibility === "public" ? "öffentlich" : "nur Mitglieder"}
            </>
          }
        />

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
                <dd>
                  <span className="block font-medium">{event.location}</span>
                  <a href={mapUrl(event.location)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 text-brand hover:underline">
                    Auf Karte öffnen <ExternalLink size={12} aria-hidden />
                    <span className="sr-only">(OpenStreetMap, neues Fenster)</span>
                  </a>
                </dd>
              </div>
            </div>
          )}
        </dl>

        {event.description && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{event.description}</p>}

        {!event.canceled && (
          <div>
            <SectionTitle className="mb-2">Kommst du?</SectionTitle>
            <div className="grid grid-cols-3 gap-2 sm:flex" role="group" aria-label="Teilnahme">
              {RSVP_OPTIONS.map((o) => (
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

        {attendees?.visible && attendees.people.length > 0 && (
          <div>
            <SectionTitle className="mb-2">Dabei sind</SectionTitle>
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-label={`${attendees.total} Zusagen`}>
              {attendees.people.slice(0, MAX_FACES).map((p) => (
                <li key={p.userId}>
                  {p.handle ? (
                    <Link href={`/profil/${p.handle}`} className="flex items-center gap-1.5 rounded-full pr-2 text-sm hover:bg-surface-2">
                      <Avatar name={p.name} mediaId={p.avatarId} size={28} />
                      <span className="max-w-32 truncate">{p.name}</span>
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm">
                      <Avatar name={p.name} mediaId={p.avatarId} size={28} />
                      <span className="max-w-32 truncate">{p.name}</span>
                    </span>
                  )}
                </li>
              ))}
              {attendees.people.length > MAX_FACES && <li className="text-sm text-muted">und {attendees.people.length - MAX_FACES} weitere</li>}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <LinkButton native variant="secondary" href={`/api/events/${event.id}/ics`}>
            <CalendarPlus size={16} aria-hidden /> In Kalender übernehmen
          </LinkButton>
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
          <SectionTitle icon={Users} className="mb-3">Teilnehmer (nur für die Verwaltung)</SectionTitle>
          {people.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Rückmeldungen.</p>
          ) : (
            <div className="space-y-3">
              {(["yes", "maybe", "no"] as const).map((s) => {
                const list = people.filter((p) => p.status === s);
                return (
                  list.length > 0 && (
                    <div key={s}>
                      <p className="mb-1.5 text-xs font-medium text-muted">{RSVP_STATUS_LABEL[s]} ({list.length})</p>
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
