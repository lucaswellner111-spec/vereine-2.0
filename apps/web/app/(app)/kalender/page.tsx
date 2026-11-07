"use client";

import { useMemo, useState } from "react";
import type { EventItem } from "@vereine/shared";
import { EventCard } from "@/components/event-card";
import { ArrowLink, CardSkeletons, EmptyState, ErrorState, PageHeader, Select } from "@/components/ui";
import { SearchField, SegmentedControl } from "@/components/ui-client";
import { useApi } from "@/lib/use-api";

type Range = "all" | "today" | "week" | "month";
const RANGES: { value: Range; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "today", label: "Heute" },
  { value: "week", label: "7 Tage" },
  { value: "month", label: "Monat" },
];

const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" });

export default function CalendarPage() {
  const list = useApi<EventItem[]>("/events", { refreshOnFocus: true });
  const events = list.data;

  const [org, setOrg] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [q, setQ] = useState("");
  const orgs = useMemo(() => [...new Map((events ?? []).map((e) => [e.orgSlug, e.orgName])).entries()], [events]);

  const filtered = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    if (range === "today") end.setHours(23, 59, 59, 999);
    else if (range === "week") end.setDate(now.getDate() + 7);
    else if (range === "month") end.setMonth(now.getMonth() + 1);
    const term = q.trim().toLowerCase();
    const hit = (e: EventItem) => !term || [e.title, e.location, e.orgName, e.teamName ?? ""].some((s) => s.toLowerCase().includes(term));
    return (events ?? []).filter((e) => (!org || e.orgSlug === org) && (range === "all" || new Date(e.startsAt) <= end) && hit(e));
  }, [events, org, range, q]);

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
      {events && events.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchField id="cal-q" label="Termine durchsuchen" value={q} onChange={setQ} placeholder="Titel, Ort oder Verein …" className="w-full sm:w-64" />
          <SegmentedControl aria-label="Zeitraum" mode="radio" variant="pills" options={RANGES} value={range} onChange={setRange} />
          {orgs.length > 1 && (
            <>
              <label htmlFor="cal-org" className="sr-only">Verein</label>
              <Select id="cal-org" size="sm" value={org} onChange={(e) => setOrg(e.target.value)} className="max-sm:w-full">
                <option value="">Alle Vereine</option>
                {orgs.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
              </Select>
            </>
          )}
        </div>
      )}
      {list.error && !events ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : events === null ? (
        <CardSkeletons count={2} />
      ) : events.length === 0 || filtered.length === 0 ? (
        <EmptyState
          title={events.length === 0 ? "Keine kommenden Termine." : q.trim() ? "Keine Termine zu deiner Suche." : "Keine Termine in diesem Zeitraum."}
          action={<ArrowLink href="/vereine">Vereine entdecken</ArrowLink>}
        >
          {events.length === 0 ? "Folge Vereinen oder werde Mitglied, um ihre Termine zu sehen." : undefined}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {byDay.map(([day, items]) => (
            <section key={day} aria-label={day}>
              <h2 className="mb-2 text-sm font-semibold capitalize text-muted">{day}</h2>
              <ul className="space-y-3">
                {items.map((e) => (
                  <li key={e.id}>
                    <EventCard event={e} onChange={(u) => list.setData((l) => (l ?? []).map((x) => (x.id === u.id ? u : x)))} />
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
