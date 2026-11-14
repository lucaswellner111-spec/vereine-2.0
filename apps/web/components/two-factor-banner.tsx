"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { TwoFactorPolicy } from "@vereine/shared";
import { useApi } from "@/lib/use-api";

const fmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Text des Hinweises (getrennt, damit er ohne Netzwerk testbar ist). */
export function twoFactorBannerText(p: TwoFactorPolicy): string | null {
  if (!p.required || p.enabled) return null;
  if (p.blocked) {
    return "Mitgliederdaten, Rechnungen, Einladungen und Moderation sind gesperrt, bis du Zwei-Faktor-Anmeldung eingerichtet hast. Das dauert etwa zwei Minuten.";
  }
  const until = p.deadline ? ` Bis ${fmt.format(new Date(p.deadline))}` : " Bald";
  return `Als Vorstand brauchst du Zwei-Faktor-Anmeldung zum Schutz der Mitgliederdaten.${until} kannst du sie einrichten, danach sind sensible Bereiche gesperrt.`;
}

/** Hinweis fuer Vorstaende und Plattform-Admins ohne Zwei-Faktor; fuehrt zur Einrichtung mit Notfallcodes. */
export function TwoFactorBanner() {
  const { data } = useApi<TwoFactorPolicy>("/security/two-factor");
  const text = data ? twoFactorBannerText(data) : null;
  if (!data || !text) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
      <ShieldAlert size={18} aria-hidden className="shrink-0 text-accent" />
      <p className="min-w-0 flex-1">{text}</p>
      <Link href="/einstellungen/sicherheit" className="hit-area font-medium text-accent underline underline-offset-2">
        Jetzt einrichten
      </Link>
    </div>
  );
}
