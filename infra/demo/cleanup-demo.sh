#!/usr/bin/env bash
# Demo-Daten sicher entfernen (alter Demo-Satz mit Feuerwehr/Fussball UND der fiktive Satz TSV Beispielburg), mit Kontrolle.
#
#   DEMO_PASSWORD="$(cat infra/demo/out/password.txt)" BASE_URL=https://klubnest.de \
#   PSQL_CMD="ssh root@SERVER 'cd /opt/vereine && docker compose -f infra/deploy/docker-compose.preview.yml --env-file .env.preview exec -T postgres psql -U vereine -d vereine -v ON_ERROR_STOP=1'" \
#   infra/demo/cleanup-demo.sh --yes
#
# Ablauf: 1. Konten ueber die Konto-Loeschfunktion der API (loescht Beitraege, Kommentare, Bilder, Zusagen ueber die
#            Bereichsdienste, nicht per Roh-SQL)  2. Demo-Vereine per SQL (feste Kennungen)  3. Kontroll-SQL: alles muss 0 sein.
# Ohne --yes passiert nichts (Probelauf zeigt nur die Schritte). Konten, die es nicht mehr gibt, werden uebersprungen.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
: "${BASE_URL:?BASE_URL setzen}"
: "${DEMO_PASSWORD:?DEMO_PASSWORD setzen (infra/demo/out/password.txt)}"
: "${PSQL_CMD:?PSQL_CMD setzen (Befehl, der SQL von stdin an die Datenbank gibt, siehe Kopfzeile)}"

if [ "${1:-}" != "--yes" ]; then
  echo "PROBELAUF. Es wuerde: (1) Demo-Konten ueber die API loeschen, (2) Demo-Vereine per SQL loeschen, (3) kontrollieren."
  echo "Ziel: $BASE_URL. Mit --yes ausfuehren."
  exit 0
fi

echo "== 1/3 Konten loeschen (alter Satz)"
DEMO_PASSWORD="$DEMO_PASSWORD" BASE_URL="$BASE_URL" node "$HERE/seed.mjs" cleanup
echo "== 1/3 Konten loeschen (fiktiver Satz)"
DEMO_PASSWORD="$DEMO_PASSWORD" BASE_URL="$BASE_URL" node "$HERE/fiktiv/seed-fiktiv.mjs" cleanup

echo "== 2/3 Demo-Vereine loeschen"
eval "$PSQL_CMD" < "$HERE/delete-demo-orgs.sql"

echo "== 3/3 Kontrolle"
OUT="$(eval "$PSQL_CMD -At -F ' '" < "$HERE/verify-demo-clean.sql")"
echo "$OUT"
if echo "$OUT" | awk '{ if ($NF + 0 > 0) bad = 1 } END { exit bad ? 0 : 1 }'; then
  echo "FEHLER: Es sind noch Demo-Daten vorhanden (siehe oben)." >&2
  exit 1
fi
cat <<'EOF'
OK: Demo-Daten sind aus der Datenbank entfernt.
Noch zu tun (docs/BETRIEB.md, Abschnitt Demo-Daten):
  - Bilddateien im Medien-Volume raeumt der stuendliche Job media.cleanup auf; nach 1-2 Stunden pruefen.
  - Sicherungen VOR dem Loeschen enthalten die Demo-Daten noch bis zum Ablauf der Aufbewahrung (taeglich 14 Tage, woechentlich 8,
    monatlich 6). Bei Demo-Daten mit echten Personen (alter Satz): betroffene Saetze einzeln loeschen (rm -rf <Satz> lokal + auf der Storage Box).
  - Lokale Ablage infra/demo/images und infra/demo/out von der Entwicklermaschine loeschen.
EOF
