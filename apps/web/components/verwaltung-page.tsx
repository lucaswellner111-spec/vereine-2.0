"use client";

import type { ReactNode } from "react";
import type { OrgRole } from "@vereine/shared";
import { itemsForRole, VERWALTUNG_ITEMS, useVerwaltung } from "@/lib/verwaltung";
import { Alert, ArrowLink, BackLink, CardSkeletons, EmptyState, ErrorState, PageHeader, Select, Skeleton } from "./ui";

export type VerwaltungCtx = { slug: string; role: OrgRole; refresh: () => void; onError: (m: string | null) => void };

/**
 * Rahmen jeder Verwaltungs-Unterseite: Titel, Vereinsauswahl bei mehreren Vereinen, Lade-/Rechte-Zustaende
 * und Fehleranzeige. Der Inhalt bekommt Verein, Rolle und Hilfsfunktionen.
 */
export function VerwaltungPage({ id, children }: { id: string; children: (ctx: VerwaltungCtx) => ReactNode }) {
  const { orgs, slug, setSlug, detail, role, refresh, reloadOrgs, orgsError, error, setError } = useVerwaltung();
  const item = VERWALTUNG_ITEMS.find((i) => i.id === id);
  const title = item?.label ?? "Verwaltung";

  if (orgs === null && orgsError) return <ErrorState message={orgsError} onRetry={reloadOrgs} />;
  if (orgs === null) return <CardSkeletons count={2} />;
  if (orgs.length === 0) {
    return (
      <>
        <PageHeader title="Verwaltung" subtitle="Hier verwaltest du deine Vereine." />
        <EmptyState title="Du bist noch in keinem Vorstand, Kassenwart oder in der Moderation eines Vereins." action={<ArrowLink href="/vereine/neu">Verein gründen</ArrowLink>} />
      </>
    );
  }

  const allowed = !!role && itemsForRole(role).some((i) => i.id === id);
  return (
    <>
      {/* Handy: Rueckweg zur Bereichsliste (am Desktop steht sie in der Seitenleiste) */}
      <BackLink href="/verwaltung" className="md:hidden">Verwaltung</BackLink>
      <PageHeader
        title={title}
        subtitle={detail ? `${detail.name} · ${detail.members} ${detail.members === 1 ? "Mitglied" : "Mitglieder"} · ${detail.followers} Follower` : <Skeleton className="mt-1 h-4 w-56" />}
        action={
          orgs.length > 1 ? (
            <div className="w-full sm:w-auto">
              <label htmlFor="org" className="sr-only">Verein</label>
              <Select id="org" value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full max-w-full sm:w-auto sm:max-w-64">
                {orgs.map((o) => (
                  <option key={o.slug} value={o.slug}>{o.name}</option>
                ))}
              </Select>
            </div>
          ) : undefined
        }
      />
      {error && !detail ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            refresh();
          }}
        />
      ) : error ? (
        <div className="mb-4"><Alert>{error}</Alert></div>
      ) : null}
      {!detail && !error && <CardSkeletons count={1} />}
      {detail && role && !allowed && (
        <EmptyState title="Mit deiner Rolle hast du auf diese Seite keinen Zugriff." action={<ArrowLink href="/verwaltung">Zurück zur Verwaltung</ArrowLink>} />
      )}
      {detail && role && allowed && slug && children({ slug, role, refresh, onError: setError })}
    </>
  );
}
