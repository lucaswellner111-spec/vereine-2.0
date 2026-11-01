"use client";

import { useEffect, useState } from "react";
import type { CalendarFeedCreated, CalendarFeedStatus } from "@vereine/shared";
import { SettingsTabs } from "@/components/settings-tabs";
import { Alert, Button, Card, PageHeader } from "@/components/ui";
import { api, describeError } from "@/lib/api";

export default function CalendarSettingsPage() {
  const [status, setStatus] = useState<CalendarFeedStatus | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CalendarFeedStatus>("/calendar-feed").then(setStatus).catch((e) => setError(describeError(e)));
  }, []);

  async function create() {
    setError(null);
    setCopied(false);
    try {
      const res = await api<CalendarFeedCreated>("/calendar-feed", { method: "POST" });
      setLink(`${window.location.origin}/api/calendar/${res.token}.ics`);
      setStatus({ enabled: true, createdAt: res.createdAt });
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function disable() {
    setError(null);
    try {
      await api("/calendar-feed", { method: "DELETE" });
      setLink(null);
      setStatus({ enabled: false, createdAt: null });
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <>
      <PageHeader title="Kalender" subtitle="Deine Termine in Google Kalender, Apple Kalender, Outlook & Co." />
      <SettingsTabs active="/einstellungen/kalender" />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <Card className="space-y-4">
        <p className="text-sm text-muted">
          Mit dem Abo-Link erscheinen alle Termine deiner Vereine und Teams automatisch in deinem Kalenderprogramm und bleiben aktuell. Wer den Link kennt, kann deine Termine sehen – gib ihn nicht weiter. Ein neuer Link macht den alten ungültig.
        </p>
        {status === null ? (
          <p className="text-sm text-muted" role="status">Lade …</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={create}>{status.enabled ? "Neuen Link erzeugen" : "Abo-Link erzeugen"}</Button>
            {status.enabled && <Button variant="secondary" onClick={disable}>Abo beenden</Button>}
          </div>
        )}
        {status?.enabled && !link && (
          <p className="text-xs text-muted">
            Ein Abo-Link ist aktiv (erstellt am {new Date(status.createdAt!).toLocaleDateString("de-DE")}). Aus Sicherheitsgründen wird er nicht erneut angezeigt – erzeuge bei Bedarf einen neuen.
          </p>
        )}
        {link && (
          <div className="space-y-2">
            <Alert tone="success">Kopiere den Link jetzt und füge ihn im Kalenderprogramm als „Kalender abonnieren“ (per URL) ein. Er wird nicht noch einmal angezeigt.</Alert>
            <div className="flex flex-wrap items-center gap-2">
              <input readOnly aria-label="Abo-Link" value={link} onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 font-mono text-xs" />
              <Button
                variant="secondary"
                onClick={() =>
                  navigator.clipboard.writeText(link).then(
                    () => setCopied(true),
                    () => setError("Kopieren nicht möglich – markiere den Link und kopiere ihn von Hand."),
                  )
                }
              >
                {copied ? "Kopiert ✓" : "Kopieren"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
