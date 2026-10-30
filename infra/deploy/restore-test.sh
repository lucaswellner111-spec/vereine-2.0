#!/usr/bin/env bash
# Prueft, dass das neueste Backup wiederherstellbar ist: Restore in eine Wegwerf-Datenbank.
set -euo pipefail
DIR="${BACKUP_DIR:-/opt/vereine/backups}"
COMPOSE="docker compose -f /opt/vereine/infra/deploy/docker-compose.preview.yml --env-file /opt/vereine/.env.preview"
LATEST="$(ls -1t "$DIR"/vereine-*.sql.gz | head -n1)"
$COMPOSE exec -T postgres psql -U vereine -d postgres -qc 'DROP DATABASE IF EXISTS restore_test;' -c 'CREATE DATABASE restore_test;'
gunzip -c "$LATEST" | $COMPOSE exec -T postgres psql -U vereine -d restore_test -q -v ON_ERROR_STOP=1 >/dev/null
USERS="$($COMPOSE exec -T postgres psql -U vereine -d restore_test -Atc 'select count(*) from users;')"
$COMPOSE exec -T postgres psql -U vereine -d postgres -qc 'DROP DATABASE restore_test;'
echo "Restore-Test OK: $LATEST (users: $USERS)"
