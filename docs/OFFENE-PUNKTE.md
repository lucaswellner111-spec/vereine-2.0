# Offene Punkte (Backlog)

Stand: 2026-10-31. Reihenfolge innerhalb einer Gruppe = Empfehlung. "Blockiert durch" nennt, was zuerst passieren muss.

## Sicherheit
| Punkt | Warum | Blockiert durch |
|---|---|---|
| E-Mail-Bestätigung + Passwort-Reset | Schließt die Konto-Enumeration bei der Registrierung (409 verrät, ob eine E-Mail existiert) und erlaubt Wiederherstellung | Mailanbieter + SPF/DKIM/DMARC |
| Passkeys (WebAuthn); 2FA-Pflicht für Vorstände/Plattform-Admins | TOTP ist gebaut (freiwillig); Pflicht und Passkeys fehlen | – |
| Datenbank-Rollen je Bereich (identity/social/chat/billing) | Least Privilege: ein SQL-Fehler im Chat soll keine Nutzerdaten lesen können | Refactor auf mehrere DB-Verbindungen; sinnvoll beim DB-Server-Umzug |
| CSP mit Nonces statt 'unsafe-inline' | Härtung gegen XSS | Next.js-Middleware |
| Monitoring + Alarme (Prometheus/Grafana/Loki) | Auslöser der Server-Aufteilung sichtbar machen, Worker-Ausfall erkennen | – |
| Virenscan für Uploads (ClamAV) | Bilder werden neu kodiert (sharp); Scan zusätzlich bei Dateianhängen | RAM (~1 GB) → größerer Server |
| Pentest, Dependency-Scanning in CI (npm audit, Dependabot) | Vor Echtbetrieb | – |

## Profile / Feed / Medien (neu)
- Feed-Ereignisse (Impression, Klick, Verweildauer) mit kurzer Aufbewahrung als Datenbasis für ML-Ranking – nur mit Einwilligung.
- Video-Uploads, Stories, Hashtags, Beitragssuche, Profil-Verifizierung, Profil-Banner, Bilder-Alt-Texte (Barrierefreiheit).
- Blockieren von Personen (Profile/Kommentare), Melden von Profilen und Bildern in der Plattform-Moderation.
- Handle-Änderungs-Sperrfrist (z. B. 30 Tage) und Weiterleitung alter Handles.
- Medien in Object Storage + CDN, Bildverarbeitung in Worker-Job, Virenscan.

## Betrieb / Infrastruktur
- Hetzner-Cloud-Firewall (22 nur eigene IP, 80/443 offen) – **du**.
- Backup-Cron installieren (Befehl in `infra/README.md`) – braucht deine ausdrückliche Freigabe; Produktion: verschlüsselte Kopie auf Storage Box + WAL-Archivierung (pgBackRest).
- Webhosting-Paket prüfen/kündigen (Domain bleibt?) – **du**.
- Server-Rescale (4 vCPU/8 GB) – **du**, danach Funktionsprüfung durch mich.
- Terraform/Ansible ausführen (statt manuellem Deploy), Remote-State, CI/CD-Deploy statt `tar`.
- Object Storage (Hetzner S3) für Medien statt lokalem Volume, CDN.
- Mailserver/-dienst (später eigener Server) – Entscheidung: zunächst Hetzner-Postfach, später eigener Mailserver auf getrennter Maschine.

## Chat
- Push-Benachrichtigungen (Web-Push/PWA), Dateianhänge/Bilder, „schreibt gerade“, Online-Status, Nachrichten suchen.
- Optional Ende-zu-Ende-Verschlüsselung für 1:1 (MLS/Signal-Protokoll).
- Chat-REST + Schlüssel in eigenen Container/Server (Stufe 3 der Architektur).

## Produkt
- Spenden (Mollie/Stripe Connect, Zuwendungsbestätigungen) – braucht Zahlungsanbieter + Testschlüssel.
- Rechnungen (Verein → Mitglied) sind gebaut (Entwurf/final/bezahlt/Storno, PDF, CSV). Offen: SEPA-Lastschrift und Online-Zahlung, E-Rechnung (XRechnung/ZUGFeRD), echtes DATEV-Format, Mahnstufen, Serienrechnungen/Beitragsklassen, Vereinsanschrift/Steuernummer/IBAN auf der Rechnung (Vereinsstammdaten), Abo-Abrechnung Plattform → Verein.
- Hinweis npm audit: 4 moderate Funde nur in der Entwicklungskette drizzle-kit → esbuild (Dev-Server); nicht im Betrieb, erledigt sich mit einem drizzle-kit-Update.
- ML-Ranking (Phase 4): Ereignis-Erfassung (Impressionen/Klicks, nur mit Einwilligung), Modell, A/B-Tests. Voraussetzung: Feed-Algorithmus v2 und genügend Daten.
- Kalender: Termine einer Serie lassen sich nur gemeinsam absagen (ab einem Termin); Einzeländerungen/Verschieben von Serien fehlen.
- Push: Einstellungen je Mitteilungsart und je Unterhaltung (stumm schalten), Absendername optional, Ruhezeiten; E-Mail-Benachrichtigungen (Mailanbieter).
- Qualität: Ende-zu-Ende-Tests (Playwright) in CI, Lasttest mit k6 auf Staging ausführen, Barrierefreiheitsprüfung.
- Monitoring: Prometheus/Grafana/Alertmanager auf dem Server aufsetzen (Messwerte unter /metrics sind vorbereitet).
- Spenden-Grundgerüst (Datenmodell, Anbieter-Schnittstelle, Test-Anbieter) – bewusst noch nicht begonnen, hängt an der Wahl des Zahlungsanbieters (Mollie/Stripe Connect).
- Mitgliederstammdaten und Beitragsklassen sind gebaut (Etappe 1). Offen: Aufnahmeformular mit Einwilligungen/Eltern, Beitragslauf aus Beitragsklassen, Import (nur per Einladung), Abteilungen = Teams (Zuordnung in der Liste fehlt), AVV-Akzeptanz beim Vereins-Onboarding, Row-Level-Security vor weiteren Verwaltungsmodulen.
- Vereins-Onboarding mit Gemeinnützigkeitsprüfung und Zahlungs-KYC.
- Hashtags, Suche über Beiträge, Stories/Reels (nur falls gewünscht).
- Row-Level-Security (Mandantentrennung) vor dem Verwaltungsmodul.

## Rechtliches
- Datenschutzerklärung, Impressum, AGB (aktuell Platzhalter) – Anwalt/DSB.
- AVV-Vorlage für Vereine, DSFA, Verarbeitungsverzeichnis, ZAG-Abgrenzung Zahlungsfluss, DSA-Kontaktstelle/Transparenzbericht.
- Marken-/Namensprüfung „Klubnest“ (DPMA/EUIPO).
- Barrierefreiheitsprüfung (BFSG, WCAG 2.1 AA).

## Datenschutz/Rechtliches aus Etappe 1 (Details: docs/DATENSCHUTZ-LAUNCH.md)
- **Mindestalter 16 vs. Jugendvereine:** Mitglieder unter 16 brauchen Elternkonto/Zustimmung (Art. 8 DSGVO) – Lösung vor dem Launch festlegen (Elternkonto, das Kinder-Mitgliedschaften verwaltet, oder Mitglied ohne eigenes Konto nur mit Stammdaten).
- Aufbewahrung der pseudonymen Austrittsdaten (Nummer, Eintritt/Austritt, Beitragsklasse) und Namens-Aufbewahrung für Vereinsunterlagen: Anwalt/DSB.
- Fristen festlegen: Benachrichtigungen (Vorschlag 90 Tage), Zugriffsprotokoll (12 Monate, Finanzaktionen länger), Server-Logs (14 Tage), Backups (14 Tage) → in Löschkonzept aufnehmen.
- AVV-Vorlage für Vereine und digitale Akzeptanz beim Onboarding fehlen (Pflicht, weil die Plattform bei Mitgliederdaten Auftragsverarbeiter ist).

## Demo-Daten auf klubnest.de (angelegt 2026-11-01) – VOR DEM LAUNCH LÖSCHEN
12 Demo-Konten (`@demo.klubnest.invalid`), 2 Vereine (Freiwillige Feuerwehr Wesenberg, FC Blau-Weiß Lindenau), 14 Beiträge mit Fotos echter Personen (auch Kinder), Konto lucaswellner111@gmail.com als Mitglied beider Vereine eingetragen. Anleitung zum Löschen: `infra/demo/README.md`. Datenschutz: Fotos nur nach Anmeldung abrufbar; vor echten Nutzern entfernen (siehe `docs/DATENSCHUTZ-LAUNCH.md`).

