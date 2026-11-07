"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { PersonItem } from "@vereine/shared";
import { Alert, ArrowLink, Avatar, Button, Card, EmptyState, ErrorState, Input, ListSkeleton, PageHeader } from "@/components/ui";
import { api, describeError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useDesktopAutoFocus } from "@/lib/use-media-query";

export default function PeoplePage() {
  const [q, setQ] = useState("");
  const term = q.trim();
  const active = term.length >= 2;
  const people = useApi<PersonItem[]>(active ? `/profiles/search?q=${encodeURIComponent(term)}` : null, { debounceMs: 250, keepPrevious: true });
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // kein autoFocus am Handy (Tastatur wuerde sofort aufgehen)
  useDesktopAutoFocus(searchRef);

  async function follow(p: PersonItem) {
    setError(null);
    try {
      const updated = await api<{ viewer: { follow: PersonItem["follow"] } }>(`/profiles/${p.handle}/follow`, p.follow === "none" ? { method: "POST", body: {} } : { method: "DELETE" });
      people.setData((list) => (list ?? []).map((x) => (x.userId === p.userId ? { ...x, follow: updated.viewer.follow } : x)));
    } catch (e) {
      setError(describeError(e));
    }
  }

  let content;
  if (!active)
    content = (
      <EmptyState title="Gib einen Namen ein, um Personen zu finden." action={<ArrowLink href="/vereine">Vereine entdecken</ArrowLink>} />
    );
  else if (people.error && !people.data) content = <ErrorState message={people.error} onRetry={people.reload} />;
  else if (!people.data) content = <ListSkeleton rows={3} />;
  else if (!people.data.length) content = <EmptyState title="Niemand gefunden." />;
  else
    content = (
      <Card flush className="divide-y divide-border">
        {people.data.map((p) => (
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
    );

  return (
    <>
      <PageHeader title="Personen finden" subtitle="Suche nach Name oder @Benutzername und folge Menschen aus deinen Vereinen." />
      <div className="mb-4">
        <label htmlFor="people-q" className="sr-only">Suche</label>
        <Input
          id="people-q"
          type="search"
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Mindestens 2 Zeichen …"
          className="w-full"
        />
      </div>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {content}
    </>
  );
}
