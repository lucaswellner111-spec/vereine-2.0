import { Building2, CalendarDays, Check, FileText, Heart, Link2, Lock, MessageCircle, MessageSquare, Newspaper, Tags, Users } from "lucide-react";
import Link from "next/link";
import { SITE_CONTAINER, SiteFooter, SiteHeader } from "@/components/site";
import { TagChips } from "@/components/tag-chips";
import { WaitlistForm } from "@/components/waitlist-form";

const features = [
  { icon: Newspaper, title: "Feed und Profile", text: "Neuigkeiten deiner Vereine und Menschen, die du kennst. Die Sortierung ist nachvollziehbar, auf Wunsch rein chronologisch." },
  { icon: MessageSquare, title: "Chat für Mitglieder", text: "Einzel- und Gruppenchats, verschlüsselt gespeichert, mit einstellbaren Löschfristen. Kein Ende-zu-Ende-Chat." },
  { icon: CalendarDays, title: "Termine und Teams", text: "Zu- und Absagen, Erinnerungen, Wiederholungen und Kalender-Abo für Google, Apple und Outlook." },
  { icon: Users, title: "Mitglieder und Beiträge", text: "Mitgliederliste mit Nummern, Beitragsklassen, Rechnungen als PDF und Export für die Buchhaltung." },
  { icon: Link2, title: "Einladungen per Link", text: "Neue Mitglieder treten über einen Link bei, ohne dass du Listen abtippen musst." },
  { icon: Tags, title: "Sportarten und Themen", text: "Vereine und Beiträge tragen Tags wie Fußball, Chor oder Feuerwehr. So findet man, was passt." },
];

const privacy = [
  "Gehostet in Deutschland",
  "Keine Werbung und keine Tracker von Drittanbietern",
  "Einwilligungen nachweisbar und jederzeit widerrufbar",
  "Datenexport und Konto löschen mit wenigen Klicks",
  "Personalisierter Feed nur, wenn du es erlaubst",
];

/** Beispiele fuer Vereinsarten (dekorativ auf der Startseite) */
const vibes = ["⚽ Fußball", "🎶 Chor", "🚒 Feuerwehr", "🤸 Turnen", "🎭 Theater", "🏓 Tischtennis"];

const cta =
  "press inline-flex h-12 items-center rounded-full bg-brand bg-brand-grad px-7 text-[0.9375rem] font-bold text-brand-contrast shadow-glow hover:brightness-110";

const planned = ["Spenden mit Zuwendungsbestätigung", "E-Mail-Benachrichtigungen", "Beitragseinzug per Lastschrift"];

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="relative isolate overflow-x-clip">
        {/* Weiche Farbflecken hinter dem Kopfbereich (dekorativ, ohne Bilder/Fremd-Requests) */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem]">
          <div className="absolute -left-24 top-10 h-80 w-80 rounded-full bg-brand/20 blur-3xl" />
          <div className="absolute -right-16 top-40 h-72 w-72 rounded-full bg-pop/30 blur-3xl dark:bg-pop/10" />
          <div className="absolute left-1/3 top-[28rem] h-64 w-64 rounded-full bg-brand-2/15 blur-3xl" />
        </div>
        <section className="mx-auto max-w-4xl px-4 pb-12 pt-14 text-center sm:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface px-3 py-1 text-sm font-semibold text-brand shadow-card">
            <span aria-hidden className="h-2 w-2 rounded-full bg-pop ring-2 ring-brand/30" />
            Für Vereine, Mitglieder und Fans
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-[2.6rem] font-black leading-[1.05] tracking-[-0.035em] sm:text-6xl">
            Das Social Media für <span className="text-brand">Vereine</span>, Mitglieder und Fans.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            Termine, Chat, Mitglieder und ein Feed an einem Ort. Gehostet in Deutschland, ohne Werbung und ohne Tracking.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/registrieren" className={cta}>
              Kostenlos registrieren
            </Link>
            <Link href="/login" className="press inline-flex h-12 items-center rounded-full border border-border bg-surface px-7 text-[0.9375rem] font-bold shadow-card hover:bg-surface-2">
              Anmelden
            </Link>
          </div>
          <ul aria-label="Beispiele für Vereine" className="mx-auto mt-10 flex max-w-2xl flex-wrap justify-center gap-2">
            {vibes.map((v) => (
              <li key={v} className="rounded-full border border-border/70 bg-surface px-3.5 py-1.5 text-sm font-medium shadow-card">{v}</li>
            ))}
          </ul>
        </section>

        <section aria-label="Vorschau des Feeds" className="mx-auto max-w-xl px-4 pb-20">
          <div className="relative">
          <span aria-hidden className="absolute -right-1 -top-4 z-10 rotate-6 rounded-full bg-surface px-3 py-1.5 text-sm font-bold shadow-overlay sm:-right-6">❤️ 24</span>
          <span aria-hidden className="absolute -bottom-4 -left-1 z-10 -rotate-6 rounded-full bg-brand bg-brand-grad px-3 py-1.5 text-sm font-bold text-brand-contrast shadow-glow sm:-left-6">✅ 18 Zusagen</span>
          <div className="rotate-[-1deg] rounded-2xl border border-border/70 bg-surface p-5 shadow-overlay transition-transform hover:rotate-0">
            <div className="flex items-center gap-3">
              <span aria-hidden className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand bg-brand-grad text-sm font-black text-brand-contrast">FC</span>
              <div>
                <p className="text-sm font-bold">FC Blau-Weiß Lindenau</p>
                <p className="text-xs text-muted">vor 2 Std. · Verein</p>
              </div>
            </div>
            <p className="mt-3 text-[0.9375rem] leading-relaxed">Spieltag! ⚽ Heimspiel gegen den Tabellenzweiten, Anstoß 15:00 Uhr am Sportplatz. Kuchenspenden sind willkommen. 🍰</p>
            <TagChips tags={["fussball", "jugendarbeit"]} className="mt-3" />
            <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-sm text-muted" aria-hidden>
              <span className="inline-flex items-center gap-1.5"><Heart size={16} className="fill-current text-like" /> 24</span>
              <span className="inline-flex items-center gap-1.5"><MessageCircle size={15} /> 6</span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-brand"><Check size={15} /> 18 Zusagen</span>
            </div>
          </div>
          </div>
          <p className="mt-8 text-center text-xs text-muted">Beispielansicht</p>
        </section>

        <section className="border-y border-border/70 bg-surface">
          <div className={`${SITE_CONTAINER} py-16`}>
            <h2 className="text-3xl font-black tracking-[-0.03em]">Was Klubnest heute kann</h2>
            <p className="mt-2 max-w-2xl text-muted">Weniger WhatsApp-Chaos und Excel-Listen, mehr Zeit für den Verein.</p>
            <ul className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span className="mt-0.5 inline-flex h-11 w-11 shrink-0 -rotate-3 items-center justify-center rounded-xl bg-brand bg-brand-grad text-brand-contrast shadow-glow"><Icon size={20} aria-hidden /></span>
                  <div>
                    <h3 className="font-bold tracking-tight">{title}</h3>
                    <p className="mt-1 text-sm text-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={`${SITE_CONTAINER} grid gap-12 py-16 md:grid-cols-2`}>
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-black tracking-[-0.03em]"><Lock size={20} aria-hidden className="text-brand" /> Datenschutz als Grundlage</h2>
            <ul className="mt-5 space-y-2.5 text-sm">
              {privacy.map((p) => (
                <li key={p} className="flex gap-2.5"><Check size={16} aria-hidden className="mt-0.5 shrink-0 text-brand" />{p}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-black tracking-[-0.03em]"><FileText size={20} aria-hidden className="text-brand" /> In Entwicklung</h2>
            <p className="mt-2 text-sm text-muted">Diese Funktionen sind geplant, aber noch nicht verfügbar:</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {planned.map((p) => (
                <li key={p} className="flex gap-2.5"><Building2 size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />{p}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="warteliste" aria-labelledby="warteliste-titel" className="scroll-mt-20 border-t border-border/70">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 md:grid-cols-[1fr_1.4fr] md:items-center">
            <div>
              <h2 id="warteliste-titel" className="text-3xl font-black tracking-[-0.03em]">Dein Verein auf die Warteliste 📝</h2>
              <p className="mt-2 text-muted">Trag deinen Verein ein und wir melden uns, sobald Klubnest für alle startet. Nur eine Mail zum Start, keine Werbung.</p>
              <ul className="mt-4 space-y-2 text-sm">
                {["Bestätigung per Link in der Mail (Double-Opt-in)", "Austragen jederzeit mit einem Klick", "Unbestätigte Anmeldungen löschen wir nach 7 Tagen"].map((p) => (
                  <li key={p} className="flex gap-2.5"><Check size={16} aria-hidden className="mt-0.5 shrink-0 text-brand" />{p}</li>
                ))}
              </ul>
            </div>
            <WaitlistForm />
          </div>
        </section>

        {/* Vollbreite Flaeche wie "Was Klubnest heute kann": Abschnitte wechseln zwischen Seitenhintergrund und Flaeche */}
        <section className="border-t border-border/70 bg-surface">
          <div className={`${SITE_CONTAINER} py-16 text-center`}>
            <h2 className="text-3xl font-black tracking-[-0.03em]">Verein anlegen und loslegen 🚀</h2>
            <p className="mx-auto mt-2 max-w-xl text-muted">Gründe deinen Verein in wenigen Minuten, lade Mitglieder per Link ein und plane den ersten Termin.</p>
            <Link href="/registrieren" className={`${cta} mt-6`}>
              Kostenlos registrieren
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
