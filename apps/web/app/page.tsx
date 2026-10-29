import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site";

const features = [
  { title: "Feed für deine Vereine", text: "Neuigkeiten, Termine und Aufrufe – transparent sortiert, auf Wunsch rein chronologisch." },
  { title: "Datenschutz-Chat", text: "Nachrichten an Mitglieder und Gruppen, verschlüsselt gespeichert, mit Löschfristen." },
  { title: "Spenden", text: "Direkt an den Verein, mit automatischer Zuwendungsbestätigung." },
  { title: "Verwaltung", text: "Mitglieder, Beiträge, Rechnungen und Rundmails an einem Ort." },
];

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:py-24">
          <p className="mb-3 inline-block rounded-full bg-brand/15 px-3 py-1 text-xs font-medium text-brand">
            DSGVO-konform · Gehostet in Deutschland
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Die soziale Plattform für Vereine, Mitglieder und Fans.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            Vernetzen, informieren, spenden und verwalten – ohne Tracking und ohne Werbeprofile.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/registrieren" className="rounded-lg bg-brand px-5 py-3 font-medium text-brand-contrast hover:bg-brand-hover">
              Kostenlos registrieren
            </Link>
            <Link href="/login" className="rounded-lg border border-border bg-surface px-5 py-3 font-medium hover:bg-surface-2">
              Anmelden
            </Link>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-20 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-1.5 text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
