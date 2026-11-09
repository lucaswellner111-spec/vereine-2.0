"use client";

import type { EmailPrefs } from "@vereine/shared";
import { api, describeError } from "@/lib/api";
import { useApi, useBusy } from "@/lib/use-api";
import { Alert, Card, CardSkeletons, ErrorState, Toggle } from "./ui";

/** Taegliche Sammelmail (Opt-in, standardmaessig aus): nur Anzahlen, keine Namen oder Inhalte, keine Likes. */
export function EmailDigestCard({ onError }: { onError: (m: string | null) => void }) {
  const prefs = useApi<EmailPrefs>("/notifications/email-prefs");
  const [busy, run] = useBusy();

  const set = (digest: boolean) =>
    run(async () => {
      onError(null);
      try {
        prefs.setData(await api<EmailPrefs>("/notifications/email-prefs", { method: "PUT", body: { digest } }));
      } catch (e) {
        onError(describeError(e));
      }
    });

  return (
    <>
      <h2 className="mb-2 mt-6 font-semibold">E-Mail</h2>
      <Card className="space-y-3">
        {prefs.error && !prefs.data ? (
          <ErrorState message={prefs.error} onRetry={prefs.reload} />
        ) : !prefs.data ? (
          <CardSkeletons count={1} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p id="digest-label" className="text-sm font-medium">Tägliche Sammelmail</p>
                <p className="text-sm text-muted">
                  Höchstens einmal am Tag eine kurze Übersicht, wenn es Neues gibt – nur Anzahlen (z. B. „2 neue Kommentare“), keine Namen oder Inhalte. Für Likes schicken wir nie Mails. Abbestellen geht jederzeit hier oder per Link in der Mail.
                </p>
              </div>
              <Toggle label="Tägliche Sammelmail" checked={prefs.data.digest} disabled={busy || (!prefs.data.available && !prefs.data.digest)} onChange={(v) => void set(v)} />
            </div>
            {!prefs.data.available && <Alert tone="info">Bestätige zuerst deine E-Mail-Adresse, dann kannst du die Sammelmail einschalten.</Alert>}
          </>
        )}
      </Card>
    </>
  );
}
