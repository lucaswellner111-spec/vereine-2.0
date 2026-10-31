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
- **Postgres/Redis auf dem DB-Server** (Ansible-Rolle inkl. Volume-Mount, pgBackRest-Backups, Restore-Test).
- **Object Storage**-Bucket (Medien) - vom hcloud-Provider nicht verwaltet, separat anlegen.
- **Monitoring** (Prometheus/Grafana/Loki), Registry und Deploy-Pipeline.
- **AVV mit Hetzner** abschliessen und DNS (A/AAAA auf Load Balancer) setzen.

## Backups (Vorschau/Staging)
- `infra/deploy/backup.sh`: Postgres-Dump (gzip, nur root lesbar, die letzten 14 bleiben, Plausibilitaetspruefung).
- `infra/deploy/restore-test.sh`: stellt das neueste Backup in einer Wegwerf-Datenbank wieder her und zaehlt Nutzer.
- Taeglich per Cron (auf dem Server als root einrichten, bewusst nicht automatisch installiert):
  `17 3 * * * /opt/vereine/infra/deploy/backup.sh >> /var/log/vereine-backup.log 2>&1`
- Produktion: Dumps zusaetzlich verschluesselt auf eine Hetzner Storage Box kopieren (pgBackRest/WAL-Archivierung im Plan).

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
