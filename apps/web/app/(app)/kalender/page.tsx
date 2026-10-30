"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EventItem } from "@vereine/shared";
import { EventCard } from "@/components/event-card";
import { Alert, Card, PageHeader } from "@/components/ui";
import { api, describeError } from "@/lib/api";

const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" });

export default function CalendarPage() {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<EventItem[]>("/events").then(setEvents).catch((e) => setError(describeError(e)));
  }, []);
  useEffect(load, [load]);

  const byDay = useMemo(() => {
    const groups = new Map<string, EventItem[]>();
    for (const e of events ?? []) {
      const key = dayFmt.format(new Date(e.startsAt));
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return [...groups];
  }, [events]);

  return (
    <>
      <PageHeader title="Kalender" subtitle="Deine kommenden Termine aus allen Vereinen und Teams." />
      {error && <Alert>{error}</Alert>}
      {events === null ? (
        <p className="text-sm text-muted" role="status">Lade …</p>
      ) : events.length === 0 ? (
        <Card>
          <p className="text-sm">Keine kommenden Termine. Folge Vereinen oder werde Mitglied, um ihre Termine zu sehen.</p>
          <Link href="/vereine" className="mt-3 inline-block text-sm font-medium text-brand hover:underline">Vereine entdecken →</Link>
        </Card>
      ) : (
        <div className="space-y-6">
          {byDay.map(([day, items]) => (
            <section key={day} aria-label={day}>
              <h2 className="mb-2 text-sm font-semibold capitalize text-muted">{day}</h2>
              <ul className="space-y-3">
                {items.map((e) => (
                  <li key={e.id}>
                    <EventCard event={e} onChange={(u) => setEvents((l) => (l ?? []).map((x) => (x.id === u.id ? u : x)))} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
