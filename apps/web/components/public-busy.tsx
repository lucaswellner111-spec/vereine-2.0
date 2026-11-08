import { Hourglass } from "lucide-react";
import { SITE_CONTAINER, SiteFooter, SiteHeader } from "./site";
import { EmptyState, LinkButton } from "./ui";

export const RATE_LIMIT_MESSAGE = "Zu viele Anfragen, bitte kurz warten.";

/** Oeffentliche Seiten bei 429 der API: eigene Meldung statt der allgemeinen Fehlerseite. */
export function PublicBusy({ retryHref }: { retryHref: string }) {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className={`${SITE_CONTAINER} py-16`}>
        <EmptyState icon={Hourglass} title={RATE_LIMIT_MESSAGE} action={<LinkButton href={retryHref} variant="secondary">Erneut laden</LinkButton>}>
          Von deinem Anschluss kamen in der letzten Minute sehr viele Aufrufe. Versuche es in einer Minute noch einmal.
        </EmptyState>
      </main>
      <SiteFooter />
    </div>
  );
}
