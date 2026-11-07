import { BackLink } from "./ui";

/** Nur am Handy sichtbar, immer ueber dem Seitentitel: Zurueck zur Ordnerliste. Am Desktop steht das Untermenue in der Seitenleiste. */
export function SettingsBackLink() {
  return (
    <BackLink href="/einstellungen" className="md:hidden">
      Einstellungen
    </BackLink>
  );
}
