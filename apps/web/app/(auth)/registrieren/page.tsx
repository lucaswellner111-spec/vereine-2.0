"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Checkbox, Field } from "@/components/ui";
import { describeError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { rememberNext, safeNext, withNext } from "@/lib/next-url";

export default function RegisterPage() {
  const { register } = useAuth();
  // Erst nach dem Laden gesetzt, damit Server- und Client-Ausgabe uebereinstimmen.
  const [nextTarget, setNextTarget] = useState("");
  useEffect(() => setNextTarget(safeNext(window.location.search, "")), []);
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!age || !terms || !privacy) {
      setError("Bitte bestätige Alter, Nutzungsbedingungen und Datenschutzerklärung.");
      return;
    }
    setBusy(true);
    try {
      await register({ ...form, confirmAge16: true, acceptTerms: true, acceptPrivacy: true });
      rememberNext(safeNext(window.location.search, ""));
      setSentTo(form.email.trim());
      setForm((f) => ({ ...f, password: "" }));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    // Gleiche Ansicht fuer neue und schon registrierte Adressen (verraet nicht, ob es ein Konto gibt).
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Prüfe dein Postfach</h1>
        <p className="text-sm text-muted">
          Wir haben eine E-Mail an <span className="font-medium text-text">{sentTo}</span> geschickt. Klicke auf den Link darin, um dein Konto zu bestätigen – danach bist du direkt angemeldet. Der Link ist 24 Stunden gültig.
        </p>
        <p className="text-sm text-muted">Keine Mail da? Schau im Spam-Ordner nach oder registriere dich in ein paar Minuten noch einmal.</p>
        <Link href={withNext("/login", nextTarget)} className="block text-center text-sm font-medium text-brand hover:underline">Zur Anmeldung</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-xl font-semibold">Konto erstellen</h1>
      {error && <Alert>{error}</Alert>}
      <Field id="name" label="Anzeigename" autoComplete="nickname" required minLength={2} maxLength={50} value={form.displayName} onChange={set("displayName")} hint="Ein Pseudonym ist erlaubt." />
      <Field id="email" label="E-Mail" type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
      <Field id="password" label="Passwort" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={form.password} onChange={set("password")} hint="Mindestens 12 Zeichen. Ein Satz aus mehreren Wörtern ist ideal." />
      <div className="space-y-2.5">
        <Checkbox id="age" checked={age} onChange={(e) => setAge(e.target.checked)}>
          Ich bin mindestens 16 Jahre alt.
        </Checkbox>
        <Checkbox id="terms" checked={terms} onChange={(e) => setTerms(e.target.checked)}>
          Ich akzeptiere die{" "}
          <Link href="/agb" target="_blank" className="text-brand underline">Nutzungsbedingungen</Link>.
        </Checkbox>
        <Checkbox id="privacy" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)}>
          Ich habe die{" "}
          <Link href="/datenschutz" target="_blank" className="text-brand underline">Datenschutzerklärung</Link>{" "}
          gelesen.
        </Checkbox>
      </div>
      <Button type="submit" busy={busy} className="w-full">
        Konto erstellen
      </Button>
      <p className="text-center text-sm text-muted">
        Schon registriert?{" "}
        <Link href={withNext("/login", nextTarget)} className="font-medium text-brand hover:underline">Anmelden</Link>
      </p>
    </form>
  );
}
