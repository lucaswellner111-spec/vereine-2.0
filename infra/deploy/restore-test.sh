#!/usr/bin/env bash
# Kompatibilitaets-Aufruf: Restore-Probe in eine Wegwerf-Datenbank (Live-Daten bleiben unberuehrt).
# Braucht AGE_IDENTITY (Pfad zum privaten age-Schluessel). Siehe infra/ops/restore.sh und docs/BETRIEB.md.
exec "$(dirname "$(readlink -f "$0")")/../ops/restore.sh" verify "$@"
