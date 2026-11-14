import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/site";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4">
      <main className="flex w-full flex-1 flex-col items-center justify-center py-10">
        <Logo className="mb-6 text-lg" />
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-card">{children}</div>
      </main>
      {/* Impressum und Datenschutz muessen von jeder Seite aus leicht erreichbar sein */}
      <footer className="pb-[max(env(safe-area-inset-bottom),1rem)] pt-2">
        <nav aria-label="Rechtliches" className="flex items-center justify-center gap-1 text-xs text-muted">
          <Link href="/datenschutz" className="inline-flex min-h-11 items-center rounded-lg px-3 hover:text-text hover:underline">Datenschutz</Link>
          <Link href="/impressum" className="inline-flex min-h-11 items-center rounded-lg px-3 hover:text-text hover:underline">Impressum</Link>
        </nav>
      </footer>
    </div>
  );
}
