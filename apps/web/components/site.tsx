import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_LINKS } from "@/lib/legal-links";
import { ThemeToggle } from "./theme-toggle";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 font-extrabold tracking-[-0.02em] ${className ?? ""}`}>
      <span aria-hidden className="relative inline-flex h-8 w-8 -rotate-6 items-center justify-center rounded-[0.625rem] bg-brand bg-brand-grad text-[15px] font-black text-brand-contrast shadow-glow">
        K
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-pop ring-2 ring-surface" />
      </span>
      <span>Klubnest</span>
    </Link>
  );
}

/** Gemeinsame Breite fuer Kopf, Inhalt und Fuss der oeffentlichen Seiten */
export const SITE_CONTAINER = "mx-auto w-full max-w-6xl px-4";

export function SiteHeader() {
  return (
    <header className="glass hairline-b sticky top-0 z-30">
      <div className={`${SITE_CONTAINER} flex h-16 items-center justify-between max-sm:px-3`}>
        <Logo />
        <nav aria-label="Konto" className="flex items-center gap-1 text-sm sm:gap-2">
          {/* Am Handy steht der Darstellungs-Umschalter in der Fusszeile, damit der Kopf ruhig bleibt.
              Huelle statt className: "hidden" verliert sonst gegen das inline-flex der Komponente (kein tailwind-merge) */}
          <div className="mr-1 hidden sm:block">
            <ThemeToggle compact />
          </div>
          <Link href="/login" className="press inline-flex h-10 items-center rounded-full px-3 font-medium text-muted hover:bg-surface-2 hover:text-text">
            Anmelden
          </Link>
          <Link href="/registrieren" className="press inline-flex h-10 items-center rounded-full bg-brand bg-brand-grad px-4 font-semibold text-brand-contrast shadow-glow hover:brightness-110">
            Registrieren
          </Link>
        </nav>
      </div>
    </header>
  );
}

const footerLink ="-mx-2 flex min-h-11 items-center rounded-lg px-2 text-muted hover:bg-surface-2 hover:text-text sm:min-h-9";

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text">{title}</h2>
      <ul className="mt-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className={footerLink}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-10 text-sm">
      <div className={`${SITE_CONTAINER} grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-[2fr_1fr_1fr]`}>
        <div className="col-span-2 sm:col-span-1">
          <Logo />
          <p className="mt-3 max-w-xs text-muted">Die Plattform für Vereine, Mitglieder und Fans. Gehostet in Deutschland, ohne Werbung und ohne Tracking.</p>
        </div>
        <FooterColumn
          title="Klubnest"
          links={[
            { href: "/registrieren", label: "Registrieren" },
            { href: "/login", label: "Anmelden" },
            { href: "/vereine-finden", label: "Vereine finden" },
            { href: "/hilfe", label: "Hilfe" },
            { href: "/kontakt", label: "Kontakt" },
          ]}
        />
        <FooterColumn title="Rechtliches" links={LEGAL_LINKS} />
      </div>
      <div className={`${SITE_CONTAINER} mt-8 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">Darstellung</span>
          <ThemeToggle compact />
        </div>
        <p className="text-xs text-muted">© {new Date().getFullYear()} Klubnest</p>
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
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
