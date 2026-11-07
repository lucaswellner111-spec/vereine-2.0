"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { PersonItem } from "@vereine/shared";
import { ArrowLink, Avatar, Button, Card, EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/ui";
import { BackButton, SearchField } from "@/components/ui-client";
import { api, describeError } from "@/lib/api";
import { toast } from "@/components/ui-hosts";
import { nextFollowState } from "@/lib/follow";
import { useApi } from "@/lib/use-api";
import { useDesktopAutoFocus } from "@/lib/use-media-query";

export default function PeoplePage() {
  const [q, setQ] = useState("");
  const term = q.trim();
  const active = term.length >= 2;
  const people = useApi<PersonItem[]>(active ? `/profiles/search?q=${encodeURIComponent(term)}` : null, { debounceMs: 250, keepPrevious: true });
  // Sperre je Person: ein laufendes Folgen blockiert nur diesen Eintrag
  const following = useRef(new Set<string>());
  const searchRef = useRef<HTMLInputElement>(null);
  // kein autoFocus am Handy (Tastatur wuerde sofort aufgehen)
  useDesktopAutoFocus(searchRef);

  const setFollow = (userId: string, follow: PersonItem["follow"]) =>
    people.setData((list) => (list ?? []).map((x) => (x.userId === userId ? { ...x, follow } : x)));

  // Optimistisch umschalten; private Profile zeigen sofort "Angefragt"
  const follow = async (p: PersonItem) => {
    if (following.current.has(p.userId)) return;
    following.current.add(p.userId);
    setFollow(p.userId, nextFollowState(p.follow, p.isPrivate));
    try {
      const updated = await api<{ viewer: { follow: PersonItem["follow"] } }>(`/profiles/${p.handle}/follow`, p.follow === "none" ? { method: "POST", body: {} } : { method: "DELETE" });
      setFollow(p.userId, updated.viewer.follow);
    } catch (e) {
      setFollow(p.userId, p.follow);
      toast.error(describeError(e));
    } finally {
      following.current.delete(p.userId);
    }
  };

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
            <Button size="sm" variant={p.follow === "none" ? "primary" : "secondary"} onClick={() => void follow(p)}>
              {p.follow === "following" ? "Du folgst" : p.follow === "requested" ? "Angefragt" : "Folgen"}
            </Button>
          </div>
        ))}
      </Card>
    );

  return (
    <>
      <BackButton fallback="/feed" className="md:hidden">Zurück</BackButton>
      <PageHeader title="Personen finden" subtitle="Suche nach Name oder @Benutzername und folge Menschen aus deinen Vereinen." />
      <div className="mb-4">
        <SearchField id="people-q" label="Personen suchen" inputRef={searchRef} value={q} onChange={setQ} placeholder="Mindestens 2 Zeichen …" />
      </div>
      {content}
    </>
  );
}
