import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/** Nur am Handy sichtbar: Zurueck zur Ordnerliste. Am Desktop steht das Untermenue in der Seitenleiste. */
export function SettingsTabs({ active }: { active: string }) {
  void active;
  return (
    <Link href="/einstellungen" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-text md:hidden">
      <ArrowLeft size={16} aria-hidden /> Einstellungen
    </Link>
  );
}
