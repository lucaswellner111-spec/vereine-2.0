"use client";

import { useState } from "react";
import type { ChatReportItem } from "@vereine/shared";
import { Alert, ArrowLink, Badge, Button, Card, CardSkeletons, EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { SegmentedControl, tabPanelProps } from "@/components/ui-client";
import { ReportQueue } from "@/components/moderation-queue";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { reportReasonLabel } from "@/lib/labels";
import { useApi } from "@/lib/use-api";
import { ask } from "@/components/ui-hosts";

type Tab = "posts" | "chat";
const TABS: { value: Tab; label: string }[] = [
  { value: "posts", label: "Beiträge" },
  { value: "chat", label: "Chat-Meldungen" },
];

export default function PlatformPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("posts");
  const [error, setError] = useState<string | null>(null);

  if (!user?.isPlatformAdmin) {
    return (
      <Card>
        <p className="text-sm">Dieser Bereich ist der Plattform-Moderation vorbehalten.</p>
        <ArrowLink href="/feed" className="mt-2">Zum Feed</ArrowLink>
      </Card>
    );
  }

  return (
    <>
      <PageHeader title="Plattform-Moderation" subtitle="Meldungen ohne Vereinszuständigkeit. Jeder Zugriff auf Chat-Inhalte wird protokolliert." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <SegmentedControl
        aria-label="Meldungsart"
        mode="tabs"
        idBase="pf"
        panelId="pf-panel"
        options={TABS}
        value={tab}
        onChange={setTab}
        className="mb-4"
      />
      <div {...tabPanelProps("pf", "pf-panel", tab)} className="focus:outline-none">
        {tab === "posts" ? (
          <ReportQueue
            listPath="/platform/reports"
            resolvePath={(id) => `/platform/reports/${id}/resolve`}
            emptyText="Keine offenen Meldungen zu persönlichen Beiträgen."
            onError={setError}
          />
        ) : (
          <ChatReports onError={setError} />
        )}
      </div>
    </>
  );
}

function ChatReports({ onError }: { onError: (m: string | null) => void }) {
  const list = useApi<ChatReportItem[]>("/platform/chat-reports");

  async function resolve(id: string, action: "dismiss" | "delete") {
    onError(null);
    try {
      await api(`/platform/chat-reports/${id}/resolve`, { method: "POST", body: { action } });
      list.setData((l) => l?.filter((r) => r.id !== id) ?? l);
      list.reload();
    } catch (e) {
      onError(describeError(e));
    }
  }

  if (list.error && !list.data) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data) return <CardSkeletons count={2} />;
  if (!list.data.length) return <EmptyState title="Keine offenen Chat-Meldungen." />;

  return (
    <>
      <p className="mb-3 text-xs text-muted">Es wird nur die gemeldete Nachricht angezeigt, nicht der Verlauf. Das Öffnen dieser Liste wird protokolliert.</p>
      <ul className="space-y-3">
        {list.data.map((r) => (
          <li key={r.id}>
            <Card>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge tone="danger">{reportReasonLabel(r.reason)}</Badge>
                <span>{new Date(r.createdAt).toLocaleString("de-DE")}</span>
                <span>· {r.conversationKind === "group" ? "Gruppe" : r.conversationKind === "direct" ? "Direktnachricht" : "Unterhaltung gelöscht"}</span>
                <span>· von {r.senderName}, gemeldet von {r.reporterName}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 text-sm">{r.text ?? "Nachricht bereits gelöscht."}</p>
              {r.note && <p className="mt-1 text-xs text-muted">Hinweis: {r.note}</p>}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!r.text}
                  onClick={async () => {
                    if (!(await ask("Nachricht endgültig löschen?", { confirmLabel: "Löschen" }))) return;
                    await resolve(r.id, "delete");
                  }}
                >
                  Nachricht löschen
                </Button>
                <Button size="sm" variant="secondary" onClick={() => resolve(r.id, "dismiss")}>Meldung ablehnen</Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
