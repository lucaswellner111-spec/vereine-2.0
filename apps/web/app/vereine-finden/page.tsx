import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { ORG_CATEGORIES, PUBLIC_PAGE_SIZE, TAGS, TAG_GROUPS, type PublicOrgSummary } from "@vereine/shared";
import { PublicBusy } from "@/components/public-busy";
import { SITE_CONTAINER, SiteFooter, SiteHeader } from "@/components/site";
import { TagChips } from "@/components/tag-chips";
import { Avatar, Badge, Button, Card, EmptyState, Input, LinkButton, Select } from "@/components/ui";
import { finderLink, finderQuery } from "@/lib/finder";
import { fetchPublic, RATE_LIMITED, rateLimited } from "@/lib/public-api";
import { ALLOW_INDEXING, SITE_URL } from "@/lib/site-meta";

export const metadata: Metadata = {
  title: "Vereine finden",
  description: "Finde Vereine in deiner Nähe nach Ort, Sportart oder Thema – ohne Anmeldung.",
  alternates: { canonical: `${SITE_URL}/vereine-finden` },
  robots: ALLOW_INDEXING ? { index: true, follow: true } : { index: false, follow: false },
};

type Search = { q?: string; ort?: string; tag?: string; kategorie?: string; seite?: string };

const label = "mb-1 block text-xs font-medium text-muted";

/** Vereinsfinder ohne Login: nur Vereine, die ihre oeffentliche Seite freigeschaltet haben. Funktioniert ohne JavaScript (GET-Formular). */
export default async function FinderPage({ searchParams }: { searchParams: Promise<Search> }) {
  const f = finderQuery(await searchParams);
  const loaded = await fetchPublic<PublicOrgSummary[]>(`/orgs${f.apiQuery ? `?${f.apiQuery}` : ""}`).catch(rateLimited);
  if (loaded === RATE_LIMITED) return <PublicBusy retryHref={finderLink(f, f.seite)} />;
  const results = loaded ?? [];
  const pageLink = (seite: number) => finderLink(f, seite);
  const filtered = !!(f.q || f.ort || f.tag || f.kategorie);

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className={`${SITE_CONTAINER} py-8`}>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Vereine finden</h1>
        <p className="mt-1 text-sm text-muted">Vereine, die ihre Seite öffentlich zeigen. Weitere findest du nach der Anmeldung.</p>

        <form method="get" action="/vereine-finden" role="search" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
          <div>
            <label htmlFor="f-q" className={label}>Name oder Stichwort</label>
            <Input id="f-q" name="q" type="search" defaultValue={f.q} maxLength={80} placeholder="z. B. Turnverein" className="w-full" />
          </div>
          <div>
            <label htmlFor="f-ort" className={label}>Ort</label>
            <Input id="f-ort" name="ort" defaultValue={f.ort} maxLength={60} autoComplete="address-level2" placeholder="z. B. Musterstadt" className="w-full" />
          </div>
          <div>
            <label htmlFor="f-tag" className={label}>Sportart oder Thema</label>
            <Select id="f-tag" name="tag" defaultValue={f.tag} className="w-full">
              <option value="">Alle</option>
              {TAG_GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {TAGS.filter((t) => t.group === g).map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="f-kat" className={label}>Kategorie</label>
            <Select id="f-kat" name="kategorie" defaultValue={f.kategorie} className="w-full">
              <option value="">Alle</option>
              {ORG_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
          <Button type="submit" className="w-full lg:w-auto">Suchen</Button>
        </form>

        <section aria-label="Ergebnisse" className="mt-8">
          {results.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={filtered ? "Keine Vereine zu deiner Suche." : "Noch keine öffentlichen Vereinsseiten."}
              action={filtered ? <LinkButton href="/vereine-finden" variant="secondary">Filter zurücksetzen</LinkButton> : <LinkButton href="/registrieren">Kostenlos registrieren</LinkButton>}
            >
              {filtered ? "Versuche einen anderen Ort oder eine andere Sportart." : "Vereine schalten ihre öffentliche Seite in der Verwaltung frei."}
            </EmptyState>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((o) => (
                <li key={o.slug}>
                  <Card className="h-full">
                    <Link href={`/verein/${o.slug}`} className="flex items-center gap-3 rounded-lg hover:underline">
                      <Avatar name={o.name} size={44} mediaId={o.logoId} kind="org" publicMedia />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{o.name}</span>
                        <span className="block text-xs text-muted">{o.city} · {o.members} {o.members === 1 ? "Mitglied" : "Mitglieder"}</span>
                      </span>
                    </Link>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge>{o.category}</Badge>
                      <TagChips tags={o.tags} />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {(f.seite > 1 || results.length === PUBLIC_PAGE_SIZE) && (
            <nav aria-label="Seiten" className="mt-6 flex justify-center gap-3">
              {f.seite > 1 && <LinkButton href={pageLink(f.seite - 1)} variant="secondary">Zurück</LinkButton>}
              {results.length === PUBLIC_PAGE_SIZE && <LinkButton href={pageLink(f.seite + 1)} variant="secondary">Weitere Vereine</LinkButton>}
            </nav>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
