# A3: Betriebsreife (Backup, Restore, Alarme, Deploy, Caddy, Firewall, Lasttest, Demo-Daten)

Stand: 14. November 2026. Betriebshandbuch: `docs/BETRIEB.md`. Die Einträge unten sind zum Übernehmen in `docs/DATENSCHUTZ-LAUNCH.md` (Abschnitt 2, 4, 5) und `docs/OFFENE-PUNKTE.md` gedacht (bewusst nicht direkt dort geändert, damit parallele Pakete nicht kollidieren). Keine Rechtsberatung.

## Was gebaut ist

- **API:** Modul `ops` (Worker-Lebenszeichen, Alarmbewertung, Betreiber-Mail), `GET /platform/ops`, `"worker"` in `/health/ready`, neue Messwerte in `/metrics`, Karte „Betrieb“ auf der Plattform-Seite, Mail-Vorlage `ops-alert`, Env `RATE_LIMIT_ALLOWLIST` (nur Staging-Lastgenerator). Tests: `ops/ops.spec.ts`, `platform/platform.spec.ts`, `mail/mail.spec.ts`, `app.setup.spec.ts`.
- **Skripte/Konfiguration:** `infra/ops/*`, `infra/deploy/*` (Compose mit Image-Tags, Log-Begrenzung, Staging-Variante, Caddyfiles), `infra/monitoring/*`, `infra/terraform/firewall-single`, `infra/loadtest/*`, `infra/demo/*`, `.github/workflows/deploy.yml`, CI-Job `infra`.
- **Keine Migration** und keine neue Tabelle. Die Statusdatei der Sicherung liegt im Dateisystem, Alarm-Zähler im Cache-Redis.

## Zu Abschnitt 2 (Verarbeitungsübersicht)

| Verarbeitung | Daten | Rechtsgrundlage | Speicherort / Frist | Hinweise |
|---|---|---|---|---|
| Sicherungen (Backup) | Vollständiger Datenbank-Dump (alle personenbezogenen Daten, Chat-Inhalte bleiben mit dem Chat-Schlüssel verschlüsselt), Medien, Konfiguration ohne Geheimnisse | berechtigtes Interesse / Art. 32 DSGVO (Verfügbarkeit, Wiederherstellbarkeit) | Server `/var/backups/vereine` und Hetzner Storage Box (Deutschland), **age-verschlüsselt**, privater Schlüssel nie auf dem Server. **Frist: täglich 14 Tage, wöchentlich 8 Wochen, monatlich 6 Monate** (Weekly/Monthly als Hardlinks) | Gelöschte Daten bleiben bis zum Ausmustern des Satzes in der Sicherung (**längstens ca. 7 Monate**). Nach einer Wiederherstellung werden seit dem Satz erfolgte Löschungen erneut ausgeführt (`docs/BETRIEB.md`, 5.2). **AVV mit Hetzner (auch Storage Box) nötig.** |
| Betriebsalarme | Nur Zahlen und feste Texte (Warteschlangen-Zähler, Auslastung, Alter der Sicherung), **keine Personendaten** | berechtigtes Interesse (Betriebssicherheit) | Cache-Redis (Tageszähler 2 Tage), Mail an den Betreiber | Empfänger ist die Adresse des Betreibers (`OPERATOR_ALERT_EMAIL`), Versand über den Mailanbieter (AVV Scaleway). Eine Mail je Ereignisart und Tag. |
| Zugriffslog Caddy | IP **gekürzt** (IPv4 /24, IPv6 /56), Pfad, Status, Zeit, Browserkennung; **ohne** Cookie, Authorization, X-Forwarded-For, Set-Cookie; Kalender-Token im Pfad geschwärzt | berechtigtes Interesse (Sicherheit, Fehlersuche) | Docker-Volume `caddy_logs`, **Rotation 14 Tage** (Datei-Rotation, höchstens 14 Dateien à 20 MiB); Docker-Container-Logs ca. 30 MB je Container | Ersetzt „Rotation festlegen / IP-Kürzung prüfen“ in der Zeile „Server-Logs“. Die API-eigenen Logs enthalten weiterhin keine IPs. |
| Uptime-Check von außen | keine Nutzerdaten (nur Statuscodes der eigenen Seite) | berechtigtes Interesse | eigener Rechner des Betreibers | Kein Drittanbieter. |
| Lasttest-Konten | erfundene Konten `lt-0001@loadtest.invalid` | – (keine echten Personen) | nur Staging, danach `provision.mjs delete` | Nie gegen Produktion; Rate-Limit-Ausnahme nur im Staging-Compose. |

## Zu Abschnitt 4/5 (Löschkonzept, offene Aufgaben)

- **Backup-Frist festlegen und dokumentieren.** Der bisherige Vorschlag „14 Tage“ galt für ein Backup ohne Monatsstände. Mit der Vorgabe 14/8/6 liegen Löschungen bis zu ca. 7 Monate in Sicherungen. Zu entscheiden mit dem Datenschutzbeauftragten: (a) 14/8/6 beibehalten und im Löschkonzept so festhalten (Begründung: Wiederherstellbarkeit, nicht nutzbar im Regelbetrieb, verschlüsselt, Löschung wird nach Wiederherstellung nachgezogen), oder (b) kürzen, z. B. nur täglich 14 + wöchentlich 4 (`KEEP_*` in `ops.env`). Die Entscheidung ist ein reiner Konfigurationswert.
- **Löschprotokoll für die Wiederherstellung:** Nach einer Wiederherstellung müssen gelöschte Konten erneut gelöscht werden. Dafür gibt es keine technische Liste der gelöschten Konten (die Konten sind ja weg). Vorschlag: bei jeder Konto-Löschung nur die **ID** und das Löschdatum in einem Löschprotokoll festhalten (kein Name, keine E-Mail), Aufbewahrung gleich lang wie die Sicherungen. Braucht eine Tabelle/Migration und eine Entscheidung des DSB: **nicht gebaut, Rücksprache nötig.** Bis dahin Handarbeit anhand Support-Tickets und `identity.audit_log` (`docs/BETRIEB.md`, 5.2).
- **Betreiber-Mailadresse** (`OPERATOR_ALERT_EMAIL`) möglichst als Funktionsadresse (z. B. `betrieb@…`), nicht als persönliche Adresse.
- **AVV:** Hetzner Storage Box (Sicherungen) in den bestehenden Hetzner-AVV aufnehmen; Mailanbieter (Alarm-Mails) ist durch den Scaleway-AVV abgedeckt.

## Zu `docs/OFFENE-PUNKTE.md` (neuer Abschnitt „A3: Betrieb“)

1. **AUTH_SECRET_KEY hat keine Rotation** (nur ein Schlüssel). Eine Rotation entwertet 2FA-Geheimnisse, Einladungs-/Abmelde-/Wartelistenlinks und **die Mail-Sperrliste** (Adress-Hashes): Abgemeldete Adressen würden wieder Mails bekommen. Zwei-Schlüssel-Betrieb (neu + alt lesen) wäre nötig. Bis dahin: Schlüssel nie rotieren ohne DSB-Rücksprache; sorgfältig sichern.
2. **Löschprotokoll** für Wiederherstellungen (siehe oben): braucht Migration und DSB-Entscheidung.
3. **Keine WAL-Archivierung:** tägliche Vollsicherung, Wiederherstellungspunkt bis 24 Stunden alt. pgBackRest/WAL erst bei höherem Bedarf.
4. **Storage-Box-Snapshots** müssen in der Hetzner-Konsole aktiviert werden (Schutz gegen `rsync --delete` durch einen kompromittierten Server).
5. **Caddy-Dateien nicht mit `caddy validate` geprüft** (kein Caddy/Docker in der Entwicklungsumgebung): `infra/ops/validate-caddy.sh` vor dem ersten Einsatz (CI-Job `infra` macht es ebenfalls). Besonders: Log-Filter-Felder (`request>client_ip`, `regexp`), `max_header_size`, `servers { timeouts }`.
6. **Kein Rate-Limit auf Caddy-Ebene** (Standard-Image ohne Modul). Je-IP-Grenzen in der API; optionaler Build `infra/docker/caddy.Dockerfile` mit Vorlage.
7. **Docker und IPv6:** Keine AAAA-Einträge oder `ip6tables` aktivieren, sonst gilt das Rate-Limit je IP für alle IPv6-Besucher gleichzeitig.
8. **Alarm-Lücke:** Fällt der Server komplett aus, kann er keine Mail schicken. Der Uptime-Check von außen (anderer Rechner) ist deshalb Pflicht vor dem Launch.
9. **Rollback ohne Migrations-Rückbau:** Migrationen müssen rückwärtskompatibel sein (Leitlinie in `docs/BETRIEB.md`).
10. **`docs/DATENPANNE-PROZESS.md` fehlt** (Verweis im Betriebshandbuch ist ein TODO).
11. **Terraform nicht ausgeführt/validiert** (`terraform` fehlt lokal): `terraform init && terraform validate` in `infra/terraform` und `infra/terraform/firewall-single` vor dem Einsatz.
12. **Demo-Daten:** Der alte Satz (Fotos echter Personen) bleibt ein Risiko bis zur Löschung; Sicherungen vor der Löschung enthalten ihn weiter (Sätze einzeln löschen).

## Restore-Übung: Protokollvorlage

```
Datum:                 ____-__-__        Durchgeführt von: ________
Satz (Name):           ____________      Alter des Satzes: ___ h
Umgebung:              [ ] Wegwerf-Server (Typ ____)   [ ] Laptop mit Docker
age-Schlüssel genutzt: [ ] ja (nach der Übung entfernt/geschreddert)
Prüfsummen:            [ ] OK   [ ] Fehler
Wiederhergestellt:     users=____ organisationen=____ beiträge=____ (Manifest: users=____)
Medien:                ____ Dateien
Dauer (RESTORE-UEBUNG OK in ___ s):  ________   -> RTO-Messwert
Auffälligkeiten / Maßnahmen: _______________________________
Nächste Übung fällig:  ____-__-__ (spätestens 3 Monate)
```

## Nicht verifiziert (ehrlich)

- Alle Shell-Skripte sind **syntaktisch geprüft** (`bash -n`) und die reinen Hilfsfunktionen (Schwärzen, Aufbewahrung, Status-JSON) laufen im Selbsttest. **Nicht ausgeführt** wurden: `backup.sh`, `restore.sh`, `deploy.sh`, `smoke.sh`, `uptime-check.sh` (brauchen Server, Docker, age, Storage Box).
- Caddyfiles, Compose-Dateien, Terraform, Prometheus-/Alertmanager-Konfiguration, GitHub-Workflows: nur gelesen, nicht durch die jeweiligen Werkzeuge geprüft (Werkzeuge fehlen lokal). Die CI-Jobs sollen das nachholen.
- k6-Skripte: Syntax mit Node geprüft, **nicht gegen eine Umgebung gelaufen** (k6 fehlt). Annahmen: Anmeldung per `POST /auth/login` ohne bestätigte E-Mail möglich, Cookie `sid`, WebSocket-Ereignisse tragen ein `type`.
- Die Demo-Grafiken wurden erzeugt und angesehen; der fiktive Seed ist gegen die API **nicht gelaufen**.
