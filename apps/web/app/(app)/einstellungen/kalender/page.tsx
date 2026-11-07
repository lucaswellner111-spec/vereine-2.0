"use client";

import { useCallback, useEffect, useState } from "react";
import type { CalendarFeedCreated, CalendarFeedStatus } from "@vereine/shared";
import { SettingsBackLink } from "@/components/settings-back-link";
import { CalendarPlus } from "lucide-react";
import { Alert, Button, Card, ErrorState, LinkButton, PageHeader, Skeleton } from "@/components/ui";
import { CopyField } from "@/components/ui-client";
import { ask, toast } from "@/components/ui-hosts";
import { api, describeError } from "@/lib/api";
import { useBusy } from "@/lib/use-api";

/** webcal:// aus der https-Adresse: Kalender-Apps (Apple, Outlook) oeffnen das Abo direkt. */
const webcal = (url: string) => url.replace(/^https?:\/\//, "webcal://");

export default function CalendarSettingsPage() {
  const [status, setStatus] = useState<CalendarFeedStatus | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, run] = useBusy();

  const load = useCallback(() => {
    setLoadError(null);
    api<CalendarFeedStatus>("/calendar-feed").then(setStatus).catch((e) => setLoadError(describeError(e)));
  }, []);
  useEffect(load, [load]);

  const create = () =>
    run(async () => {
      // Ersetzen eines aktiven Links nur nach Rueckfrage: Kalender mit dem alten Link bekommen nichts mehr
      if (status?.enabled && !(await ask("Der alte Link hört auf zu funktionieren. Kalender, die ihn nutzen, musst du neu verbinden.", { title: "Neuen Abo-Link erzeugen?", confirmLabel: "Neuen Link erzeugen", danger: true }))) return;
      setError(null);
      try {
        const res = await api<CalendarFeedCreated>("/calendar-feed", { method: "POST" });
        setLink(`${window.location.origin}/api/calendar/${res.token}.ics`);
        setStatus({ enabled: true, createdAt: res.createdAt });
      } catch (e) {
        setError(describeError(e));
      }
    });

  const disable = () =>
    run(async () => {
      if (!(await ask("Der Link funktioniert danach nicht mehr; deine Termine verschwinden aus dem abonnierten Kalender.", { title: "Abo beenden?", confirmLabel: "Abo beenden", danger: true }))) return;
      setError(null);
      try {
        await api("/calendar-feed", { method: "DELETE" });
        setLink(null);
        setStatus({ enabled: false, createdAt: null });
        toast.success("Kalender-Abo beendet.");
      } catch (e) {
        setError(describeError(e));
      }
    });

  return (
    <>
      <SettingsBackLink />
      <PageHeader title="Kalender" subtitle="Deine Termine in Google Kalender, Apple Kalender, Outlook & Co." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <Card className="space-y-4">
        <p className="text-sm text-muted">
          Mit dem Abo-Link erscheinen alle Termine deiner Vereine und Teams automatisch in deinem Kalenderprogramm und bleiben aktuell. Wer den Link kennt, kann deine Termine sehen – gib ihn nicht weiter. Ein neuer Link macht den alten ungültig.
        </p>
        {status === null && loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : status === null ? (
          <div role="status" aria-label="Lade" className="flex gap-2"><Skeleton className="h-10 w-44" /></div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={create} busy={busy}>{status.enabled ? "Neuen Link erzeugen" : "Abo-Link erzeugen"}</Button>
            {status.enabled && <Button variant="secondary" onClick={disable} disabled={busy}>Abo beenden</Button>}
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
            <CopyField label="Abo-Link" value={link} />
            <LinkButton native variant="secondary" href={webcal(link)}>
              <CalendarPlus size={16} aria-hidden /> In Kalender-App abonnieren
            </LinkButton>
          </div>
        )}
      </Card>
    </>
  );
}
