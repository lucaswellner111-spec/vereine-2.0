#!/usr/bin/env bash
# Vollsicherung: Postgres-Dump, Medien-Volume und Konfiguration (ohne Klartext-Geheimnisse), alles mit age verschluesselt,
# Aufbewahrung taeglich/woechentlich/monatlich, Spiegelung auf die Hetzner Storage Box (rsync ueber SSH).
# Aufruf: per systemd-Timer (infra/ops/systemd) oder Cron als root; manuell: sudo infra/ops/backup.sh
#
# Datenschutz: Die Saetze enthalten personenbezogene Daten (auch inzwischen geloeschte, bis der Satz ausgemustert wird).
# Es liegt nie Klartext auf der Platte: der Dump wird im Strom komprimiert und verschluesselt.
# Den privaten age-Schluessel gibt es NICHT auf dem Server (nur oeffentliche Empfaenger in AGE_RECIPIENTS).
# Der Chat-Master-Schluessel und AUTH_SECRET_KEY stecken NICHT in der Sicherung: separat im Passwortmanager (docs/BETRIEB.md).
set -euo pipefail
# shellcheck source=infra/ops/lib.sh
. "$(dirname "$(readlink -f "$0")")/lib.sh"
ops_load_env
umask 077

command -v age >/dev/null || ops_die "age fehlt (apt install age)."
command -v rsync >/dev/null || ops_die "rsync fehlt."
[ -s "$AGE_RECIPIENTS" ] || ops_die "Empfaengerdatei $AGE_RECIPIENTS fehlt oder ist leer (oeffentliche age-Schluessel)."
grep -q 'AGE-SECRET-KEY' "$AGE_RECIPIENTS" && ops_die "$AGE_RECIPIENTS enthaelt einen PRIVATEN Schluessel. Nur oeffentliche Schluessel (age1...) eintragen."

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly"
LOCK="${BACKUP_LOCK:-/var/lock/vereine-backup.lock}"
exec 9>"$LOCK"
flock -n 9 || { ops_log "Sicherung laeuft bereits."; exit 0; }

STAMP="$(date +%Y%m%d-%H%M%S)"
SET="$BACKUP_DIR/daily/$STAMP"
DONE=0
fail() {
  if [ "$DONE" -ne 1 ]; then
    ops_log "Sicherung FEHLGESCHLAGEN (Satz $STAMP)." >&2
    rm -rf "$SET"
    ops_write_status false 0 "$STAMP" null || true
  fi
}
trap fail EXIT

mkdir -p "$SET"

# 1) Datenbank: Strom pg_dump -> gzip -> age (kein Klartext auf der Platte). pipefail bricht bei jedem Fehler ab.
ops_log "Datenbank sichern ..."
USERS="$(ops_compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc 'select count(*) from identity.users;')"
ops_compose exec -T postgres pg_dump -U "$POSTGRES_USER" --no-owner "$POSTGRES_DB" | gzip -9 | age -R "$AGE_RECIPIENTS" > "$SET/db.sql.gz.age"
[ "$(stat -c %s "$SET/db.sql.gz.age")" -ge "${BACKUP_MIN_DB_BYTES:-2048}" ] || ops_die "Dump verdaechtig klein."

# 2) Medien (Docker-Volume, Bilder): ebenfalls im Strom verschluesselt
MEDIA=true
if docker volume inspect "$MEDIA_VOLUME" >/dev/null 2>&1; then
  ops_log "Medien sichern ($MEDIA_VOLUME) ..."
  docker run --rm -v "$MEDIA_VOLUME":/data:ro alpine tar czf - -C /data . | age -R "$AGE_RECIPIENTS" > "$SET/media.tar.gz.age"
else
  [ "${SKIP_MEDIA:-0}" = 1 ] || ops_die "Medien-Volume $MEDIA_VOLUME nicht gefunden (MEDIA_VOLUME pruefen; SKIP_MEDIA=1 nur bewusst)."
  MEDIA=false
fi

# 3) Konfiguration OHNE Klartext-Geheimnisse: Compose/Caddy-Dateien und .env mit entfernten Werten (nur Namen).
ops_log "Konfiguration sichern (ohne Geheimnisse) ..."
CFG="$(mktemp -d)"
trap 'rm -rf "$CFG"; fail' EXIT
mkdir -p "$CFG/deploy" "$CFG/env"
cp -r "$APP_DIR/infra/deploy/." "$CFG/deploy/"
[ -f "$ENV_FILE" ] && ops_redact_env "$ENV_FILE" > "$CFG/env/$(basename "$ENV_FILE").redacted"
[ -f /etc/vereine/ops.env ] && ops_redact_env /etc/vereine/ops.env > "$CFG/env/ops.env.redacted"
tar czf - -C "$CFG" . | age -R "$AGE_RECIPIENTS" > "$SET/config.tar.gz.age"
rm -rf "$CFG"
trap fail EXIT

# 4) Pruefsummen und Manifest (kein Geheimnis: Zeitpunkt, Groessen, Zaehler)
( cd "$SET" && sha256sum ./*.age > SHA256SUMS )
BYTES="$(du -sb "$SET" | cut -f1)"
printf '{"createdAt":"%s","users":%s,"media":%s,"bytes":%s,"host":"%s"}\n' "$(date -u +%FT%TZ)" "${USERS:-0}" "$MEDIA" "$BYTES" "$(hostname -s)" > "$SET/manifest.json"

# 5) Aufbewahrung: Sonntag -> woechentlich, 1. des Monats -> monatlich (Hardlinks, kein doppelter Platz)
[ "$(date +%u)" = 7 ] && cp -al "$SET" "$BACKUP_DIR/weekly/$STAMP"
[ "$(date +%d)" = 01 ] && cp -al "$SET" "$BACKUP_DIR/monthly/$STAMP"
ops_prune_sets "$BACKUP_DIR/daily" "$KEEP_DAILY"
ops_prune_sets "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"
ops_prune_sets "$BACKUP_DIR/monthly" "$KEEP_MONTHLY"

# 6) Offsite: Spiegel auf die Storage Box (geloeschte lokale Saetze verschwinden dort ebenfalls),
#    danach Trockenlauf: es darf kein Unterschied uebrig bleiben.
OFFSITE=null
if [ -n "${STORAGEBOX_TARGET:-}" ]; then
  ops_log "Offsite nach $STORAGEBOX_TARGET ..."
  SSH="ssh -p $STORAGEBOX_PORT -i $STORAGEBOX_KEY -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$STORAGEBOX_KNOWN_HOSTS"
  RS=(rsync -a --delete --partial -e "$SSH")
  if "${RS[@]}" "$BACKUP_DIR/" "$STORAGEBOX_TARGET:$STORAGEBOX_DIR/" \
     && [ "$("${RS[@]}" -n --itemize-changes "$BACKUP_DIR/" "$STORAGEBOX_TARGET:$STORAGEBOX_DIR/" | wc -l)" -eq 0 ]; then
    OFFSITE=true
  else
    OFFSITE=false
    ops_log "WARNUNG: Offsite-Kopie fehlgeschlagen." >&2
  fi
else
  ops_log "Hinweis: STORAGEBOX_TARGET nicht gesetzt, nur lokale Sicherung."
fi

DONE=1
if [ "$OFFSITE" = false ]; then
  ops_write_status false "$BYTES" "$STAMP" false
  exit 1
fi
ops_write_status true "$BYTES" "$STAMP" "$OFFSITE"
ops_log "Sicherung fertig: $STAMP ($(du -sh "$SET" | cut -f1), offsite=$OFFSITE)"
