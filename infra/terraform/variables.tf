variable "hcloud_token" {
  description = "Hetzner Cloud API-Token (Projekt, Lese/Schreib). Nie einchecken - per TF_VAR_hcloud_token setzen."
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Umgebung: staging oder production"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment muss staging oder production sein."
  }
}

variable "location" {
  description = "Hetzner-Standort (DE): fsn1 (Falkenstein) oder nbg1 (Nuernberg)"
  type        = string
  default     = "fsn1"
  validation {
    condition     = contains(["fsn1", "nbg1"], var.location)
    error_message = "Nur deutsche Standorte erlaubt (fsn1, nbg1)."
  }
}

variable "network_zone" {
  type    = string
  default = "eu-central"
}

variable "ssh_public_key" {
  description = "Oeffentlicher SSH-Schluessel fuer den Admin-Zugang"
  type        = string
}

variable "admin_cidrs" {
  description = "IP-Bereiche, die per SSH zugreifen duerfen (z. B. [\"203.0.113.4/32\"])"
  type        = list(string)
}

variable "app_server_count" {
  type    = number
  default = 2
}

variable "app_server_type" {
  type    = string
  default = "cx32"
}

variable "db_server_type" {
  type    = string
  default = "cx42"
}

variable "db_volume_size_gb" {
  description = "Groesse des Postgres-Datenvolumes"
  type        = number
  default     = 100
}

variable "image" {
  type    = string
  default = "ubuntu-24.04"
}
