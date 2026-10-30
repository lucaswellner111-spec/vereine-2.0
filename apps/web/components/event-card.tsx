"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import type { EventItem, RsvpStatus } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { Alert, Badge, Button, Card } from "./ui";

const rsvpOptions: { id: RsvpStatus; label: string }[] = [
  { id: "yes", label: "Zusagen" },
  { id: "maybe", label: "Vielleicht" },
  { id: "no", label: "Absagen" },
];

const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

export function EventCard({ event, onChange }: { event: EventItem; onChange: (e: EventItem) => void }) {
  const [error, setError] = useState<string | null>(null);

  async function rsvp(status: RsvpStatus) {
    setError(null);
    try {
      onChange(await api<EventItem>(`/events/${event.id}/rsvp`, { method: "PUT", body: { status } }));
    } catch (e) {
      setError(describeError(e));
    }
  }

  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : null;

  return (
    <Card className={clsx(event.canceled && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={clsx("font-semibold", event.canceled && "line-through")}>{event.title}</p>
          <p className="mt-0.5 text-sm text-muted">
            {timeFmt.format(start)}
            {end && ` – ${timeFmt.format(end)}`} Uhr
            {event.location && ` · ${event.location}`}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <Link href={`/vereine/${event.orgSlug}`} className="hover:underline">{event.orgName}</Link>
            {event.teamName && <Badge tone="brand">{event.teamName}</Badge>}
            {event.visibility === "public" && <Badge>öffentlich</Badge>}
            {event.canceled && <Badge tone="danger">abgesagt</Badge>}
          </p>
        </div>
        <a
          href={`/api/events/${event.id}/ics`}
          className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text"
          aria-label={`${event.title} in den Kalender übernehmen (.ics)`}
        >
          + Kalender
        </a>
      </div>
      {event.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{event.description}</p>}

      {!event.canceled && (
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Teilnahme">
          {rsvpOptions.map((o) => (
            <Button
              key={o.id}
              size="sm"
              variant={event.myStatus === o.id ? "primary" : "secondary"}
              aria-pressed={event.myStatus === o.id}
              onClick={() => rsvp(o.id)}
            >
              {o.label}
            </Button>
          ))}
          <span className="text-xs text-muted">
            {event.counts.yes} Zusagen · {event.counts.maybe} vielleicht · {event.counts.no} Absagen
          </span>
        </div>
      )}
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </Card>
  );
}

