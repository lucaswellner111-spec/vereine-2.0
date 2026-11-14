#!/usr/bin/env bash
# Prueft die Sicherung: letzte erfolgreiche Sicherung, Alter, Groesse, Offsite, Vollstaendigkeit des neuesten Satzes.
# Ausgabe: eine Zeile je Pruefung. Exit 0 = alles gut, 1 = Warnung/Fehler (Cron/systemd melden das).
# Optional zusaetzlich: SHA256SUMS des neuesten Satzes pruefen (CHECK_HASH=1, liest alle Dateien: kann dauern).
set -euo pipefail
# shellcheck source=infra/ops/lib.sh
. "$(dirname "$(readlink -f "$0")")/lib.sh"
ops_load_env

MAX_AGE_H="${BACKUP_MAX_AGE_HOURS:-30}"
MIN_BYTES="${BACKUP_MIN_BYTES:-10240}"
STATUS="$STATUS_DIR/status.json"
BAD=0
bad() { echo "FEHLER  $*"; BAD=1; }
ok() { echo "OK      $*"; }

if [ ! -f "$STATUS" ]; then
  bad "Keine Statusdatei ($STATUS): es lief noch nie eine Sicherung."
else
  OKFLAG="$(ops_json_get "$STATUS" ok)"
  FIN="$(ops_json_get "$STATUS" finishedAt)"
  BYTES="$(ops_json_get "$STATUS" bytes)"
  SETN="$(ops_json_get "$STATUS" set)"
  OFF="$(ops_json_get "$STATUS" offsite)"
  AGE_H=$(( ( $(date +%s) - $(date -d "$FIN" +%s 2>/dev/null || echo 0) ) / 3600 ))
  [ "$OKFLAG" = true ] && ok "letzte Sicherung erfolgreich (Satz $SETN)" || bad "letzte Sicherung ist fehlgeschlagen (Satz $SETN)"
  [ "$AGE_H" -le "$MAX_AGE_H" ] && ok "Alter ${AGE_H} h (Grenze ${MAX_AGE_H} h)" || bad "Sicherung ist ${AGE_H} h alt (Grenze ${MAX_AGE_H} h)"
  [ "${BYTES:-0}" -ge "$MIN_BYTES" ] && ok "Groesse ${BYTES} Byte" || bad "Sicherung auffaellig klein (${BYTES:-0} Byte, Minimum ${MIN_BYTES})"
  if [ -n "${STORAGEBOX_TARGET:-}" ]; then
    [ "$OFF" = true ] && ok "Offsite-Kopie aktuell" || bad "Offsite-Kopie fehlt oder fehlgeschlagen"
  fi
fi

LATEST="$(ops_latest_set "$BACKUP_DIR/daily")"
if [ -z "$LATEST" ]; then
  bad "Kein Satz in $BACKUP_DIR/daily"
else
  for f in db.sql.gz.age media.tar.gz.age config.tar.gz.age SHA256SUMS manifest.json; do
    [ -s "$BACKUP_DIR/daily/$LATEST/$f" ] || bad "Datei fehlt oder leer: $LATEST/$f"
  done
  if [ "${CHECK_HASH:-0}" = 1 ]; then
    ( cd "$BACKUP_DIR/daily/$LATEST" && sha256sum -c --quiet SHA256SUMS ) && ok "Pruefsummen stimmen" || bad "Pruefsummen stimmen NICHT"
  fi
  ok "neuester Satz $LATEST: $(du -sh "$BACKUP_DIR/daily/$LATEST" | cut -f1), taeglich $(find "$BACKUP_DIR/daily" -mindepth 1 -maxdepth 1 -type d | wc -l) / woechentlich $(find "$BACKUP_DIR/weekly" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l) / monatlich $(find "$BACKUP_DIR/monthly" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)"
fi

exit "$BAD"
