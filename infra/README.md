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
