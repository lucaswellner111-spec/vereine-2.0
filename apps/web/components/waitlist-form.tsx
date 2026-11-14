"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  WAITLIST_CONSENT_TEXT,
  WAITLIST_MIN_FILL_MS,
  WAITLIST_REGION_LABELS,
  WAITLIST_REGIONS,
  WAITLIST_ROLE_LABELS,
  WAITLIST_ROLES,
  waitlistSignupSchema,
  type WaitlistRegion,
  type WaitlistRole,
  type WaitlistSource,
} from "@vereine/shared";
import { Alert, Button, Checkbox, Field, SelectField } from "@/components/ui";
import { api, describeError } from "@/lib/api";

type Errors = Partial<Record<"email" | "orgName" | "consent", string>>;

/**
 * Warteliste (Startseite und /warteliste, ohne Login). Danach immer dieselbe neutrale Bestaetigung; die Anmeldung gilt erst
 * nach Klick auf den Link in der Mail (Double-Opt-in). Bot-Schutz ohne Drittanbieter: das Feld „website“ ist ein fuer
 * Menschen unsichtbarer Honeypot, dazu wird die Zeit seit Anzeige des Formulars mitgeschickt (Server prueft die Mindestzeit).
 * `source` stammt aus `?q=` (festes Vokabular, auf dem Server erneut geprueft).
 */
export function WaitlistForm({ source }: { source?: WaitlistSource }) {
  const [values, setValues] = useState({ email: "", orgName: "", role: "" as WaitlistRole | "", region: "" as WaitlistRegion | "", website: "" });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const shownAt = useRef<number>(0);
  // Knopf erst nach der Mindestzeit aktiv: Autofill/Passwortmanager werden so nie still vom Server verworfen.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    shownAt.current = Date.now();
    const t = setTimeout(() => setReady(true), WAITLIST_MIN_FILL_MS + 100);
    return () => clearTimeout(t);
  }, []);
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = waitlistSignupSchema.safeParse({
      email: values.email,
      orgName: values.orgName,
      role: values.role || undefined,
      region: values.region || undefined,
      source,
      consent,
      website: values.website || undefined,
      elapsedMs: shownAt.current ? Date.now() - shownAt.current : 0,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        if (key && !next[key]) {
          next[key] =
            key === "email" ? "Bitte gib eine gültige E-Mail-Adresse an." :
            key === "orgName" ? "Bitte kürzer fassen (höchstens 120 Zeichen)." :
            "Bitte bestätige die Einwilligung.";
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await api<{ message: string }>("/waitlist", { method: "POST", body: parsed.data });
      setDone(res.message);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-[22px] border border-border/70 bg-surface p-6 text-center shadow-card">
        <p className="text-4xl" aria-hidden>📬</p>
        <p className="mt-3 text-lg font-bold tracking-tight">{done}</p>
        <p className="mt-1 text-sm text-muted">Der Link in der Mail ist 48 Stunden gültig. Keine Mail da? Schau auch im Spam-Ordner nach.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Warteliste" className="space-y-4 rounded-[22px] border border-border/70 bg-surface p-5 text-left shadow-card sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="wl-email" label="E-Mail" type="email" autoComplete="email" required maxLength={254} value={values.email} onChange={set("email")} error={errors.email} className="sm:col-span-2" />
        <SelectField id="wl-role" label="Deine Rolle (optional)" value={values.role} onChange={set("role")}>
          <option value="">Keine Angabe</option>
          {WAITLIST_ROLES.map((r) => <option key={r} value={r}>{WAITLIST_ROLE_LABELS[r]}</option>)}
        </SelectField>
        <SelectField id="wl-region" label="Region (optional)" value={values.region} onChange={set("region")}>
          <option value="">Keine Angabe</option>
          {WAITLIST_REGIONS.map((r) => <option key={r} value={r}>{WAITLIST_REGION_LABELS[r]}</option>)}
        </SelectField>
        <Field id="wl-org" label="Name des Vereins (optional)" autoComplete="organization" maxLength={120} value={values.orgName} onChange={set("orgName")} error={errors.orgName} className="sm:col-span-2" />
      </div>
      {/* Honeypot: fuer Menschen und Screenreader verborgen, Bots fuellen es oft aus */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="wl-website">Website</label>
        <input id="wl-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
      </div>
      <div>
        <Checkbox id="wl-consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={errors.consent ? "true" : undefined} aria-describedby={errors.consent ? "wl-consent-error" : undefined}>
          {WAITLIST_CONSENT_TEXT}{" "}
          <Link href="/datenschutz" className="font-medium text-brand underline">Datenschutzerklärung</Link>
        </Checkbox>
        {errors.consent && <p id="wl-consent-error" className="mt-1 text-xs text-danger">{errors.consent}</p>}
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" busy={busy} disabled={!ready} className="w-full sm:w-auto">Auf die Warteliste</Button>
    </form>
  );
}
