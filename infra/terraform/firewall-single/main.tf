# Hetzner-Cloud-Firewall fuer EINEN bereits vorhandenen Server (Vorschau/Variante A "Schlank"), ohne den Server selbst
# in Terraform zu holen. Eingehend: nur 80/443 (+UDP 443 fuer HTTP/3), SSH ausschliesslich von den eigenen IPs.
# Ausgehend ist alles erlaubt (Updates, ACME, SMTP zum EU-Mailanbieter, Storage-Box-Sicherung auf Port 23).
# Kein Cloudflare/US-Vorschaltdienst: Schutz vor DDoS = Hetzner-Basisschutz (im Netz inklusive) + diese Firewall + Zeitlimits in Caddy.
terraform {
  required_version = ">= 1.6"
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.50"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

variable "hcloud_token" {
  description = "Hetzner-Cloud-Projekttoken. Nie einchecken: export TF_VAR_hcloud_token=..."
  type        = string
  sensitive   = true
}

variable "server_ids" {
  description = "IDs der Server, auf die die Firewall wirkt (Konsole: Server -> Nummer in der URL; oder `hcloud server list`)"
  type        = list(number)
}

variable "admin_cidrs" {
  description = "Eigene IP(s) fuer SSH, z. B. [\"203.0.113.4/32\"]. Nie das ganze Internet."
  type        = list(string)

  validation {
    condition     = length(var.admin_cidrs) > 0 && !anytrue([for c in var.admin_cidrs : contains(["0.0.0.0/0", "::/0"], c)])
    error_message = "admin_cidrs darf nicht leer sein und nicht 0.0.0.0/0 oder ::/0 enthalten."
  }
}

resource "hcloud_firewall" "single" {
  name = "klubnest-single"
  labels = {
    project = "vereine"
  }

  rule {
    description = "SSH nur von den eigenen IPs"
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = var.admin_cidrs
  }

  rule {
    description = "HTTP (ACME + Weiterleitung auf HTTPS)"
    direction   = "in"
    protocol    = "tcp"
    port        = "80"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "HTTPS"
    direction   = "in"
    protocol    = "tcp"
    port        = "443"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "HTTP/3 (QUIC)"
    direction   = "in"
    protocol    = "udp"
    port        = "443"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "Ping zur Fehlersuche (ICMP)"
    direction   = "in"
    protocol    = "icmp"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  # Postgres (5432), Redis (6379/6380), Metriken und Chat-Gateway (4100) sind NIE oeffentlich: sie sind in Compose nicht
  # veroeffentlicht und hier nicht freigegeben (doppelte Absicherung).
}

resource "hcloud_firewall_attachment" "servers" {
  firewall_id = hcloud_firewall.single.id
  server_ids  = var.server_ids
}

output "firewall_id" {
  value = hcloud_firewall.single.id
}
