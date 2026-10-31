"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ChatReportItem, ReportItem } from "@vereine/shared";
import { Alert, Badge, Button, Card, PageHeader } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const reasonLabel: Record<string, string> = { spam: "Spam", hate: "Hass / Hetze", illegal: "Illegal", other: "Sonstiges" };
type Tab = "Beiträge" | "Chat-Meldungen";

export default function PlatformPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("Beiträge");
  const [error, setError] = useState<string | null>(null);

  if (!user?.isPlatformAdmin) {
    return (
      <Card>
        <p className="text-sm">Dieser Bereich ist der Plattform-Moderation vorbehalten.</p>
        <Link href="/feed" className="mt-2 inline-block text-sm text-brand hover:underline">Zum Feed</Link>
      </Card>
    );
  }

  return (
    <>
      <PageHeader title="Plattform-Moderation" subtitle="Meldungen ohne Vereinszuständigkeit. Jeder Zugriff auf Chat-Inhalte wird protokolliert." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <div role="tablist" className="mb-4 inline-flex rounded-lg border border-border bg-surface p-1">
        {(["Beiträge", "Chat-Meldungen"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={clsx("rounded-md px-3 py-1.5 text-sm font-medium", tab === t ? "bg-brand text-brand-contrast" : "text-muted hover:text-text")}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Beiträge" ? <PostReports onError={setError} /> : <ChatReports onError={setError} />}
    </>
  );
}

function PostReports({ onError }: { onError: (m: string | null) => void }) {
  const [items, setItems] = useState<ReportItem[] | null>(null);
  const [hiding, setHiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    api<ReportItem[]>("/platform/reports").then(setItems).catch((e) => onError(describeError(e)));
  }, [onError]);
  useEffect(load, [load]);

  async function resolve(id: string, body: object) {
    onError(null);
    try {
      await api(`/platform/reports/${id}/resolve`, { method: "POST", body });
      setHiding(null);
      setReason("");
      load();
    } catch (e) {
      onError(describeError(e));
    }
  }

  if (items === null) return <p className="text-sm text-muted" role="status">Lade …</p>;
  if (items.length === 0) return <Card><p className="text-sm text-muted">Keine offenen Meldungen zu persönlichen Beiträgen.</p></Card>;

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
                <textarea id={`why-${r.id}`} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
                  className="w-full resize-none rounded-lg border border-border bg-bg p-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]" />
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

function ChatReports({ onError }: { onError: (m: string | null) => void }) {
  const [items, setItems] = useState<ChatReportItem[] | null>(null);

  const load = useCallback(() => {
    api<ChatReportItem[]>("/platform/chat-reports").then(setItems).catch((e) => onError(describeError(e)));
  }, [onError]);
  useEffect(load, [load]);

  async function resolve(id: string, action: "dismiss" | "delete") {
    onError(null);
    try {
      await api(`/platform/chat-reports/${id}/resolve`, { method: "POST", body: { action } });
      load();
    } catch (e) {
      onError(describeError(e));
    }
  }

  if (items === null) return <p className="text-sm text-muted" role="status">Lade …</p>;
  if (items.length === 0) return <Card><p className="text-sm text-muted">Keine offenen Chat-Meldungen.</p></Card>;

  return (
    <>
      <p className="mb-3 text-xs text-muted">Es wird nur die gemeldete Nachricht angezeigt, nicht der Verlauf. Das Öffnen dieser Liste wird protokolliert.</p>
      <ul className="space-y-3">
        {items.map((r) => (
          <li key={r.id}>
            <Card>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge tone="danger">{reasonLabel[r.reason] ?? r.reason}</Badge>
                <span>{new Date(r.createdAt).toLocaleString("de-DE")}</span>
                <span>· {r.conversationKind === "group" ? "Gruppe" : "Direktnachricht"}</span>
                <span>· von {r.senderName}, gemeldet von {r.reporterName}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 text-sm">{r.text ?? "Nachricht bereits gelöscht."}</p>
              {r.note && <p className="mt-1 text-xs text-muted">Hinweis: {r.note}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="danger" disabled={!r.text} onClick={() => confirm("Nachricht endgültig löschen?") && resolve(r.id, "delete")}>Nachricht löschen</Button>
                <Button size="sm" variant="secondary" onClick={() => resolve(r.id, "dismiss")}>Meldung ablehnen</Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
