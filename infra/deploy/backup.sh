#!/usr/bin/env bash
# Taegliches Postgres-Backup (Vorschau/Staging). Aufruf per Cron, siehe infra/README.md.
# Behaelt die letzten KEEP Sicherungen. Die Dumps enthalten personenbezogene Daten:
# Verzeichnis nur fuer root lesbar; fuer Produktion zusaetzlich verschluesselt extern ablegen.
set -euo pipefail

DIR="${BACKUP_DIR:-/opt/vereine/backups}"
KEEP="${KEEP:-14}"
COMPOSE="docker compose -f /opt/vereine/infra/deploy/docker-compose.preview.yml --env-file /opt/vereine/.env.preview"

umask 077
mkdir -p "$DIR"
FILE="$DIR/vereine-$(date +%Y%m%d-%H%M%S).sql.gz"

$COMPOSE exec -T postgres pg_dump -U vereine --no-owner vereine | gzip > "$FILE.tmp"
# Plausibilitaet: Dump darf nicht leer sein und muss unsere Tabellen (Schema identity) enthalten
gunzip -c "$FILE.tmp" | grep -q 'CREATE TABLE identity.users' || { rm -f "$FILE.tmp"; echo "Backup ungueltig" >&2; exit 1; }
mv "$FILE.tmp" "$FILE"

# Medien (Bilder) liegen im Docker-Volume, nicht in der Datenbank: ebenfalls sichern
VOL="${MEDIA_VOLUME:-deploy_mediadata}"
if docker volume inspect "$VOL" >/dev/null 2>&1; then
  MFILE="$DIR/media-$(date +%Y%m%d-%H%M%S).tar.gz"
  docker run --rm -v "$VOL":/data:ro alpine tar czf - -C /data . > "$MFILE.tmp" && mv "$MFILE.tmp" "$MFILE"
  ls -1t "$DIR"/media-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
  echo "Medien gesichert: $MFILE ($(du -h "$MFILE" | cut -f1))"
fi

ls -1t "$DIR"/vereine-*.sql.gz | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "Backup erstellt: $FILE ($(du -h "$FILE" | cut -f1))"
