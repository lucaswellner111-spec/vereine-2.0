#!/usr/bin/env bash
# Deploy mit Rollback (laeuft auf dem Server, nachdem der Quellstand nach $APP_DIR entpackt wurde).
#
#   infra/ops/deploy.sh [TAG]          bauen, sichern, ausrollen, testen; bei Fehler Rollback auf das vorige Tag
#   infra/ops/deploy.sh rollback [TAG] auf ein Tag zurueck (Standard: das vorige)
#   infra/ops/deploy.sh status         aktuelles und voriges Tag
#
# Reihenfolge (jeder Schritt bricht ab, bevor der naechste die laufende App anfasst):
#   1. Vorpruefung (Compose-Datei, Platz)    2. Sicherung (Datenbank, Medien, offsite) - ohne Erfolg KEIN Deploy
#   3. Images bauen und mit TAG versehen     4. Ausrollen; die API fuehrt dabei die Migrationen aus (CMD der API),
#                                              also erst NACH der erfolgreichen Sicherung
#   5. Smoke-Test (infra/ops/smoke.sh)       6. Fehler -> Rollback der Images auf das vorige Tag und erneuter Smoke-Test
#
# Wichtig: Ein Rollback macht Migrationen NICHT rueckgaengig. Migrationen muessen deshalb rueckwaertskompatibel sein
# (erst hinzufuegen, spaeter entfernen). Bei einer zerstoerenden Migration: restore.sh live <Satz> (Satz steht im Protokoll).
set -euo pipefail
# shellcheck source=infra/ops/lib.sh
. "$(dirname "$(readlink -f "$0")")/lib.sh"
ops_load_env

OPS="$(dirname "$(readlink -f "$0")")"
STATE="$APP_DIR/.deploy"
mkdir -p "$STATE"
CURRENT="$(cat "$STATE/current" 2>/dev/null || true)"
PREVIOUS="$(cat "$STATE/previous" 2>/dev/null || true)"
KEEP_IMAGES="${KEEP_IMAGES:-3}"

# Basis-URL fuer den Smoke-Test: bei HTTPS-Domain lokal ueber --resolve (kein DNS/Hairpin noetig)
smoke() {
  local domain
  domain="$(sed -nE 's/^DOMAIN=(.+)$/\1/p' "$ENV_FILE" | head -n1)"
  if [ -n "$domain" ] && [ "$domain" != localhost ]; then
    SMOKE_RESOLVE="$domain:443:127.0.0.1" SMOKE_COMPOSE="IMAGE_TAG=$1 docker compose -f $COMPOSE_FILE --env-file $ENV_FILE" "$OPS/smoke.sh" "https://$domain"
  else
    SMOKE_COMPOSE="IMAGE_TAG=$1 docker compose -f $COMPOSE_FILE --env-file $ENV_FILE" "$OPS/smoke.sh" "http://127.0.0.1"
  fi
}

roll_to() { # $1 = Tag, ohne Bauen
  IMAGE_TAG="$1" ops_compose up -d --no-build --remove-orphans
}

case "${1:-}" in
  status)
    echo "aktuell: ${CURRENT:-<keins>}  vorher: ${PREVIOUS:-<keins>}"
    docker image ls --format '{{.Repository}}:{{.Tag}}  {{.CreatedSince}}' | grep -E '^vereine-(api|web):' || true
    exit 0
    ;;
  rollback)
    TARGET="${2:-$PREVIOUS}"
    [ -n "$TARGET" ] || ops_die "Kein voriges Tag bekannt."
    docker image inspect "vereine-api:$TARGET" "vereine-web:$TARGET" >/dev/null 2>&1 || ops_die "Images fuer Tag $TARGET nicht mehr vorhanden."
    ops_log "Rollback auf $TARGET ..."
    roll_to "$TARGET"
    smoke "$TARGET" || ops_die "Smoke-Test nach Rollback fehlgeschlagen: manuell eingreifen (docs/BETRIEB.md, Notfallplan)."
    echo "$CURRENT" > "$STATE/previous"; echo "$TARGET" > "$STATE/current"
    ops_log "Rollback fertig: $TARGET"
    exit 0
    ;;
esac

# --- Deploy ------------------------------------------------------------------------------------------------
REL="$( [ -f "$APP_DIR/.release" ] && tr -d '[:space:]' < "$APP_DIR/.release" || true)"
TAG="${1:-$(date +%Y%m%d-%H%M%S)${REL:+-$REL}}"
[[ "$TAG" =~ ^[A-Za-z0-9_.-]+$ ]] || ops_die "Ungueltiges Tag: $TAG"
ops_log "Deploy $TAG (aktuell: ${CURRENT:-<keins>})"

[ -f "$ENV_FILE" ] || ops_die "$ENV_FILE fehlt."
ops_compose config -q || ops_die "Compose-Datei ungueltig."
FREE_GB="$(df -P --output=avail -BG / | tail -n1 | tr -dc '0-9')"
[ "${FREE_GB:-0}" -ge "${MIN_FREE_GB:-4}" ] || ops_die "Zu wenig Platz (${FREE_GB} GB frei). Zuerst: docker builder prune -f && docker image prune -f"

# 2) Sicherung: ohne Erfolg wird nichts veraendert
if [ "${DEPLOY_ALLOW_NO_BACKUP:-0}" = 1 ]; then
  ops_log "WARNUNG: DEPLOY_ALLOW_NO_BACKUP=1, es wird NICHT gesichert."
else
  ops_log "Sicherung vor dem Deploy ..."
  "$OPS/backup.sh" || ops_die "Sicherung fehlgeschlagen: Deploy abgebrochen, laufende Version unveraendert."
fi
BACKUP_SET="$(ops_latest_set "$BACKUP_DIR/daily")"

# 3) Bauen (laufende Container bleiben unberuehrt)
ops_log "Images bauen ..."
IMAGE_TAG="$TAG" ops_compose build api web || ops_die "Build fehlgeschlagen: laufende Version unveraendert."

# 4) Ausrollen (die API migriert beim Start)
ops_log "Ausrollen ..."
if ! roll_to "$TAG"; then
  ops_log "Ausrollen fehlgeschlagen."
  OK=0
else
  # 5) Smoke-Test
  if smoke "$TAG"; then OK=1; else OK=0; fi
fi

if [ "$OK" -ne 1 ]; then
  ops_log "FEHLER: Deploy $TAG ist nicht gesund."
  if [ -n "$CURRENT" ] && docker image inspect "vereine-api:$CURRENT" >/dev/null 2>&1; then
    ops_log "Rollback auf $CURRENT ..."
    roll_to "$CURRENT"
    if smoke "$CURRENT"; then ops_log "Rollback erfolgreich, Version $CURRENT laeuft wieder."; else ops_log "Auch nach dem Rollback nicht gesund: manuell eingreifen."; fi
  else
    ops_log "Kein voriges Tag zum Zurueckrollen vorhanden."
  fi
  echo "Hinweis: Migrationen sind nicht rueckgaengig gemacht. Sicherung vor dem Deploy: ${BACKUP_SET:-?}"
  echo "         Bei zerstoerender Migration: AGE_IDENTITY=... $OPS/restore.sh live ${BACKUP_SET:-latest}"
  exit 1
fi

# 6) Merken und aufraeumen
echo "$CURRENT" > "$STATE/previous"
echo "$TAG" > "$STATE/current"
echo "$(date -u +%FT%TZ) $TAG backup=${BACKUP_SET:-none}" >> "$STATE/history"
ops_log "Deploy $TAG erfolgreich (vorher: ${CURRENT:-<keins>})."

# Alte Tags entfernen, die beiden aktuellen bleiben immer
for repo in vereine-api vereine-web; do
  docker image ls "$repo" --format '{{.Tag}}' | grep -vx -e local -e "$TAG" -e "${CURRENT:-__none__}" | sort -r | tail -n +"$((KEEP_IMAGES))" \
    | while read -r t; do docker rmi "$repo:$t" >/dev/null 2>&1 || true; done
done
docker builder prune -f --filter until=72h >/dev/null 2>&1 || true
