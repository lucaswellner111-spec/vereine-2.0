"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { safeNext, withNext } from "@/lib/next-url";

export default function LoginPage() {
  const { user, loading, login, loginTwoFactor } = useAuth();
  const router = useRouter();
  // Erst nach dem Laden gesetzt, damit Server- und Client-Ausgabe uebereinstimmen.
  const [nextTarget, setNextTarget] = useState("");
  useEffect(() => setNextTarget(safeNext(window.location.search, "")), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    setDeleted(new URLSearchParams(window.location.search).has("geloescht"));
  }, []);

  useEffect(() => {
    if (!loading && user) router.replace(safeNext(window.location.search));
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (challenge) {
        await loginTwoFactor(challenge, code);
      } else {
        const res = await login({ email, password });
        if (res) {
          setChallenge(res.challenge);
          return;
        }
      }
      router.replace(safeNext(window.location.search));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-xl font-semibold">Anmelden</h1>
      {deleted && <Alert tone="success">Dein Konto und deine Daten wurden gelöscht.</Alert>}
      {error && <Alert>{error}</Alert>}
      {challenge ? (
        <>
          <p className="text-sm text-muted">Gib den 6-stelligen Code aus deiner Authenticator-App ein. Ohne Zugriff auf die App funktioniert auch ein Notfallcode.</p>
          <Field id="code" label="Code" inputMode="text" autoComplete="one-time-code" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} />
        </>
      ) : (
        <>
          <Field id="email" label="E-Mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field id="password" label="Passwort" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Anmelden …" : challenge ? "Bestätigen" : "Anmelden"}
      </Button>
      {challenge && (
        <button type="button" onClick={() => { setChallenge(null); setCode(""); setError(null); }} className="w-full text-center text-sm text-muted hover:text-text">
          Zurück
        </button>
      )}
      <p className="text-center text-sm text-muted">
        Noch kein Konto?{" "}
        <Link href={withNext("/registrieren", nextTarget)} className="font-medium text-brand hover:underline">
          Jetzt registrieren
        </Link>
      </p>
    </form>
  );
}
