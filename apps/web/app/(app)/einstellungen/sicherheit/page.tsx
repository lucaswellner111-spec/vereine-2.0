"use client";

import { useState, type FormEvent } from "react";
import type { SessionInfo } from "@vereine/shared";
import { SettingsBackLink } from "@/components/settings-back-link";
import { Alert, Badge, Button, Card, ErrorState, Field, ListSkeleton, PageHeader } from "@/components/ui";
import { TwoFactorCard } from "@/components/two-factor-card";
import { api, describeError } from "@/lib/api";
import { useApi, useBusy } from "@/lib/use-api";
import { ask, toast } from "@/components/ui-hosts";
import { useAuth } from "@/lib/auth";

const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function SecurityPage() {
  const list = useApi<SessionInfo[]>("/auth/sessions");
  const sessions = list.data;
  const [pwBusy, runPw] = useBusy();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const [mailBusy, runMail] = useBusy();
  const [newEmail, setNewEmail] = useState("");
  const [mailPw, setMailPw] = useState("");

  function changeEmail(e: FormEvent) {
    e.preventDefault();
    void runMail(async () => {
      setError(null);
      try {
        await api("/auth/email/change", { method: "POST", body: { newEmail, password: mailPw } });
        toast.success(`Prüfe dein Postfach: Bestätige die neue Adresse über den Link an ${newEmail.trim()}. Bis dahin gilt die bisherige.`);
        setNewEmail("");
        setMailPw("");
      } catch (err) {
        setError(describeError(err));
      }
    });
  }

  function changePassword(e: FormEvent) {
    e.preventDefault();
    void runPw(async () => {
      setError(null);
      try {
        await api("/auth/password", { method: "PUT", body: { currentPassword: current, newPassword: next } });
        setCurrent("");
        setNext("");
        toast.success("Passwort geändert. Alle anderen Geräte wurden abgemeldet.");
        list.reload();
      } catch (err) {
        setError(describeError(err));
      }
    });
  }

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      list.reload();
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <>
      <SettingsBackLink />
      <PageHeader title="Sicherheit" subtitle="Passwort, E-Mail-Adresse und angemeldete Geräte." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <TwoFactorCard onError={setError} />

      <h2 className="mb-2 font-semibold">Passwort ändern</h2>
      <Card className="mb-6">
        <form onSubmit={changePassword} className="max-w-sm space-y-3">
          <Field id="cur" label="Aktuelles Passwort" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          <Field id="new" label="Neues Passwort" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={next} onChange={(e) => setNext(e.target.value)} hint="Mindestens 12 Zeichen. Ein Satz aus mehreren Wörtern ist ideal." />
          <Button type="submit" busy={pwBusy} disabled={!current || next.length < 12}>Passwort ändern</Button>
        </form>
      </Card>

      <h2 className="mb-2 font-semibold">E-Mail-Adresse</h2>
      <Card className="mb-6">
        <p className="mb-3 text-sm text-muted">
          Aktuell: <span className="font-medium text-text">{user?.email}</span>{" "}
          {user?.emailVerified === false ? <Badge tone="accent">unbestätigt</Badge> : <Badge tone="brand">bestätigt</Badge>}
        </p>
        <form onSubmit={changeEmail} className="max-w-sm space-y-3">
          <Field id="new-email" label="Neue E-Mail-Adresse" type="email" autoComplete="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} hint="Wir schicken einen Bestätigungslink an die neue Adresse und einen Hinweis an die bisherige." />
          <Field id="mail-pw" label="Passwort zur Bestätigung" type="password" autoComplete="current-password" required value={mailPw} onChange={(e) => setMailPw(e.target.value)} />
          <Button type="submit" busy={mailBusy} disabled={!newEmail || !mailPw}>Adresse ändern</Button>
        </form>
      </Card>

      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Angemeldete Geräte</h2>
        <Button
          variant="secondary"
          size="sm"
          disabled={(sessions?.length ?? 0) < 2}
          onClick={async () => {
            if (!(await ask("Alle anderen Geräte abmelden?", { confirmLabel: "Abmelden" }))) return;
            await run(() => api("/auth/sessions/revoke-others", { method: "POST", body: {} }));
          }}
        >
          Alle anderen abmelden
        </Button>
      </div>
      {list.error && !sessions ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : sessions === null ? (
        <ListSkeleton rows={2} />
      ) : (
      <Card flush className="divide-y divide-border">
        {(
          sessions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium">
                  {s.device} {s.current && <Badge tone="brand">dieses Gerät</Badge>}
                </p>
                <p className="text-xs text-muted">Angemeldet am {dateFmt.format(new Date(s.createdAt))}</p>
              </div>
              {!s.current && (
                <Button variant="ghost" size="sm" onClick={() => run(() => api(`/auth/sessions/${s.id}`, { method: "DELETE" }))}>Abmelden</Button>
              )}
            </div>
          ))
        )}
      </Card>
      )}
    </>
  );
}
