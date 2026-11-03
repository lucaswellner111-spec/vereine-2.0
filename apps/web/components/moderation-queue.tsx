"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReportItem } from "@vereine/shared";
import { Badge, Button, Card } from "./ui";
import { api, describeError } from "@/lib/api";

const reasonLabel: Record<string, string> = { spam: "Spam", hate: "Hass / Hetze", illegal: "Illegal", other: "Sonstiges" };

/** Offene Meldungen zu Beiträgen des Vereins (DSA: Ausblenden nur mit Begründung). */
export function ModerationQueue({ slug, onError }: { slug: string; onError: (m: string | null) => void }) {
  const [items, setItems] = useState<ReportItem[] | null>(null);
  const [hiding, setHiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    api<ReportItem[]>(`/orgs/${slug}/reports`).then(setItems).catch((e) => onError(describeError(e)));
  }, [slug, onError]);
  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  async function resolve(id: string, body: object) {
    onError(null);
    try {
      await api(`/reports/${id}/resolve`, { method: "POST", body });
      setHiding(null);
      setReason("");
      load();
    } catch (e) {
      onError(describeError(e));
    }
  }

  if (items === null) return <p className="text-sm text-muted" role="status">Lade …</p>;
  if (items.length === 0) return <Card><p className="text-sm text-muted">Keine offenen Meldungen. 🎉</p></Card>;

  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <li key={r.id}>
          <Card>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge tone="danger">{reasonLabel[r.reason] ?? r.reason}</Badge>
              <span>{new Date(r.createdAt).toLocaleString("de-DE")}</span>
              <span>· Beitrag von {r.post.authorName}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{r.post.body}</p>
            {r.note && <p className="mt-1 text-xs text-muted">Hinweis: {r.note}</p>}
            {hiding === r.id ? (
              <div className="mt-3 space-y-2">
                <label htmlFor={`why-${r.id}`} className="text-xs font-medium">Begründung (wird dem Autor mitgeteilt)</label>
                <textarea
                  id={`why-${r.id}`}
                  rows={2}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full resize-none rounded-lg border border-border bg-bg p-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" disabled={reason.trim().length < 10} onClick={() => resolve(r.id, { action: "hide", reason })}>Ausblenden</Button>
                  <Button size="sm" variant="ghost" onClick={() => setHiding(null)}>Abbrechen</Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="danger" onClick={() => setHiding(r.id)}>Beitrag ausblenden …</Button>
                <Button size="sm" variant="secondary" onClick={() => resolve(r.id, { action: "dismiss" })}>Meldung ablehnen</Button>
              </div>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
