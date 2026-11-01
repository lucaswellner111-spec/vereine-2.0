# Offene Punkte (Backlog)

Stand: 2026-10-31. Reihenfolge innerhalb einer Gruppe = Empfehlung. "Blockiert durch" nennt, was zuerst passieren muss.

## Sicherheit
| Punkt | Warum | Blockiert durch |
|---|---|---|
| E-Mail-Bestätigung + Passwort-Reset | Schließt die Konto-Enumeration bei der Registrierung (409 verrät, ob eine E-Mail existiert) und erlaubt Wiederherstellung | Mailanbieter + SPF/DKIM/DMARC |
| 2FA (TOTP) und Passkeys | Schutz bei gestohlenen Passwörtern; Pflicht für Vorstände empfohlen | – (kann sofort gebaut werden, nach Profil/Feed) |
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
- Kalender-Abo per Link (iCal-Feed), Wiederholungstermine.
- Mitgliederstammdaten (Adresse, Geburtstag) mit AVV, Beitragsklassen.
- Vereins-Onboarding mit Gemeinnützigkeitsprüfung und Zahlungs-KYC.
- Hashtags, Suche über Beiträge, Stories/Reels (nur falls gewünscht).
- Row-Level-Security (Mandantentrennung) vor dem Verwaltungsmodul.

## Rechtliches
- Datenschutzerklärung, Impressum, AGB (aktuell Platzhalter) – Anwalt/DSB.
- AVV-Vorlage für Vereine, DSFA, Verarbeitungsverzeichnis, ZAG-Abgrenzung Zahlungsfluss, DSA-Kontaktstelle/Transparenzbericht.
- Marken-/Namensprüfung „Klubnest“ (DPMA/EUIPO).
- Barrierefreiheitsprüfung (BFSG, WCAG 2.1 AA).
