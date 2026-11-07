"use client";

import { AlertTriangle } from "lucide-react";
import { Logo } from "@/components/site";
import { Button, Card, LinkButton } from "@/components/ui";

/** Fehlerseite ausserhalb des App-Bereichs. Zeigt bewusst keine Meldung und keinen Stack, nur den Fehler-Code. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-6 text-lg" />
      <Card className="w-full max-w-md text-center">
        <AlertTriangle size={32} aria-hidden className="mx-auto mb-3 text-danger" />
        <h1 className="text-xl font-semibold">Etwas ist schiefgelaufen</h1>
        <p className="mt-1 text-sm text-muted">Versuche es noch einmal. Wenn der Fehler bleibt, lade die Seite neu.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Erneut versuchen</Button>
          <LinkButton href="/" variant="secondary">Startseite</LinkButton>
        </div>
        {error.digest && <p className="mt-4 text-xs text-muted">Fehler-Code: <span className="font-mono">{error.digest}</span></p>}
      </Card>
    </main>
  );
}
