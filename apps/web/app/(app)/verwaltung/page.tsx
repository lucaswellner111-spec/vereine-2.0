"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLink, CardSkeletons, ListGroup, ListRow, EmptyState, ErrorState, PageHeader, Select, Skeleton } from "@/components/ui";
import { LargeTitleHeader } from "@/components/ui-client";
import { useIsDesktopState } from "@/lib/use-media-query";
import { itemsForRole, useVerwaltung } from "@/lib/verwaltung";

export default function VerwaltungIndexPage() {
  const { orgs, slug, setSlug, detail, role, refresh, reloadOrgs, orgsError, error, setError } = useVerwaltung();
  const router = useRouter();
  const items = itemsForRole(role);
  const isDesktop = useIsDesktopState();

  // Auf grossen Bildschirmen steht das Menue in der Seitenleiste: direkt zum ersten Bereich.
  useEffect(() => {
    if (items.length > 0 && isDesktop) router.replace(`/verwaltung/${items[0].id}`);
  }, [items.length, isDesktop]); // eslint-disable-line react-hooks/exhaustive-deps

  if (orgs === null && orgsError) return <ErrorState message={orgsError} onRetry={reloadOrgs} />;
  // Unbekannt oder Desktop mit Bereichen (Weiterleitung laeuft): Skeleton statt kurz aufblitzender Liste
  if (orgs === null || isDesktop === null || (isDesktop && items.length > 0)) return <CardSkeletons count={2} />;
  if (orgs.length === 0) {
    return (
      <>
        <PageHeader title="Verwaltung" subtitle="Hier verwaltest du deine Vereine." />
        <EmptyState title="Du bist noch in keinem Vorstand, Kassenwart oder in der Moderation eines Vereins." action={<ArrowLink href="/vereine/neu">Verein gründen</ArrowLink>} />
      </>
    );
  }
  return (
    <>
      <LargeTitleHeader title="Verwaltung" subtitle={detail?.name ?? <Skeleton className="mt-1 h-4 w-40" />} />
      {orgs.length > 1 && (
        <div className="mb-4">
          <label htmlFor="org" className="sr-only">Verein</label>
          <Select id="org" value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full">
            {orgs.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
          </Select>
        </div>
      )}
      {error && !detail && (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            refresh();
          }}
          className="mb-4"
        />
      )}
      <ListGroup footer={detail ? `${detail.members} ${detail.members === 1 ? "Mitglied" : "Mitglieder"} · ${detail.followers} Follower` : undefined}>
        {items.map(({ id, label, icon }) => (
          <ListRow key={id} href={`/verwaltung/${id}`} icon={icon} title={label} tone={id === "moderation" ? "danger" : id === "beitraege" || id === "rechnungen" ? "accent" : "brand"} />
        ))}
      </ListGroup>
    </>
  );
}
