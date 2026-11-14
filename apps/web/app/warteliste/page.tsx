import type { Metadata } from "next";
import { Check } from "lucide-react";
import { parseWaitlistSource } from "@vereine/shared";
import { SITE_CONTAINER, SiteFooter, SiteHeader } from "@/components/site";
import { WaitlistForm } from "@/components/waitlist-form";
import { ALLOW_INDEXING, SITE_URL } from "@/lib/site-meta";

export const metadata: Metadata = {
  title: "Warteliste",
  description: "Trag dich ein und erfahre als Erste:r, wenn Klubnest startet. Bestätigung per E-Mail, Austragen mit einem Klick, kein Tracking.",
  alternates: { canonical: `${SITE_URL}/warteliste` },
  robots: ALLOW_INDEXING ? { index: true, follow: true } : { index: false, follow: false },
};

/** Eigene Seite fuer Flyer-QR-Codes, Link in Bio usw.: `/warteliste?q=flyer` (nur Werte aus dem festen Vokabular zaehlen). */
export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const source = parseWaitlistSource(Array.isArray(q) ? q[0] : q) ?? "warteliste";
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className={`${SITE_CONTAINER} py-10`}>
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[1fr_1.4fr] md:items-start">
          <div>
            <h1 className="text-3xl font-black tracking-[-0.03em]">Auf die Warteliste 📝</h1>
            <p className="mt-2 text-muted">Trag dich ein und wir melden uns, sobald Klubnest startet. Nur Infos zu Klubnest, kein Spam.</p>
            <ul className="mt-4 space-y-2 text-sm">
              {[
                "Bestätigung per Link in der Mail (Double-Opt-in)",
                "Austragen jederzeit mit einem Klick, danach löschen wir deine Adresse",
                "Wir messen nicht, ob du unsere Mails öffnest",
                "Unbestätigte Anmeldungen löschen wir nach 7 Tagen",
              ].map((p) => (
                <li key={p} className="flex gap-2.5"><Check size={16} aria-hidden className="mt-0.5 shrink-0 text-brand" />{p}</li>
              ))}
            </ul>
          </div>
          <WaitlistForm source={source} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
