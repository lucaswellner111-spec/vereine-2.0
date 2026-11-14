#!/usr/bin/env bash
# Uptime-Check von AUSSEN (am besten von einem anderen Rechner/Anbieter in der EU als dem Server, per Cron alle 5 Minuten):
#   */5 * * * * /pfad/infra/ops/uptime-check.sh
# Prueft: Startseite, /api/health/ready (DB, Cache, Worker), TLS-Zertifikat (Restlaufzeit).
# Meldet nur bei Zustandswechsel (OK -> FEHLER und zurueck), damit kein Mail-Sturm entsteht.
# Alarmweg: Exit-Code 1 + Ausgabe (Cron-MAILTO) oder SMTP per curl (ALERT_SMTP_* in der Umgebungsdatei, Datei 600).
# Keine Drittanbieter-Dienste: der Check laeuft auf eurer eigenen Maschine.
set -uo pipefail
# shellcheck source=infra/ops/lib.sh
. "$(dirname "$(readlink -f "$0")")/lib.sh"
ops_load_env

URL="${1:-${UPTIME_URL:-}}"
[ -n "$URL" ] || { echo "UPTIME_URL oder Argument fehlt" >&2; exit 2; }
URL="${URL%/}"
MIN_DAYS="${UPTIME_CERT_MIN_DAYS:-14}"
STATE_FILE="${UPTIME_STATE_FILE:-${XDG_STATE_HOME:-$HOME/.local/state}/vereine-uptime.state}"
mkdir -p "$(dirname "$STATE_FILE")"

PROBLEMS=()
code="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$URL/" 2>/dev/null || echo 000)"
[ "$code" = 200 ] || PROBLEMS+=("Startseite antwortet mit $code")

body="$(curl -sS --max-time 15 -w '\n%{http_code}' "$URL/api/health/ready" 2>/dev/null || printf '\n000')"
rcode="${body##*$'\n'}"
rbody="${body%$'\n'*}"
if [ "$rcode" != 200 ]; then
  PROBLEMS+=("Bereitschaft antwortet mit $rcode (Datenbank oder Cache?)")
else
  printf '%s' "$rbody" | grep -q '"worker":"down"' && PROBLEMS+=("Worker meldet sich nicht")
fi

case "$URL" in
  https://*)
    host="${URL#https://}"; host="${host%%/*}"
    end="$(echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
    if [ -z "$end" ]; then
      PROBLEMS+=("TLS-Zertifikat nicht lesbar")
    else
      days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
      [ "$days" -ge "$MIN_DAYS" ] || PROBLEMS+=("TLS-Zertifikat laeuft in $days Tagen ab")
    fi
    ;;
esac

now="OK"; [ "${#PROBLEMS[@]}" -eq 0 ] || now="FEHLER"
before="$(cat "$STATE_FILE" 2>/dev/null || echo OK)"
echo "$now" > "$STATE_FILE"

msg="$(printf '%s\n' "${PROBLEMS[@]:-}")"
if [ "$now" = FEHLER ]; then echo "UPTIME FEHLER $URL"; echo "$msg"; fi

send_mail() { # $1 Betreff, $2 Text
  [ -n "${ALERT_SMTP_URL:-}" ] && [ -n "${ALERT_MAIL_TO:-}" ] || return 0
  printf 'From: %s\nTo: %s\nSubject: %s\nContent-Type: text/plain; charset=utf-8\n\n%s\n' "$ALERT_MAIL_FROM" "$ALERT_MAIL_TO" "$1" "$2" \
    | curl -sS --max-time 30 --ssl-reqd --url "$ALERT_SMTP_URL" --user "${ALERT_SMTP_USER:-}:${ALERT_SMTP_PASS:-}" \
        --mail-from "$ALERT_MAIL_FROM" --mail-rcpt "$ALERT_MAIL_TO" -T - >/dev/null 2>&1 || echo "Alarm-Mail konnte nicht gesendet werden" >&2
}
if [ "$now" != "$before" ]; then
  if [ "$now" = FEHLER ]; then send_mail "Klubnest Uptime: FEHLER" "$URL: $msg"; else send_mail "Klubnest Uptime: wieder OK" "$URL ist wieder erreichbar."; echo "UPTIME wieder OK $URL"; fi
fi
[ "$now" = OK ]
