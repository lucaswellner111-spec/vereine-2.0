#!/usr/bin/env bash
# Prueft alle Caddyfiles mit `caddy validate` (lokales caddy oder Docker-Image caddy:2). Fehlt beides: Exit 3.
# Die Dateien benutzen {$DOMAIN}, {$ACME_EMAIL} u. a.; hier werden Platzhalterwerte gesetzt.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/../deploy" && pwd)"
export DOMAIN="${DOMAIN:-example.test}" ACME_EMAIL="${ACME_EMAIL:-admin@example.test}"
export STAGING_ALLOW_CIDR="${STAGING_ALLOW_CIDR:-127.0.0.1/32}"
rc=0
for f in "$DIR"/Caddyfile "$DIR"/Caddyfile.tls "$DIR"/Caddyfile.preview "$DIR"/Caddyfile.staging; do
  [ -f "$f" ] || continue
  echo "== $(basename "$f")"
  if command -v caddy >/dev/null; then
    caddy validate --config "$f" --adapter caddyfile || rc=1
  elif command -v docker >/dev/null; then
    docker run --rm -e DOMAIN -e ACME_EMAIL -e STAGING_ALLOW_CIDR -v "$f":/etc/caddy/Caddyfile:ro caddy:2 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || rc=1
  else
    echo "Weder caddy noch docker gefunden: nicht validiert." >&2
    exit 3
  fi
done
exit "$rc"
