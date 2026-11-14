# Betriebshandbuch Klubnest

Für den Gründer als Betreiber. Alles hier ist als Skript oder Konfiguration im Repository vorbereitet (`infra/ops`, `infra/deploy`, `infra/monitoring`, `infra/loadtest`), **ausgeführt wird es von dir** auf dem Server. Sprache: Du-Form. Keine Geheimnisse in dieser Datei und nie im Chat: nur Vorgehen, keine Werte.

Stand: Paket A3 (Betriebsreife). Rechtliches (Fristen, Datenpanne) steht in `docs/DATENSCHUTZ-LAUNCH.md` und `docs/welle2/A3-DOKU.md`.

## Inhalt
1. Überblick und Skripte
2. Einrichtung der Betriebsskripte (einmalig)
3. Sicherung (Backup)
4. Prüfung der Sicherung
5. Wiederherstellung und Restore-Übung
6. Schlüssel: sichern und rotieren
7. Überwachung und Alarme
8. Deploy mit Rollback, Staging
9. Caddy: Header, Logs, Zeitlimits
10. Firewall und DDoS (nur EU)
11. Lasttest
12. Notfallplan und Datenpanne
13. Demo-Daten
14. Checkliste Go-Live

---

## 1. Überblick und Skripte

| Zweck | Datei | Läuft |
|---|---|---|
| Sicherung (DB, Medien, Konfiguration, offsite) | `infra/ops/backup.sh` | Server, täglich per Timer |
| Sicherung prüfen | `infra/ops/check-backup.sh` | Server, täglich per Timer |
| Wiederherstellung, Restore-Übung | `infra/ops/restore.sh` | Server oder Wegwerf-Maschine, von Hand |
| Deploy mit Rollback | `infra/ops/deploy.sh` | Server, von Hand oder per GitHub-Workflow |
| Smoke-Test | `infra/ops/smoke.sh` | Server oder von außen |
| Uptime-Check von außen | `infra/ops/uptime-check.sh` | **anderer** Rechner (Cron alle 5 Min.) |
| Caddy-Dateien prüfen | `infra/ops/validate-caddy.sh` | Rechner mit `caddy` oder Docker, auch CI |
| Selbsttest der Skripte | `infra/ops/selftest.sh` | überall mit bash, auch CI |
| Timer-Vorlagen | `infra/ops/systemd/` | Server |
| Konfigurationsvorlage | `infra/ops/ops.env.example` | Server (`/etc/vereine/ops.env`, 600) |
| Prometheus/Alertmanager (optional) | `infra/monitoring/` | Server, Docker |
| Lasttests | `infra/loadtest/` | Lastgenerator gegen **Staging** |
| Firewall (Terraform) | `infra/terraform/firewall-single/`, `infra/terraform/main.tf` | dein Rechner |
| Demo-Daten | `infra/demo/` | siehe Abschnitt 13 |

In der App selbst: **Plattform-Seite** (`/plattform`, nur Plattform-Rolle) zeigt die Betriebslage; `GET /api/health/ready` nennt Datenbank, Cache, Worker, Warteschlange, Mail-Kontingent; `/metrics` (nur intern, mit `METRICS_TOKEN`) liefert Messwerte für Prometheus.

## 2. Einrichtung der Betriebsskripte (einmalig)

Auf dem Server als root. Nichts davon geschieht automatisch.

```bash
apt install -y age rsync                      # Verschlüsselung und Offsite-Kopie
install -d -m 700 /etc/vereine /var/backups/vereine
install -d -m 755 /var/lib/vereine/status     # Statusdatei, wird read-only in API/Worker gemountet (keine Geheimnisse)
install -m 600 /opt/vereine/infra/ops/ops.env.example /etc/vereine/ops.env   # danach Werte anpassen
chmod +x /opt/vereine/infra/ops/*.sh
```

**age-Schlüsselpaar** (auf **deinem eigenen Rechner**, nicht auf dem Server):

```bash
age-keygen -o klubnest-backup-key.txt         # gibt "Public key: age1..." aus
```
- Den **privaten** Schlüssel (`AGE-SECRET-KEY-...`) legst du im Passwortmanager **und** als Ausdruck/USB-Stick an einem zweiten Ort ab. Ohne ihn ist jede Sicherung wertlos.
- Den **öffentlichen** Schlüssel (`age1...`) schreibst du auf den Server in `/etc/vereine/backup-recipients.txt` (eine Zeile je Empfänger, empfohlen: zwei Personen, damit niemand allein ein Risiko ist). Das Skript bricht ab, wenn dort ein privater Schlüssel steht.

**Hetzner Storage Box** (Offsite, Deutschland):
1. Storage Box bestellen, in der Konsole „SSH-Unterstützung“ und „Externe Erreichbarkeit“ aktivieren. Besser: ein **Unterkonto** nur für dieses Verzeichnis anlegen.
2. SSH-Schlüssel nur für die Sicherung erzeugen: `ssh-keygen -t ed25519 -f /root/.ssh/storagebox_ed25519 -N ""` und den öffentlichen Teil gemäß Hetzner-Anleitung hinterlegen (`install-ssh-key`, Port 23).
3. Host-Schlüssel festschreiben und mit der Hetzner-Dokumentation vergleichen: `ssh-keyscan -p 23 uXXXXXX.your-storagebox.de > /root/.ssh/known_hosts_storagebox`.
4. In `/etc/vereine/ops.env` `STORAGEBOX_TARGET=uXXXXXX@uXXXXXX.your-storagebox.de` eintragen.
5. **Snapshots der Storage Box einschalten** (Konsole, soweit im Tarif verfügbar). Grund: `rsync --delete` spiegelt auch Löschungen; ein kompromittierter Server könnte sonst die Offsite-Kopie leeren. Der Snapshot-Plan ist die Absicherung dagegen.

Timer aktivieren (Anleitung und Cron-Alternative: `infra/ops/systemd/README.md`):

```bash
cp /opt/vereine/infra/ops/systemd/vereine-backup*.service /opt/vereine/infra/ops/systemd/vereine-backup*.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now vereine-backup.timer vereine-backup-check.timer
/opt/vereine/infra/ops/backup.sh              # erste Sicherung von Hand, Ausgabe lesen
/opt/vereine/infra/ops/check-backup.sh        # muss mit Exit 0 enden
```

Danach in `.env.preview` setzen (siehe Abschnitt 7): `OPERATOR_ALERT_EMAIL`, und neu starten (`deploy.sh` oder `docker compose up -d`).

## 3. Sicherung (Backup)

**Was** (`backup.sh`, ein „Satz“ je Lauf unter `/var/backups/vereine/daily/JJJJMMTT-HHMMSS/`):

| Datei | Inhalt |
|---|---|
| `db.sql.gz.age` | Postgres-Dump (pg_dump → gzip → age im Strom, nie Klartext auf der Platte) |
| `media.tar.gz.age` | Medien-Volume (Bilder) |
| `config.tar.gz.age` | Compose-/Caddy-Dateien und `.env` **mit geschwärzten Werten** (nur Variablennamen; Zeilen mit PASSWORD, PASS, SECRET, KEY(S), TOKEN, PRIVATE, DATABASE_URL werden `=<ENTFERNT>`) |
| `SHA256SUMS`, `manifest.json` | Prüfsummen, Zeitpunkt, Nutzerzahl, Größe |

**Nicht** enthalten und getrennt zu sichern: `CHAT_MASTER_KEYS`, `AUTH_SECRET_KEY`, `POSTGRES_PASSWORD`, VAPID-Schlüssel, SMTP-Zugang, `METRICS_TOKEN`, age-Privatschlüssel, SSH-Schlüssel (Abschnitt 6).

**Aufbewahrung:** täglich 14, wöchentlich 8 (sonntags), monatlich 6 (am Ersten); Weekly/Monthly sind Hardlinks (kein doppelter Platz). Einstellbar mit `KEEP_DAILY/WEEKLY/MONTHLY` in `/etc/vereine/ops.env`.

**Datenschutz:** Ein Satz enthält auch Daten, die inzwischen gelöscht wurden, bis der Satz ausgemustert ist: längstens ca. 6 Monate + 1 Monat (monatliche Sätze). Das ist im Löschkonzept zu dokumentieren und mit dem Datenschutzbeauftragten abzustimmen (Vorschlag und Alternativen: `docs/welle2/A3-DOKU.md`). Wird eine Sicherung eingespielt, müssen seit dem Satz gelöschte Konten **erneut gelöscht** werden (Abschnitt 5). Verschlüsselung ruht, der Schlüssel liegt nie auf dem Server.

**Offsite:** `rsync` über SSH auf die Storage Box; nach dem Kopieren folgt ein Trockenlauf, der **keinen** Unterschied mehr zeigen darf. Schlägt Offsite fehl, gilt die Sicherung als fehlgeschlagen (Alarm). Lokale Sicherung allein schützt nicht vor Server-Verlust.

**Status:** `backup.sh` schreibt `/var/lib/vereine/status/status.json` (`finishedAt`, `ok`, `bytes`, `set`, `offsite`). API und Worker lesen sie und alarmieren bei Alter > 30 Stunden oder `ok:false` (Abschnitt 7).

**Grenze:** Das ist eine tägliche Vollsicherung (Wiederherstellungspunkt bis 24 Stunden alt). WAL-Archivierung/pgBackRest für minutengenaue Wiederherstellung ist **nicht** gebaut; sie lohnt sich, sobald ein Tag Datenverlust nicht mehr tragbar ist.

## 4. Prüfung der Sicherung

`check-backup.sh` (täglich 08:00 per Timer, Ausgabe: eine Zeile je Prüfung, Exit 1 bei Fehler) prüft: letzte Sicherung erfolgreich, Alter ≤ 30 Stunden, Größe ≥ 10 KiB, Offsite aktuell, neuester Satz vollständig (alle Dateien da). Mit `CHECK_HASH=1` zusätzlich alle Prüfsummen. Schlägt der Timer fehl, siehst du es mit `systemctl status vereine-backup-check` und `journalctl -u vereine-backup-check`. Unabhängig davon alarmiert die App per Mail (Abschnitt 7).

**Eine Sicherung zählt erst, wenn eine Wiederherstellung geklappt hat.** Deshalb Abschnitt 5, mindestens vierteljährlich.

## 5. Wiederherstellung und Restore-Übung

`infra/ops/restore.sh` hat vier Betriebsarten. Den privaten Schlüssel übergibst du nur für den Lauf (`AGE_IDENTITY=/pfad/key.txt`, z. B. vom USB-Stick) und entfernst ihn danach.

| Befehl | Wirkung |
|---|---|
| `restore.sh pull` | holt die Sätze von der Storage Box nach `BACKUP_DIR` (frische Maschine) |
| `restore.sh verify [Satz]` | Prüfsummen, Entschlüsseln, Einspielen in eine **Wegwerf-Datenbank** im laufenden Postgres; Live-Daten bleiben unberührt |
| `restore.sh fresh [Satz]` | **Restore-Übung:** eigener Wegwerf-Postgres-Container (nur Docker nötig), spielt DB ein, entpackt Medien, misst die Dauer, räumt auf |
| `restore.sh live [Satz]` | **Echte Wiederherstellung:** Notfall-Sicherung des Ist-Zustands, App stoppen, DB und Medien ersetzen, App starten. Verlangt die Eingabe `WIEDERHERSTELLEN` |

### 5.1 Restore-Übung auf einer Wegwerf-Instanz (vierteljährlich, ca. 30 Minuten, Kosten Cent-Bereich)

Ziel: beweisen, dass die Sicherung **ohne** den Produktionsserver wiederherstellbar ist, und die Dauer messen.

1. Wegwerf-Server in Deutschland anlegen (Hetzner Cloud, kleinster Typ reicht, z. B. `cx22`, Ubuntu 24.04, **eigener** SSH-Schlüssel, keine Produktionsdaten): in der Konsole oder `hcloud server create --name restore-drill --type cx22 --image ubuntu-24.04 --location fsn1 --ssh-key <dein-key>`.
2. Darauf: `apt update && apt install -y docker.io age rsync`. Repository-Stand kopieren (nur `infra/ops`, z. B. `git archive HEAD infra/ops | ssh root@<ip> "mkdir -p /opt/vereine && tar -xf - -C /opt/vereine"`).
3. `/etc/vereine/ops.env` mit **nur** den Storage-Box-Werten (`STORAGEBOX_*`, `BACKUP_DIR`) anlegen; Storage-Box-SSH-Schlüssel und `known_hosts_storagebox` vorübergehend hinkopieren (besser ein Lese-Unterkonto der Storage Box). **Die Produktions-`.env` kommt nicht auf diese Maschine.**
4. `infra/ops/restore.sh pull` (holt die Sätze), dann `AGE_IDENTITY=/root/key.txt infra/ops/restore.sh fresh latest`.
5. Erwartete Ausgabe: `Wiederhergestellt: users=... organisationen=... beitraege=...` und `RESTORE-UEBUNG OK in N s`. Die Nutzerzahl muss ungefähr der in `manifest.json` entsprechen.
6. Aufräumen: Schlüssel und Sicherungen auf der Maschine löschen (`shred -u /root/key.txt; rm -rf /var/backups/vereine`), Server **löschen** (`hcloud server delete restore-drill`), Storage-Box-Schlüssel widerrufen, falls nur dafür angelegt.
7. Protokoll führen (Datum, Satz, Dauer, Auffälligkeiten; Vorlage in `docs/welle2/A3-DOKU.md`).

Alternativ ohne Cloud-Maschine: auf deinem Laptop mit Docker, gleiche Befehle (`fresh` braucht nur Docker, age und die Dateien).

### 5.2 Echte Wiederherstellung (Notfall)

Szenarien und Vorgehen:

- **Datenbank beschädigt oder falsch geändert, Server läuft:** `AGE_IDENTITY=... infra/ops/restore.sh live latest` (oder einen bestimmten Satz). Das Skript macht vorher eine Notfall-Sicherung.
- **Server verloren:** neuen Server nach `infra/README.md` aufsetzen (Terraform/Ansible oder von Hand), Repository nach `/opt/vereine`, `.env.preview` aus dem Passwortmanager neu bauen (Variablennamen stehen geschwärzt in `config.tar.gz.age`), Schlüssel aus dem Passwortmanager, Betriebsskripte einrichten (Abschnitt 2), `restore.sh pull`, dann `restore.sh live latest`, danach DNS umstellen.
- **Nur Medien verloren:** `media.tar.gz.age` mit `age -d -i key.txt media.tar.gz.age | docker run --rm -i -v deploy_mediadata:/data alpine tar xz -C /data`.

Nach jeder echten Wiederherstellung (das Skript erinnert daran):
1. `infra/ops/smoke.sh` bis `SMOKE OK`.
2. `CHAT_MASTER_KEYS` und `AUTH_SECRET_KEY` prüfen (müssen die **alten** Werte sein, sonst sind Chat-Inhalte und Zwei-Faktor-Daten unlesbar).
3. **Seit dem Satz gelöschte Konten erneut löschen** (Löschwünsche nach Art. 17 DSGVO dürfen durch eine Wiederherstellung nicht aufleben): Support-Postfach/Tickets und Zugriffsprotokoll (`identity.audit_log`, Aktion der Kontolöschung) seit dem Satzdatum durchgehen, jedes betroffene Konto erneut löschen, Ergebnis dokumentieren.
4. Betroffene (Datenverlust seit dem Satz) informieren; prüfen, ob eine Meldepflicht besteht (Abschnitt 12).

## 6. Schlüssel: sichern und rotieren

Nur Vorgehen, **nie** Werte in Chat, Tickets, Git oder Logs.

| Geheimnis | Wo es liegt | Sicherung | Folge bei Verlust |
|---|---|---|---|
| `CHAT_MASTER_KEYS` | `.env.preview` (Server) | Passwortmanager (Zeile komplett) + Ausdruck im Safe | **Chat-Inhalte unwiderruflich unlesbar** |
| `AUTH_SECRET_KEY` | `.env.preview` | Passwortmanager + Ausdruck | 2FA-Geheimnisse unlesbar (Nutzer richten 2FA neu ein), Einladungs-, Abmelde- und Wartelisten-Links ungültig, **Mail-Sperrliste greift nicht mehr** (Adress-Hashes) |
| `POSTGRES_PASSWORD` | `.env.preview` | Passwortmanager | Neu setzbar, aber DB-Benutzer muss mitgezogen werden |
| `VAPID_PRIVATE_KEY` | `.env.preview` | Passwortmanager | Alle Push-Abos ungültig (Nutzer müssen neu zustimmen) |
| `SMTP_PASS`, `METRICS_TOKEN` | `.env.preview` | Passwortmanager | Neu ausstellbar |
| age-Privatschlüssel | offline | Passwortmanager + zweiter physischer Ort, mind. 2 Personen | Sicherungen unlesbar |
| SSH-Schlüssel, Hetzner-/Storage-Box-Zugang | dein Rechner / Konsole | Passwortmanager, Hardware-Schlüssel/2FA | Zugang neu einrichten |

Schlüsselerzeugung: `openssl rand -base64 32` (Chat, Auth). **Zeilen aus `.env.preview` nie in Tickets/Chats kopieren.**

### Rotation

- **Chat-Master-Schlüssel (vorgesehen, ohne Datenverlust):** `CHAT_MASTER_KEYS=1:<alt>,2:<neu>`, `CHAT_ACTIVE_KEY_VERSION=2` setzen, API und Worker neu starten, `docker compose ... exec api node apps/api/dist/jobs/enqueue-cli.js chat.rewrap-keys`, danach alten Schlüssel entfernen und die neue Zeile im Passwortmanager ablegen. Nachrichten müssen nicht neu verschlüsselt werden. **Nach der Rotation eine Sicherung ziehen**, denn Sicherungen vor der Rotation brauchen den alten Schlüssel (alten Schlüssel im Passwortmanager als „Version 1, gültig bis …“ aufbewahren, solange alte Sätze existieren).
- **AUTH_SECRET_KEY:** Eine Rotation ist **nicht vorgesehen** (nur ein Schlüssel, kein Zwei-Schlüssel-Betrieb). Nur bei Verdacht auf Kompromittierung, mit den Folgen aus der Tabelle (insbesondere Sperrliste und 2FA). Vorher DSB informieren. Offener Punkt: Zwei-Schlüssel-Betrieb bauen (`docs/welle2/A3-DOKU.md`).
- **POSTGRES_PASSWORD:** neues Passwort in `.env.preview`, `ALTER USER vereine PASSWORD '…'` im Postgres-Container ausführen (Passwort nicht in die Shell-Historie: aus Datei lesen), Dienste neu starten.
- **METRICS_TOKEN, SMTP_PASS:** neu erzeugen, in `.env.preview` und (bei Prometheus) `infra/monitoring/secrets/` ersetzen, neu starten.
- **age-Schlüssel:** neues Paar erzeugen, neuen öffentlichen Schlüssel **zusätzlich** in `backup-recipients.txt`, nach 14 Tagen den alten entfernen (Sätze mit dem alten bleiben nur mit dem alten Privatschlüssel lesbar: aufbewahren, bis diese Sätze ausgemustert sind).
- **SSH-/Storage-Box-Schlüssel:** neuen Schlüssel hinterlegen, testen, alten entfernen.

## 7. Überwachung und Alarme

**Eingebaut (in der API, `apps/api/src/ops`):**

Der Worker meldet sich alle 30 Sekunden (Cache-Redis, Ablauf 2 Minuten). Der Job `ops.alert-check` (Worker, alle 5 Minuten) bewertet die Lage. Je Ereignisart und Kalendertag geht **höchstens eine Mail** an `OPERATOR_ALERT_EMAIL`, über den `MailService` (also mit Kostenbremse und Sperrliste; Betreff und Text sind feste Texte mit Zahlen, **keine Personendaten**). Ohne diese Variable wird nur angezeigt, nichts verschickt.

| Alarm (`kind`) | Auslöser (Standard) | Einstellbar | Erste Maßnahme |
|---|---|---|---|
| `worker` | kein Lebenszeichen seit > 2 Min. | – | `docker compose ps`, `logs worker`, `up -d worker` |
| `jobs-failed` | ≥ 5 endgültig fehlgeschlagene Jobs | `OPS_JOBS_FAILED_MAX` | `logs worker` lesen, Ursache beheben, Jobs prüfen |
| `jobs-backlog` | ≥ 500 wartende Jobs | `OPS_JOBS_BACKLOG_MAX` | Worker hängt/überlastet: neu starten, `WORKER_CONCURRENCY` prüfen |
| `mail-quota` | Mail-Kontingent ≥ 80 % (Tag oder Monat) | `OPS_MAIL_QUOTA_PERCENT`, `MAIL_DAILY_LIMIT`, `MAIL_MONTHLY_LIMIT` | Ursache prüfen (Massenmail?), Limit bewusst anheben oder abwarten |
| `disk` | Platte ≥ 80 % | `OPS_DISK_PERCENT`, `OPS_DISK_PATH` | `docker builder prune -f && docker image prune -f`, alte Sicherungen/Logs prüfen, Volume vergrößern |
| `backup` | Sicherung älter als 30 Std., fehlgeschlagen oder keine Statusdatei | `OPS_BACKUP_MAX_AGE_HOURS` | `journalctl -u vereine-backup`, `backup.sh` von Hand |

Anzeige: **Plattform-Seite, Karte „Betrieb“**, sowie `GET /platform/ops` (nur Plattform-Rolle). Der Bereitschafts-Endpunkt `GET /api/health/ready` enthält zusätzlich `"worker":"up|down|inline"`. `/metrics` liefert `klubnest_worker_up`, `klubnest_disk_used_percent`, `klubnest_backup_age_seconds`, `klubnest_alert_active{kind=…}`.

**Wichtig – Grenzen:** Fällt der Server oder die Mail-Zustellung aus, kann sich die App nicht selbst melden. Deshalb zusätzlich:

**Uptime-Check von außen** (`infra/ops/uptime-check.sh`) auf einem **anderen** Rechner in der EU (z. B. dein Heimserver/Raspberry oder ein zweites kleines VPS bei einem EU-Anbieter): Cron `*/5 * * * * /pfad/infra/ops/uptime-check.sh`. Prüft Startseite, `/api/health/ready` (inkl. Worker) und die TLS-Restlaufzeit (< 14 Tage). Meldet nur bei Zustandswechsel, per Cron-Mail (`MAILTO`) oder SMTP (`ALERT_SMTP_*` in `ops.env`, Datei 600). Keine Drittanbieter-Dienste, keine Daten an Dritte.

**Optional Prometheus + Alertmanager** (`infra/monitoring/`): leichte Konfiguration, die dieselben Kriterien über `klubnest_alert_active` auswertet und zusätzlich Fehlerquote > 1 %, p95 > 400 ms, Event-Loop-Verzögerung. Start und Geheimnisse siehe Kopfzeile von `docker-compose.monitoring.yml`. Kein Grafana nötig.

Reaktionszeit-Vorschlag (Gründer entscheidet): Alarm `worker`, `backup` **am selben Tag**, `disk` innerhalb 2 Tagen, `mail-quota` am selben Tag prüfen.

## 8. Deploy mit Rollback, Staging

**Ablauf (`infra/ops/deploy.sh`, auf dem Server):**

1. Vorprüfung (Compose gültig, ≥ 4 GB frei).
2. **Sicherung** (`backup.sh`). Schlägt sie fehl, bricht der Deploy ab, **die laufende Version bleibt unberührt**.
3. Images bauen und mit Tag versehen (`vereine-api:<tag>`, `vereine-web:<tag>`); die laufende Version bleibt unberührt.
4. Ausrollen. Die API führt **beim Start** die Migrationen aus, also erst **nach** der erfolgreichen Sicherung.
5. Smoke-Test (`smoke.sh`: Startseite, `/api/auth/me` 401, `/api/metrics` 404, Bereitschaft, Worker, Sicherheits-Header, Container gesund).
6. Fehler: automatischer **Rollback der Images** auf das vorige Tag und erneuter Smoke-Test.

Wichtig: Ein Rollback macht **Migrationen nicht rückgängig**. Migrationen müssen deshalb rückwärtskompatibel sein (erst Spalte hinzufügen und befüllen, später entfernen). Bei einer zerstörenden Migration: `restore.sh live <Satz vor dem Deploy>` (das Skript nennt den Satz).

```bash
# 1. Quellstand hochladen (von deinem Rechner, im Repository)
git archive --format=tar HEAD | ssh root@<server> "cd /opt/vereine && tar -xf -"
git rev-parse --short HEAD | ssh root@<server> "cat > /opt/vereine/.release"
# 2. Deploy auf dem Server
ssh root@<server> "/opt/vereine/infra/ops/deploy.sh"
# Status / Rollback
ssh root@<server> "/opt/vereine/infra/ops/deploy.sh status"
ssh root@<server> "/opt/vereine/infra/ops/deploy.sh rollback"      # auf das vorige Tag
```

**GitHub-Workflow** (`.github/workflows/deploy.yml`, nur manuell auslösbar, **keine Geheimnisse im Repository**): Die Werte `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` legst du in GitHub unter *Settings → Environments → production* an (mit „Required reviewers“) und setzt die Repository-Variable `DEPLOY_ENABLED=true`. Ohne das tut der Workflow nichts. Der Deploy-Schlüssel gehört einem eigenen Benutzer/Schlüssel nur für diesen Zweck.

**Staging:** `infra/deploy/docker-compose.staging.yml` (zusätzlich zur Preview-Compose) + `Caddyfile.staging`: eigener Projektname und Volumes, Mail **nie** echt (Treiber `log`), nur freigegebene IPs (`STAGING_ALLOW_CIDR`), `noindex`, optional Rate-Limit-Ausnahme für den Lastgenerator (`LOADTEST_IP`). Betriebsskripte gegen Staging: `COMPOSE_EXTRA="-f /opt/vereine/infra/deploy/docker-compose.staging.yml" ENV_FILE=/opt/vereine/.env.staging MEDIA_VOLUME=vereine-staging_mediadata`. Staging bekommt **keine** echten Personendaten; Testdaten mit `infra/demo/fiktiv`.

## 9. Caddy: Header, Logs, Zeitlimits

Geändert gegenüber vorher (`infra/deploy/Caddyfile.tls`, `Caddyfile`, neu `Caddyfile.staging`):

- **`trusted_proxies`:** In `Caddyfile` stand `static private_ranges`. Das ist **entfernt**: Es ließ jeden Client mit privater Bridge-IP (Docker-Userland-Proxy, z. B. IPv6) seine IP per `X-Forwarded-For` wählen und damit das Rate-Limit je IP umgehen (und Hetzner-L4-Load-Balancer setzen den Header ohnehin nicht). Ohne `trusted_proxies` ersetzt Caddy einen vom Client mitgeschickten `X-Forwarded-For` durch die echte Socket-IP; die API vertraut dem Header nur von privaten Gegenstellen (Caddy im Docker-Netz) und kann ihn so nicht fälschen. Hinter einem Load Balancer: Proxy Protocol (Anleitung im Kopf der `Caddyfile`).
- **Docker/IPv6:** Keine `AAAA`-Einträge setzen oder in `/etc/docker/daemon.json` `{"ip6tables": true, "experimental": true}` aktivieren, sonst sieht Caddy für IPv6-Besucher die Bridge-IP (Rate-Limit je IP wirkt dann für alle gleichzeitig).
- **Sicherheits-Header** für alle Antworten: HSTS (1 Jahr, includeSubDomains), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, Server-Header entfernt. CSP setzt weiterhin Next.js für die Seiten.
- **Grenzen:** Header-Zeitlimit 10 s, Body-Zeitlimit 60 s, Leerlauf 2 Min., Header ≤ 16 KB, Body ≤ 10 MB (Bilder sind in der API auf 8 MB begrenzt).
- **Gesperrt nach außen:** `/api/metrics`, `/api/__dev` (404).
- **Rate-Limits:** Das Standard-Image `caddy:2` hat **kein** Rate-Limit-Modul. Je-IP-Grenzen bleiben in der API (Redis: Login 10/Min., sonst 200/Min., Mail-Auth je IP/Adresse, Wartelisten-Limit). Optional ein eigener Caddy-Build mit `caddy-ratelimit`: `infra/docker/caddy.Dockerfile` und Vorlage `infra/deploy/ratelimit.caddy.example`.
- **Logs:** Zugriffslog nach `/var/log/caddy/access.log` (Volume `caddy_logs`), **Rotation 14 Tage** (`roll_keep_for 336h`, 20 MiB, höchstens 14 Dateien), **IP gekürzt** (IPv4 /24, IPv6 /56), ohne `Cookie`, `Authorization`, `X-Forwarded-For`, `Set-Cookie`; das Kalender-Abo-Token im Pfad wird geschwärzt. Docker-Container-Logs sind auf ca. 30 MB je Container begrenzt. Das entspricht der Frist „Server-Logs 14 Tage“ in `docs/OFFENE-PUNKTE.md`.
- **Validierung:** `caddy` war bei der Erstellung **nicht verfügbar** (weder lokal noch Docker). Die Dateien sind daher **nicht** mit `caddy validate` geprüft. **Aufgabe vor dem ersten Einsatz:** `infra/ops/validate-caddy.sh` ausführen (nutzt `caddy` oder `docker run caddy:2`); der CI-Job `infra` macht dasselbe. Besonders prüfen: die `log`/`format filter`-Felder (`request>client_ip` braucht Caddy ≥ 2.7) und der `regexp`-Filter für das Kalender-Token.

## 10. Firewall und DDoS (nur EU)

Grundsatz: **kein Cloudflare, kein Anbieter außerhalb der EU vor dem Server** (Entscheidung „Nur EU-Anbieter“).

Schichten:
1. **Hetzner-Basisschutz:** In jedem Hetzner-Netz ist ein automatischer DDoS-Schutz auf Netzwerkebene (L3/L4) ohne Aufpreis enthalten. Er fängt volumetrische Angriffe ab, ohne dass Datenverkehr über Dritte läuft.
2. **Cloud-Firewall** (Terraform): eingehend nur TCP 80, 443 (+ UDP 443 für HTTP/3), ICMP, **SSH (22) nur von deiner eigenen IP**. Postgres/Redis/Gateway/Metriken sind nie veröffentlicht.
   - Ein Server (heutige Vorschau): `infra/terraform/firewall-single/` (`terraform apply` mit `server_ids` und `admin_cidrs`; Variable verbietet `0.0.0.0/0`).
   - Zwei-Server-Aufbau: `infra/terraform/main.tf` (Variablen-Prüfung neu: SSH nie weltweit; HTTP/3 und ICMP ergänzt).
   - Ohne Terraform: Hetzner-Konsole → Firewalls → neue Firewall mit denselben fünf Regeln, auf den Server anwenden. Danach **von außen prüfen**: `nmap -Pn <ip>` zeigt nur 80/443.
   - SSH-Zugang absichern: Schlüssel statt Passwort (`PasswordAuthentication no`), `fail2ban` optional. Wechselt deine IP (Heimnetz), die Firewall-Regel über die Konsole kurz anpassen; Ausweg bleibt die Hetzner-Konsole (VNC).
3. **Anwendungsebene:** Caddy-Zeitlimits gegen Slowloris, Body-Grenzen, API-Rate-Limits je IP, Chat-Gateway: 5 Verbindungen je Konto. Bei anhaltendem Angriff: Hetzner-Support kontaktieren.
4. Ehrliche Grenze: Gegen große verteilte Angriffe auf Anwendungsebene schützt ein EU-only Einzelserver nur begrenzt. Dann: Last prüfen (Abschnitt 11), notfalls Hetzner Load Balancer mit mehr App-Servern.

## 11. Lasttest

k6-Skripte in `infra/loadtest/` (Zielwerte aus `docs/ARCHITEKTUR.md`: API p95 < 400 ms, Fehlerquote < 1 %, WebSocket-Latenz p95 < 500 ms, bis 2000 gleichzeitige Verbindungen; Anmeldung wegen argon2id mit eigenem Wert p95 < 1500 ms).

**Nie gegen Produktion.** Die Skripte und `provision.mjs` verweigern jeden Host außer `localhost` und Namen mit „staging“. Ablauf auf **Staging**:

```bash
# 1. In .env.staging: LOADTEST_IP=<öffentliche IP des Lastgenerators>, STAGING_ALLOW_CIDR enthält sie; Staging neu starten.
# 2. Testkonten und Test-Verein (200 Konten, 100 Paare)
LOADTEST_PASSWORD='<mind. 12 Zeichen>' BASE_URL=https://staging.example.de ACCOUNTS=200 node infra/loadtest/provision.mjs create
# 3. Tests (k6 installieren: https://k6.io)
k6 run -e BASE_URL=https://staging.example.de -e LOADTEST_PASSWORD=... -e ACCOUNTS=200 infra/loadtest/auth.js
k6 run -e BASE_URL=... -e LOADTEST_PASSWORD=... -e ACCOUNTS=200 -e VUS=100 infra/loadtest/feed.js
k6 run -e BASE_URL=... -e LOADTEST_PASSWORD=... -e ACCOUNTS=200 infra/loadtest/events.js
k6 run -e BASE_URL=... -e LOADTEST_PASSWORD=... -e ACCOUNTS=200 -e VUS=100 infra/loadtest/chat-ws.js
# 4. Aufräumen
LOADTEST_PASSWORD=... BASE_URL=... ACCOUNTS=200 node infra/loadtest/provision.mjs delete
```

Schlägt ein Schwellenwert fehl, beendet k6 mit Fehlercode. Währenddessen auf dem Staging-Server `docker stats` und die Plattform-Seite beobachten (Auslöser für die Server-Aufteilung: `docs/ARCHITEKTUR.md`). 2000 gleichzeitige WebSocket-Verbindungen brauchen ≥ 400 Konten (max. 5 Verbindungen je Konto) und einen Lastgenerator mit genug Dateideskriptoren. Ergebnisse in `docs/welle2/` festhalten. Die Rate-Limit-Ausnahme `LOADTEST_IP` gibt es **nur** im Staging-Compose.

## 12. Notfallplan und Datenpanne

**Erste 15 Minuten, immer:** Ruhe, Zeitpunkt und Beobachtung notieren, nichts löschen (Beweise), nichts Neues deployen.

| Lage | Sofort | Danach |
|---|---|---|
| Seite nicht erreichbar | `smoke.sh` / `docker compose ps` / `df -h`; Caddy-, API-Logs | Neustart des betroffenen Dienstes; bei Platte voll Abschnitt 7 `disk` |
| Deploy hat etwas kaputt gemacht | `deploy.sh rollback` | Ursache klären, Migrationen prüfen (Abschnitt 8) |
| Datenbank/Medien beschädigt | App stoppen, `restore.sh live` (Abschnitt 5.2) | Löschungen erneut anwenden, Nutzer informieren |
| Server verloren | Neuer Server (Abschnitt 5.2) | DNS umstellen, Smoke-Test |
| Verdacht auf Einbruch/Datenabfluss | Server **nicht** ausschalten (Speicher-Abbild sichern), Zugangsdaten rotieren (Abschnitt 6), Sitzungen widerrufen (`TRUNCATE identity.sessions;` im Postgres-Container, Cache-Redis leeren: `redis-cli FLUSHALL` im Dienst `redis`), SSH-Schlüssel tauschen | **Datenpanne-Prozess** |
| Verlust des Chat-Master-Schlüssels | Sicherungen und alte Server nach dem Schlüssel durchsuchen, Passwortmanager prüfen | Ohne Schlüssel sind Chat-Inhalte verloren: Nutzer informieren |
| Mail-Kostenexplosion | `MAIL_DAILY_LIMIT` senken, `MAIL_DRIVER=log` setzen, Ursache suchen | Scaleway-Budget prüfen |

**Datenpanne (Art. 33/34 DSGVO, 72 Stunden):** Der Ablauf (Bewertung, Meldung an die Aufsichtsbehörde, Benachrichtigung Betroffener, Dokumentation) gehört in **`docs/DATENPANNE-PROZESS.md`**. Diese Datei **existiert noch nicht** (TODO, Verantwortung: Datenschutzbeauftragter/Gründer). Bis dahin: Zeitpunkt der Kenntnis notieren, Umfang eingrenzen, DSB und Anwalt sofort informieren, Frist 72 Stunden ab Kenntnis. Auftragsverarbeiter-Rolle bei Vereinsdaten: Verein informieren (AVV).

**Kontakte (vom Gründer auszufüllen, nicht im Repository mit privaten Nummern):** Datenschutzbeauftragter, Anwalt, Hetzner-Support, Mailanbieter-Support (Scaleway), Stellvertretung für Schlüsselzugriff.

## 13. Demo-Daten

- **Für Screenshots und Vorführungen** nur noch den fiktiven Satz `infra/demo/fiktiv` („TSV Beispielburg 1923“: erfundene Personen, selbst erzeugte Grafiken, keine Fotos).
- **Alter Satz** (`infra/demo/seed.mjs`, Feuerwehr/Fußball): enthält Fotos echter Personen, auch Kinder. **Vor dem Start mit echten Nutzern entfernen.**
- **Löschen mit Kontrolle:** `infra/demo/cleanup-demo.sh --yes` (Kopfzeile erklärt Variablen): Konten über die Konto-Löschfunktion der API, Demo-Vereine per SQL mit **festen Kennungen** (kein Muster, kein echter Verein trifft), danach `verify-demo-clean.sql`: alle Werte müssen 0 sein.
- **Danach prüfen:** Bilddateien im Medien-Volume räumt der stündliche Job `media.cleanup` auf (nach 1–2 Stunden `docker compose exec api ls /data/media | wc -l` vergleichen). **Sicherungen vor dem Löschen enthalten die Demo-Daten weiter** bis zum Ablauf der Aufbewahrung; beim alten Satz mit echten Personen die betroffenen Sicherungssätze (lokal und auf der Storage Box) einzeln löschen. Lokal `infra/demo/images` und `infra/demo/out` von der Entwicklermaschine entfernen.

## 14. Checkliste Go-Live

Abhaken, mit Datum. „(du)“ = nur du kannst es tun.

**Rechtliches und Organisation (du)**
- [ ] AVV mit Hetzner, mit dem Mailanbieter (Scaleway) und der Storage Box abgeschlossen; Verzeichnis der Verarbeitungstätigkeiten, Löschkonzept (inkl. Backup-Frist) abgestimmt (`docs/welle2/A3-DOKU.md`).
- [ ] `docs/DATENPANNE-PROZESS.md` vorhanden, Kontaktliste ausgefüllt, Stellvertretung kann auf Schlüssel zugreifen.
- [ ] Demo-Daten entfernt (Abschnitt 13), `verify-demo-clean.sql` ergibt 0.

**Infrastruktur**
- [ ] Hetzner-Firewall aktiv, `nmap -Pn <ip>` zeigt nur 80/443; SSH nur von der eigenen IP.
- [ ] DNS: A (und **kein** AAAA, oder Docker-IPv6 gelöst), TLS-Zertifikat gültig, HSTS-Header da (`smoke.sh`).
- [ ] `.env.preview`: `COOKIE_SECURE=true`, `WEB_ORIGIN`, `CADDY_FILE=Caddyfile.tls`, `MAIL_DRIVER=smtp` mit EU-Anbieter, `AUTH_SECRET_KEY`, `CHAT_MASTER_KEYS`, `METRICS_TOKEN` gesetzt, **Rechte 600**, nicht im Repository.
- [ ] `infra/ops/validate-caddy.sh` bestanden (Caddy-Dateien sind sonst ungeprüft).
- [ ] `ALLOW_INDEXING` bewusst entschieden (Suchmaschinen), Datenschutzerklärung für Besucher aktuell.

**Sicherung**
- [ ] `ops.env`, age-Empfänger, Storage Box mit Snapshots, Timer aktiv (`systemctl list-timers 'vereine-*'`).
- [ ] Erste Sicherung gelaufen, `check-backup.sh` Exit 0, Offsite sichtbar.
- [ ] **Restore-Übung auf Wegwerf-Instanz bestanden** (Abschnitt 5.1), Dauer notiert.
- [ ] Alle Schlüssel in Passwortmanager **und** zweitem Ort (Abschnitt 6), age-Privatschlüssel getrennt vom Server.

**Überwachung**
- [ ] `OPERATOR_ALERT_EMAIL` gesetzt, Testalarm provoziert (z. B. `OPS_DISK_PERCENT=1` kurz setzen, Mail kommt, wieder zurücksetzen).
- [ ] Plattform-Seite zeigt „Alles in Ordnung“; `/api/health/ready` zeigt `"worker":"up"`.
- [ ] Uptime-Check von außen läuft (anderer Rechner), Alarmweg getestet.
- [ ] Scaleway: Monatslimit/Budget-Alarm gesetzt (Kostenbremse der App ist nur eine Bremse).

**Deploy und Last**
- [ ] `deploy.sh` mindestens einmal auf Staging komplett durchgelaufen, Rollback geübt (`deploy.sh rollback`).
- [ ] Lasttest auf Staging bestanden (Abschnitt 11) oder Abweichung bewusst akzeptiert.
- [ ] Plattform-Admin per CLI vergeben (`set-platform-admin`), 2FA für alle Admin-Konten an.
- [ ] Pentest/Sicherheitsprüfung nach Plan (`docs/OFFENE-PUNKTE.md`).
