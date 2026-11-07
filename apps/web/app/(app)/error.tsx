"use client";

import { ErrorState, LinkButton } from "@/components/ui";

/** Fehler innerhalb des App-Bereichs: Navigation (Shell) bleibt stehen, nur der Inhalt zeigt den Fehler. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-4">
      <ErrorState message="Etwas ist schiefgelaufen. Versuche es noch einmal." onRetry={reset} />
      <div className="flex flex-wrap items-center justify-center gap-3">
        <LinkButton href="/feed" variant="secondary">Zum Feed</LinkButton>
        {error.digest && <p className="text-xs text-muted">Fehler-Code: <span className="font-mono">{error.digest}</span></p>}
      </div>
    </div>
  );
}
