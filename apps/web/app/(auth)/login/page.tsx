"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    setDeleted(new URLSearchParams(window.location.search).has("geloescht"));
  }, []);

  useEffect(() => {
    if (!loading && user) router.replace("/feed");
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login({ email, password });
      router.replace("/feed");
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
      <Field id="email" label="E-Mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field id="password" label="Passwort" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Anmelden …" : "Anmelden"}
      </Button>
      <p className="text-center text-sm text-muted">
        Noch kein Konto?{" "}
        <Link href="/registrieren" className="font-medium text-brand hover:underline">
          Jetzt registrieren
        </Link>
      </p>
    </form>
  );
}
