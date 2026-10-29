output "load_balancer_ipv4" {
  description = "Oeffentliche IP des Load Balancers (DNS A-Record darauf zeigen lassen)"
  value       = hcloud_load_balancer.main.ipv4
}

output "load_balancer_ipv6" {
  value = hcloud_load_balancer.main.ipv6
}

output "app_servers" {
  value = {
    for s in hcloud_server.app : s.name => {
      public_ipv4  = s.ipv4_address
      private_ipv4 = one(s.network).ip
    }
  }
}

output "db_server" {
  value = {
    name         = hcloud_server.db.name
    public_ipv4  = hcloud_server.db.ipv4_address
    private_ipv4 = one(hcloud_server.db.network).ip
  }
}

output "db_volume_linux_device" {
  value = hcloud_volume.db_data.linux_device
}
