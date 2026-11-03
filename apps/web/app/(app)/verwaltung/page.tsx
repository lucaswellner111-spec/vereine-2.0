"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { itemsForRole, useVerwaltung } from "@/lib/verwaltung";

export default function VerwaltungIndexPage() {
  const { orgs, slug, setSlug, detail, role } = useVerwaltung();
  const router = useRouter();
  const items = itemsForRole(role);

  // Auf grossen Bildschirmen steht das Menue in der Seitenleiste: direkt zum ersten Bereich.
  useEffect(() => {
    if (items.length > 0 && window.matchMedia("(min-width: 768px)").matches) router.replace(`/verwaltung/${items[0].id}`);
  }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
  return (
    <>
      <PageHeader title="Verwaltung" subtitle={detail?.name ?? "Lade …"} />
      {orgs.length > 1 && (
        <div className="mb-4">
          <label htmlFor="org" className="sr-only">Verein</label>
          <select id="org" value={slug} onChange={(e) => setSlug(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm">
            {orgs.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
          </select>
        </div>
      )}
      <Card className="divide-y divide-border p-0">
        {items.map(({ id, label, icon: Icon }) => (
          <Link key={id} href={`/verwaltung/${id}`} className="flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-surface-2">
            <Icon size={18} aria-hidden className="text-muted" />
            <span className="flex-1">{label}</span>
            <ChevronRight size={16} aria-hidden className="text-muted" />
          </Link>
        ))}
      </Card>
    </>
  );
}
