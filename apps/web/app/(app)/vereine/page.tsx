"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TAGS, TAG_GROUPS, type OrgSummary } from "@vereine/shared";
import { TagChips } from "@/components/tag-chips";
import { Alert, Avatar, Badge, Card, LinkButton, PageHeader, CardSkeletons } from "@/components/ui";
import { api, describeError } from "@/lib/api";

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Tag aus dem Link (z. B. /vereine?tag=fussball) uebernehmen
  useEffect(() => {
    setTag(new URLSearchParams(window.location.search).get("tag") ?? "");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (tag) params.set("tag", tag);
    const t = setTimeout(() => {
      api<OrgSummary[]>(`/orgs${params.size ? `?${params}` : ""}`)
        .then(setOrgs)
        .catch((e) => setError(describeError(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [q, tag]);

  return (
    <>
      <PageHeader
        title="Vereine entdecken"
        subtitle="Finde Vereine in deiner Nähe und folge ihnen."
        action={<LinkButton href="/vereine/neu">Verein gründen</LinkButton>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <label htmlFor="tag" className="sr-only">Sportart oder Thema</label>
        <select id="tag" value={tag} onChange={(e) => setTag(e.target.value)} className="h-10 rounded-lg border border-border bg-surface px-3 text-sm sm:w-56">
          <option value="">Alle Sportarten</option>
          {TAG_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {TAGS.filter((t) => t.group === g).map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <label htmlFor="q" className="sr-only">Suche</label>
        <input
          id="q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, Ort oder Kategorie suchen …"
          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </div>
      {error && <Alert>{error}</Alert>}
      {orgs === null ? (
        <CardSkeletons count={2} />
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
                  <TagChips tags={org.tags} className="mt-3" />
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                    {org.tags.length === 0 && <Badge>{org.category}</Badge>}
                    <span>{org.members} {org.members === 1 ? "Mitglied" : "Mitglieder"}</span>
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
