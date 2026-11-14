"use client";

import { ShieldOff } from "lucide-react";
import { useState } from "react";
import { WAITLIST_REGION_LABELS, WAITLIST_ROLE_LABELS, type ChatReportItem, type MailQuota, type WaitlistOverview } from "@vereine/shared";
import { Alert, ArrowLink, Badge, Button, Card, CardSkeletons, CellLabel, EmptyState, ErrorState, LinkButton, PageHeader, stackTable, UserNameLink } from "@/components/ui";
import { BackButton, SegmentedControl, tabPanelProps } from "@/components/ui-client";
import { ReportQueue } from "@/components/moderation-queue";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { reportReasonLabel } from "@/lib/labels";
import { useApi } from "@/lib/use-api";
import { ask } from "@/components/ui-hosts";

type Tab = "posts" | "chat" | "waitlist";
const TABS: { value: Tab; label: string }[] = [
  { value: "posts", label: "Beiträge" },
  { value: "chat", label: "Chat-Meldungen" },
  { value: "waitlist", label: "Warteliste" },
];

export default function PlatformPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("posts");
  const [error, setError] = useState<string | null>(null);

  if (!user?.isPlatformAdmin) {
    return (
      <EmptyState icon={ShieldOff} title="Kein Zugriff." action={<ArrowLink href="/feed">Zum Feed</ArrowLink>}>
        Dieser Bereich ist der Plattform-Moderation vorbehalten.
      </EmptyState>
    );
  }

  return (
    <>
      <BackButton fallback="/feed" className="md:hidden">Zurück</BackButton>
      <PageHeader title="Plattform-Moderation" subtitle="Meldungen ohne Vereinszuständigkeit. Jeder Zugriff auf Chat-Inhalte wird protokolliert." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <MailQuotaCard />
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
        ) : tab === "chat" ? (
          <ChatReports onError={setError} />
        ) : (
          <WaitlistPanel />
        )}
      </div>
    </>
  );
}

/** Kostenbremse sichtbar machen: "Mail-Kontingent 82 %" (Tag/Monat), ab 80 % werden nicht wichtige Mails zurueckgehalten. */
function MailQuotaCard() {
  const q = useApi<MailQuota>("/platform/mail-quota").data;
  if (!q) return null;
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Mail-Kontingent {q.percent} %</p>
        <Badge tone={q.percent >= 100 ? "danger" : q.warning ? "accent" : "neutral"}>{q.driver === "smtp" ? "Versand aktiv" : "Versand aus (Protokoll)"}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        Heute {q.day.used} von {q.day.limit}, diesen Monat {q.month.used} von {q.month.limit}.
        {q.warning && " Ab 80 % gehen nur noch wichtige Mails (Bestätigung, Passwort) raus; Einladungen und Rechnungs-Mails warten bis morgen, die Sammelmail entfällt."}
      </p>
    </Card>
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
                <span>
                  · von <UserNameLink handle={r.senderHandle} name={r.senderName} className="text-text" />, gemeldet von{" "}
                  <UserNameLink handle={r.reporterHandle} name={r.reporterName} className="text-text" />
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 text-sm">{r.text ?? "Nachricht bereits gelöscht."}</p>
              {r.note && <p className="mt-1 text-xs text-muted">Hinweis: {r.note}</p>}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!r.text}
                  onClick={async () => {
                    if (!(await ask("Die gemeldete Nachricht wird für alle gelöscht. Das lässt sich nicht rückgängig machen.", { title: "Nachricht endgültig löschen?", confirmLabel: "Endgültig löschen", danger: true }))) return;
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

/** Warteliste (nur bestaetigte Eintraege mit Adresse). Abruf und CSV-Export werden protokolliert. */
function WaitlistPanel() {
  const list = useApi<WaitlistOverview>("/platform/waitlist");
  if (list.error && !list.data) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data) return <CardSkeletons count={1} />;
  const { confirmed, pending, entries, byRole, byRegion, bySource } = list.data;
  const tally = (c: Record<string, number>, label: (k: string) => string) =>
    Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${label(k)} ${n}`).join(" · ") || "–";
  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="text-2xl font-black tabular-nums">{confirmed}</span> bestätigt
            <span className="ml-3 text-muted tabular-nums">{pending} unbestätigt</span>
          </p>
          <LinkButton native size="sm" variant="secondary" href="/api/platform/waitlist.csv" className="max-sm:w-full">CSV-Export</LinkButton>
        </div>
        <dl className="mt-2 space-y-0.5 text-xs text-muted">
          <div><dt className="inline font-medium">Rollen: </dt><dd className="inline">{tally(byRole, (k) => WAITLIST_ROLE_LABELS[k as keyof typeof WAITLIST_ROLE_LABELS] ?? "Keine Angabe")}</dd></div>
          <div><dt className="inline font-medium">Regionen: </dt><dd className="inline">{tally(byRegion, (k) => WAITLIST_REGION_LABELS[k as keyof typeof WAITLIST_REGION_LABELS] ?? "Keine Angabe")}</dd></div>
          <div><dt className="inline font-medium">Quellen: </dt><dd className="inline">{tally(bySource, (k) => (k === "-" ? "Keine Angabe" : k))}</dd></div>
        </dl>
        <p className="mt-1 text-xs text-muted">Unbestätigte Anmeldungen werden nach 7 Tagen gelöscht. Abruf und Export werden protokolliert.</p>
      </Card>
      {entries.length === 0 ? (
        <EmptyState emoji="📝" title="Noch niemand auf der Warteliste.">Bestätigte Anmeldungen von der Startseite und von /warteliste erscheinen hier.</EmptyState>
      ) : (
        <Card flush>
          <table className={stackTable.table}>
            <thead className={stackTable.thead}>
              <tr>
                <th className="p-3">Verein</th>
                <th className="p-3">E-Mail</th>
                <th className="p-3">Ort / Art</th>
                <th className="p-3">Rolle / Region</th>
                <th className="p-3">Bestätigt</th>
              </tr>
            </thead>
            <tbody className={stackTable.tbody}>
              {entries.map((e) => (
                <tr key={e.id} className={stackTable.tr}>
                  <td className={stackTable.tdMain}>{e.orgName || "–"}</td>
                  <td className={`${stackTable.td} break-all`}><CellLabel>E-Mail</CellLabel>{e.email}</td>
                  <td className={stackTable.td}><CellLabel>Ort / Art</CellLabel>{[e.city, e.orgType].filter(Boolean).join(" · ") || "–"}</td>
                  <td className={stackTable.td}><CellLabel>Rolle / Region</CellLabel>{[e.role ? WAITLIST_ROLE_LABELS[e.role] : null, e.region ? WAITLIST_REGION_LABELS[e.region] : null].filter(Boolean).join(" · ") || "–"}</td>
                  <td className={`${stackTable.td} tabular-nums`}><CellLabel>Bestätigt</CellLabel>{new Date(e.confirmedAt).toLocaleDateString("de-DE")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
