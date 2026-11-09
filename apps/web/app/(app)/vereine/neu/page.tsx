"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MAX_ORG_TAGS, ORG_CATEGORIES, type OrgDetail } from "@vereine/shared";
import { LazyTagPicker as TagPicker } from "@/components/lazy";
import { Alert, BackLink, Button, Card, Field, PageHeader, SelectField, TextareaField } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { useVerwaltung } from "@/lib/verwaltung";
import { useAuth } from "@/lib/auth";

export default function NewOrgPage() {
  const router = useRouter();
  const { reloadOrgs } = useVerwaltung();
  const unverified = useAuth().user?.emailVerified === false;
  const [form, setForm] = useState({ name: "", category: ORG_CATEGORIES[0] as string, city: "", about: "", tags: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const org = await api<OrgDetail>("/orgs", { method: "POST", body: form });
      // Gruender wird Admin: Verwaltung sofort in Navigation und "Mehr" anbieten
      reloadOrgs();
      router.push(`/vereine/${org.slug}`);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  return (
    <>
      <BackLink href="/vereine">Alle Vereine</BackLink>
      <PageHeader title="Verein gründen" subtitle="Du wirst automatisch Vorstand (Admin) deines Vereins." />
      {unverified && <div className="mb-4"><Alert tone="info">Bestätige zuerst deine E-Mail-Adresse (Link in deinem Postfach oder oben „Link erneut senden“). Danach kannst du deinen Verein gründen.</Alert></div>}
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field id="name" label="Name des Vereins" required minLength={3} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <SelectField id="category" label="Kategorie" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {ORG_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <TagPicker label="Sportarten und Themen" value={form.tags} onChange={(tags) => setForm({ ...form, tags })} max={MAX_ORG_TAGS} hint="Damit Mitglieder und Fans deinen Verein finden, z. B. Fußball, Jugendarbeit." />
          <Field id="city" label="Ort" required minLength={2} maxLength={60} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <TextareaField id="about" label="Kurzbeschreibung" rows={4} maxLength={600} value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} />
          <Button type="submit" busy={busy}>{busy ? "Wird angelegt …" : "Verein anlegen"}</Button>
        </form>
      </Card>
    </>
  );
}
