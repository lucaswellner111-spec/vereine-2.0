# Infrastruktur (Hetzner, Deutschland)

Topologie: Managed Load Balancer (TCP-Passthrough 80/443) -> App-Server (Caddy, Web, API) -> DB-Server (Postgres, Redis) im privaten Netz `10.10.0.0/16`. Oeffentlich erreichbar sind nur der Load Balancer und die App-Server (80/443); SSH nur vom `admin_cidrs`-Netz; DB-Server ohne oeffentliche Datenbankports.

## Ablauf
```bash
cd infra/terraform
export TF_VAR_hcloud_token=...          # Hetzner-Cloud-Projekttoken, nie einchecken
cp terraform.tfvars.example staging.tfvars   # anpassen
terraform init
terraform plan  -var-file=staging.tfvars
terraform apply -var-file=staging.tfvars

cd ../ansible
cp inventory.example.ini inventory.ini  # IPs aus `terraform output`
ansible-playbook -i inventory.ini bootstrap.yml
```

## Noch offen (bewusst nicht Teil dieses Gerüsts)
- **Remote-State** fuer Terraform (Hetzner Object Storage oder verschluesseltes Backend) - bis dahin liegt der State lokal und ist per `.gitignore` ausgeschlossen.
- **Postgres/Redis auf dem DB-Server** (Ansible-Rolle inkl. Volume-Mount, WAL-Archivierung/pgBackRest; die tägliche Vollsicherung steht in `infra/ops`).
- **Object Storage**-Bucket (Medien) - vom hcloud-Provider nicht verwaltet, separat anlegen.
- **Registry** (Images werden bisher auf dem Server gebaut) und zentrale Log-Sammlung (Loki).
- **AVV mit Hetzner** abschliessen und DNS (A/AAAA auf Load Balancer) setzen.

## Betrieb: Backup, Restore, Deploy, Monitoring, Lasttest
Vollständiges Handbuch mit Checkliste „Go-Live“: **`docs/BETRIEB.md`**. Kurzüberblick:
- **Backup** (`infra/ops/backup.sh`): Postgres, Medien und Konfiguration (ohne Klartext-Geheimnisse) verschlüsselt mit age, Aufbewahrung 14 täglich / 8 wöchentlich / 6 monatlich, Offsite per rsync auf die Hetzner Storage Box, Timer unter `infra/ops/systemd/`, Prüfung `check-backup.sh`. Die alten Aufrufe `infra/deploy/backup.sh` und `restore-test.sh` leiten dorthin weiter.
- **Restore** (`infra/ops/restore.sh`): `verify` (Wegwerf-DB), `fresh` (Restore-Übung mit Wegwerf-Container), `live` (echt, mit Rückfrage).
- **Deploy mit Rollback** (`infra/ops/deploy.sh`): Sicherung zuerst, dann Bauen mit Tag, Ausrollen (Migrationen beim API-Start), Smoke-Test (`smoke.sh`), bei Fehler Rollback aufs vorige Tag. GitHub-Vorlage `.github/workflows/deploy.yml` (ohne Geheimnisse im Repository). Staging: `infra/deploy/docker-compose.staging.yml` + `Caddyfile.staging`.
- **Monitoring**: Alarme in der App (Worker, Jobs, Mail-Kontingent, Platte, Backup-Alter) mit Mail an `OPERATOR_ALERT_EMAIL` und Plattform-Seite; `infra/ops/uptime-check.sh` von außen; optional `infra/monitoring/` (Prometheus/Alertmanager).
- **Firewall/DDoS** (nur EU): `infra/terraform/firewall-single/` (ein Server) bzw. `main.tf` (zwei Server); SSH nur von der eigenen IP.
- **Lasttest**: `infra/loadtest/` (k6, nur gegen Staging).
- **Demo-Daten**: `infra/demo/` (fiktiver Satz in `fiktiv/`, Löschen mit Kontrolle `cleanup-demo.sh`).

## Deploy (Vorschau, von Hand)
1. Quellstand hochladen: `git archive --format=tar HEAD | ssh root@<server> "cd /opt/vereine && tar -xf -"`
2. `ssh root@<server> "/opt/vereine/infra/ops/deploy.sh"` (sichert, baut, rollt aus, testet, rollt bei Fehler zurück).
3. Smoke-Test läuft im Skript: `/`, `/api/health/ready` (200, Worker), `/api/auth/me` (401).

## Redis
- Cache/Zaehler-Speicher fuer Sessions (60 s) und Rate-Limit, ohne Persistenz, 128 MB LRU. `REDIS_URL` setzen; ohne Redis faellt die API auf einen Prozess-Cache zurueck (nur lokal sinnvoll).
- Readiness: `GET /api/health/ready` (DB + Redis), Docker-Healthcheck der API nutzt das.

## Domain und HTTPS (klubnest.de)
- DNS (Hetzner KonsoleH): `A @` und `A www` -> Server-IP, keine `AAAA`-Eintraege zum Webhosting.
- `.env.preview` auf dem Server: `CADDY_FILE=Caddyfile.tls`, `DOMAIN=klubnest.de`, `COOKIE_SECURE=true`, `WEB_ORIGIN=https://klubnest.de`.
- Caddy holt und erneuert Zertifikate automatisch (Let's Encrypt). Ports 80 und 443 muessen erreichbar sein.
- HSTS mit `includeSubDomains`: alle Subdomains von klubnest.de muessen HTTPS koennen (z. B. `webmail.`).

## Chat-Schlüssel
- `CHAT_MASTER_KEYS=1:<32 Byte base64>` steht nur in `/opt/vereine/.env.preview` (Server). Neu erzeugen: `openssl rand -base64 32`.
- **Sichern:** Schlüsselzeile separat (Passwortmanager) ablegen. Geht er verloren, sind Chat-Inhalte unwiderruflich unlesbar. Datenbank-Backups enthalten ihn nicht.
- Rotation: `CHAT_MASTER_KEYS=1:<alt>,2:<neu>`, `CHAT_ACTIVE_KEY_VERSION=2`, API+Worker neu starten, `node apps/api/dist/jobs/enqueue-cli.js chat.rewrap-keys`; danach den alten Schlüssel entfernen.

## Plattform-Moderation
- Rolle nur per CLI (kein Web-Weg), wirkt sofort: `docker compose ... exec api node apps/api/dist/auth/set-platform-admin.js <e-mail>` (Entziehen: `--revoke`). Jede Vergabe wird im Zugriffsprotokoll (`identity.audit_log`) festgehalten.
- Oberfläche: `/plattform` (nur für die Rolle sichtbar). Dort: Meldungen zu persönlichen Beiträgen ohne Verein und Chat-Meldungen. Chat-Klartext nur für die gemeldete Nachricht; jedes Öffnen der Liste wird protokolliert (`platform.chat-reports.viewed`).
- Readiness `/api/health/ready` zeigt jetzt Warteschlangen-Zähler (`jobs.waiting/active/delayed/failed`) für Monitoring/Alarm.
