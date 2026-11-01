"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { InviteInfo } from "@vereine/shared";
import { Alert, Button, Card } from "@/components/ui";
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
  const [busy, setBusy] = useState(false);
  const here = `/einladung/${token}`;

  useEffect(() => {
    if (!user) return;
    api<InviteInfo>(`/invites/${token}`)
      .then(setInfo)
      .catch((e) => (e instanceof ApiError && e.status === 404 ? setInvalid(true) : setError(describeError(e))));
  }, [user, token]);

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
          <p className="text-sm text-muted" role="status">Lade …</p>
        ) : !user ? (
          <>
            <p className="text-sm text-muted">Melde dich an oder erstelle ein Konto, um der Einladung zu folgen.</p>
            <div className="flex flex-wrap gap-2">
              <Link href={withNext("/registrieren", here)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-contrast hover:bg-brand-hover">Konto erstellen</Link>
              <Link href={withNext("/login", here)} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2">Anmelden</Link>
            </div>
          </>
        ) : invalid ? (
          <Alert>Dieser Einladungslink ist ungültig oder abgelaufen. Bitte den Vorstand um einen neuen Link.</Alert>
        ) : !info ? (
          <p className="text-sm text-muted" role="status">{error ?? "Lade …"}</p>
        ) : info.alreadyMember ? (
          <>
            <p className="text-sm">Du bist bereits Mitglied bei <strong>{info.orgName}</strong>.</p>
            <Link href={`/vereine/${info.orgSlug}`} className="text-sm font-medium text-brand hover:underline">Zum Verein →</Link>
          </>
        ) : (
          <>
            <p className="text-sm">Du wurdest zu <strong>{info.orgName}</strong> eingeladen. Als Mitglied siehst du interne Beiträge und Termine und bekommst Benachrichtigungen des Vereins.</p>
            {error && <Alert>{error}</Alert>}
            <Button onClick={join} disabled={busy} className="w-full">{busy ? "Trete bei …" : "Verein beitreten"}</Button>
          </>
        )}
      </Card>
    </main>
  );
}
