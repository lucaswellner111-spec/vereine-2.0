/**
 * Freigaben bei mehreren Eltern: restriktiv, EIN Widerspruch genuegt (docs/welle2/JUGEND-KONZEPT.md, Abschnitt 7 Punkt 7).
 * Reine Funktion ohne Datenbank (getestet in consent-rules.spec.ts).
 */
/** Eintraege fuer EINEN Zweck/Verein, NEUESTE ZUERST. */
export type ConsentEvent = { guardianUserId: string | null; granted: boolean };

/**
 * Widerspricht ein ANDERER aktiver Elternteil? Gilt, wenn dessen letzter Eintrag fuer diesen Zweck/Verein ein Widerruf ist.
 * Wer widersprochen hat, hebt es selbst wieder auf (neue Freigabe); der andere Elternteil kann das nicht fuer ihn tun.
 * Eintraege ohne Person (Austritt durch den Vorstand, Konto geloescht) zaehlen nicht als Widerspruch eines Elternteils.
 */
export function objectingGuardian(events: ConsentEvent[], activeGuardianIds: string[], me: string): string | null {
  const latest = new Map<string, ConsentEvent>();
  for (const e of events) {
    if (!e.guardianUserId || !activeGuardianIds.includes(e.guardianUserId)) continue;
    if (!latest.has(e.guardianUserId)) latest.set(e.guardianUserId, e);
  }
  for (const [guardian, e] of latest) if (guardian !== me && !e.granted) return guardian;
  return null;
}
