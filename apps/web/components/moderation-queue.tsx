"use client";

import { useState } from "react";
import type { ReportItem } from "@vereine/shared";
import { Badge, Button, Card, CardSkeletons, EmptyState, ErrorState, TextareaField } from "./ui";
import { api, describeError } from "@/lib/api";
import { reportReasonLabel } from "@/lib/labels";
import { useApi } from "@/lib/use-api";

/**
 * Offene Meldungen zu Beitraegen (DSA: Ausblenden nur mit Begruendung).
 * Genutzt vom Verein (/orgs/:slug/reports) und von der Plattform-Moderation (/platform/reports).
 */
export function ReportQueue({
  listPath,
  resolvePath,
  emptyText,
  onError,
}: {
  listPath: string;
  resolvePath: (id: string) => string;
  emptyText: string;
  onError: (m: string | null) => void;
}) {
  const list = useApi<ReportItem[]>(listPath);
  const [hiding, setHiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function resolve(id: string, body: object) {
    onError(null);
    try {
      await api(resolvePath(id), { method: "POST", body });
      setHiding(null);
      setReason("");
      list.setData((l) => l?.filter((r) => r.id !== id) ?? l);
      list.reload();
    } catch (e) {
      onError(describeError(e));
    }
  }

  if (list.error && !list.data) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data) return <CardSkeletons count={2} />;
  if (!list.data.length) return <EmptyState title={emptyText} />;

  return (
    <ul className="space-y-3">
      {list.data.map((r) => (
        <li key={r.id}>
          <Card>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge tone="danger">{reportReasonLabel(r.reason)}</Badge>
              <span>{new Date(r.createdAt).toLocaleString("de-DE")}</span>
              <span>· Beitrag von {r.post.authorName}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{r.post.body}</p>
            {r.note && <p className="mt-1 text-xs text-muted">Hinweis: {r.note}</p>}
            {hiding === r.id ? (
              <div className="mt-3 space-y-2">
                <TextareaField
                  id={`why-${r.id}`}
                  label="Begründung (wird dem Autor mitgeteilt, mind. 10 Zeichen)"
                  rows={2}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" disabled={reason.trim().length < 10} onClick={() => resolve(r.id, { action: "hide", reason })}>
                    Ausblenden
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setHiding(null)}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setReason("");
                    setHiding(r.id);
                  }}
                >
                  Beitrag ausblenden …
                </Button>
                <Button size="sm" variant="secondary" onClick={() => resolve(r.id, { action: "dismiss" })}>
                  Meldung ablehnen
                </Button>
              </div>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
