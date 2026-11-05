"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EventItem } from "@vereine/shared";
import { EventCard } from "@/components/event-card";
import { Alert, Card, PageHeader, CardSkeletons } from "@/components/ui";
import { api, describeError } from "@/lib/api";

const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" });

export default function CalendarPage() {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<EventItem[]>("/events").then(setEvents).catch((e) => setError(describeError(e)));
  }, []);
  useEffect(load, [load]);

  const [org, setOrg] = useState("");
  const [range, setRange] = useState<"all" | "today" | "week" | "month">("all");
  const orgs = useMemo(() => [...new Map((events ?? []).map((e) => [e.orgSlug, e.orgName])).entries()], [events]);

  const filtered = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    if (range === "today") end.setHours(23, 59, 59, 999);
    else if (range === "week") end.setDate(now.getDate() + 7);
    else if (range === "month") end.setMonth(now.getMonth() + 1);
    return (events ?? []).filter((e) => (!org || e.orgSlug === org) && (range === "all" || new Date(e.startsAt) <= end));
  }, [events, org, range]);

  const byDay = useMemo(() => {
    const groups = new Map<string, EventItem[]>();
    for (const e of filtered) {
      const key = dayFmt.format(new Date(e.startsAt));
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return [...groups];
  }, [filtered]);

  return (
    <>
      <PageHeader title="Kalender" subtitle="Deine kommenden Termine aus allen Vereinen und Teams." />
      {error && <Alert>{error}</Alert>}
      {events && events.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5" role="group" aria-label="Zeitraum">
            {([["all", "Alle"], ["today", "Heute"], ["week", "7 Tage"], ["month", "Monat"]] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={range === id}
                onClick={() => setRange(id)}
                className={`h-9 rounded-full px-3.5 text-sm font-medium ${range === id ? "bg-brand text-brand-contrast" : "border border-border bg-surface text-muted hover:text-text"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {orgs.length > 1 && (
            <>
              <label htmlFor="cal-org" className="sr-only">Verein</label>
              <select id="cal-org" value={org} onChange={(e) => setOrg(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm">
                <option value="">Alle Vereine</option>
                {orgs.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
              </select>
            </>
          )}
        </div>
      )}
      {events === null ? (
        <CardSkeletons count={2} />
      ) : events.length === 0 || filtered.length === 0 ? (
        <Card>
          <p className="text-sm">{events.length === 0 ? "Keine kommenden Termine. Folge Vereinen oder werde Mitglied, um ihre Termine zu sehen." : "Keine Termine in diesem Zeitraum."}</p>
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
