"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { TAGS, TAG_GROUPS, type OrgSummary } from "@vereine/shared";
import { TagChips } from "@/components/tag-chips";
import { Building2, SearchX } from "lucide-react";
import { Avatar, Badge, Button, Card, CardSkeletons, EmptyState, ErrorState, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { SearchField } from "@/components/ui-client";
import { useApi } from "@/lib/use-api";

export default function OrgsPage() {
  return (
    <Suspense fallback={<CardSkeletons count={2} />}>
      <Orgs />
    </Suspense>
  );
}

function Orgs() {
  const router = useRouter();
  const pathname = usePathname();
  // Tag steht in der URL (/vereine?tag=fussball), damit Links und Zurueck funktionieren
  const search = useSearchParams();
  const tag = search.get("tag") ?? "";
  const [q, setQ] = useState("");
  // Ort-Filter: Startwert aus der URL (/vereine?ort=Musterstadt), danach lokal (Tippen soll die URL nicht fluten)
  const [city, setCity] = useState(() => search.get("ort") ?? "");

  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (tag) params.set("tag", tag);
  if (city.trim()) params.set("city", city.trim());
  const path = `/orgs${params.size ? `?${params}` : ""}`;
  const orgs = useApi<OrgSummary[]>(path, { debounceMs: 250, keepPrevious: true });

  const setTag = (t: string) => router.replace(t ? `${pathname}?tag=${encodeURIComponent(t)}` : pathname, { scroll: false });

  let content;
  if (orgs.error && !orgs.data) content = <ErrorState message={orgs.error} onRetry={orgs.reload} />;
  else if (!orgs.data) content = <CardSkeletons count={2} />;
  else if (!orgs.data.length)
    content =
      q.trim() || tag || city.trim() ? (
        <EmptyState
          icon={SearchX}
          title="Keine Vereine zu deiner Suche"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQ("");
                setCity("");
                setTag("");
              }}
            >
              Filter zurücksetzen
            </Button>
          }
        >
          Versuche einen anderen Namen, Ort oder eine andere Sportart.
        </EmptyState>
      ) : (
        <EmptyState icon={Building2} title="Noch keine Vereine." action={<LinkButton href="/vereine/neu" variant="secondary">Verein gründen</LinkButton>}>
          Gründe den ersten Verein deiner Region!
        </EmptyState>
      );
  else
    content = (
      <ul className="grid gap-4 sm:grid-cols-2">
        {orgs.data.map((org) => (
          <li key={org.slug}>
            <Link href={`/vereine/${org.slug}`} className="block h-full">
              <Card className="h-full transition-colors hover:bg-surface-2">
                <div className="flex items-center gap-3">
                  <Avatar name={org.name} size={44} mediaId={org.logoId} kind="org" />
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
    );

  return (
    <>
      <PageHeader
        title="Vereine entdecken"
        subtitle="Finde Vereine in deiner Nähe und folge ihnen."
        action={<LinkButton href="/vereine/neu">Verein gründen</LinkButton>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <label htmlFor="tag" className="sr-only">Sportart oder Thema</label>
        <Select id="tag" value={tag} onChange={(e) => setTag(e.target.value)} className="w-full sm:w-56">
          <option value="">Alle Sportarten</option>
          {TAG_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {TAGS.filter((t) => t.group === g).map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </optgroup>
          ))}
        </Select>
        <label htmlFor="ort" className="sr-only">Ort</label>
        <Input id="ort" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ort" autoComplete="address-level2" maxLength={60} className="w-full sm:w-44" />
        <SearchField id="q" label="Vereine suchen" value={q} onChange={setQ} placeholder="Name, Ort oder Kategorie suchen …" className="min-w-0 flex-1" />
      </div>
      {content}
    </>
  );
}
