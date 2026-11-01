import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site";

const features = [
  { icon: "📰", title: "Feed für deine Vereine", text: "Neuigkeiten, Termine und Aufrufe – transparent sortiert, auf Wunsch rein chronologisch." },
  { icon: "💬", title: "Datenschutz-Chat", text: "Nachrichten an Mitglieder und Gruppen, verschlüsselt gespeichert, mit Löschfristen." },
  { icon: "📅", title: "Termine & Teams", text: "Zu- und Absagen, Erinnerungen und Kalender-Export für jede Mannschaft." },
  { icon: "💚", title: "Spenden", text: "Direkt an den Verein, mit automatischer Zuwendungsbestätigung." },
  { icon: "🗂️", title: "Verwaltung", text: "Mitglieder, Beiträge, Rechnungen und Rundmails an einem Ort." },
  { icon: "🔒", title: "Datenschutz ernst genommen", text: "Gehostet in Deutschland, ohne Tracking und ohne Werbeprofile." },
];

const steps = [
  { n: "1", title: "Verein gründen oder finden", text: "Lege deinen Verein in Minuten an oder tritt einem bestehenden bei." },
  { n: "2", title: "Mitglieder einladen", text: "Teams, Rollen und Termine – alle wissen, was ansteht." },
  { n: "3", title: "Gemeinsam wachsen", text: "Fans folgen, Familien bleiben informiert, Spenden kommen an." },
];

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_20%_-10%,color-mix(in_srgb,var(--brand)_22%,transparent),transparent),radial-gradient(40rem_25rem_at_90%_10%,color-mix(in_srgb,var(--brand)_12%,transparent),transparent)]" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-2">
            <div className="text-center lg:text-left">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                <span className="size-1.5 rounded-full bg-brand" /> DSGVO-konform · Gehostet in Deutschland
              </p>
              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
                Das Social Media für <span className="text-brand">Vereine, Mitglieder und Fans.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lg text-muted lg:mx-0">
                Vernetzen, informieren, spenden und verwalten – ohne Tracking und ohne Werbeprofile.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
                <Link href="/registrieren" className="rounded-xl bg-brand px-6 py-3.5 font-semibold text-brand-contrast shadow-lg shadow-brand/25 transition hover:-translate-y-0.5 hover:bg-brand-hover">
                  Kostenlos registrieren
                </Link>
                <Link href="/login" className="rounded-xl border border-border bg-surface px-6 py-3.5 font-semibold transition hover:bg-surface-2">
                  Anmelden
                </Link>
              </div>
              <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted lg:justify-start">
                <li>✓ Keine Werbung</li>
                <li>✓ Kein Tracking</li>
                <li>✓ Daten exportieren &amp; löschen</li>
              </ul>
            </div>

            <div aria-hidden className="relative mx-auto w-full max-w-md">
              <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-brand/25 to-transparent blur-2xl" />
              <div className="space-y-3 rounded-3xl border border-border bg-surface p-4 shadow-2xl">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-full bg-brand text-sm font-bold text-brand-contrast">TS</div>
                  <div>
                    <p className="text-sm font-semibold">TSV Beispielstadt</p>
                    <p className="text-xs text-muted">vor 12 Min. · Verein</p>
                  </div>
                </div>
                <p className="text-sm">Heimspiel am Samstag, 15 Uhr! Wer ist dabei? Kuchenspenden willkommen 🎉</p>
                <div className="h-36 rounded-2xl bg-gradient-to-br from-brand/40 via-brand/15 to-surface-2" />
                <div className="flex gap-2 text-xs">
                  <span className="rounded-full bg-brand/15 px-3 py-1 font-medium text-brand">✓ Zugesagt (18)</span>
                  <span className="rounded-full bg-surface-2 px-3 py-1 text-muted">♥ 42</span>
                  <span className="rounded-full bg-surface-2 px-3 py-1 text-muted">💬 7</span>
                </div>
              </div>
              <div className="absolute -bottom-5 -left-3 rounded-2xl border border-border bg-surface px-4 py-3 text-xs shadow-xl sm:-left-8">
                <p className="font-semibold">🔒 Chat verschlüsselt gespeichert</p>
                <p className="text-muted">Löschfrist: 365 Tage</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight">Alles, was dein Verein braucht</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted">Ein Ort statt vieler Gruppen, Listen und Tools.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="group rounded-2xl border border-border bg-surface p-6 transition hover:-translate-y-1 hover:border-brand/40 hover:shadow-lg">
                <div className="mb-4 grid size-11 place-items-center rounded-xl bg-brand/12 text-xl">{f.icon}</div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-surface-2/60">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-center text-3xl font-bold tracking-tight">So startest du</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {steps.map((s) => (
                <div key={s.n} className="rounded-2xl bg-surface p-6 shadow-sm">
                  <div className="mb-4 grid size-10 place-items-center rounded-full bg-brand text-lg font-bold text-brand-contrast">{s.n}</div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-muted">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="rounded-3xl bg-gradient-to-br from-brand to-brand-hover px-6 py-14 text-center text-brand-contrast">
            <h2 className="text-3xl font-bold tracking-tight">Bereit für dein Vereinsnest?</h2>
            <p className="mx-auto mt-3 max-w-xl opacity-90">Starte kostenlos – in wenigen Minuten ist dein Verein online.</p>
            <Link href="/registrieren" className="mt-8 inline-block rounded-xl bg-white px-6 py-3.5 font-semibold text-neutral-900 transition hover:-translate-y-0.5">
              Jetzt kostenlos registrieren
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
