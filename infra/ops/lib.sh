#!/usr/bin/env bash
# Gemeinsame Hilfen der Betriebsskripte (mit `source` laden). Enthaelt KEINE Geheimnisse:
# Konfiguration kommt aus /etc/vereine/ops.env (Vorlage: infra/ops/ops.env.example), Schluessel aus Dateien ausserhalb des Repos.

ops_log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
ops_die() { ops_log "FEHLER: $*" >&2; exit 1; }

# Umgebung laden und Standardwerte setzen.
ops_load_env() {
  local f="${VEREINE_OPS_ENV:-/etc/vereine/ops.env}"
  if [ -f "$f" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$f"
    set +a
  fi
  : "${APP_DIR:=/opt/vereine}"
  : "${COMPOSE_FILE:=$APP_DIR/infra/deploy/docker-compose.preview.yml}"
  : "${ENV_FILE:=$APP_DIR/.env.preview}"
  : "${BACKUP_DIR:=/var/backups/vereine}"
  : "${STATUS_DIR:=/var/lib/vereine/status}"
  : "${MEDIA_VOLUME:=deploy_mediadata}"
  : "${AGE_RECIPIENTS:=/etc/vereine/backup-recipients.txt}"
  : "${KEEP_DAILY:=14}"
  : "${KEEP_WEEKLY:=8}"
  : "${KEEP_MONTHLY:=6}"
  : "${STORAGEBOX_PORT:=23}"
  : "${STORAGEBOX_DIR:=vereine-backups}"
  : "${STORAGEBOX_KEY:=/root/.ssh/storagebox_ed25519}"
  : "${STORAGEBOX_KNOWN_HOSTS:=/root/.ssh/known_hosts_storagebox}"
  : "${POSTGRES_USER:=vereine}"
  : "${POSTGRES_DB:=vereine}"
}

# docker compose mit den Projektdateien (COMPOSE_EXTRA z. B. "-f .../docker-compose.staging.yml").
ops_compose() {
  # shellcheck disable=SC2086
  docker compose -f "$COMPOSE_FILE" ${COMPOSE_EXTRA:-} --env-file "$ENV_FILE" "$@"
}

# Zeilen mit Geheimnissen (Passwort, Schluessel, Token, DB-URL mit Passwort) durch einen Platzhalter ersetzen.
# Die Namen bleiben, damit bei einer Wiederherstellung klar ist, welche Werte aus dem Passwortmanager kommen.
ops_redact_env() {
  sed -E \
    -e 's/^([[:space:]]*(export[[:space:]]+)?[A-Za-z0-9_]*(PASSWORD|PASS|SECRET|KEY|KEYS|TOKEN|PRIVATE|DATABASE_URL|_DSN|_URI)[A-Za-z0-9_]*)=.*/\1=<ENTFERNT>/' \
    "$@"
}

# Ordner im Format JJJJMMTT-HHMMSS (sortierbar), ausser den neuesten $2 loeschen. $1 = Verzeichnis.
ops_prune_sets() {
  local dir="$1" keep="$2" old
  [ -d "$dir" ] || return 0
  while IFS= read -r old; do
    [ -n "$old" ] && rm -rf -- "${dir:?}/$old"
  done < <(find "$dir" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*-[0-9]*' -printf '%f\n' | LC_ALL=C sort -r | tail -n +"$((keep + 1))")
}

# Neuester Satz in $1 (Name, leer wenn keiner).
ops_latest_set() {
  find "$1" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*-[0-9]*' -printf '%f\n' 2>/dev/null | LC_ALL=C sort -r | head -n1
}

# JSON-Status der Sicherung atomar schreiben (lesbar fuer den API-Container, enthaelt keine Geheimnisse).
# $1 ok(true|false) $2 bytes $3 Satzname $4 offsite(true|false|null)
ops_write_status() {
  mkdir -p "$STATUS_DIR"
  chmod 755 "$STATUS_DIR"
  printf '{"finishedAt":"%s","ok":%s,"bytes":%s,"set":"%s","offsite":%s}\n' "$(date -u +%FT%TZ)" "$1" "${2:-0}" "${3:-}" "${4:-null}" > "$STATUS_DIR/status.json.tmp"
  chmod 644 "$STATUS_DIR/status.json.tmp"
  mv "$STATUS_DIR/status.json.tmp" "$STATUS_DIR/status.json"
}

# Einfaches JSON-Feld lesen (nur flache Dateien wie status.json; $1 Datei, $2 Feldname).
ops_json_get() {
  sed -nE "s/.*\"$2\":(\"([^\"]*)\"|([^,}]*)).*/\2\3/p" "$1" | head -n1
}
