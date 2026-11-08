"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import { useState } from "react";
import type { PollView as Poll } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useBusy } from "@/lib/use-api";
import { Button } from "./ui";
import { toast } from "./ui-hosts";

/** Anteil in ganzen Prozent (0 bei keiner Stimme). Exportiert fuer Tests. */
export const pollPercent = (votes: number, total: number) => (total > 0 ? Math.round((votes / total) * 100) : 0);

/** "Endet am 12.11., 18:00" bzw. "Beendet" (Europe/Berlin). */
export function pollDeadline(poll: Pick<Poll, "closesAt" | "closed">): string | null {
  if (poll.closed) return "Beendet";
  if (!poll.closesAt) return null;
  const d = new Date(poll.closesAt);
  return `Endet am ${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" })}, ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}`;
}

/**
 * Umfrage an einem Beitrag: Einfachwahl, anonym (nur Zahlen, nie Namen). Vor der eigenen Stimme Auswahlknoepfe,
 * danach Ergebnisbalken; die Stimme laesst sich bis zum Ende aendern oder zuruecknehmen.
 */
export function PollView({ postId, poll: initial, onChange }: { postId: string; poll: Poll; onChange?: (poll: Poll) => void }) {
  const [poll, setPoll] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setPoll(initial);
  }
  const [busy, run] = useBusy();
  const showResults = poll.closed || poll.myOptionId !== null;
  const deadline = pollDeadline(poll);

  const apply = (next: Poll) => {
    setPoll(next);
    onChange?.(next);
  };
  const vote = (optionId: string) =>
    run(async () => {
      try {
        apply(await api<Poll>(`/posts/${postId}/poll/vote`, { method: "PUT", body: { optionId } }));
      } catch (e) {
        toast.error(describeError(e));
      }
    });
  const withdraw = () =>
    run(async () => {
      try {
        apply(await api<Poll>(`/posts/${postId}/poll/vote`, { method: "DELETE" }));
      } catch (e) {
        toast.error(describeError(e));
      }
    });

  return (
    <fieldset className="mt-3 rounded-xl border border-border p-3" aria-busy={busy}>
      <legend className="px-1 text-sm font-semibold">{poll.question}</legend>
      <ul className="space-y-2">
        {poll.options.map((o) => {
          const pct = pollPercent(o.votes, poll.total);
          const mine = poll.myOptionId === o.id;
          return (
            <li key={o.id}>
              {showResults ? (
                <button
                  type="button"
                  disabled={poll.closed || busy || mine}
                  onClick={() => vote(o.id)}
                  aria-label={`${o.label}: ${pct} Prozent, ${o.votes} ${o.votes === 1 ? "Stimme" : "Stimmen"}${mine ? ", deine Wahl" : ""}`}
                  className={clsx(
                    "relative flex min-h-11 w-full items-center gap-2 overflow-hidden rounded-lg border px-3 text-left text-sm",
                    mine ? "border-brand" : "border-border",
                    !poll.closed && !mine && "hover:bg-surface-2",
                  )}
                >
                  <span aria-hidden className="absolute inset-y-0 left-0 bg-brand/15" style={{ width: `${pct}%` }} />
                  <span className="relative flex min-w-0 flex-1 items-center gap-1.5">
                    {mine && <Check size={14} aria-hidden className="shrink-0 text-brand" />}
                    <span className="break-words [overflow-wrap:anywhere]">{o.label}</span>
                  </span>
                  <span className="relative tabular-nums text-muted">{pct} %</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => vote(o.id)}
                  className="flex min-h-11 w-full items-center rounded-lg border border-border px-3 text-left text-sm hover:border-brand hover:bg-surface-2"
                >
                  <span className="break-words [overflow-wrap:anywhere]">{o.label}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        {/* Punkt fest an "anonym" (geschuetztes Leerzeichen), Frist ohne Umbruch: nie ein "·" am Zeilenanfang */}
        <span>
          {poll.total} {poll.total === 1 ? "Stimme" : "Stimmen"} · anonym
          {deadline && (
            <>
              {"\u00a0· "}
              <span className="whitespace-nowrap">{deadline}</span>
            </>
          )}
        </span>
        {poll.myOptionId && !poll.closed && (
          <Button variant="ghost" size="sm" onClick={withdraw} disabled={busy} className="ml-auto">
            Stimme zurücknehmen
          </Button>
        )}
      </div>
    </fieldset>
  );
}
