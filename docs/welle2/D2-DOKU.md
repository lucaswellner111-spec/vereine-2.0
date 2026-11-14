# D2: Jugendkonten Etappe E1 (Eltern verwalten Kinder, kein Kind-Login)

Stand: 2026-11-14. Spezifikation: `docs/welle2/JUGEND-KONZEPT.md`. Einträge für `DATENSCHUTZ-LAUNCH.md` (Abschnitt 2/4/5) und `OFFENE-PUNKTE.md` stehen hier gesammelt und werden vom Koordinator übernommen.

## 1. Umfang E1
- Elternkonto (Erwachsenenkonto, bestätigte E-Mail) legt Kinder von 6 bis 15 Jahren an: Name, Geburtsdatum, Selbstauskunft „sorgeberechtigt“.
- Jugendkonto: `identity.users.account_type='youth'`, Platzhalter-E-Mail `youth+<uuid>@konto.invalid`, kein Passwort-Hash, keine Sitzung, kein Login, kein Passwort-Reset (per Test belegt). Mail an `*.invalid` wird nie versendet.
- Mitgliedschaft über die Eltern: Einladungslink (= Vereinsbestätigung, sofort aktiv) oder Antrag (Vorstand bestätigt). Das Kind kann nie selbst beitreten.
- Zu-/Absagen und Helferdienste durch die Eltern; der andere Elternteil wird benachrichtigt (ohne Kindesnamen).
- Rechnungen und Beitragslauf an den Rechnungsempfänger (Elternteil); fehlt er, wird das Kind übersprungen und im Ergebnis genannt (`skippedNoRecipient`). Geschwister: je Kind eine Rechnung.
- Vorstand/Moderation: Jugend-Kennzeichnung und voller Name in Mitgliederliste, Anwesenheit, Mitgliederübersicht; Elternname nur in der Mitgliederliste.
- Plattformgrenzen: Jugendkonten sind nicht auffindbar (Suche, Profilseite, Folgen, Kontaktkandidaten), nicht anschreibbar (`canContact`), nicht im Chat (Gruppenmitglieder ausgeschlossen), nur Rolle „Mitglied“.
- Alter zentral: `packages/shared/src/youth.ts` (`ageOn`, `graduationDate`, Konstanten), `apps/api/src/common/age.ts` (Berliner Datum). Grenzen 6 bis 15, Schaltjahr 29.02. -> 01.03.
- Job `youth.graduation` (täglich): Hinweis 30 und 7 Tage vor dem 16. Geburtstag (je einmal), am Stichtag ruht das Jugendkonto (Eltern können nur noch ansehen, exportieren, austreten, löschen).
- Rate-Limits: 5 Kinder/Tag, max. 10 Kinder je Elternteil, 20 Beitritte/Tag, 120 Zu-/Absagen und 60 Helfer-Eintragungen je Stunde, Export 5/h, Löschen 10/h.

## 2. Verarbeitungen (für DATENSCHUTZ-LAUNCH Abschnitt 2)
| Verarbeitung | Daten | Zweck | Rechtsgrundlage (Arbeitsannahme) | Frist |
|---|---|---|---|---|
| Jugendkonto | Anzeigename (Vorname + Initiale), voller Name, Geburtsdatum, Verknüpfung zu Elternteil | Verwaltung des Kindes im Verein durch die Eltern, Altersgrenze | Art. 6 Abs. 1 lit. b (Vereinsmitgliedschaft über die Eltern), lit. a/Art. 8 für freigabepflichtige Funktionen (E3/E4) | bis Löschung durch Eltern; Geburtsdatum fällt mit dem Konto weg |
| Nachweis Elternfreigabe (`identity.guardian_consents`) | Kind-ID, Eltern-ID, Zweck, Verein-ID, erteilt/widerrufen, Textfassung + Prüfsumme | Nachweis Art. 7 Abs. 1 DSGVO | Art. 6 Abs. 1 lit. c/f | append-only; nach Löschung des Kindes pseudonym 3 Jahre (`retain_until`), dann Löschung per Job; keine IP, kein User-Agent |
| Zu-/Absagen, Helferdienste, Anwesenheit des Kindes | wie bei Erwachsenen | Vereinsbetrieb | Art. 6 Abs. 1 lit. b | Anwesenheit 24 Monate (siehe offene Punkte), Rest bis Löschung |
| Rechnungen für ein Kind | Empfänger = Elternteil; `subject_name` (voller Name des Kindes) als Kopie | Beitragsabrechnung | Art. 6 Abs. 1 lit. b, c (GoBD) | Aufbewahrung wie Rechnungen; bei Kindlöschung entfällt nur `subject_user_id`, die Namenskopie bleibt |
| Audit | `youth.created/consent.granted/revoked/exported/deleted/graduation.paused` mit Kind-ID, ohne Namen/Geburtsdatum | Nachvollziehbarkeit | Art. 6 Abs. 1 lit. f | 12 Monate (Standard) |
| Benachrichtigungen an Eltern | `child_rsvp`, `child_graduation`, `membership_decision` (mit `child`) | Information | Art. 6 Abs. 1 lit. b | 180 Tage; Export-Felder in `EXPORT_KEYS`, kein Kindesname |

## 3. Austritt, Auskunft, Löschung (Abschnitt 4/5)
- Austritt des Kindes (Eltern oder Vorstand): Stammdaten beim Verein werden geleert (`anonymizeOnLeave`), die Freigabe für diesen Verein wird als widerrufen nachgewiesen (neuer Eintrag).
- Auskunft: `GET /guardian/children/:id/export` (Eltern, ohne Platzhalter-E-Mail), enthält Stammdaten, Freigaben, Termine, Anwesenheit, Rechnungen mit Kindesbezug. Eigene Auskunft des Elternteils enthält `guardianship` (Kinder, erteilte Freigaben).
- Löschung: `DELETE /guardian/children/:id` mit Passwort des Elternteils; `PrivacyService.eraseEverything` wie beim Konto; `GuardianService.eraseUser` startet die 3-Jahres-Frist der Nachweise.
- Elternteil löscht sein Konto: Nachweise werden entkoppelt, Rechnungsempfänger geht an einen anderen Elternteil; war er der letzte, ruht das Kind und wird nach 30 Tagen gelöscht (`orphanedYouth`, Job `privacy.retention`).
- `boundaries.spec.ts`: Privacy-Allowlist unverändert; neue Tests sperren Jugend-Tabellen für alle Bereiche außer auth/guardian.

## 4. Migration
`0031_youth_accounts`: `users.account_type`, `youth_profiles`, `guardianships` (partieller Unique-Index: ein Rechnungsempfänger je Kind), `guardian_consents` (+ Trigger append-only, Löschen nur im Aufbewahrungsjob nach Fristende, TRUNCATE nie), `billing.invoices.subject_user_id/subject_name`, Unique-Index `invoices_fee_run_recipient_uq` (je Lauf, Empfänger und Kind), `billing.fee_runs.skipped_no_recipient`.

## 5. Offene Rechtsfragen (zusätzlich in OFFENE-PUNKTE.md)
1. Genügt Selbstauskunft + bestätigte E-Mail + Vereinsbestätigung als Nachweis der Elternschaft (Art. 8 Abs. 2)?
2. Aufbewahrung der Freigabe-Nachweise 3 Jahre gegen Löschanspruch des Kindes.
3. Namenskopie des Kindes auf aufbewahrungspflichtigen Rechnungen nach Löschung; Rechnung an Elternteil mit Kindesbezug (GoBD).
4. Anwesenheit Minderjähriger: 12 oder 24 Monate (in E1 unverändert 24).
5. Altersuntergrenze 6 Jahre (Missbrauchsschutz, Wert offen).
6. Sorgerechtskonflikt (E1: ein Elternteil; weitere Eltern folgen in E2).
7. Plattformkonto ruht ab 16 bis zur Übernahme (E5): rechtliche Wirkung auf Mitgliedschaft und Rechnungsempfänger.
8. Information der Kinder/Eltern (Art. 13) in kindgerechter Fassung noch zu schreiben.

## 6. Bewusst nicht in E1
Kind-Login (E3), zweiter Elternteil per Einladung und Wechsel des Rechnungsempfängers (E2; Datenmodell vorbereitet), Freigaben für Kommentare/Chat/Push/Avatar (E4), Übernahme mit 16 (E5), CSV-Import für Kinder (E2), YouthGuard/Positivliste (greift erst mit Kind-Login; bis dahin hat das Jugendkonto keine Sitzung). Zahlungen/Spenden nicht gebaut. Kind-Login in der UI: „Kommt später“.

## 7. Risiken
- Termin-Benachrichtigungen an Kinder (event_created etc.) landen im unbenutzten Posteingang des Kindes (nur Nachrücken wird an Eltern geleitet); Folge: Zeilen bis 180 Tage.
- Beitragsklassen-Altershinweise und Elternkontakt für den Vorstand fehlen (E2).
- Am 16. Geburtstag bleibt der Elternteil Rechnungsempfänger, bis E5 die Übernahme regelt.
