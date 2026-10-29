"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OrgSummary } from "@vereine/shared";
import { Alert, Avatar, Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { api, describeError } from "@/lib/api";

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api<OrgSummary[]>(`/orgs${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)
        .then(setOrgs)
        .catch((e) => setError(describeError(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <PageHeader
        title="Vereine entdecken"
        subtitle="Finde Vereine in deiner Nähe und folge ihnen."
        action={<LinkButton href="/vereine/neu">Verein gründen</LinkButton>}
      />
      <div className="mb-4">
        <label htmlFor="q" className="sr-only">Suche</label>
        <input
          id="q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, Ort oder Kategorie suchen …"
          className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </div>
      {error && <Alert>{error}</Alert>}
      {orgs === null ? (
        <p className="text-sm text-muted" role="status">Lade …</p>
      ) : orgs.length === 0 ? (
        <Card>
          <p className="text-sm">{q ? "Nichts gefunden." : "Noch keine Vereine."} Gründe den ersten Verein deiner Region!</p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {orgs.map((org) => (
            <li key={org.slug}>
              <Link href={`/vereine/${org.slug}`} className="block h-full">
                <Card className="h-full transition-colors hover:bg-surface-2">
                  <div className="flex items-center gap-3">
                    <Avatar name={org.name} size={44} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{org.name}</p>
                      <p className="text-xs text-muted">{org.city}</p>
                    </div>
                  </div>
                  {org.about && <p className="mt-3 line-clamp-2 text-sm text-muted">{org.about}</p>}
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                    <Badge>{org.category}</Badge>
                    <span>{org.members} Mitglieder</span>
                    <span>· {org.followers} Follower</span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
