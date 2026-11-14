/** Kurzer Hinweis unter geschuetzten Formularen: die Pruefung laeuft automatisch, ohne Bedienung und ohne Drittanbieter. */
export function CaptchaNote() {
  return (
    <p className="text-xs text-muted">
      Geschützt durch eine automatische Sicherheitsprüfung auf unserem eigenen Server – ohne Rätsel, ohne Tracking, ohne Drittanbieter.
    </p>
  );
}
