# Datenschutz und Recht: Merkliste für den Launch

Stand: 1. November 2026. **Zentrale Sammelstelle** für alles Datenschutz- und Rechtsrelevante. Jede neue Etappe trägt ihre Verarbeitungen, Fristen und offenen Rechtsfragen hier ein (Pflicht, siehe Arbeitsvereinbarung). Das ist die Vorarbeit für Verarbeitungsverzeichnis (VVT), DSFA, Datenschutzerklärung und AVV; die rechtliche Prüfung machen Anwalt und Datenschutzbeauftragter (DSB). Dies ist keine Rechtsberatung.

## 1. Rollen
| Bereich | Rolle der Betreiber-UG/GmbH | Anmerkung |
|---|---|---|
| Konto, Anmeldung, Feed, Profile, Chat, Push | Verantwortlicher (Art. 4 Nr. 7) | Nutzer sind Privatpersonen; Rechtsgrundlagen unten |
| Mitgliederverwaltung, Beiträge, Rechnungen, Spenden eines Vereins | **Auftragsverarbeiter** (Art. 28) für den Verein | AVV je Verein muss beim Onboarding digital akzeptiert werden (**fehlt noch**) |
| Vereinsseite, öffentliche Beiträge | ggf. gemeinsame Verantwortlichkeit (Art. 26) | Vereinbarung prüfen lassen |

## 2. Verarbeitungsübersicht (Entwurf für das VVT)
| Verarbeitung | Daten | Zweck / Rechtsgrundlage | Speicherort | Frist / Löschung |
|---|---|---|---|---|
| Konto | E-Mail, Name, Passwort-Hash (argon2id), Erstellungsdatum | Vertrag (Art. 6 b) | `identity.users` | Löschung auf Wunsch sofort (Kaskade) |
| Sitzungen | Token-Hash, Gerätebeschreibung (grob), Ablauf | Vertrag, Sicherheit (6 f) | `identity.sessions` | 30 Tage, stündlicher Aufräumjob |
| Einwilligungen | Zweck, Ja/Nein, Version, Zeit | Nachweispflicht (Art. 7 Abs. 1) | `identity.consents` (nur anhängen) | mit Konto |
| Zugriffsprotokoll | Aktion, Nutzer-ID, Meta (z. B. Rechnungsnummer) | Sicherheit/Nachweis (6 f) | `identity.audit_log` | bei Kontolöschung ohne Personenbezug; **Frist festlegen** (Vorschlag 12 Monate, außer Finanzaktionen) |
| Zwei-Faktor | verschlüsseltes TOTP-Geheimnis, Notfallcode-Hashes | Sicherheit (6 f), freiwillig | `identity.user_totp`, `recovery_codes` | mit Konto / bei Deaktivierung |
| Feed, Beiträge, Kommentare | Inhalte, Zeit, Autor | Vertrag | `social.*` | auf Wunsch, mit Konto |
| Feed-Personalisierung | Interaktionen (Likes, Weniger-davon) | **Einwilligung** `personalized_feed` | `social.*` | bei Widerruf nicht mehr genutzt |
| Bilder | Datei (EXIF entfernt), Besitzer | Vertrag | Volume `mediadata` | mit Konto (Dateien + Zeilen) |
| Profile | Handle, Bio, Ort, Avatar, Sichtbarkeit | Vertrag / freiwillige Angaben | `social.profiles` | mit Konto; bei privatem Profil sehen Nicht-Follower weder Bio noch Ort |
| Chat | Nachrichten (AES-256-GCM, kein E2EE), Mitglieder | Vertrag | Schema `chat` | Standard 365 Tage, je Unterhaltung einstellbar; Austritt aus dem Verein entfernt die Person aus allen Gruppen des Vereins (Direktchats bleiben) |
| Chat-Meldungen | gemeldete Nachricht als Beweiskopie (eigener Datenschlüssel, AES-256-GCM, Master-Schlüssel rotierbar), Grund, Notiz, Melder-ID, Absender-ID | Moderation/Beweissicherung: Art. 6 Abs. 1 lit. c (Art. 16 DSA) und lit. f; Löschausnahme Art. 17 Abs. 3 lit. e | `chat.message_reports` | bleibt bis zur Prüfung, danach 30 Tage ab Erledigung (Aufräumjob); übersteht Löschen der Nachricht, Austritt und Kontolöschung des Absenders; löscht der **Melder** sein Konto, wird eine offene Meldung anonymisiert (Melder-ID entfernt), eigene erledigte Meldungen werden gelöscht. Nur die gemeldete Nachricht, kein Verlauf; jeder Zugriff wird protokolliert |
| Beitragsmeldungen | Beitrag, Grund, Notiz, Melder-ID | Moderation (6 f, Art. 16 DSA) | `social.reports` | je Person und Beitrag nur eine offene Meldung; verschwinden per Kaskade mit Beitrag oder Konto des Melders |
| Termine, Teams, Zu-/Absagen | Titel, Ort, Zusage je Person | Vertrag | `social.events*` | mit Konto / Verein |
| Zusagen-Anzeige am Termin *(Q2)* | Anzeigename, Benutzername und Profilbild der Personen mit Zusage | Vereinszweck/Mitgliedschaft (Art. 6 Abs. 1 lit. b), hilfsweise lit. f (Planung, wer kommt) | keine eigene Speicherung, gelesen aus `social.event_rsvps` und Profil | nur für **aktive Mitglieder** bei internen/Team-Terminen (höchstens 12 Bilder, Rest als Zahl); gezeigt werden nur Personen, die **noch aktive Mitglieder** sind (bei Team-Terminen zusätzlich noch im Team), Zusagen Ausgetretener an vergangenen Terminen bleiben gespeichert, erscheinen aber nicht; bei öffentlichen Terminen nur die Anzahl, keine Namen. Verschwindet mit Absage, Austritt oder Kontolöschung. Ort-Link zu OpenStreetMap lädt nichts vorab, erst der Klick öffnet die externe Seite |
| Einstellung Tastenkürzel *(Q2)* | an/aus | technisch notwendig (Nutzerwunsch, § 25 Abs. 2 Nr. 2 TDDDG) | nur `localStorage` im Browser (`klubnest.shortcuts`), kein Server | bis der Browser-Speicher gelöscht wird |
| Profil-Fotos (Reiter „Fotos“) *(Q2)* | Bilder eigener Beiträge | wie Beiträge | keine neue Speicherung (`social.post_media`) | gleiche Sichtbarkeit wie das Profil (privat nur für freigegebene Follower), gelöschte/ausgeblendete Beiträge erscheinen nicht |
| Kalender-Abo | Token-Hash | Vertrag | `social.calendar_tokens` | mit Konto, jederzeit neu/aus |
| Benachrichtigungen | Typ, Kurzdaten | Vertrag | `social.notifications` | **Frist festlegen** (Vorschlag 90 Tage) |
| Web-Push | Endpunkt + Schlüssel des Geräts, User-Agent | **Einwilligung** (Browser-Berechtigung) | `social.push_subscriptions` | bis Abmeldung/Ungültigkeit (404/410); nur bekannte Push-Dienste der Browserhersteller (Google FCM, Mozilla, Apple, Microsoft), höchstens 10 Geräte je Konto (das älteste wird ersetzt); Altzeilen fremder Hosts werden beim nächsten Versand gelöscht |
| Rechnungen (Verein → Mitglied) | Name, Anschrift (optional), Beträge; Ausstellerdaten des Vereins als Kopie | Vertrag des Vereins mit Mitglied; Aufbewahrungspflicht | Schema `billing` | **8–10 Jahre (GoBD/AO)**; bei Kontolöschung Anonymisierung statt Löschung. Ausstellerdaten (Name, Ort, Anschrift, IBAN, Steuerhinweis) werden beim **Finalisieren** festgeschrieben; Rechnungsdatum und Nummernkreis nach deutscher Zeit. Wird der Verein gelöscht, werden Entwürfe gelöscht, finalisierte Rechnungen bleiben bis Fristende (Löschjob fehlt noch, siehe `docs/OFFENE-PUNKTE.md`) |
| Vereinsstammdaten | Anschrift, IBAN, Steuerhinweis des **Vereins** | Vertrag/Rechnung | `social.organizations` | mit Verein |
| Einladungslinks | Token-Hash, Gültigkeit | Vertrag | `social.org_invites` | bis Ablauf/Widerruf |
| Mitgliederstammdaten *(gebaut, Etappe 1)* | Anschrift, Telefon, Geburtsdatum, Eintritt/Austritt, Beitragsklasse, ggf. Erziehungsberechtigte, interne Notiz | Mitgliedschaft (Vertrag des Vereins), AVV | Schema `members` | siehe Abschnitt 4 |
| Server-Logs (Caddy/Docker) | IP, Pfad, Zeit | berechtigtes Interesse (Sicherheit) | Docker-Logs | **Rotation festlegen** (Vorschlag 14 Tage); IP-Kürzung prüfen. API-Logs enthalten nur Methode und bereinigten Pfad: keine IPs, Header, Cookies oder Tokens (Kalender-Abo- und Einladungslinks werden geschwärzt), keine Query-Werte; Datenbankfehler ohne SQL/Parameter |
| Login-Schutz | Zähler je Hash(E-Mail + IP) und je Hash(E-Mail) | Sicherheit, Art. 6 Abs. 1 lit. f | Redis (`login:fail:`) | 10 Fehlversuche je E-Mail+IP sperren 15 Minuten, Notbremse 100 Fehlversuche je E-Mail und Stunde; E-Mail und IP werden nicht im Klartext gespeichert |
| Nutzungslimits | Zähler je Nutzer-ID (Vereine 10/Tag, Beiträge 60/h, Kommentare 100/h, Meldungen 30/h, Mitgliedsanträge 3 je Verein/30 Tage und 20/Tag, Chat 30/min) | Missbrauchsschutz, Art. 6 Abs. 1 lit. f | Redis (`lim:`) | läuft automatisch ab, höchstens 30 Tage |

## 3. Technische und organisatorische Maßnahmen (TOMs), soweit gebaut
Hosting Hetzner DE (AVV mit Hetzner **abschließen**), TLS überall + HSTS, strenge CSP/Sicherheits-Header, Passwörter argon2id, Konto-Drosselung, Sitzungsverwaltung, 2FA (TOTP), Chat verschlüsselt gespeichert (Schlüssel getrennt, rotierbar), Medien ohne EXIF und nur nach Anmeldung/Sichtbarkeitsprüfung, Bereichstrennung per Schema und Test, keine Drittanbieter im Frontend, Secrets nur in `.env.preview` (600) auf dem Server, Backups (Skript vorhanden, **Cron/Offsite fehlen**), Zugriffsprotokoll für Plattform-Moderation und Finanzaktionen.
**Noch offen:** Cloud-Firewall, automatische verschlüsselte Offsite-Backups, Monitoring/Alarme, DB-Rollen je Bereich, Pentest, Wiederherstellungsübung, Notfallplan/Datenpanne (72 h), Schlüsselverwaltung (Chat-Master-Key und `AUTH_SECRET_KEY` sichern!).

## 4. Mitgliederstammdaten: Konzept (Etappe 1 des Funktionsplans v2)
- **Datensparsamkeit:** nur Felder, die ein Verein tatsächlich braucht. Keine E-Mail-Adressen der Mitglieder in der Verwaltungsliste (sie sind Konto-Daten der Person, nicht des Vereins). Geburtsdatum optional (für Altersklassen/Minderjährige).
- **Zugriff:** lesen Vorstand und Kassenwart, ändern nur Vorstand (Kassenwart sieht Anschrift für Rechnungen). Moderation und Mitglieder sehen keine Stammdaten anderer. Jeder sieht und ändert die **eigenen** Daten (Selbstverwaltung, Art. 15/16).
- **Export der Mitgliederliste** wird im Zugriffsprotokoll festgehalten (wer, wann, welcher Verein, wie viele Datensätze).
- **Austritt/Entfernung:** personenbezogene Stammdaten (Anschrift, Telefon, Geburtsdatum, Erziehungsberechtigte, Notiz) werden gelöscht; nur Mitgliedsnummer, Eintritts-/Austrittsdatum und Beitragsklasse bleiben als Vereinsunterlage (pseudonym, ohne Name). **Offene Rechtsfrage:** Aufbewahrungsdauer und ob Vereine Namen für Mitgliederverzeichnis/Satzungszwecke länger brauchen (Anwalt/DSB; Vereine sind selbst verantwortlich).
- **Kontolöschung:** alle Stammdaten dieser Person in allen Vereinen werden gelöscht; Rechnungen bleiben anonymisiert (Aufbewahrungspflicht).
- **Austritt (umgesetzt, Paket P1):** neben den Stammdaten werden Team-Mitgliedschaften, Zusagen zu künftigen internen Terminen und Team-Terminen sowie die Mitgliedschaft in allen Gruppen-Chats des Vereins entfernt (Besitz geht an das älteste verbleibende Mitglied). Schlägt ein Aufräumschritt fehl, wiederholt ihn ein Hintergrundjob (`orgs.leave-cleanup`), damit die Löschung garantiert ist.
- **Ablauf der Kontolöschung (umgesetzt):** 1) Passwort prüfen; 2) ist die Person **einziger Vorstand** eines Vereins mit weiteren Mitgliedern, wird abgelehnt (409) mit Hinweis, die Vorstandsrolle zu übertragen; 3) Konto sofort **sperren** (Löschzeitpunkt setzen, alle Sitzungen beenden, Protokolleintrag) – danach ist keine Anmeldung mehr möglich; 4) Daten aller Bereiche löschen bzw. anonymisieren. Bricht Schritt 4 ab, schließt der stündliche Job `privacy.erase-pending` die Löschung nach 15 Minuten ab.
- **Vereinslöschung (Variante A, umgesetzt):** ist die Person einziges aktives Mitglied, wird ihr Verein mitgelöscht: Beiträge, Termine, Teams, Einladungen (Kaskade), Gruppen-Chats, Mitgliederstammdaten, Beitragsklassen und Mitgliedsnummern-Zähler, Rechnungs-**Entwürfe** und Bilder der Vereinsbeiträge. **Finalisierte Rechnungen bleiben** wegen der Aufbewahrungspflicht (Ausstellerdaten als Kopie enthalten). Vor der Kontolöschung weist die Oberfläche darauf hin, die Rechnungen vorher als CSV zu exportieren.
- **Minderjährige:** Ableitung aus dem Geburtsdatum; Felder für Erziehungsberechtigte (Name, E-Mail). Mindestalter der Plattform 16 Jahre (Selbstangabe bei Registrierung) – **Konflikt mit Jugendvereinen** (Mitglieder unter 16): Elternkonto/Elternzustimmung muss vor dem Launch geklärt werden (Art. 8 DSGVO, JMStV).
- **Notizen:** interne Vorstandsnotizen sind Daten der Person (Auskunftsrecht!). Nutzer informieren; keine sensiblen Angaben (Gesundheit, Religion) – Hinweis im Formular.
- **Sensible Daten (Art. 9)** (z. B. Gesundheit bei Sportvereinen) werden **nicht** vorgesehen.

## 5. Offene Rechts- und Datenschutz-Aufgaben vor dem Launch
**Dokumente (Anwalt/DSB):** Datenschutzerklärung, Impressum, Nutzungsbedingungen/AGB, Community-Richtlinien, **AVV-Vorlage für Vereine** (Art. 28), VVT, **DSFA** (Profiling/Feed, Chat, Minderjährige), TOM-Dokument, Löschkonzept (Fristen aus Abschnitt 2 festlegen), Datenpannen-Prozess, DSB benennen, Verarbeitung durch Unterauftragsverarbeiter dokumentieren (Hetzner, Push-Dienste der Browserhersteller, später Mail- und Zahlungsanbieter).
**Plattformrecht:** DSA (Meldeverfahren, Begründung, Kontaktstelle, Transparenzbericht), DDG-Impressum, BFSG/WCAG 2.1 AA, JMStV (Jugendschutz), ggf. NetzDG-Nachfolger.
**Zahlungen/Finanzen:** ZAG-Abgrenzung (Zahlungsfluss über Mollie/Stripe Connect, wir nie im Geldfluss), Zuwendungsbestätigungen (Aussteller = Verein; Freistellungsbescheid), GoBD (Unveränderbarkeit, Nummernkreis – umgesetzt), E-Rechnung ab 2025/2028, SEPA-Gläubiger-ID und Mandate je Verein.
**Paket P1 (Härtung), offen:** Aufbewahrung erledigter Chat-Meldungen (30 Tage) gegen die Anfechtungsfrist des Beschwerdeverfahrens nach **Art. 20 DSA (6 Monate)** abwägen; Löschjob für finalisierte Rechnungen gelöschter Vereine nach Ablauf der Aufbewahrungsfrist; Login-Schutz und Nutzungslimits in der Datenschutzerklärung nennen (berechtigtes Interesse).
**Technisch/organisatorisch:** Server-Logs rotieren/kürzen, Backup-Aufbewahrung gegen Löschwünsche abwägen (Backups enthalten gelöschte Daten bis zum Ablauf – Frist dokumentieren, z. B. 14 Tage), Pentest, Barrierefreiheit prüfen.
**Marke/Namen:** „Klubnest“ bei DPMA/EUIPO prüfen.

## 6. Dokumentationsregel für jede neue Etappe
1. Neue personenbezogene Daten? → Zeile in Abschnitt 2 (Daten, Zweck/Rechtsgrundlage, Ort, Frist).
2. Wer darf lesen/ändern? Wird Zugriff protokolliert? → Abschnitt 4 bzw. neuer Abschnitt.
3. Was passiert bei Austritt, Konto- und Vereinslöschung? Test dafür schreiben.
4. Neue Unterauftragsverarbeiter oder Drittland? → Abschnitt 5.
5. Offene Rechtsfrage? → Abschnitt 5 und `docs/OFFENE-PUNKTE.md`.

## 7. Demo-Daten (Stand 2026-11-01)
Auf klubnest.de liegen Demo-Konten und -Beiträge mit Fotos echter Personen (Lizenz/Einwilligung der Abgebildeten nicht geklärt, Kinder erkennbar). Sie dürfen nur zum internen Test dienen und müssen **vor dem Start mit echten Nutzern** gelöscht werden (`infra/demo/README.md`). Nie solche Bilder in Marketing oder öffentliche Seiten übernehmen, ohne Rechteklärung (Recht am eigenen Bild, KUG/DSGVO).

