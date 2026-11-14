"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { GuardianInviteInfo } from "@vereine/shared";
import { Alert, Button, Card, ErrorState, LinkButton, Skeleton } from "@/components/ui";
import { Logo } from "@/components/site";
import { api, ApiError, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { withNext } from "@/lib/next-url";

/** Zweiter Elternteil nimmt die Einladung an: eigenes, bestaetigtes Konto mit der eingeladenen Adresse, Selbstauskunft "sorgeberechtigt". */
export default function GuardianInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [info, setInfo] = useState<GuardianInviteInfo | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = `/eltern-einladung/${token}`;

  const load = useCallback(() => {
    setLoadError(null);
    api<GuardianInviteInfo>(`/guardian/invites/${token}`)
      .then(setInfo)
      .catch((e) => (e instanceof ApiError && [403, 404, 409].includes(e.status) ? setProblem(describeError(e)) : setLoadError(describeError(e))));
  }, [token]);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ childId: string }>(`/guardian/invites/${token}/accept`, { method: "POST", body: { confirmGuardian: true } });
      router.replace(`/kinder/${res.childId}`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-6 text-lg" />
      <Card className="w-full max-w-md space-y-4 p-6">
        <h1 className="text-xl font-semibold">Einladung als Elternteil</h1>
        {loading ? (
          <div role="status" aria-label="Lade" className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="mt-3 h-10 w-full" />
          </div>
        ) : !user ? (
          <>
            <p className="text-sm text-muted">Melde dich mit dem Konto an, dessen E-Mail-Adresse die Einladung bekommen hat, oder erstelle ein Konto mit genau dieser Adresse und bestätige sie.</p>
            <div className="flex flex-wrap gap-2">
              <LinkButton href={withNext("/registrieren", here)}>Konto erstellen</LinkButton>
              <LinkButton href={withNext("/login", here)} variant="secondary">Anmelden</LinkButton>
            </div>
          </>
        ) : problem ? (
          <Alert>{problem}</Alert>
        ) : !info ? (
          loadError ? <ErrorState message={loadError} onRetry={load} /> : <div role="status" aria-label="Lade"><Skeleton className="h-10 w-full" /></div>
        ) : (
          <>
            <p className="text-sm">
              <strong>{info.inviterName}</strong> lädt dich ein, <strong>{info.childName}</strong> gemeinsam bei Klubnest zu verwalten: Vereinsmitgliedschaft, Zu- und Absagen und Rechnungen. Das Kind bekommt keinen eigenen Zugang.
            </p>
            {user.emailVerified === false && <Alert tone="info">Bitte bestätige zuerst deine E-Mail-Adresse, dann kannst du die Einladung annehmen.</Alert>}
            {error && <Alert>{error}</Alert>}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-4" />
              <span>Ich bin für dieses Kind sorgeberechtigt und habe die Hinweise zur Verarbeitung der Daten meines Kindes gelesen.</span>
            </label>
            <Button onClick={accept} busy={busy} disabled={!confirmed || user.emailVerified === false} className="w-full">Einladung annehmen</Button>
          </>
        )}
      </Card>
    </main>
  );
}
