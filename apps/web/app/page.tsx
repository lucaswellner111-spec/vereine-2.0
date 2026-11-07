import { Building2, CalendarDays, Check, FileText, Heart, Link2, Lock, MessageCircle, MessageSquare, Newspaper, Tags, Users } from "lucide-react";
import Link from "next/link";
import { SITE_CONTAINER, SiteFooter, SiteHeader } from "@/components/site";
import { TagChips } from "@/components/tag-chips";

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

const planned = ["Spenden mit Zuwendungsbestätigung", "E-Mail-Benachrichtigungen", "Beitragseinzug per Lastschrift"];

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-4xl px-4 pb-12 pt-16 text-center sm:pt-24">
          <p className="text-sm font-medium text-brand">Für Vereine, Mitglieder und Fans</p>
          <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Das Social Media für Vereine, Mitglieder und Fans.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            Termine, Chat, Mitglieder und ein Feed an einem Ort. Gehostet in Deutschland, ohne Werbung und ohne Tracking.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/registrieren" className="inline-flex h-11 items-center rounded-lg bg-brand px-6 text-sm font-semibold text-brand-contrast hover:bg-brand-hover">
              Kostenlos registrieren
            </Link>
            <Link href="/login" className="inline-flex h-11 items-center rounded-lg border border-border bg-surface px-6 text-sm font-semibold hover:bg-surface-2">
              Anmelden
            </Link>
          </div>
        </section>

        <section aria-label="Vorschau des Feeds" className="mx-auto max-w-xl px-4 pb-20">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <div className="flex items-center gap-3">
              <span aria-hidden className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand">FC</span>
              <div>
                <p className="text-sm font-medium">FC Blau-Weiß Lindenau</p>
                <p className="text-xs text-muted">vor 2 Std. · Verein</p>
              </div>
            </div>
            <p className="mt-3 text-sm">Spieltag! Heimspiel gegen den Tabellenzweiten, Anstoß 15:00 Uhr am Sportplatz. Kuchenspenden sind willkommen.</p>
            <TagChips tags={["fussball", "jugendarbeit"]} className="mt-3" />
            <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-sm text-muted" aria-hidden>
              <span className="inline-flex items-center gap-1.5"><Heart size={15} /> 24</span>
              <span className="inline-flex items-center gap-1.5"><MessageCircle size={15} /> 6</span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-brand"><Check size={15} /> 18 Zusagen</span>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-muted">Beispielansicht</p>
        </section>

        <section className="border-y border-border bg-surface">
          <div className={`${SITE_CONTAINER} py-16`}>
            <h2 className="text-2xl font-semibold tracking-tight">Was Klubnest heute kann</h2>
            <p className="mt-2 max-w-2xl text-muted">Weniger WhatsApp-Chaos und Excel-Listen, mehr Zeit für den Verein.</p>
            <ul className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand"><Icon size={18} aria-hidden /></span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-sm text-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={`${SITE_CONTAINER} grid gap-12 py-16 md:grid-cols-2`}>
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Lock size={20} aria-hidden className="text-brand" /> Datenschutz als Grundlage</h2>
            <ul className="mt-5 space-y-2.5 text-sm">
              {privacy.map((p) => (
                <li key={p} className="flex gap-2.5"><Check size={16} aria-hidden className="mt-0.5 shrink-0 text-brand" />{p}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><FileText size={20} aria-hidden className="text-brand" /> In Entwicklung</h2>
            <p className="mt-2 text-sm text-muted">Diese Funktionen sind geplant, aber noch nicht verfügbar:</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {planned.map((p) => (
                <li key={p} className="flex gap-2.5"><Building2 size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />{p}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* Vollbreite Flaeche wie "Was Klubnest heute kann": Abschnitte wechseln zwischen Seitenhintergrund und Flaeche */}
        <section className="border-t border-border bg-surface">
          <div className={`${SITE_CONTAINER} py-16 text-center`}>
            <h2 className="text-2xl font-semibold tracking-tight">Verein anlegen und loslegen</h2>
            <p className="mx-auto mt-2 max-w-xl text-muted">Gründe deinen Verein in wenigen Minuten, lade Mitglieder per Link ein und plane den ersten Termin.</p>
            <Link href="/registrieren" className="mt-6 inline-flex h-11 items-center rounded-lg bg-brand px-6 text-sm font-semibold text-brand-contrast hover:bg-brand-hover">
              Kostenlos registrieren
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
