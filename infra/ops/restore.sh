#!/usr/bin/env bash
# Wiederherstellung und Restore-Uebung. Der PRIVATE age-Schluessel wird nur fuer den Lauf als Datei uebergeben
# (AGE_IDENTITY=/pfad/zum/age-key.txt, z. B. vom USB-Stick) und nie auf dem Server abgelegt.
#
#   restore.sh pull                    Saetze von der Storage Box nach BACKUP_DIR holen (frische Maschine)
#   restore.sh verify [SATZ|latest]    Pruefsummen, Entschluesseln, Wiederherstellen in eine Wegwerf-DB im laufenden Postgres
#                                      (Live-Daten bleiben unberuehrt). Fuer die regelmaessige Pruefung.
#   restore.sh fresh  [SATZ|latest]    Restore-Uebung: eigener Wegwerf-Postgres-Container, braucht nur Docker. Misst die Dauer.
#   restore.sh live   [SATZ|latest]    ECHTE Wiederherstellung: stoppt die App, ersetzt Datenbank und Medien. Fragt vorher nach.
set -euo pipefail
# shellcheck source=infra/ops/lib.sh
. "$(dirname "$(readlink -f "$0")")/lib.sh"
ops_load_env

MODE="${1:-}"
WANT="${2:-latest}"
START="$(date +%s)"
IMG="${POSTGRES_IMAGE:-pgvector/pgvector:pg16}"

case "$MODE" in
  pull|verify|fresh|live) ;;
  *) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac

if [ "$MODE" = pull ]; then
  [ -n "${STORAGEBOX_TARGET:-}" ] || ops_die "STORAGEBOX_TARGET nicht gesetzt."
  mkdir -p "$BACKUP_DIR"
  rsync -a -e "ssh -p $STORAGEBOX_PORT -i $STORAGEBOX_KEY -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$STORAGEBOX_KNOWN_HOSTS" \
    "$STORAGEBOX_TARGET:$STORAGEBOX_DIR/" "$BACKUP_DIR/"
  ops_log "Geholt. Neuester Satz: $(ops_latest_set "$BACKUP_DIR/daily")"
  exit 0
fi

command -v age >/dev/null || ops_die "age fehlt (apt install age)."
[ -n "${AGE_IDENTITY:-}" ] && [ -r "$AGE_IDENTITY" ] || ops_die "AGE_IDENTITY (Pfad zum privaten Schluessel) fehlt oder ist nicht lesbar."

# Satz bestimmen: Name, Pfad oder "latest" (daily)
if [ "$WANT" = latest ]; then
  NAME="$(ops_latest_set "$BACKUP_DIR/daily")"
  [ -n "$NAME" ] || ops_die "Kein Satz in $BACKUP_DIR/daily."
  SET="$BACKUP_DIR/daily/$NAME"
elif [ -d "$WANT" ]; then
  SET="$WANT"
else
  SET="$(find "$BACKUP_DIR" -mindepth 2 -maxdepth 2 -type d -name "$WANT" | head -n1)"
  [ -n "$SET" ] || ops_die "Satz $WANT nicht gefunden."
fi
ops_log "Satz: $SET"
[ -f "$SET/db.sql.gz.age" ] || ops_die "db.sql.gz.age fehlt im Satz."

ops_log "Pruefsummen ..."
( cd "$SET" && sha256sum -c --quiet SHA256SUMS ) || ops_die "Pruefsummen stimmen nicht: Satz ist beschaedigt, naechsten Satz nehmen."

EXPECT_USERS="$(ops_json_get "$SET/manifest.json" users 2>/dev/null || echo "")"
dec() { age -d -i "$AGE_IDENTITY" "$1"; }

# psql-Aufruf je Modus: $1 = Datenbankname
case "$MODE" in
  verify | live) psql_run() { ops_compose exec -T postgres psql -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1 -q "${@:2}"; } ;;
  fresh)
    CT="vereine-restore-drill-$$"
    PW="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"
    cleanup_fresh() { docker rm -f "$CT" >/dev/null 2>&1 || true; [ -n "${TMPM:-}" ] && rm -rf "$TMPM"; }
    trap cleanup_fresh EXIT
    ops_log "Wegwerf-Postgres starten ($IMG) ..."
    docker run -d --name "$CT" -e POSTGRES_PASSWORD="$PW" -e POSTGRES_USER=vereine "$IMG" >/dev/null
    for _ in $(seq 1 60); do docker exec "$CT" pg_isready -U vereine >/dev/null 2>&1 && break; sleep 1; done
    docker exec "$CT" pg_isready -U vereine >/dev/null || ops_die "Wegwerf-Postgres wurde nicht bereit."
    POSTGRES_USER=vereine
    psql_run() { docker exec -i "$CT" psql -U vereine -d "$1" -v ON_ERROR_STOP=1 -q "${@:2}"; }
    ;;
esac

count() { psql_run "$1" -Atc "$2" | tr -d '[:space:]'; }

restore_db() { # $1 = Ziel-DB (existiert, leer)
  ops_log "Datenbank einspielen ..."
  dec "$SET/db.sql.gz.age" | gunzip | psql_run "$1" >/dev/null
}

summary() { # $1 = DB
  local users orgs posts
  users="$(count "$1" 'select count(*) from identity.users;')"
  orgs="$(count "$1" 'select count(*) from social.organizations;' 2>/dev/null || echo "?")"
  posts="$(count "$1" 'select count(*) from social.posts;' 2>/dev/null || echo "?")"
  ops_log "Wiederhergestellt: users=$users organisationen=$orgs beitraege=$posts (Manifest: users=${EXPECT_USERS:-?})"
  [ "$users" -ge 1 ] || ops_die "Keine Nutzer in der wiederhergestellten Datenbank."
}

case "$MODE" in
  verify)
    DBN="restore_drill_$$"
    ops_compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -qc "DROP DATABASE IF EXISTS $DBN;" -c "CREATE DATABASE $DBN;"
    trap 'ops_compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -qc "DROP DATABASE IF EXISTS '"$DBN"';" >/dev/null 2>&1 || true' EXIT
    restore_db "$DBN"
    summary "$DBN"
    [ -f "$SET/media.tar.gz.age" ] && ops_log "Medien: $(dec "$SET/media.tar.gz.age" | tar tz | wc -l) Dateien lesbar"
    [ -f "$SET/config.tar.gz.age" ] && ops_log "Konfiguration: $(dec "$SET/config.tar.gz.age" | tar tz | wc -l) Dateien lesbar"
    ops_log "VERIFY OK in $(( $(date +%s) - START )) s (Live-Datenbank unberuehrt)"
    ;;
  fresh)
    docker exec "$CT" psql -U vereine -d postgres -qc "CREATE DATABASE vereine;"
    restore_db vereine
    summary vereine
    TMPM="$(mktemp -d)"
    if [ -f "$SET/media.tar.gz.age" ]; then
      dec "$SET/media.tar.gz.age" | tar xz -C "$TMPM"
      ops_log "Medien: $(find "$TMPM" -type f | wc -l) Dateien entpackt"
    fi
    ops_log "RESTORE-UEBUNG OK in $(( $(date +%s) - START )) s (RTO-Messwert fuer Datenbank+Medien; Wegwerf-Container wird entfernt)"
    ;;
  live)
    echo "ACHTUNG: ersetzt die LIVE-Datenbank '$POSTGRES_DB' und das Medien-Volume '$MEDIA_VOLUME' durch Satz $(basename "$SET")."
    echo "Die App wird dabei gestoppt. Vorher wird eine Notfall-Sicherung des aktuellen Stands gemacht."
    if [ "${RESTORE_CONFIRM:-}" != "WIEDERHERSTELLEN" ]; then
      read -r -p "Zum Fortfahren WIEDERHERSTELLEN eintippen: " ANSWER
      [ "$ANSWER" = WIEDERHERSTELLEN ] || ops_die "Abgebrochen."
    fi
    ops_log "Notfall-Sicherung des aktuellen Stands ..."
    "$(dirname "$(readlink -f "$0")")/backup.sh" || ops_log "WARNUNG: Notfall-Sicherung fehlgeschlagen, mache trotzdem weiter (bestaetigt)."
    ops_log "App stoppen ..."
    ops_compose stop api worker chat-gateway web >/dev/null
    ops_compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -qc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$POSTGRES_DB' AND pid<>pg_backend_pid();" >/dev/null
    ops_compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -qc "DROP DATABASE IF EXISTS $POSTGRES_DB;" -c "CREATE DATABASE $POSTGRES_DB;"
    restore_db "$POSTGRES_DB"
    summary "$POSTGRES_DB"
    if [ -f "$SET/media.tar.gz.age" ]; then
      ops_log "Medien zurueckspielen ..."
      dec "$SET/media.tar.gz.age" | docker run --rm -i -v "$MEDIA_VOLUME":/data alpine sh -c 'find /data -mindepth 1 -delete && tar xz -C /data'
    fi
    ops_log "App starten ..."
    ops_compose up -d --no-build
    for _ in $(seq 1 60); do
      ops_compose exec -T api node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1 && break
      sleep 2
    done
    ops_log "LIVE-WIEDERHERSTELLUNG fertig in $(( $(date +%s) - START )) s."
    cat <<'EOF'
Naechste Schritte (docs/BETRIEB.md, Abschnitt Wiederherstellung):
  1. Smoke-Test: infra/ops/smoke.sh
  2. CHAT_MASTER_KEYS und AUTH_SECRET_KEY in .env pruefen (aus dem Passwortmanager, NICHT aus der Sicherung).
  3. Seit dem Satz geloeschte Konten erneut loeschen (Loeschprotokoll/Support-Tickets durchgehen, Art. 17 DSGVO).
  4. Betroffene Nutzer informieren, falls Daten seit dem Satz verloren sind.
EOF
    ;;
esac
