#!/usr/bin/env bash
# Selbsttest der Betriebsskripte ohne Docker/age/Server: Schwaerzen von Geheimnissen, Aufbewahrung, Status-Datei.
# Lauf: bash infra/ops/selftest.sh  (auch im CI-Job "infra")
set -euo pipefail
# shellcheck source=infra/ops/lib.sh
. "$(dirname "$(readlink -f "$0")")/lib.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
FAILS=0
eq() { if [ "$2" = "$3" ]; then echo "OK      $1"; else echo "FEHLER  $1: erwartet '$2', ist '$3'"; FAILS=$((FAILS + 1)); fi; }

# 1) Geheimnisse werden geschwaerzt, Namen und unkritische Werte bleiben
cat > "$T/env" <<'EOF'
POSTGRES_PASSWORD=geheim123
CHAT_MASTER_KEYS=1:abcdef==
AUTH_SECRET_KEY=xyz
SMTP_PASS=pw
METRICS_TOKEN=tok
VAPID_PRIVATE_KEY=priv
DATABASE_URL=postgres://u:pw@db/x
export REDIS_PASSWORD=r
DOMAIN=klubnest.de
COOKIE_SECURE=true
WEB_ORIGIN=https://klubnest.de
EOF
ops_redact_env "$T/env" > "$T/out"
if grep -Eq 'geheim123|abcdef|xyz|=pw|=tok|=priv|u:pw|=r$' "$T/out"; then echo "FEHLER  Geheimnis nicht geschwaerzt"; cat "$T/out"; FAILS=$((FAILS + 1)); else echo "OK      keine Geheimnisse in der Ausgabe"; fi
eq "Name bleibt" "1" "$(grep -c '^CHAT_MASTER_KEYS=<ENTFERNT>$' "$T/out")"
eq "Domain bleibt" "1" "$(grep -c '^DOMAIN=klubnest.de$' "$T/out")"
eq "WEB_ORIGIN bleibt" "1" "$(grep -c '^WEB_ORIGIN=https://klubnest.de$' "$T/out")"
eq "Anzahl Zeilen gleich" "$(wc -l < "$T/env")" "$(wc -l < "$T/out")"

# 2) Aufbewahrung: nur die neuesten N Saetze bleiben, fremde Ordner werden nicht angefasst
mkdir -p "$T/daily"
for i in $(seq -w 1 20); do mkdir -p "$T/daily/202611$i-030000"; done
mkdir -p "$T/daily/lost+found"
ops_prune_sets "$T/daily" 14
eq "14 Saetze bleiben" "14" "$(find "$T/daily" -mindepth 1 -maxdepth 1 -name '2026*' | wc -l)"
eq "aeltester bleibende Satz" "20261107-030000" "$(find "$T/daily" -mindepth 1 -maxdepth 1 -name '2026*' -printf '%f\n' | sort | head -n1)"
eq "neuester Satz" "20261120-030000" "$(ops_latest_set "$T/daily")"
eq "fremder Ordner bleibt" "1" "$([ -d "$T/daily/lost+found" ] && echo 1 || echo 0)"
ops_prune_sets "$T/daily" 6
eq "woechentlich 6" "6" "$(find "$T/daily" -mindepth 1 -maxdepth 1 -name '2026*' | wc -l)"
ops_prune_sets "$T/gibt-es-nicht" 3
eq "fehlendes Verzeichnis ist kein Fehler" "0" "$?"
eq "leeres Verzeichnis: kein neuester Satz" "" "$(mkdir -p "$T/leer" && ops_latest_set "$T/leer")"

# 3) Status-Datei: gueltiges JSON, lesbar, Felder auslesbar
STATUS_DIR="$T/status" ops_write_status true 12345 20261114-031700 true
S="$T/status/status.json"
eq "ok-Feld" "true" "$(ops_json_get "$S" ok)"
eq "bytes-Feld" "12345" "$(ops_json_get "$S" bytes)"
eq "set-Feld" "20261114-031700" "$(ops_json_get "$S" set)"
eq "offsite-Feld" "true" "$(ops_json_get "$S" offsite)"
case "$(ops_json_get "$S" finishedAt)" in 20??-??-??T??:??:??Z) echo "OK      finishedAt im ISO-Format" ;; *) echo "FEHLER  finishedAt"; FAILS=$((FAILS + 1)) ;; esac
if command -v node >/dev/null; then
  eq "Status ist gueltiges JSON" "true" "$(node -e "const s=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(s.ok===true&&typeof s.bytes==='number')" "$S")"
fi

# 4) Alle Skripte syntaktisch in Ordnung
for f in "$(dirname "$(readlink -f "$0")")"/*.sh; do
  bash -n "$f" && echo "OK      Syntax $(basename "$f")" || { echo "FEHLER  Syntax $(basename "$f")"; FAILS=$((FAILS + 1)); }
done

[ "$FAILS" -eq 0 ] && echo "SELFTEST OK" || echo "SELFTEST: $FAILS Fehler"
exit "$FAILS"
