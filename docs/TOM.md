# Technische und organisatorische Maßnahmen (TOM), Art. 32 DSGVO

Stand: 14. November 2026 (Paket A1). Grundlage für Anhang 1 des Vertrags zur Auftragsverarbeitung (`packages/shared/src/avv.ts`) und die Datenschutzerklärung. Dies ist eine ehrliche Bestandsaufnahme mit Status: **umgesetzt** (im Code oder in der Infrastruktur vorhanden und getestet bzw. im Repo nachweisbar), **teilweise**, **offen**. Sie ist nicht anwaltlich oder durch eine:n Datenschutzbeauftragte:n geprüft. Faktenbasis: `docs/DATENSCHUTZ-LAUNCH.md` (Abschnitt 3), `docs/ARCHITEKTUR.md`, `infra/`.

Verantwortlich für die Pflege: Geschäftsführung (Betreiber). Überprüfung mindestens jährlich und bei jeder Etappe mit neuen personenbezogenen Daten.

## 1. Vertraulichkeit

| Maßnahme | Status | Nachweis |
|---|---|---|
| **Zutrittskontrolle:** keine eigenen Räume mit Datenbestand; Rechenzentrum Hetzner (DE) mit eigener Zutrittskontrolle | umgesetzt (Hetzner) | AVV mit Hetzner abschließen (offen, siehe 6) |
| **Zugangskontrolle Server:** SSH nur mit Schlüssel, keine Passwort- und keine Root-Anmeldung, fail2ban, automatische Sicherheitsupdates | umgesetzt | `infra/ansible/bootstrap.yml` |
| **Zugangskontrolle Anwendung:** Passwörter argon2id; Sitzungen mit Token-Hash in der Datenbank, HttpOnly/SameSite=Lax/Secure-Cookie; 30 Tage Laufzeit, stündliche Bereinigung; Zwei-Faktor (TOTP, freiwillig) mit Notfallcodes als Hash und Replay-Schutz; Login-Drosselung (10 Fehlversuche je E-Mail+IP = 15 Minuten, 100 je E-Mail und Stunde); generische Auth-Fehlermeldungen | umgesetzt | `apps/api/src/auth`, Tests |
| **Zugriffskontrolle:** Rollen im Verein (Vorstand, Kasse, Moderation, Mitglied) und Plattformrolle (nur per CLI `set-platform-admin`, `PlatformAdminGuard`); Mitgliederstammdaten lesen Vorstand und Kasse, ändern nur Vorstand; Anwesenheit nur Vorstand und Moderation; Medien nur nach Anmeldung und Sichtbarkeitsprüfung (`ProfileAccess`) | umgesetzt | Tests je Modul |
| **Zugriffsprotokoll:** Exporte der Mitgliederliste, Rechnungsaktionen, Moderationsentscheidungen, Zugriff auf Chat-Klartext gemeldeter Nachrichten, Einladungslink-Abruf, AVV-Zustimmung, Wartelisten-Abrufe; ohne Inhalte; Fristen 12/24 Monate/10 Jahre | umgesetzt | `AuditService`, `common/retention.ts` |
| **Trennungskontrolle:** Schemas je Bereich (identity, social, chat, billing, members, avv, mail, waitlist), Test `boundaries.spec.ts` bricht bei Cross-Schema-Zugriffen; getrennte Container (api, web, chat-gateway, worker); Secrets je Dienst | umgesetzt (Schemas, Container); **teilweise** bei Datenbankrollen: noch ein DB-Benutzer für alle Bereiche | `docs/ARCHITEKTUR.md` |
| **Verschlüsselung:** TLS überall + HSTS; Chat-Inhalte, Chat-Beweiskopien, 2FA-Geheimnisse und Einladungs-Token AES-256-GCM (Master-Schlüssel getrennt, Chat-Schlüssel rotierbar); Token, Sitzungs- und Einmal-Links nur als SHA-256-Hash; Adressen in Sperrliste/Zählern als HMAC | umgesetzt | `chat`, `auth`, `mail` |
| **Pseudonymisierung/Datensparsamkeit:** keine E-Mail-Adressen in der Mitgliederliste; keine Art.-9-Daten vorgesehen; Bilder ohne EXIF, Original nicht gespeichert; Logs ohne IP/Header/Cookies/Tokens/Query-Werte, Links mit Geheimnissen geschwärzt | umgesetzt | API-Logging, `media` |
| **Weitergabekontrolle:** keine Drittanbieter-Aufrufe im Frontend (strenge CSP, lokale Schrift, Playwright-Wächter gegen Fremd-Hosts); Push nur Kurztexte (Chat ohne Absender/Inhalt); Rechnungsmails nur mit Link; Metriken nur mit Token und von Caddy nach außen geblockt | umgesetzt | `apps/web/next.config.ts`, e2e |
| **Mandantentrennung zwischen Vereinen:** alle Abfragen über Vereinsrolle der anfragenden Person (`OrgsService.activeRole`); Tests für Zugriff auf fremde Vereine | umgesetzt | Tests |

## 2. Integrität

| Maßnahme | Status | Nachweis |
|---|---|---|
| **Eingabekontrolle:** Erfasser und Zeitpunkt bei Anwesenheit, Rechnungen, Beitragsläufen, Meldungen; Zod-Validierung aller API-Eingaben aus `packages/shared` | umgesetzt | Code |
| **Unveränderbarkeit:** finalisierte Rechnungen (Ausstellerdaten als Kopie, lückenloser Nummernkreis); AVV-Zustimmungen nur anhängend (DB-Trigger sperrt Ändern, Löschen, Truncate) | umgesetzt | `billing`, `avv` |
| **Sicherer Betrieb der Anwendung:** Sicherheits-Header, CSP, Formel-Schutz bei CSV-Export, CSV-Import mit Abweisung gefährlicher Namen, Rate-Limits, Open-Redirect-Schutz | umgesetzt | Tests |
| **Änderungsmanagement:** Schema-Änderungen nur per Migration; CI: typecheck, build, Tests (API auch gegen Postgres 16), E2E mit axe, `npm audit` | umgesetzt | `.github/workflows/ci.yml` |

## 3. Verfügbarkeit und Belastbarkeit

| Maßnahme | Status | Nachweis |
|---|---|---|
| **Sicherungen:** Skript sichert Datenbank und Medienspeicher, behält die letzten 14 Sicherungen; Wiederherstellungstest-Skript | **teilweise**: Skripte vorhanden; **automatischer Lauf (Cron/Timer) und verschlüsselte Offsite-Kopie fehlen**; Wiederherstellungsübung nicht durchgeführt | `infra/deploy/backup.sh`, `restore-test.sh` |
| **Ausfallsicherheit:** Container starten automatisch neu, Zustandsprüfungen; Warteschlange (Redis mit AOF, noeviction) wiederholt Jobs; Hintergrundjobs als Sicherheitsnetz (z. B. Löschung nach Austritt) | umgesetzt | `docker-compose.preview.yml`, `JobsService` |
| **Schutz vor Überlast und Missbrauch:** Rate-Limits (öffentlich je IP, Anmeldung, Nutzeraktionen, Mail-Kostenbremse, Export) | umgesetzt | Redis-Zähler |
| **Netzwerk:** Datenbank und Redis nur im internen Docker-Netz; Caddy als einziger öffentlicher Eingang | umgesetzt; **Cloud-Firewall (Hetzner) offen** | `infra/` |
| **Monitoring und Alarme:** `/metrics` (Prometheus-Text, nur mit Token); Dashboards/Alarme nicht eingerichtet | **offen** | `docs/ARCHITEKTUR.md` |
| **Protokoll-Rotation:** Docker json-file, 10 MB × 3 Dateien je Container | umgesetzt (größenbasiert, keine feste Tagesfrist; Ziel höchstens 14 Tage) | `infra/ansible/bootstrap.yml` |
| **Schlüsselsicherung:** Chat-Master-Schlüssel und `AUTH_SECRET_KEY` müssen separat und verschlüsselt gesichert werden (ohne sie sind Chat und 2FA unlesbar) | **offen (organisatorisch)** | `docs/ARCHITEKTUR.md` |

## 4. Verfahren zur regelmäßigen Überprüfung (Art. 32 Abs. 1 lit. d)

| Maßnahme | Status |
|---|---|
| Automatische Tests bei jeder Änderung (Einheit, Integration, E2E, axe, Abhängigkeitsprüfung) | umgesetzt |
| Verarbeitungsverzeichnis (`docs/VVT.md`), Löschkonzept (`docs/LOESCHKONZEPT.md`), Datenpannen-Prozess (`docs/DATENPANNE-PROZESS.md`) | angelegt (A1), Übung der Datenpanne und Prüfung durch DSB offen |
| Datenschutz-Merker je Etappe (CLAUDE.md) | umgesetzt |
| Penetrationstest | **offen** |
| Datenschutz-Folgenabschätzung (Feed-Profiling, Chat, Minderjährige) | **offen** (DSB) |
| Jährliche Überprüfung dieses Dokuments | organisatorisch festgelegt, erstmals zum Jahresende 2027 |

## 5. Organisatorische Maßnahmen

- Verpflichtung aller Beteiligten (Geschäftsführung, Freelancer, Hilfskräfte) auf Vertraulichkeit schriftlich; Zugänge nur nach Bedarf, bei Ausscheiden sofort entziehen (SSH-Schlüssel, Repo, Server, Mail-Konto, Hetzner und Scaleway).
- Passwörter und Schlüssel nie im Chat, in Tickets oder im Repo; Secrets nur in `.env.preview` (Rechte 600) auf dem Server.
- Zugriff auf Chat-Klartext nur über Plattform-Moderation bei Meldungen; Datenpanne nach `docs/DATENPANNE-PROZESS.md`.
- Test- und Demo-Daten dürfen keine echten Personenfotos enthalten und sind vor dem Start mit echten Nutzern zu löschen (`infra/demo/README.md`).
- Verträge: AVV mit Hetzner und Scaleway abschließen und ablegen (Voraussetzung für den Echtbetrieb), Unterauftragsverarbeiter-Liste pflegen.

## 6. Offene Punkte, die die TOM-Aussagen nach außen begrenzen

Diese Punkte stehen bewusst **nicht** als Zusage im öffentlichen Text oder im AVV-Anhang als umgesetzt, bis sie erledigt sind:
1. Automatischer Backup-Lauf und Offsite-Kopie (verschlüsselt), Wiederherstellungsübung.
2. Cloud-Firewall, Monitoring mit Alarmen.
3. Datenbankrollen je Bereich.
4. Penetrationstest, DSFA.
5. AVV mit Hetzner und Scaleway abgeschlossen und abgelegt.
