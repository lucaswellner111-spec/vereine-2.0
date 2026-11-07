import { BackLink } from "./ui";

/** Nur am Handy sichtbar: Zurueck zur Ordnerliste. Am Desktop steht das Untermenue in der Seitenleiste. */
export function SettingsTabs({ active }: { active: string }) {
  void active;
  return (
    <BackLink href="/einstellungen" className="md:hidden">
      Einstellungen
    </BackLink>
  );
}
