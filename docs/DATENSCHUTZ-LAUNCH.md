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
| Profile | Handle, Bio, Ort, Avatar, Sichtbarkeit | Vertrag / freiwillige Angaben | `social.profiles` | mit Konto |
| Chat | Nachrichten (AES-256-GCM, kein E2EE), Mitglieder, Meldungen | Vertrag; Moderation (6 f) | Schema `chat` | Standard 365 Tage, je Unterhaltung einstellbar |
| Termine, Teams, Zu-/Absagen | Titel, Ort, Zusage je Person | Vertrag | `social.events*` | mit Konto / Verein |
| Kalender-Abo | Token-Hash | Vertrag | `social.calendar_tokens` | mit Konto, jederzeit neu/aus |
| Benachrichtigungen | Typ, Kurzdaten | Vertrag | `social.notifications` | **Frist festlegen** (Vorschlag 90 Tage) |
| Web-Push | Endpunkt + Schlüssel des Geräts, User-Agent | **Einwilligung** (Browser-Berechtigung) | `social.push_subscriptions` | bis Abmeldung/Ungültigkeit (404/410) |
| Rechnungen (Verein → Mitglied) | Name, Anschrift (optional), Beträge | Vertrag des Vereins mit Mitglied; Aufbewahrungspflicht | Schema `billing` | **8–10 Jahre (GoBD/AO)**; bei Kontolöschung Anonymisierung statt Löschung |
| Vereinsstammdaten | Anschrift, IBAN, Steuerhinweis des **Vereins** | Vertrag/Rechnung | `social.organizations` | mit Verein |
| Einladungslinks | Token-Hash, Gültigkeit | Vertrag | `social.org_invites` | bis Ablauf/Widerruf |
| Mitgliederstammdaten *(gebaut, Etappe 1)* | Anschrift, Telefon, Geburtsdatum, Eintritt/Austritt, Beitragsklasse, ggf. Erziehungsberechtigte, interne Notiz | Mitgliedschaft (Vertrag des Vereins), AVV | Schema `members` | siehe Abschnitt 4 |
| Server-Logs (Caddy/Docker) | IP, Pfad, Zeit | berechtigtes Interesse (Sicherheit) | Docker-Logs | **Rotation festlegen** (Vorschlag 14 Tage); IP-Kürzung prüfen |

## 3. Technische und organisatorische Maßnahmen (TOMs), soweit gebaut
Hosting Hetzner DE (AVV mit Hetzner **abschließen**), TLS überall + HSTS, strenge CSP/Sicherheits-Header, Passwörter argon2id, Konto-Drosselung, Sitzungsverwaltung, 2FA (TOTP), Chat verschlüsselt gespeichert (Schlüssel getrennt, rotierbar), Medien ohne EXIF und nur nach Anmeldung/Sichtbarkeitsprüfung, Bereichstrennung per Schema und Test, keine Drittanbieter im Frontend, Secrets nur in `.env.preview` (600) auf dem Server, Backups (Skript vorhanden, **Cron/Offsite fehlen**), Zugriffsprotokoll für Plattform-Moderation und Finanzaktionen.
**Noch offen:** Cloud-Firewall, automatische verschlüsselte Offsite-Backups, Monitoring/Alarme, DB-Rollen je Bereich, Pentest, Wiederherstellungsübung, Notfallplan/Datenpanne (72 h), Schlüsselverwaltung (Chat-Master-Key und `AUTH_SECRET_KEY` sichern!).

## 4. Mitgliederstammdaten: Konzept (Etappe 1 des Funktionsplans v2)
- **Datensparsamkeit:** nur Felder, die ein Verein tatsächlich braucht. Keine E-Mail-Adressen der Mitglieder in der Verwaltungsliste (sie sind Konto-Daten der Person, nicht des Vereins). Geburtsdatum optional (für Altersklassen/Minderjährige).
- **Zugriff:** lesen Vorstand und Kassenwart, ändern nur Vorstand (Kassenwart sieht Anschrift für Rechnungen). Moderation und Mitglieder sehen keine Stammdaten anderer. Jeder sieht und ändert die **eigenen** Daten (Selbstverwaltung, Art. 15/16).
- **Export der Mitgliederliste** wird im Zugriffsprotokoll festgehalten (wer, wann, welcher Verein, wie viele Datensätze).
- **Austritt/Entfernung:** personenbezogene Stammdaten (Anschrift, Telefon, Geburtsdatum, Erziehungsberechtigte, Notiz) werden gelöscht; nur Mitgliedsnummer, Eintritts-/Austrittsdatum und Beitragsklasse bleiben als Vereinsunterlage (pseudonym, ohne Name). **Offene Rechtsfrage:** Aufbewahrungsdauer und ob Vereine Namen für Mitgliederverzeichnis/Satzungszwecke länger brauchen (Anwalt/DSB; Vereine sind selbst verantwortlich).
- **Kontolöschung:** alle Stammdaten dieser Person in allen Vereinen werden gelöscht; Rechnungen bleiben anonymisiert (Aufbewahrungspflicht).
- **Minderjährige:** Ableitung aus dem Geburtsdatum; Felder für Erziehungsberechtigte (Name, E-Mail). Mindestalter der Plattform 16 Jahre (Selbstangabe bei Registrierung) – **Konflikt mit Jugendvereinen** (Mitglieder unter 16): Elternkonto/Elternzustimmung muss vor dem Launch geklärt werden (Art. 8 DSGVO, JMStV).
- **Notizen:** interne Vorstandsnotizen sind Daten der Person (Auskunftsrecht!). Nutzer informieren; keine sensiblen Angaben (Gesundheit, Religion) – Hinweis im Formular.
- **Sensible Daten (Art. 9)** (z. B. Gesundheit bei Sportvereinen) werden **nicht** vorgesehen.

## 5. Offene Rechts- und Datenschutz-Aufgaben vor dem Launch
**Dokumente (Anwalt/DSB):** Datenschutzerklärung, Impressum, Nutzungsbedingungen/AGB, Community-Richtlinien, **AVV-Vorlage für Vereine** (Art. 28), VVT, **DSFA** (Profiling/Feed, Chat, Minderjährige), TOM-Dokument, Löschkonzept (Fristen aus Abschnitt 2 festlegen), Datenpannen-Prozess, DSB benennen, Verarbeitung durch Unterauftragsverarbeiter dokumentieren (Hetzner, Push-Dienste der Browserhersteller, später Mail- und Zahlungsanbieter).
**Plattformrecht:** DSA (Meldeverfahren, Begründung, Kontaktstelle, Transparenzbericht), DDG-Impressum, BFSG/WCAG 2.1 AA, JMStV (Jugendschutz), ggf. NetzDG-Nachfolger.
**Zahlungen/Finanzen:** ZAG-Abgrenzung (Zahlungsfluss über Mollie/Stripe Connect, wir nie im Geldfluss), Zuwendungsbestätigungen (Aussteller = Verein; Freistellungsbescheid), GoBD (Unveränderbarkeit, Nummernkreis – umgesetzt), E-Rechnung ab 2025/2028, SEPA-Gläubiger-ID und Mandate je Verein.
**Technisch/organisatorisch:** Server-Logs rotieren/kürzen, Backup-Aufbewahrung gegen Löschwünsche abwägen (Backups enthalten gelöschte Daten bis zum Ablauf – Frist dokumentieren, z. B. 14 Tage), Pentest, Barrierefreiheit prüfen.
**Marke/Namen:** „Klubnest“ bei DPMA/EUIPO prüfen.

## 6. Dokumentationsregel für jede neue Etappe
1. Neue personenbezogene Daten? → Zeile in Abschnitt 2 (Daten, Zweck/Rechtsgrundlage, Ort, Frist).
2. Wer darf lesen/ändern? Wird Zugriff protokolliert? → Abschnitt 4 bzw. neuer Abschnitt.
3. Was passiert bei Austritt, Konto- und Vereinslöschung? Test dafür schreiben.
4. Neue Unterauftragsverarbeiter oder Drittland? → Abschnitt 5.
5. Offene Rechtsfrage? → Abschnitt 5 und `docs/OFFENE-PUNKTE.md`.
