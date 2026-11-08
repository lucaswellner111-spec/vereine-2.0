"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { EventItem } from "@vereine/shared";
import { berlinDayKey, monthGrid, monthLabel, shiftMonth, type DayKey, type MonthKey } from "@/lib/calendar";
import { EventCard } from "./event-card";
import { Button } from "./ui";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MAX_TITLES = 3;
const dayLabelFmt = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const dayDate = (key: DayKey) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/**
 * Monatsansicht Mo-So (Europe/Berlin). Desktop: Titel in den Tageszellen; Handy: Punkte je Termin.
 * Ein Tag laesst sich auswaehlen, darunter stehen dessen Termine als Karten.
 */
export function CalendarMonth({
  month,
  events,
  onMonthChange,
  onEventChange,
  today = berlinDayKey(new Date()),
}: {
  month: MonthKey;
  events: EventItem[];
  onMonthChange: (m: MonthKey) => void;
  onEventChange: (e: EventItem) => void;
  today?: DayKey;
}) {
  const grid = useMemo(() => monthGrid(month), [month]);
  const byDay = useMemo(() => {
    const map = new Map<DayKey, EventItem[]>();
    for (const e of events) {
      const k = berlinDayKey(e.startsAt);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return map;
  }, [events]);
  const [picked, setPicked] = useState<DayKey | null>(null);
  const selected = picked && picked.startsWith(month) ? picked : today.startsWith(month) ? today : null;
  const dayEvents = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" aria-label="Vorheriger Monat" onClick={() => onMonthChange(shiftMonth(month, -1))}>
          <ChevronLeft size={18} aria-hidden />
        </Button>
        <h2 className="text-base font-semibold capitalize" aria-live="polite">{monthLabel(month)}</h2>
        <Button variant="ghost" size="sm" aria-label="Nächster Monat" onClick={() => onMonthChange(shiftMonth(month, 1))}>
          <ChevronRight size={18} aria-hidden />
        </Button>
      </div>

      <div role="grid" aria-label={`Monat ${monthLabel(month)}`} className="overflow-hidden rounded-xl border border-border bg-surface">
        <div role="row" className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} role="columnheader" className="py-2">{d}</div>
          ))}
        </div>
        {grid.map((week) => (
          <div key={week[0].key} role="row" className="grid grid-cols-7 border-b border-border last:border-0">
            {week.map((day) => {
              const list = byDay.get(day.key) ?? [];
              const isSel = day.key === selected;
              return (
                <div key={day.key} role="gridcell" aria-selected={isSel} className="min-w-0 border-r border-border last:border-0">
                  <button
                    type="button"
                    onClick={() => setPicked(day.key)}
                    aria-label={`${dayLabelFmt.format(dayDate(day.key))}: ${list.length ? `${list.length} ${list.length === 1 ? "Termin" : "Termine"}` : "keine Termine"}`}
                    className={clsx(
                      "flex h-full min-h-14 w-full flex-col items-stretch gap-1 p-1 text-left hover:bg-surface-2 sm:min-h-24 sm:p-1.5",
                      !day.inMonth && "text-muted/60",
                      isSel && "bg-brand/10",
                    )}
                  >
                    <span
                      className={clsx(
                        "inline-flex h-6 w-6 items-center justify-center self-center rounded-full text-xs sm:self-start",
                        day.key === today && "bg-brand font-semibold text-brand-contrast",
                      )}
                    >
                      {day.day}
                    </span>
                    {/* Handy: Punkte */}
                    {list.length > 0 && (
                      <span className="flex flex-wrap justify-center gap-0.5 sm:hidden" aria-hidden>
                        {list.slice(0, 4).map((e) => (
                          <span key={e.id} className={clsx("h-1.5 w-1.5 rounded-full", e.canceled ? "bg-muted" : "bg-brand")} />
                        ))}
                      </span>
                    )}
                    {/* Desktop: Titel */}
                    <span className="hidden min-w-0 flex-col gap-0.5 sm:flex" aria-hidden>
                      {list.slice(0, MAX_TITLES).map((e) => (
                        <span key={e.id} className={clsx("truncate rounded bg-brand/15 px-1 text-[11px] text-brand", e.canceled && "bg-surface-2 text-muted line-through")}>
                          {timeFmt.format(new Date(e.startsAt))} {e.title}
                        </span>
                      ))}
                      {list.length > MAX_TITLES && <span className="text-[11px] text-muted">+{list.length - MAX_TITLES} weitere</span>}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {selected && (
        <section className="mt-4" aria-label={dayLabelFmt.format(dayDate(selected))}>
          <h3 className="mb-2 text-sm font-semibold capitalize text-muted">{dayLabelFmt.format(dayDate(selected))}</h3>
          {dayEvents.length === 0 ? (
            <p className="text-sm text-muted">Keine Termine an diesem Tag.</p>
          ) : (
            <ul className="space-y-3">
              {dayEvents.map((e) => (
                <li key={e.id}>
                  <EventCard event={e} onChange={onEventChange} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {!selected && (
        <p className="mt-4 text-sm text-muted">
          Wähle einen Tag, um seine Termine zu sehen. <Link href="/kalender" className="text-brand hover:underline">Zur Liste</Link>
        </p>
      )}
    </div>
  );
}
