import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import { Logo } from "@/components/site";
import { Card, LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "Nicht gefunden" };

/** 404-Seite (Server-Komponente). */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-6 text-lg" />
      <Card className="w-full max-w-md text-center">
        <SearchX size={32} aria-hidden className="mx-auto mb-3 text-muted" />
        <h1 className="text-xl font-semibold">Seite nicht gefunden</h1>
        <p className="mt-1 text-sm text-muted">Die Adresse gibt es nicht (mehr).</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <LinkButton href="/feed">Zum Feed</LinkButton>
          <LinkButton href="/" variant="secondary">Startseite</LinkButton>
        </div>
      </Card>
    </main>
  );
}
