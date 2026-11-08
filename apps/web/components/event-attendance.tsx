"use client";

import clsx from "clsx";
import { ClipboardCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AttendanceList, AttendanceStatus, EventItem } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { ATTENDANCE_LABEL, RSVP_STATUS_LABEL } from "@/lib/events";
import { useApi, useBusy } from "@/lib/use-api";
import { Alert, Button, Card, CellLabel, ErrorState, ListSkeleton, SectionTitle, stackTable } from "./ui";
import { SegmentedControl } from "./ui-client";
import { toast } from "./ui-hosts";

type Choice = AttendanceStatus | "";
const OPTIONS: { value: Choice; label: string }[] = (["present", "absent", "excused"] as const).map((s) => ({ value: s, label: ATTENDANCE_LABEL[s] }));
/** Ab einer Stunde vor Beginn erfassbar (wie die API). */
export const attendanceOpen = (e: EventItem, now = Date.now()) => !e.canceled && now >= new Date(e.startsAt).getTime() - 3600_000;

/**
 * Anwesenheit erfassen (nur Vorstand/Moderation): je Person Da/Fehlt/Entschuldigt, gespeichert in einem Rutsch.
 * Bewusst ohne Grund/Freitext. Am Handy als Karten (stackTable).
 */
export function EventAttendance({ event }: { event: EventItem }) {
  const list = useApi<AttendanceList>(`/events/${event.id}/attendance`);
  const [draft, setDraft] = useState<Map<string, Choice>>(new Map());
  const [busy, run] = useBusy();
  const entries = list.data?.entries;

  useEffect(() => setDraft(new Map()), [list.data]);

  const value = (userId: string, saved: AttendanceStatus | null): Choice => (draft.has(userId) ? draft.get(userId)! : (saved ?? ""));
  const changes = useMemo(
    () => (entries ?? []).filter((e) => draft.has(e.userId) && draft.get(e.userId) !== (e.status ?? "")),
    [entries, draft],
  );
  const set = (userId: string, v: Choice) => setDraft((d) => new Map(d).set(userId, v));

  const save = () =>
    run(async () => {
      try {
        const next = await api<AttendanceList>(`/events/${event.id}/attendance`, {
          method: "PUT",
          body: { entries: changes.map((e) => ({ userId: e.userId, status: draft.get(e.userId) || null })) },
        });
        list.setData(next);
        toast.success("Anwesenheit gespeichert.");
      } catch (e) {
        toast.error(describeError(e));
      }
    });

  return (
    <Card className="mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={ClipboardCheck}>Anwesenheit (nur für die Verwaltung)</SectionTitle>
        {entries && entries.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setDraft((d) => {
                const n = new Map(d);
                for (const e of entries) if (e.rsvp === "yes" && !value(e.userId, e.status)) n.set(e.userId, "present");
                return n;
              })
            }
          >
            Zusagen als „Da“
          </Button>
        )}
      </div>
      {list.error && !entries ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !entries ? (
        <ListSkeleton rows={3} />
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">{event.visibility === "public" ? "Noch keine Zusagen von Mitgliedern." : "Keine Mitglieder für diesen Termin."}</p>
      ) : (
        <>
          <table className={stackTable.table}>
            <thead className={stackTable.thead}>
              <tr>
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Rückmeldung</th>
                <th className="p-3 font-medium">Anwesenheit</th>
              </tr>
            </thead>
            <tbody className={stackTable.tbody}>
              {entries.map((e) => {
                const v = value(e.userId, e.status);
                return (
                  <tr key={e.userId} className={stackTable.tr}>
                    <td className={stackTable.tdMain}>{e.name}</td>
                    <td className={stackTable.td}>
                      <CellLabel>Rückmeldung</CellLabel>
                      <span className="text-muted">{e.rsvp ? RSVP_STATUS_LABEL[e.rsvp] : "–"}</span>
                    </td>
                    <td className={stackTable.tdActions}>
                      <div className="flex flex-wrap items-center gap-2">
                        <SegmentedControl<Choice> aria-label={`Anwesenheit ${e.name}`} mode="radio" options={OPTIONS} value={v} onChange={(x) => set(e.userId, x)} />
                        {v && (
                          <button type="button" className={clsx("hit-area text-xs text-muted underline-offset-2 hover:text-text hover:underline")} onClick={() => set(e.userId, "")}>
                            Leeren<span className="sr-only"> ({e.name})</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <Button disabled={changes.length === 0} busy={busy} onClick={() => void save()}>
              Speichern{changes.length ? ` (${changes.length})` : ""}
            </Button>
            {changes.length > 0 && (
              <Button variant="ghost" onClick={() => setDraft(new Map())}>Verwerfen</Button>
            )}
          </div>
          <div className="mt-3">
            <Alert tone="info">Nur Da, Fehlt oder Entschuldigt – bitte keine Gründe (z. B. Krankheit) notieren.</Alert>
          </div>
        </>
      )}
    </Card>
  );
}
