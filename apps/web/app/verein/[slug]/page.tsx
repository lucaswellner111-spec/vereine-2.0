import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CalendarDays, MapPin, Newspaper } from "lucide-react";
import type { PublicOrg } from "@vereine/shared";
import { PublicBusy, RATE_LIMIT_MESSAGE } from "@/components/public-busy";
import { SITE_CONTAINER, SiteFooter, SiteHeader } from "@/components/site";
import { TagChips } from "@/components/tag-chips";
import { Avatar, Badge, Card, DetailHeader, EmptyState, LinkButton, SectionTitle } from "@/components/ui";
import { EVENT_KIND_LABEL } from "@/lib/events";
import { withNext } from "@/lib/next-url";
import { fetchPublic, publicMediaUrl, RATE_LIMITED, rateLimited } from "@/lib/public-api";
import { ALLOW_INDEXING, SITE_URL } from "@/lib/site-meta";

type Props = { params: Promise<{ slug: string }> };

const SLUG = /^[a-z0-9-]{1,80}$/;
/** Einmal je Anfrage (Metadaten + Seite), 429 -> RATE_LIMITED */
const loadOrg = cache(async (slug: string) => (SLUG.test(slug) ? fetchPublic<PublicOrg>(`/orgs/${encodeURIComponent(slug)}`).catch(rateLimited) : null));

const tz = "Europe/Berlin";
const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: tz });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const org = await loadOrg(slug);
  if (org === RATE_LIMITED) return { title: RATE_LIMIT_MESSAGE, robots: { index: false, follow: false } };
  if (!org) return { title: "Verein nicht gefunden", robots: { index: false, follow: false } };
  const description = (org.about || `${org.name} aus ${org.city} auf Klubnest.`).slice(0, 160);
  return {
    title: `${org.name} (${org.city})`,
    description,
    alternates: { canonical: `${SITE_URL}/verein/${org.slug}` },
    // Vorschau mit Testdaten: erst mit NEXT_PUBLIC_ALLOW_INDEXING=1 in Suchmaschinen
    robots: ALLOW_INDEXING ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: org.name,
      description,
      url: `${SITE_URL}/verein/${org.slug}`,
      type: "website",
      ...(org.bannerId ? { images: [{ url: `${SITE_URL}${publicMediaUrl(org.bannerId, "banner")}`, width: 1500, height: 500 }] } : {}),
    },
  };
}

/**
 * Oeffentliche Vereinsseite ohne Login (vom Vorstand freigeschaltet). Zeigt bewusst keine Personendaten:
 * keine Mitgliedernamen, keine Autoren, keine Beitragsbilder, nur oeffentliche Termine.
 */
export default async function PublicOrgPage({ params }: Props) {
  const { slug } = await params;
  const org = await loadOrg(slug);
  if (org === RATE_LIMITED) return <PublicBusy retryHref={`/verein/${slug}`} />;
  if (!org) notFound();
  const next = `/vereine/${org.slug}`;

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className={`${SITE_CONTAINER} py-8`}>
        {org.bannerId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicMediaUrl(org.bannerId, "banner")}
            srcSet={`${publicMediaUrl(org.bannerId, "banner-sm")} 750w, ${publicMediaUrl(org.bannerId, "banner")} 1500w`}
            sizes="(max-width: 768px) 100vw, 1152px"
            alt=""
            width={1500}
            height={500}
            className="mb-6 aspect-[3/1] w-full rounded-xl bg-surface-2 object-cover"
          />
        )}
        <DetailHeader
          media={<Avatar name={org.name} size={72} mediaId={org.logoId} kind="org" publicMedia />}
          title={org.name}
          badges={<Badge>{org.category}</Badge>}
          subtitle={
            <>
              {org.city} · {org.members} {org.members === 1 ? "Mitglied" : "Mitglieder"}
            </>
          }
          actions={
            <>
              <LinkButton href={withNext("/login", next)} variant="secondary">Anmelden, um zu folgen</LinkButton>
              <LinkButton href={withNext("/login", next)}>Mitglied werden</LinkButton>
            </>
          }
        >
          {org.tags.length > 0 && <TagChips tags={org.tags} to="/vereine-finden" className="mt-3" />}
        </DetailHeader>

        {org.about && <p className="mt-6 max-w-3xl whitespace-pre-line break-words text-sm leading-relaxed">{org.about}</p>}

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="pub-events">
            <SectionTitle icon={CalendarDays} className="mb-3">
              <span id="pub-events">Nächste öffentliche Termine</span>
            </SectionTitle>
            {org.events.length === 0 ? (
              <EmptyState title="Gerade keine öffentlichen Termine." />
            ) : (
              <ul className="space-y-3">
                {org.events.map((e, i) => (
                  <li key={`${e.startsAt}-${i}`}>
                    <Card>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 break-words font-medium [overflow-wrap:anywhere]">{e.title}</p>
                        <Badge>{EVENT_KIND_LABEL[e.kind] ?? "Termin"}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        <time dateTime={e.startsAt}>{dateLabel(e.startsAt)}, {timeLabel(e.startsAt)} Uhr</time>
                        {e.endsAt && <> – {timeLabel(e.endsAt)} Uhr</>}
                      </p>
                      {e.location && (
                        <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                          <MapPin size={14} aria-hidden /> {e.location}
                        </p>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="pub-posts">
            <SectionTitle icon={Newspaper} className="mb-3">
              <span id="pub-posts">Neuigkeiten</span>
            </SectionTitle>
            {org.posts.length === 0 ? (
              <EmptyState title="Noch keine Neuigkeiten." />
            ) : (
              <ul className="space-y-3">
                {org.posts.map((p, i) => (
                  <li key={`${p.createdAt}-${i}`}>
                    <Card>
                      <p className="text-xs text-muted">
                        <time dateTime={p.createdAt}>{dateLabel(p.createdAt)}</time>
                      </p>
                      <p className="mt-1 whitespace-pre-line break-words text-sm [overflow-wrap:anywhere]">{p.body}</p>
                      <TagChips tags={p.tags} className="mt-2" />
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <p className="mt-10 text-xs text-muted">
          Diese Seite hat der Verein selbst freigegeben. Sie zeigt keine Namen von Mitgliedern. Mehr siehst du nach der Anmeldung.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
