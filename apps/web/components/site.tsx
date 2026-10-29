import Link from "next/link";
import type { ReactNode } from "react";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className ?? ""}`}>
      <span aria-hidden className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-contrast">
        V
      </span>
      <span>Vereine 2.0</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Logo />
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/login" className="rounded-lg px-3 py-2 text-muted hover:bg-surface-2 hover:text-text">
            Anmelden
          </Link>
          <Link href="/registrieren" className="rounded-lg bg-brand px-3 py-2 font-medium text-brand-contrast hover:bg-brand-hover">
            Registrieren
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-8 text-sm text-muted">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4">
        <p>© {new Date().getFullYear()} Vereine 2.0 · Gehostet in Deutschland</p>
        <nav className="flex gap-4">
          <Link href="/datenschutz" className="hover:text-text">Datenschutz</Link>
          <Link href="/impressum" className="hover:text-text">Impressum</Link>
          <Link href="/agb" className="hover:text-text">Nutzungsbedingungen</Link>
        </nav>
      </div>
    </footer>
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-2 rounded-lg border border-dashed border-accent/60 bg-accent/10 px-3 py-2 text-xs text-muted">
          Platzhalter: Dieser Text muss vor dem Start von einer Rechtsberatung bzw. dem Datenschutzbeauftragten erstellt werden.
        </div>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
