"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PersonItem } from "@vereine/shared";
import { Alert, Avatar, Button, Card, PageHeader } from "@/components/ui";
import { api, describeError } from "@/lib/api";

export default function PeoplePage() {
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<PersonItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setPeople(null);
      return;
    }
    const t = setTimeout(() => {
      api<PersonItem[]>(`/profiles/search?q=${encodeURIComponent(q.trim())}`).then(setPeople).catch((e) => setError(describeError(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function follow(p: PersonItem) {
    setError(null);
    try {
      const updated = await api<{ viewer: { follow: PersonItem["follow"] } }>(`/profiles/${p.handle}/follow`, p.follow === "none" ? { method: "POST", body: {} } : { method: "DELETE" });
      setPeople((list) => (list ?? []).map((x) => (x.userId === p.userId ? { ...x, follow: updated.viewer.follow } : x)));
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <>
      <PageHeader title="Personen finden" subtitle="Suche nach Name oder @Benutzername und folge Menschen aus deinen Vereinen." />
      <div className="mb-4">
        <label htmlFor="people-q" className="sr-only">Suche</label>
        <input
          id="people-q"
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Mindestens 2 Zeichen …"
          className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </div>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {people === null ? (
        <Card><p className="text-sm text-muted">Gib einen Namen ein, um Personen zu finden. <Link href="/vereine" className="text-brand hover:underline">Vereine entdecken →</Link></p></Card>
      ) : people.length === 0 ? (
        <Card><p className="text-sm text-muted">Niemand gefunden.</p></Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {people.map((p) => (
            <div key={p.userId} className="flex items-center gap-3 p-3">
              <Link href={`/profil/${p.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={p.displayName} mediaId={p.avatarId} />
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{p.displayName}</span><span className="block truncate text-xs text-muted">@{p.handle}</span></span>
              </Link>
              <Button size="sm" variant={p.follow === "none" ? "primary" : "secondary"} onClick={() => follow(p)}>
                {p.follow === "following" ? "Du folgst" : p.follow === "requested" ? "Angefragt" : "Folgen"}
              </Button>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
