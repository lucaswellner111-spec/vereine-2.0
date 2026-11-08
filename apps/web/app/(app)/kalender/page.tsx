"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import type { EventItem } from "@vereine/shared";
import { CalendarMonth } from "@/components/calendar-month";
import { EventCard } from "@/components/event-card";
import { ArrowLink, Button, CardSkeletons, EmptyState, ErrorState, PageHeader, Select, Skeleton } from "@/components/ui";
import { SearchField, SegmentedControl } from "@/components/ui-client";
import { toast } from "@/components/ui-hosts";
import { api, describeError } from "@/lib/api";
import { currentMonth, gridRange, monthGrid, parseMonth, type MonthKey } from "@/lib/calendar";
import { useApi, useBusy } from "@/lib/use-api";
import { useInfiniteScroll, useMoreFailed } from "@/lib/use-infinite-scroll";

type Range = "all" | "today" | "week" | "month";
const RANGES: { value: Range; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "today", label: "Heute" },
  { value: "week", label: "7 Tage" },
  { value: "month", label: "30 Tage" },
];

type View = "liste" | "monat" | "vergangen";
const VIEWS: { value: View; label: string }[] = [
  { value: "liste", label: "Liste" },
  { value: "monat", label: "Monat" },
  { value: "vergangen", label: "Vergangene" },
];
/** Seitengroesse der API fuer vergangene Termine. */
const PAST_PAGE = 100;

const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" });
const replaceIn = (list: EventItem[] | null, u: EventItem) => (list ?? []).map((x) => (x.id === u.id ? u : x));

// useSearchParams braucht eine Suspense-Grenze (sonst bricht der statische Build ab)
export default function CalendarPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <CalendarView />
    </Suspense>
  );
}

/** Ansicht in der URL: ?ansicht=monat&monat=2026-11 bzw. ?ansicht=vergangen; ohne Parameter die Liste. */
function CalendarView() {
  const router = useRouter();
  const pathname = usePathname() ?? "/kalender";
  const params = useSearchParams();
  const raw = params.get("ansicht");
  const view: View = raw === "monat" || raw === "vergangen" ? raw : "liste";
  const month = parseMonth(params.get("monat")) ?? currentMonth();

  const go = (v: View, m?: MonthKey) => {
    const q = new URLSearchParams();
    if (v !== "liste") q.set("ansicht", v);
    if (v === "monat" && m) q.set("monat", m);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  return (
    <>
      <PageHeader title="Kalender" subtitle="Deine Termine aus allen Vereinen und Teams." />
      <SegmentedControl aria-label="Ansicht" mode="radio" options={VIEWS} value={view} onChange={(v) => go(v, month)} className="mb-4" />
      {view === "liste" && <ListView />}
      {view === "monat" && <MonthView month={month} onMonthChange={(m) => go("monat", m)} />}
      {view === "vergangen" && <PastView />}
    </>
  );
}

function ListView() {
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
                    <EventCard event={e} onChange={(u) => list.setData((l) => replaceIn(l, u))} />
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

function MonthView({ month, onMonthChange }: { month: MonthKey; onMonthChange: (m: MonthKey) => void }) {
  const { from, to } = useMemo(() => gridRange(monthGrid(month)), [month]);
  const list = useApi<EventItem[]>(`/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { keepPrevious: true, refreshOnFocus: true });
  if (list.error && !list.data) return <ErrorState message={list.error} onRetry={list.reload} />;
  return (
    <div aria-busy={list.loading}>
      <CalendarMonth month={month} events={list.data ?? []} onMonthChange={onMonthChange} onEventChange={(u) => list.setData((l) => replaceIn(l, u))} />
    </div>
  );
}

/** Vergangene Termine, neueste zuerst; weitere Seiten per to + before (Endlos-Scroll mit "Mehr laden"). */
function PastView() {
  const list = useApi<EventItem[]>("/events?past=1");
  const [hasMore, setHasMore] = useState(true);
  const [moreBusy, runMore] = useBusy();
  const [moreFailed, setMoreFailed] = useMoreFailed();
  const data = list.data;
  const more = !!data && data.length >= PAST_PAGE && hasMore;

  const loadMore = () =>
    runMore(async () => {
      const last = data?.[data.length - 1];
      if (!last) return;
      try {
        const page = await api<EventItem[]>(`/events?past=1&to=${encodeURIComponent(last.startsAt)}&before=${last.id}`);
        if (page.length < PAST_PAGE) setHasMore(false);
        list.setData((prev) => [...(prev ?? []), ...page.filter((x) => !(prev ?? []).some((y) => y.id === x.id))]);
      } catch (e) {
        setMoreFailed(true);
        toast.error(describeError(e));
      }
    });
  const sentinelRef = useInfiniteScroll({ hasMore: more && !moreFailed, loading: moreBusy, onLoadMore: () => void loadMore() });

  if (list.error && !data) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!data) return <CardSkeletons count={2} />;
  if (data.length === 0) return <EmptyState title="Noch keine vergangenen Termine." />;
  return (
    <>
      <ul className="space-y-3">
        {data.map((e) => (
          <li key={e.id}>
            <EventCard event={e} showDate onChange={(u) => list.setData((l) => replaceIn(l, u))} />
          </li>
        ))}
      </ul>
      {more && <div ref={sentinelRef} aria-hidden />}
      {more && (
        <div className="mt-4 text-center">
          <Button
            variant="secondary"
            busy={moreBusy}
            onClick={() => {
              setMoreFailed(false);
              void loadMore();
            }}
          >
            Mehr laden
          </Button>
        </div>
      )}
    </>
  );
}
