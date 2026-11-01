# Klubnest – Kontext für den Cowork-Space (Marketing, Planung, Strategie)

Stand: 1. November 2026. Zweck: Diese Datei erklärt einem Assistenten ohne Technik-Vorwissen, was Klubnest ist, wo das Projekt steht und woran ihr arbeiten könnt. **Claude Code ist ausschließlich für den Bau zuständig.** Marketing, Preise, Recht, Vertrieb und Planung werden hier erarbeitet; Ergebnisse, die den Bau betreffen (Funktionswünsche, Prioritäten, Texte), kommen als klare Aufträge zurück zu Claude Code.

> Hinweis zur Verlässlichkeit: Zahlen zu Markt, Preisen und Wettbewerbern sind Annahmen und müssen recherchiert/geprüft werden. Keine Rechtsberatung.

## 1. Das Produkt in drei Sätzen
Klubnest (klubnest.de) ist eine datenschutzfreundliche Plattform aus Deutschland für **Vereine, ihre Mitglieder und Fans**. Vereine organisieren Termine, Teams, Chat und Mitglieder an einem Ort und erreichen zugleich ihr Umfeld über einen Feed mit Profilen – ohne Werbung und ohne Tracking. Geplant sind außerdem Spenden (mit Zuwendungsbestätigung) und eine Vereinsverwaltung mit Beiträgen und Rechnungen.

**Betreiber:** UG/GmbH (Gründung/Status bitte intern klären). **Hosting:** Hetzner, Deutschland. **Marke:** Klubnest (Namens-/Markenprüfung bei DPMA/EUIPO steht aus).

## 2. Zielgruppen
- **Vereine** (zahlende Kunden): Vorstände, Kassenwarte, Trainer/Jugendwarte, Übungsleiter. Segmente: Sportvereine (v. a. Jugend), Feuerwehren, Musik-/Kulturvereine, Schützen, Fördervereine.
- **Mitglieder:** nutzen Termine/Zusagen, Chat, Vereinsneuigkeiten.
- **Fans/Familie/Umfeld:** folgen Vereinen, sehen öffentliche Beiträge/Termine, spenden.
- **Entscheider/Multiplikatoren:** Stadt-/Kreissportbünde, Verbände, Kommunen, Ehrenamtsagenturen, Sparkassen/Volksbanken.

## 3. Wofür Vereine heute zahlen/leiden (Hypothesen zum Prüfen)
WhatsApp-Gruppen (Chaos, Telefonnummern sichtbar, Datenschutz), Excel-Listen, verstreute Tools für Termine/Beiträge/Spenden, wenig Reichweite. Wechselgrund ist **Entlastung des Ehrenamts**, nicht „ein weiteres soziales Netzwerk“.

## 4. Funktionsstand (ehrlich)
**Läuft heute (Vorschau unter https://klubnest.de, mit Testdaten, noch kein öffentlicher Betrieb):**
- Konten, Anmeldung, Sicherheitseinstellungen (Sitzungen, Passwort), Datenschutz-Center (Einwilligungen, Datenexport, Konto löschen).
- Vereine gründen/finden/folgen, Mitgliedsanträge, Rollen (Vorstand, Kassenwart, Moderation, Mitglied).
- Feed mit Beiträgen, Bildern, Likes, Kommentaren, Melden; Feed-Sortierung nachvollziehbar („Warum sehe ich das?“), „Weniger davon“, Personalisierung nur mit Einwilligung.
- Profile wie bei Instagram (Bild, @Name, Bio, Fotoraster, Follower/Folgt, private Profile mit Folgeanfragen), Personensuche.
- Termine/Kalender mit Zu-/Absage, Teams/Mannschaften, Erinnerungen, Kalender-Export (iCal).
- Chat (1:1 und Gruppen), serverseitig verschlüsselt gespeichert, Löschfristen, Blockieren, Melden, Echtzeit.
- Moderation durch Vereine (mit Begründung, DSA-konform) und durch die Plattform.

**Nur als Oberfläche/Beispiel (nicht echt):** Spenden, Rechnungen, Verwaltungs-Finanzen.
**Noch nicht vorhanden:** E-Mail-Versand (Bestätigung, Passwort-Reset), Push-Nachrichten/App, Einladungslinks & Mitgliederimport, Zahlungen, Beitragseinzug, 2FA, echte Rechtstexte.
**Wichtig für Marketing-Aussagen:** Der Chat ist *verschlüsselt gespeichert, aber nicht Ende-zu-Ende-verschlüsselt* – nicht als „E2E“ bewerben. Nichts als „fertig“ bewerben, was in „Nur als Oberfläche“ steht.

## 5. Datenschutz & Vertrauen (Kernversprechen – belegbar)
Hosting in Deutschland (Hetzner) · keine Werbung, keine Drittanbieter-Tracker, keine US-Dienste für Kernfunktionen · Einwilligungen nachweisbar und widerrufbar · Datenexport und Kontolöschung per Klick · Chat mit Löschfristen · Feed-Personalisierung nur freiwillig · Moderationsentscheidungen mit Begründung (DSA) · Zugriffe der Plattform-Moderation werden protokolliert. Rechtstexte/AVV für Vereine werden noch durch Anwalt/Datenschutzbeauftragten erstellt.

## 6. Wettbewerb (zu vertiefen)
WhatsApp/Facebook-Gruppen (größter Gegner) · Spond (Teams, Termine, Chat) · Vereinsverwaltung wie easyVerein, Vereinsflieger, Campai · Heimspiel, SportEasy, TeamSnap · Nebenan.de/Instagram für Reichweite.
**Positionierung (Entwurf):** „Die datenschutzfreundliche Vereinsplattform aus Deutschland: Mitglieder organisieren, Fans erreichen, Spenden sammeln – an einem Ort, ohne Werbung.“
**Strategische Leitlinie:** Erst Werkzeug (Termine, Chat, Organisation), dann Netzwerk. Erst eine Region und 1–2 Vereinsarten, Dichte vor Breite. Kennzahl: wöchentlich aktive Vereine.

## 7. Erlösmodell (offen – bitte gemeinsam erarbeiten)
Hypothese: Gratis-Stufe für Kleinvereine; bezahlte Stufen je Vereinsgröße/Funktionen (grob 9–79 €/Monat); optional kleine Gebühr auf Spenden zzgl. Zahlungsanbieter-Kosten. Offen: Preise testen in 10–15 Interviews, Rabatte für Gemeinnützige/Verbände, Pilotkonditionen.

## 8. Fahrplan (Entwurf)
1. **Pilot-Reife (ca. 6–10 Wochen):** E-Mail-Versand, Backups/Monitoring, Vereins-Onboarding (Einladungen, Import), Handy-App-Gefühl (PWA) + Push, Sicherheit (2FA), Tests.
2. **Beta:** 10–20 Pilotvereine in einer Region.
3. **Öffentlicher Launch (ca. 4–6 Monate):** Spenden mit Zuwendungsbestätigung, Mitglieder-Verwaltung light, Abo-Abrechnung, Vereinsseite.
4. **Danach:** Beitragseinzug/SEPA/Rechnungen/E-Rechnung/DATEV, Umfragen, Helferpläne, native Apps, intelligenteres Feed-Ranking.

Details: `STATUS-ANALYSE.md` (Analyse, Risiken, Infrastruktur, Wettbewerb).

## 9. Größenordnung für den Start
Ziel „erste 250 Vereine / ~1.000 Nutzer“: Technik ist unkritisch (ein Server genügt, ca. 35–70 € Infrastruktur im Monat). Aufwand und Zeit liegen in **Vertrieb, Rechtstexten, Zahlungs-Freischaltung (KYC) und Support**.

## 10. Offene Entscheidungen & Aufgaben für euch (nicht von Claude Code lösbar)
- Preismodell und Pilotkonditionen · Zielregion/Segment für die Beta · Launch-Umfang (Beta ohne Spenden?).
- Mailanbieter wählen · Zahlungsanbieter wählen (Mollie/Stripe Connect) und Konto/KYC starten.
- Anwalt/Datenschutzbeauftragten beauftragen (Datenschutzerklärung, Impressum, AGB, AVV, DSFA).
- Marken-/Namensprüfung „Klubnest“ · Social-Media-Handles/Domains sichern.
- Wer ist Plattform-Moderator und wer macht Support/Community?
- Technik-Freigaben (an Claude Code zu geben): Server vergrößern, Firewall, Backup-Zeitplan.

## 11. Aufgaben, die im Cowork-Space sinnvoll sind
1. Marktrecherche & Wettbewerbsmatrix (Funktionen, Preise, Schwächen) mit Quellen.
2. Zielgruppen-Personas und Interviewleitfaden (10–15 Vereine), Auswertungsvorlage.
3. Positionierung, Name/Claim-Test, Tonalität (Duzen/Siezen), Markenleitfaden.
4. Preis- und Paketmodell, Erlösrechnung (Szenarien 50/250/1.000 Vereine).
5. Website-/Landing-Texte, Onboarding-Mails, Pilotvereine-Ansprache, Pressetext.
6. Go-to-Market: Regionsplan, Multiplikatoren (Verbände, Kommunen, Banken), Veranstaltungen, Social-Media-Plan.
7. Rechts-/Compliance-Checkliste für Gespräche mit Anwalt/DSB.
8. Priorisierte Funktionswünsche aus Interviews → kurze Aufträge für Claude Code (Format: Problem, Nutzer, gewünschtes Ergebnis, Priorität).

## 12. Hinweise zur Zusammenarbeit
- Aufträge an Claude Code kurz und konkret formulieren; Wirkung beschreiben, nicht Technik.
- Keine Passwörter, Schlüssel oder personenbezogene Daten in den Cowork-Space kopieren.
- Texte für Außendarstellung gegen Abschnitt 4 und 5 prüfen (keine unbelegten Versprechen).
