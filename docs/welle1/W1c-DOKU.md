# W1c: Digitale AVV-Akzeptanz (Art. 28 DSGVO)

Stand: 13. November 2026. Einträge zum Übernehmen in `docs/DATENSCHUTZ-LAUNCH.md` (Abschnitt 1, 2, 4, 5) und `docs/OFFENE-PUNKTE.md`. Diese Datei ersetzt keine Rechtsberatung; der rechtlich gültige AVV-Text kommt vom Anwalt/DSB.

## Zu Abschnitt 1 (Rollen)

Die Zeile „Mitgliederverwaltung, Beiträge, Rechnungen, Spenden eines Vereins: Auftragsverarbeiter, AVV je Verein muss beim Onboarding digital akzeptiert werden (**fehlt noch**)“ ändern in: Mechanik **gebaut (W1c)**, Text ist ein **Entwurf/Platzhalter**, Anwaltsprüfung ausstehend, Durchsetzung per `AVV_REQUIRED` (Standard aus).

## Zu Abschnitt 2 (Verarbeitungen)

| Verarbeitung | Daten | Rechtsgrundlage | Speicherort / Frist | Hinweise |
|---|---|---|---|---|
| AVV-Akzeptanz *(W1c)* | Vereins-ID, Fassung (Versionsnummer), SHA-256-Prüfsumme des Textes, Nutzer-ID der zustimmenden Person (nur Vorstand), Zeitpunkt. **Keine IP-Adresse**, kein Text, kein Name | Nachweis der Erfüllung gesetzlicher Pflichten (Art. 28 Abs. 3, Art. 5 Abs. 2, Art. 6 Abs. 1 lit. c DSGVO); berechtigtes Interesse an der Beweisführung (lit. f) | Schema `avv`, Tabelle `avv.acceptances` (append-only, keine Fremdschlüssel). Frist: **offen**, Vorschlag unten | Zustimmung nur durch den Vorstand mit bestätigter E-Mail-Adresse; kein Passwort/2FA nötig. Zugriffsprotokoll `avv.accepted` (nur Verein und Fassung, 12 Monate wie jedes Protokoll). Status und Download sieht auch der Kassenwart |

## Zu Abschnitt 4 (Betroffenenrechte, Löschung, Austritt)

- **Auskunft (Art. 15):** Die zustimmende Person findet ihre abgegebenen Zustimmungen im Export unter `avvAcceptances` (Vereins-ID, Fassung, Prüfsumme, Zeitpunkt). Umgesetzt in `AvvService.exportFor`, aufgerufen von `PrivacyService.exportData` (Allowlist in `boundaries.spec.ts` unverändert).
- **Kontolöschung (Art. 17):** `AvvService.eraseUser` setzt `accepted_by` auf NULL. Der Nachweis (Verein, Fassung, Prüfsumme, Zeitpunkt) bleibt bestehen und gilt weiter; die Oberfläche zeigt „einem inzwischen gelöschten Konto“. Ein Datenbank-Trigger erlaubt ausschließlich dieses Leeren, jede andere Änderung scheitert (Test vorhanden).
- **Austritt aus dem Verein / Rollenwechsel:** keine Wirkung auf den Nachweis; die Person bleibt, bis das Konto gelöscht wird, im Nachweis genannt.
- **Vereinslöschung:** Die Akzeptanzen werden **nicht** mit dem Verein gelöscht (kein Handler an `onOrgDeleted`). Begründung und Vorschlag siehe offene Rechtsfrage 1.

## Zu Abschnitt 5 (offene Punkte, Launch-Vorbereitung)

**Paket W1c, offen:**
- Der AVV-Text in `packages/shared/src/avv.ts` ist ein **Platzhalter** (`status: "draft"`, in der Oberfläche und im Download als ENTWURF gekennzeichnet). Vor dem Launch: Anwaltstext einsetzen, `status: "final"` setzen, `version` erhöhen, neuen Hash in `apps/api/src/avv/avv-document.spec.ts` ergänzen, alte Fassung in `AVV_VERSIONS` behalten (sonst ist ein bereits akzeptierter Text nicht mehr abrufbar).
- **`AVV_REQUIRED=true`** in der Produktionsumgebung setzen (`.env` auf dem Server, nicht im Repo), erst nach Einsetzen des geprüften Textes. Bis dahin sperrt nichts (Standard aus). Beim Einschalten sind alle Bestandsvereine ohne Zustimmung für die gesperrten Aktionen blockiert: vorher Vereine per Mail informieren (Übergangsfrist gilt nur bei vorhandener älterer Zustimmung, nicht bei erster Zustimmung).
- Unterauftragsverarbeiter-Liste im Text (Hetzner DE, Scaleway FR) mit den tatsächlich abgeschlossenen AVV abgleichen; Push-Dienste der Browserhersteller aufnehmen oder bewusst ausnehmen (nicht Teil des Auftrags „Mitgliederdaten/Rechnungen“, aber Anwalt fragen). TOM-Dokument verlinken oder anhängen.
- Gesperrte Aktionen (Stand W1c): Mitglieder-Stammdaten ändern, Beitragsklassen anlegen/ändern/löschen, Mitglieder-Import bestätigen, Beitragslauf anlegen/neu starten, Rechnungen anlegen/finalisieren/löschen/als bezahlt markieren/stornieren, Einladung per Mail. Weiter erlaubt: Lesen, Einladungslinks ohne Mail, Selbstpflege der eigenen Daten durch Mitglieder, Vorschau (Beitragslauf, Import-Prüfung), bereits eingereihte Jobs. Anwalt/DSB prüfen lassen, ob weitere Bereiche (z. B. CSV-Exporte, Anwesenheit) dazugehören.
- Übergangsfrist: `AVV_GRACE_DAYS = 30` ab `publishedAt` der neuen Fassung (nur für Vereine mit älterer Zustimmung). Mit DSB bestätigen.

## Offene Rechtsfragen (zu `docs/OFFENE-PUNKTE.md`)

1. **Aufbewahrung des Nachweises nach Vereinslöschung bzw. Vertragsende.** Aktuell bleibt die Zeile unbegrenzt (nur Vereins-ID, Fassung, Prüfsumme, Zeitpunkt; ohne Personenbezug, sobald das Konto der zustimmenden Person gelöscht ist). **Vorschlag:** Nachweis behalten, solange Ansprüche aus der Auftragsverarbeitung denkbar sind: **3 Jahre ab Ende des Jahres, in dem der Verein gelöscht wurde** (Regelverjährung § 195 BGB, Beginn § 199 BGB), danach Löschjob `purgeExpired` im Dienst `avv` (Frist in `common/retention.ts`, Job `privacy.retention`). Dafür müsste beim Löschen des Vereins ein Zeitstempel (`org_deleted_at`) an den Nachweis geschrieben werden; das ist noch nicht gebaut, weil die Frist rechtlich bestätigt werden muss (Bußgeld-/Verjährungsfristen nach DSGVO/OWiG ggf. länger; Rechnungsbezug 10 Jahre prüfen). Anwalt/DSB entscheiden: 3 Jahre, 6 Jahre oder 10 Jahre.
2. **Wirksamkeit der Zustimmung per Klick.** Genügt Zustimmung durch ein Vorstandsmitglied mit Konto in Textform (Art. 28 Abs. 9 DSGVO, elektronisches Format)? Klären, ob die Vertretungsberechtigung des Zustimmenden geprüft werden muss (Vereinsregister, mehrere Vorstände, Gesamtvertretung) und ob der Verein einen Nachweis (Vorstandsbeschluss) braucht; die Oberfläche lässt den Vorstand bestätigen, dass er vertretungsberechtigt ist.
3. **Nennung der zustimmenden Person im Nachweis.** Speichern der Nutzer-ID ist für den Nachweis nötig und bis zur Kontolöschung vorgesehen; DSB prüft, ob Anonymisierung bei Austritt aus dem Vorstand (nicht nur bei Kontolöschung) nötig ist.
4. **Zeitpunkt der Pflicht.** Ab wann muss der AVV vorliegen (vor dem ersten Speichern von Mitgliederdaten, nicht erst bei Rechnungen)? Aktuell sperrt `AVV_REQUIRED` nur die genannten Schreibaktionen; Mitglieder können ihre Daten weiterhin selbst pflegen und der Verein Beitritte annehmen.
5. **Neue Fassung und Widerspruch.** Was passiert, wenn ein Verein einer neuen Fassung nicht zustimmt (Vertragsende, Löschung/Export der Daten nach Frist)? Bisher nur Sperre der Schreibaktionen, keine Löschung.

## Technik (Kurzüberblick)

- Text: `packages/shared/src/avv.ts` (`AVV_DOCUMENT`, `AVV_VERSIONS`, `avvToMarkdown`); Hash = SHA-256 des Markdown-Textes (API, `avv/avv.service.ts`); Test `avv-document.spec.ts` hält den Hash je Version fest.
- Tabelle: Migration `0027_avv_acceptance` (Schema `avv`, Trigger `acceptances_guard`). In der Vorgabe war 0026 genannt; diese Nummer war bereits durch `0026_waitlist` belegt. Beim Zusammenführen mit parallelen Paketen die Nummer und `meta/_journal.json` prüfen.
- API: `GET orgs/:slug/avv` (Vorstand, Kassenwart), `POST orgs/:slug/avv/accept` (nur Vorstand, bestätigte E-Mail), `GET orgs/:slug/avv/document[?version=]` (Markdown, Header `X-Text-Hash`).
- Durchsetzung: `AvvService.assertAccepted(orgId)` in `MembersService`, `MemberImportService.confirm`, `BillingService`, `FeeRunsService`, `OrgAdminService.mailInvite`; Fehler 403 mit `code: "avv_required"`.
- Web: Seite `/verwaltung/vertrag`, Banner über Verwaltungsseiten, Punkt in „Erste Schritte“.

## Nacharbeit nach Prüfung: Entscheidungen

- **Konfiguration:** `AVV_REQUIRED` steht in `infra/deploy/docker-compose.preview.yml` bei **api und worker** (`${AVV_REQUIRED:-}`, leer = aus). Der Worker braucht es, weil er den Import-Versand (`sendInvites`) ausführt.
- **Trigger:** `avv.acceptances` sperrt zusätzlich **DELETE** (zeilenweise) und **TRUNCATE**; erlaubt bleibt nur `accepted_by` auf NULL. **Folge für ein künftiges `purgeExpired`** (Aufbewahrungsfrist, offene Rechtsfrage 1): Es muss den Trigger bewusst umgehen, z. B. per eigener Migration, die den Trigger durch eine Fristprüfung ersetzt (Löschen nur, wenn die Zeile älter als die Frist ist), oder über eine `SECURITY DEFINER`-Funktion, die nur abgelaufene Zeilen löscht. Ein einfaches `DELETE` im Dienst scheitert absichtlich.
- **Vereinsdaten (`setBillingProfile`, Anschrift/IBAN/Steuerhinweis):** bewusst **nicht gesperrt**. Das sind Daten des Vereins, keine Mitgliederdaten; ohne sie könnte der Vorstand den Onboarding-Schritt „Vereinsdaten“ nicht erledigen. Ein Test belegt das.
- **Import-Nachlauf (`sendInvites`, Job und Folgetage):** prüft die Zustimmung. Ohne gültigen AVV wird **nichts verschickt**, die Zeilen bleiben `queued`, der Job plant sich für den nächsten Morgen neu ein und holt den Versand nach der Zustimmung nach. Test vorhanden.
- **Beitragslauf-Ausführung (`execute`/Sweep):** läuft für einen **bereits angelegten** Lauf zu Ende (erzeugt nur Rechnungsentwürfe aus vorhandenen Daten; Finalisieren, Versand und Bezahlmarkierung bleiben gesperrt). Gesperrt sind **Anlegen und „Erneut versuchen“**. Begründung: Ein halb fertiger Lauf wäre inkonsistenter als ein fertiger Entwurfsstapel.
- **Austritt und Löschen** (Mitglied verlässt Verein, Kontolöschung, Vereinslöschung, Anonymisierung) bleiben immer erlaubt; sie rufen `assertAccepted` nicht auf.
- **Tests ergänzt:** finalize, Entwurf löschen, als bezahlt markieren, stornieren, Beitragslauf-retry, Import bestätigen und Import-Versand, jeweils gesperrt und nach Zustimmung wieder erlaubt; DELETE/TRUNCATE auf der Tabelle scheitern.
