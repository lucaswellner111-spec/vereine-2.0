#!/usr/bin/env bash
# Kompatibilitaets-Aufruf: die Sicherung liegt jetzt in infra/ops/backup.sh (verschluesselt, Medien, Konfiguration,
# Offsite, Aufbewahrung 14/8/6). Siehe docs/BETRIEB.md.
exec "$(dirname "$(readlink -f "$0")")/../ops/backup.sh" "$@"
