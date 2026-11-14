"use client";

import { useState, type FormEvent } from "react";
import { api, describeError } from "@/lib/api";
import { useBusy } from "@/lib/use-api";
import { toast } from "./ui-hosts";
import { Button, Card, Field } from "./ui";

/**
 * Plattform-Werkzeug "Vorstand setzen": nur fuer Vereine ohne aktiven Vorstand (z. B. nach der Kontoloeschung des
 * einzigen Vorstands). Die Person muss ein Konto haben; der Aufruf wird protokolliert.
 */
export function PlatformOrgAdmin() {
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [busy, run] = useBusy();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      try {
        await api(`/platform/orgs/${encodeURIComponent(slug.trim().toLowerCase())}/admin`, { method: "POST", body: { email } });
        toast.success("Vorstand gesetzt.");
        setSlug("");
        setEmail("");
      } catch (err) {
        toast.error(describeError(err));
      }
    });
  };

  return (
    <Card className="mb-4">
      <h2 className="mb-1 font-semibold">Vorstand setzen</h2>
      <p className="mb-3 text-sm text-muted">Nur für Vereine ohne aktiven Vorstand. Die Person braucht ein Konto; der Vorgang wird protokolliert.</p>
      <form onSubmit={submit} className="grid max-w-xl gap-3 sm:grid-cols-2">
        <Field id="po-slug" label="Vereinsadresse (Slug)" required value={slug} onChange={(e) => setSlug(e.target.value)} />
        <Field id="po-email" label="E-Mail des neuen Vorstands" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="sm:col-span-2">
          <Button type="submit" busy={busy}>Als Vorstand setzen</Button>
        </div>
      </form>
    </Card>
  );
}
