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
# Plausibilitaet: Dump darf nicht leer sein und muss unsere Tabellen enthalten
gunzip -c "$FILE.tmp" | grep -q 'CREATE TABLE public.users' || { rm -f "$FILE.tmp"; echo "Backup ungueltig" >&2; exit 1; }
mv "$FILE.tmp" "$FILE"

ls -1t "$DIR"/vereine-*.sql.gz | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "Backup erstellt: $FILE ($(du -h "$FILE" | cut -f1))"
