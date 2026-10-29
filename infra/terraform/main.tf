locals {
  name = "vereine-${var.environment}"
  labels = {
    project     = "vereine"
    environment = var.environment
  }
}

resource "hcloud_ssh_key" "admin" {
  name       = "${local.name}-admin"
  public_key = var.ssh_public_key
  labels     = local.labels
}

# --- Privates Netzwerk -------------------------------------------------------

resource "hcloud_network" "main" {
  name     = local.name
  ip_range = "10.10.0.0/16"
  labels   = local.labels
}

resource "hcloud_network_subnet" "main" {
  network_id   = hcloud_network.main.id
  type         = "cloud"
  network_zone = var.network_zone
  ip_range     = "10.10.1.0/24"
}

# --- Firewalls ---------------------------------------------------------------

resource "hcloud_firewall" "app" {
  name   = "${local.name}-app"
  labels = local.labels

  rule {
    description = "SSH nur vom Admin-Netz"
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = var.admin_cidrs
  }

  rule {
    description = "HTTP (ACME + Redirect)"
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
}

resource "hcloud_firewall" "db" {
  name   = "${local.name}-db"
  labels = local.labels

  rule {
    description = "SSH nur vom Admin-Netz"
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = var.admin_cidrs
  }

  # Postgres/Redis werden ausschliesslich ueber das private Netz erreicht;
  # es gibt bewusst keine oeffentliche Freigabe fuer 5432/6379.
}

# --- Server ------------------------------------------------------------------

resource "hcloud_server" "app" {
  count        = var.app_server_count
  name         = "${local.name}-app-${count.index + 1}"
  server_type  = var.app_server_type
  image        = var.image
  location     = var.location
  ssh_keys     = [hcloud_ssh_key.admin.id]
  firewall_ids = [hcloud_firewall.app.id]
  backups      = true
  labels       = merge(local.labels, { role = "app" })

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  network {
    network_id = hcloud_network.main.id
    ip         = "10.10.1.${10 + count.index}"
  }

  depends_on = [hcloud_network_subnet.main]
}

resource "hcloud_server" "db" {
  name         = "${local.name}-db-1"
  server_type  = var.db_server_type
  image        = var.image
  location     = var.location
  ssh_keys     = [hcloud_ssh_key.admin.id]
  firewall_ids = [hcloud_firewall.db.id]
  backups      = true
  labels       = merge(local.labels, { role = "db" })

  network {
    network_id = hcloud_network.main.id
    ip         = "10.10.1.5"
  }

  depends_on = [hcloud_network_subnet.main]
}

resource "hcloud_volume" "db_data" {
  name      = "${local.name}-db-data"
  size      = var.db_volume_size_gb
  server_id = hcloud_server.db.id
  automount = true
  format    = "ext4"
  labels    = local.labels
}

# --- Load Balancer (TCP-Passthrough, TLS endet in Caddy auf den App-Servern) --

resource "hcloud_load_balancer" "main" {
  name               = local.name
  load_balancer_type = "lb11"
  location           = var.location
  labels             = local.labels
}

resource "hcloud_load_balancer_network" "main" {
  load_balancer_id = hcloud_load_balancer.main.id
  network_id       = hcloud_network.main.id
  ip               = "10.10.1.2"

  depends_on = [hcloud_network_subnet.main]
}

resource "hcloud_load_balancer_target" "app" {
  type             = "label_selector"
  load_balancer_id = hcloud_load_balancer.main.id
  label_selector   = "project=vereine,environment=${var.environment},role=app"
  use_private_ip   = true

  depends_on = [hcloud_load_balancer_network.main]
}

resource "hcloud_load_balancer_service" "http" {
  load_balancer_id = hcloud_load_balancer.main.id
  protocol         = "tcp"
  listen_port      = 80
  destination_port = 80
}

resource "hcloud_load_balancer_service" "https" {
  load_balancer_id = hcloud_load_balancer.main.id
  protocol         = "tcp"
  listen_port      = 443
  destination_port = 443

  health_check {
    protocol = "tcp"
    port     = 443
    interval = 15
    timeout  = 10
    retries  = 3
  }
}
