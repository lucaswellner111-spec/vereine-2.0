"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { OrgRole } from "@vereine/shared";
import { itemsForRole, VERWALTUNG_ITEMS, useVerwaltung } from "@/lib/verwaltung";
import { Alert, Card, PageHeader } from "./ui";

export type VerwaltungCtx = { slug: string; role: OrgRole; refresh: () => void; onError: (m: string | null) => void };

/**
 * Rahmen jeder Verwaltungs-Unterseite: Titel, Vereinsauswahl bei mehreren Vereinen, Lade-/Rechte-Zustaende
 * und Fehleranzeige. Der Inhalt bekommt Verein, Rolle und Hilfsfunktionen.
 */
export function VerwaltungPage({ id, children }: { id: string; children: (ctx: VerwaltungCtx) => ReactNode }) {
  const { orgs, slug, setSlug, detail, role, refresh, error, setError } = useVerwaltung();
  const item = VERWALTUNG_ITEMS.find((i) => i.id === id);
  const title = item?.label ?? "Verwaltung";

  if (orgs === null) return <p className="text-sm text-muted" role="status">Lade …</p>;
  if (orgs.length === 0) {
    return (
      <>
        <PageHeader title="Verwaltung" subtitle="Hier verwaltest du deine Vereine." />
        <Card>
          <p className="text-sm">Du bist noch in keinem Vorstand, Kassenwart oder in der Moderation eines Vereins.</p>
          <Link href="/vereine/neu" className="mt-3 inline-block text-sm font-medium text-brand hover:underline">Verein gründen →</Link>
        </Card>
      </>
    );
  }

  const allowed = !!role && itemsForRole(role).some((i) => i.id === id);
  return (
    <>
      <PageHeader
        title={title}
        subtitle={detail ? `${detail.name} · ${detail.members} ${detail.members === 1 ? "Mitglied" : "Mitglieder"} · ${detail.followers} Follower` : "Lade …"}
        action={
          orgs.length > 1 ? (
            <div>
              <label htmlFor="org" className="sr-only">Verein</label>
              <select id="org" value={slug} onChange={(e) => setSlug(e.target.value)} className="h-10 rounded-lg border border-border bg-surface px-3 text-sm">
                {orgs.map((o) => (
                  <option key={o.slug} value={o.slug}>{o.name}</option>
                ))}
              </select>
            </div>
          ) : undefined
        }
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {detail && role && !allowed && <Card><p className="text-sm text-muted">Mit deiner Rolle hast du auf diese Seite keinen Zugriff. <Link href="/verwaltung" className="text-brand hover:underline">Zurück zur Verwaltung</Link></p></Card>}
      {detail && role && allowed && slug && children({ slug, role, refresh, onError: setError })}
    </>
  );
}
