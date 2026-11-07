"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { InviteInfo } from "@vereine/shared";
import { Alert, ArrowLink, Button, Card, ErrorState, LinkButton, Skeleton } from "@/components/ui";
import { Logo } from "@/components/site";
import { api, ApiError, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { withNext } from "@/lib/next-url";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = `/einladung/${token}`;

  const load = useCallback(() => {
    setLoadError(null);
    api<InviteInfo>(`/invites/${token}`)
      .then(setInfo)
      .catch((e) => (e instanceof ApiError && e.status === 404 ? setInvalid(true) : setLoadError(describeError(e))));
  }, [token]);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<InviteInfo>(`/invites/${token}/accept`, { method: "POST" });
      router.replace(`/vereine/${res.orgSlug}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setInvalid(true);
      else setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-6 text-lg" />
      <Card className="w-full max-w-md space-y-4 p-6">
        <h1 className="text-xl font-semibold">Einladung zu einem Verein</h1>
        {loading ? (
          <InviteSkeleton />
        ) : !user ? (
          <>
            <p className="text-sm text-muted">Melde dich an oder erstelle ein Konto, um der Einladung zu folgen.</p>
            <div className="flex flex-wrap gap-2">
              <LinkButton href={withNext("/registrieren", here)}>Konto erstellen</LinkButton>
              <LinkButton href={withNext("/login", here)} variant="secondary">Anmelden</LinkButton>
            </div>
          </>
        ) : invalid ? (
          <Alert>Dieser Einladungslink ist ungültig oder abgelaufen. Bitte den Vorstand um einen neuen Link.</Alert>
        ) : !info ? (
          loadError ? <ErrorState message={loadError} onRetry={load} /> : <InviteSkeleton />
        ) : info.alreadyMember ? (
          <>
            <p className="text-sm">Du bist bereits Mitglied bei <strong>{info.orgName}</strong>.</p>
            <ArrowLink href={`/vereine/${info.orgSlug}`}>Zum Verein</ArrowLink>
          </>
        ) : (
          <>
            <p className="text-sm">Du wurdest zu <strong>{info.orgName}</strong> eingeladen. Als Mitglied siehst du interne Beiträge und Termine und bekommst Benachrichtigungen des Vereins.</p>
            {error && <Alert>{error}</Alert>}
            <Button onClick={join} busy={busy} className="w-full">{busy ? "Trete bei …" : "Verein beitreten"}</Button>
          </>
        )}
      </Card>
    </main>
  );
}

function InviteSkeleton() {
  return (
    <div role="status" aria-label="Lade" className="space-y-2">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="mt-3 h-10 w-full" />
    </div>
  );
}
