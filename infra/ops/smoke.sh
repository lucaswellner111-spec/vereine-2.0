#!/usr/bin/env bash
# Smoke-Test nach Deploy/Wiederherstellung. Exit 0 = alles gut.
#   infra/ops/smoke.sh [BASIS-URL]
# BASIS-URL Standard: https://$DOMAIN (aus .env) bzw. http://127.0.0.1. Auf dem Server selbst mit
#   SMOKE_RESOLVE=klubnest.de:443:127.0.0.1 gegen den lokalen Caddy testen (echtes Zertifikat, kein DNS noetig).
# WORKER_GRACE_SEC: so lange darf das Worker-Lebenszeichen nach einem Neustart fehlen (Standard 90 s).
set -uo pipefail

BASE="${1:-${SMOKE_BASE_URL:-http://127.0.0.1}}"
BASE="${BASE%/}"
GRACE="${WORKER_GRACE_SEC:-90}"
CURL=(curl -sS --max-time 10 -o /dev/null -w '%{http_code}')
[ -n "${SMOKE_RESOLVE:-}" ] && CURL+=(--resolve "$SMOKE_RESOLVE")
FAIL=0
check() { # $1 Name, $2 erwartet, $3 ist
  if [ "$2" = "$3" ]; then echo "OK      $1 ($3)"; else echo "FEHLER  $1: erwartet $2, ist $3"; FAIL=1; fi
}

check "Startseite" 200 "$("${CURL[@]}" "$BASE/" || true)"
check "Anmelde-Status ohne Cookie" 401 "$("${CURL[@]}" "$BASE/api/auth/me" || true)"
check "Messwerte nicht oeffentlich" 404 "$("${CURL[@]}" "$BASE/api/metrics" || true)"
check "Vereinsfinder (oeffentlich)" 200 "$("${CURL[@]}" "$BASE/api/public/orgs" || true)"

# Bereitschaft: DB + Cache "ok"; Worker bekommt eine Schonfrist (startet nach der API)
deadline=$(( $(date +%s) + GRACE ))
READY=""
while :; do
  READY_ARGS=(-sS --max-time 10); [ -n "${SMOKE_RESOLVE:-}" ] && READY_ARGS+=(--resolve "$SMOKE_RESOLVE")
  READY="$(curl "${READY_ARGS[@]}" "$BASE/api/health/ready" 2>/dev/null || true)"
  if printf '%s' "$READY" | grep -q '"status":"ok"' && ! printf '%s' "$READY" | grep -q '"worker":"down"'; then break; fi
  [ "$(date +%s)" -ge "$deadline" ] && break
  sleep 3
done
if printf '%s' "$READY" | grep -q '"status":"ok"'; then echo "OK      Bereitschaft (DB, Cache)"; else echo "FEHLER  Bereitschaft: $READY"; FAIL=1; fi
if printf '%s' "$READY" | grep -q '"worker":"down"'; then echo "FEHLER  Worker meldet sich nicht (Container worker pruefen)"; FAIL=1; else echo "OK      Worker"; fi
if printf '%s' "$READY" | grep -Eq '"failed":([5-9]|[1-9][0-9]+)'; then echo "WARNUNG viele fehlgeschlagene Jobs: $(printf '%s' "$READY" | grep -o '"failed":[0-9]*')"; fi

# HTTPS-Kopfzeilen nur pruefen, wenn HTTPS
case "$BASE" in
  https://*)
    HDR_ARGS=(-sSI --max-time 10); [ -n "${SMOKE_RESOLVE:-}" ] && HDR_ARGS+=(--resolve "$SMOKE_RESOLVE")
    HDR="$(curl "${HDR_ARGS[@]}" "$BASE/" 2>/dev/null || true)"
    for h in strict-transport-security x-content-type-options referrer-policy; do
      printf '%s' "$HDR" | grep -qi "^$h:" && echo "OK      Header $h" || { echo "FEHLER  Header $h fehlt"; FAIL=1; }
    done
    ;;
esac

# Container-Zustand (nur wenn docker/compose auf diesem Rechner verfuegbar)
if [ -n "${SMOKE_COMPOSE:-}" ] && command -v docker >/dev/null; then
  BADC="$(eval "$SMOKE_COMPOSE ps --format '{{.Service}} {{.State}} {{.Health}}'" 2>/dev/null | grep -Ei 'unhealthy|restarting|exited' || true)"
  if [ -n "$BADC" ]; then echo "FEHLER  Container: $BADC"; FAIL=1; else echo "OK      Container laufen"; fi
fi

[ "$FAIL" -eq 0 ] && echo "SMOKE OK" || echo "SMOKE FEHLGESCHLAGEN"
exit "$FAIL"
