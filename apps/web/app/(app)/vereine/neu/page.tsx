"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ORG_CATEGORIES, type OrgDetail } from "@vereine/shared";
import { Alert, Button, Card, Field, PageHeader } from "@/components/ui";
import { api, describeError } from "@/lib/api";

export default function NewOrgPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", category: ORG_CATEGORIES[0] as string, city: "", about: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const org = await api<OrgDetail>("/orgs", { method: "POST", body: form });
      router.push(`/vereine/${org.slug}`);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  return (
    <>
      <Link href="/vereine" className="mb-3 inline-block text-sm text-muted hover:text-text">← Alle Vereine</Link>
      <PageHeader title="Verein gründen" subtitle="Du wirst automatisch Vorstand (Admin) deines Vereins." />
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field id="name" label="Name des Vereins" required minLength={3} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="space-y-1.5">
            <label htmlFor="category" className="text-sm font-medium">Kategorie</label>
            <select
              id="category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            >
              {ORG_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <Field id="city" label="Ort" required minLength={2} maxLength={60} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <div className="space-y-1.5">
            <label htmlFor="about" className="text-sm font-medium">Kurzbeschreibung</label>
            <textarea
              id="about"
              rows={4}
              maxLength={600}
              value={form.about}
              onChange={(e) => setForm({ ...form, about: e.target.value })}
              className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Wird angelegt …" : "Verein anlegen"}</Button>
        </form>
      </Card>
    </>
  );
}
