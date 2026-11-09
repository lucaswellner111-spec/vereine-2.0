"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { takeHashToken } from "@/lib/next-url";

/** Ziel des Links aus "Passwort vergessen" (/passwort-neu#t=…). Danach sind alle Geraete abgemeldet. */
export default function NewPasswordPage() {
  const { clear } = useAuth();
  const tokenRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (tokenRef.current === null) tokenRef.current = takeHashToken();
    setToken(tokenRef.current);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/auth/password/reset", { method: "POST", body: { token, newPassword: password } });
      clear(); // auch dieses Geraet ist abgemeldet
      setDone(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Passwort geändert</h1>
        <Alert tone="success">Dein neues Passwort gilt ab sofort. Aus Sicherheitsgründen wurdest du auf allen Geräten abgemeldet.</Alert>
        <Link href="/login" className="block text-center text-sm font-medium text-brand hover:underline">Jetzt anmelden</Link>
      </div>
    );
  }

  if (token === "") {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Neues Passwort</h1>
        <Alert>Der Link ist ungültig oder abgelaufen.</Alert>
        <Link href="/passwort-vergessen" className="block text-center text-sm font-medium text-brand hover:underline">Neuen Link anfordern</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-xl font-semibold">Neues Passwort</h1>
      {error && (
        <Alert>
          {error}{" "}
          <Link href="/passwort-vergessen" className="underline">Neuen Link anfordern</Link>
        </Alert>
      )}
      <Field id="password" label="Neues Passwort" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} hint="Mindestens 12 Zeichen. Ein Satz aus mehreren Wörtern ist ideal." />
      <Button type="submit" busy={busy} disabled={!token || password.length < 12} className="w-full">Passwort speichern</Button>
    </form>
  );
}
