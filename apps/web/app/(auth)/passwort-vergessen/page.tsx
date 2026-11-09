"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { api, describeError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/auth/password/forgot", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    // Gleiche Ansicht, egal ob es ein Konto mit dieser Adresse gibt
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Prüfe dein Postfach</h1>
        <p className="text-sm text-muted">
          Wenn es ein Konto mit <span className="font-medium text-text">{email.trim()}</span> gibt, bekommst du gleich eine E-Mail mit einem Link. Er ist eine Stunde gültig und funktioniert nur einmal.
        </p>
        <Link href="/login" className="block text-center text-sm font-medium text-brand hover:underline">Zur Anmeldung</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-xl font-semibold">Passwort vergessen</h1>
      <p className="text-sm text-muted">Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst.</p>
      {error && <Alert>{error}</Alert>}
      <Field id="email" label="E-Mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button type="submit" busy={busy} className="w-full">Link anfordern</Button>
      <p className="text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-brand hover:underline">Zurück zur Anmeldung</Link>
      </p>
    </form>
  );
}
