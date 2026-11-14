# Fragenliste für Anwalt und Datenschutzbeauftragten (DSB)

Stand: 2026-11-13. Projekt Klubnest (Vereine 2.0). Gebündelt aus `docs/OFFENE-PUNKTE.md`, `docs/DATENSCHUTZ-LAUNCH.md`, `docs/ARCHITEKTUR.md`, `docs/PLAN-VOR-GRUENDUNG.md` und der Marketing-Checkliste (`Vereine Marketing/01_Strategie/08_Rechtliche-Checkliste.md`).

**Hinweis:** Das ist keine Rechtsberatung, sondern eine Arbeitsgrundlage für das Mandantengespräch. Alles ist als Frage bzw. Entwurf formuliert. Genannte Rechtsnormen stammen aus unseren Projektdokumenten; wo wir unsicher sind, steht „prüfen“. Die Empfehlungen sind technische/produktseitige Vorschläge, keine Rechtsauskunft.

**Priorität:** A = blockiert den Start mit echten Nutzern/Vereinen · B = vor dem öffentlichen Launch (Indexierung, Marketing, Skalierung der Vereinszahl) · C = später / nach Beta.
**Antwortet:** Anwalt (RA), DSB, Steuerberater (StB). „Quelle“ verweist auf Datei und Abschnitt.

## Übersicht

| Prio | Anzahl | Themen |
|---|---|---|
| A | 12 | Rollen/AVV, Minderjährige, Art. 26 bei öffentlicher Vereinsseite, Fristen-Gesamtpaket, Mail-Anbieter, Zusagen-/Namensanzeige, Sammelmail, Pflichtdokumente, DSA-Grundpflichten, Demo-Daten/Fotos, Datenpanne, Besucher-Datenschutz |
| B | 14 | Beweiskopien (DSA), Austrittsdaten, Rechnungs-Aufbewahrung, Anwesenheit Minderjährige, Umfragen, Beitragslauf Minderjährige, Zuwendungsbestätigung/ZAG, BFSG, Logs, Backups u. a. |
| C | 6 | ML-Ranking, Geodaten, Interessen-Tags, Feed-Ereignisse, E-Rechnung, Stores |

---

## Priorität A: blockiert den Launch

### A1. Rollenverteilung und AVV Plattform ↔ Verein
- **Frage:** Ist die Betreiber-UG/GmbH bei Mitgliederverwaltung, Beitragsläufen, Rechnungen (und später Spenden) tatsächlich Auftragsverarbeiter des Vereins (Art. 28), und bei Konto/Feed/Profile/Chat/Push Verantwortlicher? Stimmt die Abgrenzung in unserer Rollentabelle?
- **Hintergrund:** Wir gehen von Verantwortlicher für Konto/Social und Auftragsverarbeiter für Verwaltungsdaten aus. Die AVV-Akzeptanz beim Vereins-Onboarding fehlt noch. Quelle: `DATENSCHUTZ-LAUNCH.md` Abschnitt 1 und 5; `OFFENE-PUNKTE.md` „Datenschutz/Rechtliches aus Etappe 1“.
- **Optionen:** (1) AVV als digitale Akzeptanz beim Onboarding (Klick mit Versionsnachweis in `consents`); (2) Unterschriebener AVV je Verein (aufwendig); (3) Mischmodell: Online-Akzeptanz, Nachweis per PDF.
- **Empfehlung:** Option 1 mit Versionierung und Unterauftragsverarbeiter-Liste als Anlage; Gesamtstruktur vom Anwalt prüfen lassen.
- **Antwortet:** RA + DSB

### A2. Öffentliche Vereinsseite: Art. 26 oder AVV, Inhaltsverantwortung
- **Frage:** Gemeinsame Verantwortlichkeit (Art. 26) oder Auftragsverarbeitung mit dem Verein für die öffentliche Vereinsseite und öffentliche Beiträge? Wer haftet für Beitragstexte und Bildrechte bei Logo/Banner? Welche Hinweise gehören in Nutzungsbedingungen/AVV?
- **Hintergrund:** Seite ohne Login, nur Vereinsdaten, keine Personendaten; Texte können aber Personen nennen. Quelle: `OFFENE-PUNKTE.md` „Paket P4c Teil 1“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 (Öffentliche Vereinsseite) und 5.
- **Optionen:** (1) Art.-26-Vereinbarung; (2) reine Auftragsverarbeitung, Verein allein verantwortlich; (3) Plattform eigenverantwortlich für Hosting, Verein für Inhalt (prüfen, ob tragfähig).
- **Empfehlung:** Zwischen 1 und 2 vom Anwalt entscheiden lassen; Hinweistext beim Freischalten (existiert schon) anpassen.
- **Antwortet:** RA + DSB

### A3. Mindestalter 16 vs. Jugendvereine (Art. 8 DSGVO, JMStV)
- **Frage:** Wie dürfen Mitglieder unter 16 abgebildet werden? Elternkonto, das Kinder-Mitgliedschaften verwaltet, oder Mitglied ohne eigenes Konto nur mit Stammdaten? Welche Einwilligungs-/Nachweisform reicht? Was ist bei Chat und Feed für Minderjährige nach JMStV zu beachten (prüfen)?
- **Hintergrund:** Plattform verlangt Selbstangabe 16 Jahre, Jugendvereine haben jüngere Mitglieder. Quelle: `OFFENE-PUNKTE.md` „Datenschutz/Rechtliches aus Etappe 1“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 4 (Minderjährige), 5.
- **Optionen:** (1) Elternkonto verwaltet Kinder; (2) Kind als reiner Stammdatensatz ohne Konto (Verein verantwortlich); (3) Plattform bleibt ab 16, Jugendvereine am Anfang ausgeschlossen.
- **Empfehlung:** Zum Start Option 3 (nur ab 16 bzw. Stammdaten ohne Konto) und Option 1 als Roadmap, falls der Anwalt es trägt.
- **Antwortet:** RA + DSB

### A4. Fristen-Gesamtpaket (Löschkonzept bestätigen)
- **Frage:** Sind die umgesetzten Fristen angemessen und dokumentierbar? Benachrichtigungen 180 Tage; Zugriffsprotokoll 12 Monate, Moderation 24 Monate, Rechnungsaktionen 10 Jahre; Anwesenheit 24 Monate; gelöschte Beiträge 30 Tage (offene Meldung länger); abgelaufene Einladungen 30 Tage; unbestätigte Registrierungen 7 Tage; E-Mail-Tokens 7 Tage nach Ablauf; Sperrliste 12 Monate (Bounce) / 36 Monate (Abmeldung Einladungen); Server-Logs 14 Tage; Backups 14 Tage; Chat Standard 365 Tage.
- **Hintergrund:** Alle Fristen sind technisch umgesetzt (außer Logs/Backups, noch zu konfigurieren) und warten auf Bestätigung. Quelle: `OFFENE-PUNKTE.md` „Paket P5“, „Paket S2“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 und 5; Konstanten in `apps/api/src/common/retention.ts`.
- **Optionen:** Fristen bestätigen, kürzen oder verlängern; Begründung je Frist ins Löschkonzept.
- **Empfehlung:** Tabelle (Abschnitt „Zu liefernde Dokumente“) als Entwurf des Löschkonzepts nutzen; nur Abweichungen besprechen.
- **Antwortet:** DSB (Anwalt bei 10-Jahres-Fristen mit StB)

### A5. Mail-Anbieter Scaleway TEM: AVV und Rechtsgrundlagen
- **Frage:** Genügt ein AVV mit Scaleway (Paris/FR) plus Unterauftragsverarbeiter-Liste? Reichen die Rechtsgrundlagen: Vertrag für System-Mails, Opt-in (lit. a) für Sammelmail, berechtigtes Interesse des Vereins (lit. f) für Einladung an eine vom Vorstand eingegebene Adresse, Rechnungsmail im Auftrag des Vereins?
- **Hintergrund:** Mailversand ist gebaut, aber nur mit `MAIL_DRIVER=smtp` aktiv; vorher AVV, SPF/DKIM/DMARC, Datenschutzerklärung. Quelle: `OFFENE-PUNKTE.md` „Paket P5“ und „Paket S2“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 (E-Mail-Versand) und 5.
- **Optionen:** wie beschrieben; Alternative: Einladungslink nur per Link-Weitergabe, ohne Mailversand an Dritte.
- **Empfehlung:** Mail aktivieren erst nach AVV; Einladungsmail mit Abmeldelink (existiert) und Hinweis an Vereine, nur Erwartende einzuladen.
- **Antwortet:** DSB + RA

### A6. Zusagen-, Helferlisten- und Namensanzeige innerhalb des Vereins
- **Frage:** Reicht der Vereinszweck (Art. 6 Abs. 1 lit. b/f), damit aktive Mitglieder bei internen/Team-Terminen und Helferlisten Namen und Profilbilder der Zusagen/Eingetragenen sehen? Oder braucht es ein Opt-out („Meine Zusage nur als Zahl zeigen“)?
- **Hintergrund:** Bei öffentlichen Terminen nur Zahl, intern sichtbar für aktive Mitglieder ohne eigene Einwilligung. Quelle: `OFFENE-PUNKTE.md` „Oberfläche Paket Q2“ und „Paket P4b“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 (Zusagen-Anzeige, Helferlisten).
- **Optionen:** (1) so lassen, in Datenschutzerklärung nennen; (2) Opt-out je Person; (3) Opt-in.
- **Empfehlung:** Option 1, falls DSB zustimmt; sonst 2 (Aufwand klein).
- **Antwortet:** DSB

### A7. Sammelmail (Digest): Einwilligung oder Vertrag
- **Frage:** Ist die tägliche Sammelmail mit Anzahlen (keine Namen/Inhalte) als Opt-in sauber, oder reicht Vertrag/berechtigtes Interesse? Brauchen wir Double-Opt-in und Werbehinweise (prüfen, ob sie „Werbung“ im Sinne des UWG ist)?
- **Hintergrund:** Standardmäßig opt-in geplant, Abbestellen per One-Click. Quelle: `OFFENE-PUNKTE.md` „Paket S2“ („Rechtsfragen (DSB)“); `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 (Sammelmail-Einstellung).
- **Optionen:** Opt-in beim Registrieren, Opt-in später in den Einstellungen, reine Vertragsmail.
- **Empfehlung:** Opt-in in den Einstellungen (Zustand heute), Wortlaut prüfen lassen.
- **Antwortet:** DSB

### A8. Datenschutzerklärung für Besucher ohne Konto und App-Nutzer
- **Frage:** Welche Pflichtangaben braucht die Datenschutzerklärung für Besucher ohne Konto (Server-Logs, Rate-Limit je IP, öffentliche Vereinsseiten und Finder) vor dem Setzen von `NEXT_PUBLIC_ALLOW_INDEXING=1`? Was gehört zusätzlich hinein (Login-Schutz, Nutzungslimits, Bilder-ZIP mit größter WebP-Variante, öffentliche Mitgliederzahl)?
- **Hintergrund:** Texte sind Platzhalter; Indexierung ist bis dahin aus. Quelle: `OFFENE-PUNKTE.md` „Rechtliches“ und „Paket P4c Teil 1“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 5.
- **Optionen:** Eine Gesamterklärung vs. getrennte Erklärung für öffentlichen Bereich.
- **Empfehlung:** Eine Erklärung mit Abschnitt „Besucher ohne Konto“.
- **Antwortet:** DSB + RA

### A9. Demo-Daten, Fotos echter Personen
- **Frage:** Reicht die geplante Löschung der Demo-Daten vor dem Start? Welche Risiken bestanden bis dahin (Fotos echter Personen, auch Kinder, Einwilligung/Lizenz ungeklärt; Konto in zwei Vereinen)? Meldepflicht (prüfen)?
- **Hintergrund:** Fotos nur nach Anmeldung abrufbar; Konto lucaswellner111@gmail.com eingetragen. Quelle: `OFFENE-PUNKTE.md` „Demo-Daten auf klubnest.de“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 7.
- **Optionen:** Löschen mit Anleitung `infra/demo/README.md`; bei künftigen Demos nur eigene/lizenzfreie Bilder oder KI-generierte.
- **Empfehlung:** Vor dem ersten echten Nutzer löschen, Löschnachweis dokumentieren; Demo künftig ohne Personenbilder.
- **Antwortet:** DSB

### A10. DSA-Grundpflichten für unsere Plattform
- **Frage:** Welche DSA-Pflichten gelten konkret für uns (Vermittlungsdienst/Hosting, Plattform?): Kontaktstelle, Meldeverfahren (Art. 16), Begründung (Art. 17), internes Beschwerdeverfahren (Art. 20), Transparenzbericht? Gibt es Erleichterungen für Kleinst-/Kleinunternehmen (prüfen)? Was fehlt im heutigen Meldeweg?
- **Hintergrund:** Meldefunktion für Beiträge, Kommentare und Chat gebaut; Einspruchsverfahren, Transparenzbericht und Benachrichtigung bei Entfernen fehlen. Quelle: `OFFENE-PUNKTE.md` „Rechtliches“, „Erscheinungsbild/Tags“ (Moderation), „Paket P4a“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 5 (Plattformrecht).
- **Optionen:** Mindestumfang jetzt, Ausbau bei Wachstum.
- **Empfehlung:** Anwalt legt Mindestumfang fest; wir bauen danach Einspruch und Benachrichtigung.
- **Antwortet:** RA

### A11. Datenpannen-Prozess und Meldewege
- **Frage:** Wer meldet wann an wen (72 h), wie dokumentieren wir, und wie unterscheiden sich unsere Pflichten als Verantwortlicher von denen als Auftragsverarbeiter (Meldung an den Verein)?
- **Hintergrund:** Notfallplan fehlt. Quelle: `DATENSCHUTZ-LAUNCH.md` Abschnitt 3 und 5. Die Skill `gdprgard-compliance:breach` kann als Vorlage dienen.
- **Optionen:** Eigener Prozess mit Checkliste und Vorlage; DSB als Ansprechpartner.
- **Empfehlung:** Ein-Seiten-Prozess plus Kontaktliste, vor Launch einmal als Übung durchspielen.
- **Antwortet:** DSB

### A12. Benennung eines DSB und Pflicht-Dokumente
- **Frage:** Müssen wir einen DSB benennen (Schwellen, Art der Verarbeitung; prüfen)? Wer erstellt VVT, DSFA, TOM-Dokument?
- **Hintergrund:** Siehe Abschnitt „Zu liefernde Dokumente“. Quelle: `DATENSCHUTZ-LAUNCH.md` Abschnitt 5; `PLAN-VOR-GRUENDUNG.md` Abschnitt 3 bis 5.
- **Optionen:** Externer DSB (Pauschale), interner.
- **Empfehlung:** Externer DSB, der auch die Fristenliste bestätigt.
- **Antwortet:** RA + DSB

---

## Priorität B: vor dem öffentlichen Launch

### B1. DSA-Beweissicherung bei gelöschten Kommentaren und Beiträgen
- **Frage:** Brauchen wir eine verschlüsselte Beweiskopie (wie bei Chat-Meldungen) mit Frist, wenn „Entfernen“ einen Kommentar endgültig löscht? Muss der Autor mit Begründung benachrichtigt werden (Art. 17 DSA)? Braucht Moderation eine Beitrags-Versionshistorie?
- **Hintergrund:** Heute löscht „Entfernen“ den Kommentar, im Audit stehen nur IDs. Quelle: `OFFENE-PUNKTE.md` „Paket P4a“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 (Kommentarmeldungen) und 5.
- **Optionen:** (1) Beweiskopie befristet; (2) nur Metadaten + Begründung; (3) so lassen.
- **Empfehlung:** Option 1 wie beim Chat, Frist an Frage B2 koppeln.
- **Antwortet:** RA + DSB

### B2. Frist für erledigte Meldungen vs. Anfechtungsfrist (Art. 20 DSA)
- **Frage:** Chat-Meldungen werden 30 Tage nach Erledigung gelöscht; das Beschwerdeverfahren verlangt 6 Monate Anfechtbarkeit. Welche Aufteilung ist zulässig (z. B. Entscheidung und Begründung 6 Monate, Beweiskopie 30 Tage)?
- **Hintergrund:** Quelle: `OFFENE-PUNKTE.md` „Härtung Paket P1“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 5 (Paket P1).
- **Empfehlung:** Entscheidung/Begründung 6 Monate, Beweiskopie 30 Tage.
- **Antwortet:** RA + DSB

### B3. Beweiskopie bei Kontolöschung (offene Meldungen)
- **Frage:** Müssen gemeldete Beiträge/Kommentare als Beweis die Kontolöschung überstehen (Art. 17 Abs. 3 lit. e DSGVO)? Für wie lange? Heute verschwinden sie per Kaskade samt Meldung.
- **Hintergrund:** Quelle: `OFFENE-PUNKTE.md` „Paket P5“ (DSA-Frage Kontolöschung).
- **Antwortet:** RA + DSB

### B4. Austritt: pseudonyme Austrittsdaten und Namensaufbewahrung
- **Frage:** Dürfen Mitgliedsnummer, Eintritt/Austritt und Beitragsklasse (ohne Namen) bleiben? Wie lange? Brauchen Vereine Namen länger für Mitgliederverzeichnis/Satzungszwecke, und ist das ihre eigene Verantwortung?
- **Hintergrund:** Austritt löscht Anschrift, Telefon, Geburtsdatum, Erziehungsberechtigte, Notiz. Quelle: `OFFENE-PUNKTE.md` „Datenschutz/Rechtliches aus Etappe 1“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 4.
- **Antwortet:** RA + DSB

### B5. Finalisierte Rechnungen: Aufbewahrung, Anonymisierung, gelöschte Vereine
- **Frage:** Passen 8 bis 10 Jahre (GoBD/AO; genaue Frist prüfen) für Rechnungen Verein → Mitglied? Wer ist Verantwortlicher der Rechnungsdaten nach Vereinslöschung? Wie lange bleiben Zähler (`invoice_counters`)? Anonymisierung bei Kontolöschung des Empfängers ausreichend?
- **Hintergrund:** Löschjob nach Fristablauf fehlt. Quelle: `OFFENE-PUNKTE.md` „Härtung Paket P1“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 (Rechnungen) und 4.
- **Antwortet:** StB + DSB

### B6. `created_by` an Rechnungen, Beitragsläufen, Chats
- **Frage:** Darf die Nutzer-ID der auslösenden Person nach deren Kontolöschung stehen bleiben oder muss sie geleert werden? Gleiche Frage für `chat.conversations.created_by`.
- **Hintergrund:** Quelle: `OFFENE-PUNKTE.md` „Paket P4c Teil 2“ und „Paket P5“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 5.
- **Empfehlung:** Bei Beitragsläufen leeren, bei Rechnungen (Aufbewahrung) nach Anwaltsrat.
- **Antwortet:** DSB

### B7. Frist `billing.fee_runs`
- **Frage:** Vorschlag: mit den Rechnungen, sonst 12 Monate. Ok?
- **Hintergrund:** Quelle: `OFFENE-PUNKTE.md` „Paket P4c Teil 2“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 (Beitragslauf).
- **Antwortet:** DSB + StB

### B8. Beitragslauf und Rechnungen an Minderjährige
- **Frage:** Müssen Rechnungen an Erziehungsberechtigte adressiert werden (Feld `guardianName` existiert, ungenutzt)? Reicht Name/Anschrift des Mitglieds?
- **Hintergrund:** Quelle: `OFFENE-PUNKTE.md` „Paket P4c Teil 2“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 5.
- **Antwortet:** StB + DSB

### B9. Anwesenheitslisten (Frist und Minderjährige)
- **Frage:** Reicht der Vereinszweck für Anwesenheit (da/fehlt/entschuldigt, 24 Monate)? Bei Minderjährigen: Elterninformation oder kürzere Frist? Genügt der Verzicht auf Grund/Freitext (keine Art.-9-Daten)?
- **Hintergrund:** Nur Vorstand und Moderation lesen. Quelle: `OFFENE-PUNKTE.md` „Paket P4b“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 (Anwesenheit) und 5.
- **Antwortet:** DSB

### B10. Umfragen: Stimmen nach Austritt, sensible Themen
- **Frage:** Dürfen anonym gezählte Stimmen nach Austritt bleiben oder müssen sie gelöscht werden? Sollen Umfragen zu Art.-9-Themen (Gesundheit, Religion) in den Community-Richtlinien verboten werden?
- **Hintergrund:** Quelle: `OFFENE-PUNKTE.md` „Paket P4c Teil 1“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 (Umfragestimmen) und 5.
- **Empfehlung:** Verbot sensibler Themen in den Richtlinien; Stimme bleibt anonym gezählt, falls DSB zustimmt.
- **Antwortet:** DSB

### B11. Server-Logs, Backups und Löschwünsche
- **Frage:** Reichen 14 Tage für Server-Logs (IP, Pfad, Zeit) und Backups, auch wenn Backups gelöschte Daten bis zum Ablauf enthalten? Ist IP-Kürzung nötig (prüfen)?
- **Hintergrund:** Rotation noch festzulegen/zu konfigurieren. Quelle: `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 (Server-Logs) und 5 (Technisch/organisatorisch); `OFFENE-PUNKTE.md` „Datenschutz/Rechtliches aus Etappe 1“.
- **Antwortet:** DSB

### B12. Altkonten ohne bestätigte Adresse
- **Frage:** Dürfen Altkonten (vor S2) unbestätigt weiter bestehen (nur eingeschränkt), oder muss eine Bestätigung erzwungen werden? (Technisch: Demo-Konten haben `.invalid`.)
- **Hintergrund:** Quelle: `OFFENE-PUNKTE.md` „Paket S2“.
- **Empfehlung:** Nach Löschung der Demo-Daten gibt es keine echten Altkonten; Frage dann wahrscheinlich erledigt (prüfen).
- **Antwortet:** DSB

### B13. Barrierefreiheit (BFSG, WCAG 2.1 AA)
- **Frage:** Gilt das BFSG für Klubnest, und welchen Prüfumfang erwartet die Marktaufsicht (prüfen)? Genügt automatische axe-Prüfung plus manueller Test mit Screenreader/Tastatur? Barrierefreiheitserklärung nötig?
- **Hintergrund:** axe läuft in E2E; manuelle Prüfung offen. Quelle: `OFFENE-PUNKTE.md` „Rechtliches“ und „Produkt“ (Qualität); `DATENSCHUTZ-LAUNCH.md` Abschnitt 5.
- **Antwortet:** RA

### B14. Zahlungsfluss, ZAG-Abgrenzung und Zahlungs-KYC (vor scharfen Spenden/Lastschrift)
- **Frage:** Ist unser Modell (Zahlungsanbieter in der EU, wir nie im Geldfluss) ohne eigene Erlaubnis nach ZAG tragbar? Wer führt KYC bei Verein und bei der Firma durch? SEPA-Gläubiger-ID und Mandate je Verein: wer ist verantwortlich?
- **Hintergrund:** Quelle: `OFFENE-PUNKTE.md` „Rechtliches“ und „Produkt“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 5 (Zahlungen/Finanzen); `ARCHITEKTUR.md` (Zahlungen getrennt); `PLAN-VOR-GRUENDUNG.md` Abschnitt 4.
- **Optionen:** Mollie (NL) als EU-Kandidat; Stripe passt laut Vorgabe „nur EU-Anbieter“ nicht.
- **Antwortet:** RA + StB

---

## Priorität C: später

### C1. ML-Ranking, Feed-Ereignisse (Impression, Klick, Verweildauer)
- **Frage:** Reicht Einwilligung, wie lange speichern, braucht es eine eigene DSFA (Profiling)? Opt-in-Gestaltung.
- **Hintergrund:** Noch nicht gebaut. Quelle: `OFFENE-PUNKTE.md` „Profile/Feed/Medien“ und „Produkt“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 (Feed-Personalisierung).
- **Antwortet:** DSB

### C2. Interessen-Tags je Nutzer und „Vereine in deiner Nähe“ (Geodaten)
- **Frage:** Rechtsgrundlage und Einwilligungsform für Interessen-Tags mit Ranking-Bonus; Datenschutzbewertung von Standortdaten.
- **Hintergrund:** Quelle: `OFFENE-PUNKTE.md` „Erscheinungsbild/Tags: offen“.
- **Antwortet:** DSB

### C3. Pentest, Virenscan, DB-Rollen als TOM-Bausteine
- **Frage:** Welche TOM-Nachweise erwartet ein Verein beim AVV (Pentest-Bericht, Backup-Test, Wiederherstellungsübung)?
- **Hintergrund:** Quelle: `OFFENE-PUNKTE.md` „Sicherheit“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 3.
- **Antwortet:** DSB

### C4. E-Rechnung und DATEV-Format
- **Frage:** Ab wann ist die E-Rechnung für Vereine Pflicht (prüfen: Stand E-Rechnung ab 2025/2028)? Welche Formate (XRechnung/ZUGFeRD)?
- **Hintergrund:** Quelle: `DATENSCHUTZ-LAUNCH.md` Abschnitt 5 (Zahlungen/Finanzen); `OFFENE-PUNKTE.md` „Produkt“.
- **Antwortet:** StB

### C5. App-Store-Angaben (Privacy Nutrition Label, Data Safety, Altersfreigabe, Spendenregeln)
- **Frage:** Prüfung der Angaben, Nachweis von Melde-/Blockierfunktion, Spendenregeln der Stores für gemeinnützige Organisationen.
- **Hintergrund:** Quelle: Marketing-Checkliste „Store-Einträge“.
- **Antwortet:** RA

### C6. Vereins-Onboarding mit Gemeinnützigkeitsprüfung
- **Frage:** Welche Nachweise (Freistellungsbescheid) dürfen/müssen wir prüfen, und wie lange speichern wir sie?
- **Hintergrund:** Quelle: `OFFENE-PUNKTE.md` „Produkt“.
- **Antwortet:** RA + DSB

---

## Zu liefernde Dokumente

Status: offen = nichts Verwertbares; Vorarbeit = Entwurfsmaterial im Repo vorhanden; gebaut = technische Umsetzung vorhanden, Text fehlt.

| Dokument | Zuständig | Status | Vorarbeit im Repo |
|---|---|---|---|
| **Datenschutzerklärung** | DSB/RA | Platzhalter-Seite | Verarbeitungsliste in `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 (inkl. Fristen, Rechtsgrundlagen); Hinweise zu Besuchern, Logs, Rate-Limit, Bilder-ZIP in `OFFENE-PUNKTE.md` |
| **Impressum (DDG-konform, prüfen)** | RA | Platzhalter-Seite; Firmendaten fehlen | Seite und Verlinkung existieren; Firmendaten erst nach Gründung (`PLAN-VOR-GRUENDUNG.md` Abschnitt 4) |
| **AGB / Nutzungsbedingungen** | RA | Platzhalter | Offene Punkte: Hinweis an Vereine zu Personen in öffentlichen Beiträgen, Bildrechte, Einladungen nur an Erwartende (`OFFENE-PUNKTE.md` P4c, S2) |
| **AVV für Vereine (Art. 28)** | RA/DSB | offen; digitale Akzeptanz beim Onboarding nicht gebaut | Rollenmodell Abschnitt 1, Unterauftragsverarbeiter (Hetzner, Scaleway, später Zahlungsanbieter, Browser-Push-Dienste) in Abschnitt 5; Rechnungs-/Einladungsmail im Auftrag des Vereins |
| **AVVs mit Unterauftragsverarbeitern** (Hetzner, Scaleway) | Betreiber | offen; im Firmennamen erst nach Gründung | Liste in `DATENSCHUTZ-LAUNCH.md` Abschnitt 5 |
| **Verarbeitungsverzeichnis (VVT)** | DSB | Vorarbeit | `DATENSCHUTZ-LAUNCH.md` Abschnitt 2 ist als VVT-Entwurf gedacht (Daten, Zweck, Rechtsgrundlage, Ort, Frist) |
| **TOM-Dokument** | DSB/Technik | Vorarbeit | Abschnitt 3 (gebaut/offen); Architektur: `ARCHITEKTUR.md` (Trennlinien, Secrets je Dienst, Verschlüsselung Chat, getrennte Redis); offen: Firewall, Offsite-Backup, Monitoring, DB-Rollen, Pentest, Wiederherstellungsübung |
| **DSFA** (Profiling/Feed, Chat, Minderjährige) | DSB | offen | Beschreibungen Feed v2, Chat, Profile in `ARCHITEKTUR.md`; Minderjährigenfrage Abschnitt 4 |
| **Löschkonzept** | DSB | Vorarbeit, technisch umgesetzt | Fristen in Abschnitt 2/5; `apps/api/src/common/retention.ts`, Job `privacy.retention`; Ablauf Kontolöschung/Austritt/Vereinslöschung in Abschnitt 4 |
| **Community-Richtlinien** | RA/Produkt | offen | Moderationsfunktionen gebaut; offen: Verbot sensibler Umfragen, Hinweise zu Fotos/Personen |
| **DSA-Kontaktstelle, Meldeverfahren, Transparenzbericht** | RA | teilweise gebaut | Melden für Beiträge/Kommentare/Chat, Plattform- und Vereinsmoderation, Audit; fehlt: Einspruchsverfahren, Benachrichtigung bei Entfernen, Transparenzbericht, Kontaktstelle |
| **Datenpannen-Prozess (72 h)** | DSB | offen | Zugriffsprotokoll, Audit-Log; Skill `gdprgard-compliance:breach` als Vorlage |
| **Auskunfts-/Löschprozess (Art. 15/17/20)** | DSB | gebaut | `GET /privacy/export`, Bilder-ZIP, Kontolöschung mit Kaskade; Text und interner Ablauf fehlen |
| **Einwilligungstexte** (Feed, Push, Sammelmail) | DSB | gebaut | `identity.consents` (append-only); Wortlaut prüfen |
| **Barrierefreiheitserklärung (BFSG, prüfen)** | RA | offen | axe in E2E; manuelle Prüfung offen |

---

## Marketing-Rechtsfragen

Quelle: `Vereine Marketing/01_Strategie/08_Rechtliche-Checkliste.md` sowie `PLAN-VOR-GRUENDUNG.md`.

### M1. „DSGVO-konform“-Aussage
- **Frage:** Ab wann dürfen wir „DSGVO-konform“ werben? Reicht der Vorschlag „entwickelt nach DSGVO, Daten in Deutschland“ vorher? Wann ist Irreführung (UWG § 5) denkbar?
- **Hintergrund:** Erst zulässig, wenn Datenschutzerklärung, AVV, VVT, TOMs stehen. Zusätzlich „Gehostet in Deutschland“: Scaleway sitzt in Frankreich (EU) – Formulierung „in der EU“ prüfen.
- **Empfehlung:** Bis alle Dokumente stehen, nur „entwickelt nach DSGVO“ und „Hosting in der EU“ verwenden; „ohne Tracking“ nur mit grünem Fremd-Host-Wächter belegen.
- **Antwortet:** RA

### M2. Spenden und Zuwendungsbestätigung
- **Frage:** Wer haftet für die Richtigkeit der Zuwendungsbestätigung (Aussteller = Verein)? Dürfen wir amtliche Muster (BMF) als PDF erzeugen? Welche Prüfpflichten (Freistellungsbescheid) haben wir, welche der Verein? Darf „Spenden“ beworben werden, bevor es live ist (UWG-Risiko)?
- **Hintergrund:** `/spenden` zeigt nur „Kommt später“; kein Anbieter, kein Datenmodell. Quelle: `PLAN-VOR-GRUENDUNG.md` Abschnitt 2; Marketing-Checkliste „Werbeaussagen“; `OFFENE-PUNKTE.md` „Produkt“.
- **Empfehlung:** Bis Live-Schaltung als „kommt“ bewerben; Haftungsverteilung im AVV/AGB regeln.
- **Antwortet:** StB + RA

### M3. Kaltakquise bei Vereinen (§ 7 UWG)
- **Frage:** Ist E-Mail-Werbung an Vereine ohne vorherige Einwilligung unzulässig, und gelten Vereine als „sonstige Marktteilnehmer“ (prüfen)? Was ist bei Telefon und persönlichem Besuch erlaubt? Double-Opt-in-Anforderungen für Newsletter.
- **Hintergrund:** Plan: E-Mail nur mit Einwilligung, sonst Telefon/persönlich. Quelle: `PLAN-VOR-GRUENDUNG.md` Abschnitt 3; Marketing-Checkliste „E-Mail“ (verweist auf `04_E-Mail-Marketing.md`).
- **Antwortet:** RA

### M4. Marke „Klubnest“
- **Frage:** Recherche bei DPMA/EUIPO, Anmeldung in Klassen 9, 38, 42 (Klassenwahl prüfen), Verwechslungsgefahr mit bestehenden Marken, Sicherung von Domain und Handles.
- **Hintergrund:** Quelle: `OFFENE-PUNKTE.md` „Rechtliches“; `DATENSCHUTZ-LAUNCH.md` Abschnitt 5; Marketing-Checkliste „Vor dem ersten Post“.
- **Antwortet:** RA (Markenanwalt)

### M5. Fotos und Videos (KUG/DSGVO)
- **Frage:** Welche Einwilligungsform bei Marketingfotos mit Personen, zusätzlich Eltern bei Minderjährigen? Dürfen Vereinsfotos aus der Demo (echte Personen, Kinder) je in Marketing? Screenshots nur mit fiktiven Daten.
- **Hintergrund:** Demo-Fotos haben keine geklärte Lizenz. Quelle: `DATENSCHUTZ-LAUNCH.md` Abschnitt 7; Marketing-Checkliste „Social Media“ und „Präsentationen & Flyer“.
- **Empfehlung:** Nie Demo-Fotos verwenden; eigene Fotos mit schriftlicher Einwilligung oder Stockmaterial mit Lizenz.
- **Antwortet:** RA

### M6. Weitere Werbeaussagen und Kanäle
- **Fragen:** (a) Superlative nur mit Beleg (UWG § 5); (b) vergleichende Werbung nur sachlich und belegbar (UWG § 6); (c) „nie Ende-zu-Ende-verschlüsselt“ – Chat ist serverseitig verschlüsselt, kein E2EE: Formulierung für Verschlüsselungsaussagen; (d) Impressum in jedem Social-Profil, Impressumspflicht für Gründerprofile vor Gründung; (e) Gewinnspiele, Kooperationen/Influencer-Kennzeichnung, Musik in Reels; (f) Nutzung von Vereinsnamen/-logos in Posts nur mit Erlaubnis; (g) Zahlungsanbieter und Gebühren transparent nennen.
- **Hintergrund:** Marketing-Checkliste „Werbeaussagen“, „Social Media“; `PLAN-VOR-GRUENDUNG.md` Abschnitt 3.
- **Antwortet:** RA

---

## Vorschlag für die Reihenfolge der Gespräche
1. Erstgespräch mit RA/DSB: A1, A2, A3, A10, A12 und Gründungsthemen (Plan: Beauftragung vor Gründung, Vorlauf 2 bis 6 Wochen).
2. Dokumentenpaket: Datenschutzerklärung, AVV, AGB, Impressum (A5, A8) sobald Firmendaten stehen.
3. DSB-Sitzung mit Fristen-Tabelle (A4, B2, B3, B6, B7, B9, B10, B11), danach VVT/TOM/DSFA.
4. Marketing-Freigabe (M1 bis M6) vor dem ersten Post.
5. Zahlungsmodell (B14, M2) vor der Spenden-Freischaltung.
