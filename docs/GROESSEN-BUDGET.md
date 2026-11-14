# Größen-Budget: Server-Speicher, Images, Code (Stand 2026-11-14)

Ziel: Klubnest bleibt schlank und auf dem 40-GB-Server (38 GB nutzbar) lange ohne Aufrüsten lauffähig und liegt bei Ladegröße und Aufbau im Bereich guter moderner Webanwendungen. Zahlen unten sind gemessen, Vergleichswerte sind Richtgrößen aus meinem Wissen und vor Außenbehauptungen zu prüfen.

## Gemessen (Vorschau-Server nach dem Deploy)
| Posten | Größe | Bewertung |
|---|---|---|
| Datenbank | 11 MB | winzig; wächst mit Nutzung, nicht mit dem Code |
| Medien (Bilder) | ~1 MB | winzig; ab Echtbetrieb größter Wachstumsposten (Plan: Object Storage) |
| Backups auf dem Server | wenige MB je Satz | ok, Rotation 14 Tage |
| Docker-Images (api/worker/chat) | je ~920 MB | **zu groß**, Ziel < 350 MB |
| Docker-Image web | ~1,66 GB | **zu groß**, Ziel < 400 MB (Next `output: standalone`) |
| Docker-Build-Cache | war 17,7 GB | **Hauptursache**: Platte stieg von 47 % auf 64 %; am 2026-11-14 mit `docker builder prune` geleert, Platte 21 % |
| Web-JS (`.next/static`) gesamt | 2,6 MB (alle Routen, ungezippt) | gut für den Funktionsumfang |
| Quellcode (TS/TSX, ohne Tests/Dependencies grob) | ca. 49.000 Zeilen | für den Umfang (Verwaltung, Chat, Feed, Termine, Rechnungen) im normalen Rahmen |
| `node_modules` lokal | 787 MB | normal für ein Monorepo, nicht im Betrieb relevant |

Die **Daten** sind nicht das Problem, sondern **Build-Reste und große Images**. Jeder Deploy mit `--build` legt mehrere GB Build-Cache an.

## Richtwerte für den Vergleich (Richtgrößen, zu prüfen)
- Erstes Laden einer Seite: guter Richtwert ≤ 170 KB JavaScript (gzip) je Route; Core Web Vitals: LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1.
- Docker-Images moderner Next/Node-Dienste: Web 150–400 MB, API 200–400 MB (multi-stage, nur Produktionsabhängigkeiten, `standalone`).
- Datenbank: ein Verein mit 200 Mitgliedern liegt im einstelligen MB-Bereich ohne Bilder; Bilder dominieren (hier: WebP, EXIF entfernt, größte Variante gespeichert).

## Maßnahmen (Reihenfolge nach Nutzen)
1. **Nach jedem Deploy `docker builder prune -f`** (und alte `prev`-Tags auf die letzten 2 begrenzen). In `infra/ops/deploy.sh` einbauen, in `docs/BETRIEB.md` als Pflichtschritt.
2. **Images verschlanken:** Multi-Stage-Builds, `npm ci --omit=dev` bzw. `npm prune --omit=dev` im Endimage, Next `output: "standalone"`, kein Dev-/Test-/Playwright-Inhalt im Image, gemeinsame Basis für api/worker/chat-gateway (heute dasselbe Image mehrfach getaggt, die Schichten teilen sich, aber das Image ist zu groß).
3. **Bundle-Budget in CI:** Build-Ausgabe von Next auswerten und bei > 170 KB gzip erstem Laden je Route oder > 3,5 MB `.next/static` warnen/fehlschlagen; schwere Komponenten nur dynamisch laden (z. B. QR-Erzeugung, PDF, Diagramme).
4. **Messung:** Lighthouse/Web-Vitals-Lauf lokal gegen den Produktionsbuild (ohne Drittanbieter) auf Startseite, Feed, Termin, Verein; Ergebnis hier eintragen.
5. **Medien:** vor Echtbetrieb Object Storage (Hetzner S3) und Größenlimits je Verein; Bildverarbeitung bleibt WebP.
6. **Alarm:** Platte > 80 % und Backup-Alter alarmieren bereits (Modul `ops`, Plattform-Karte). Zusätzlich Docker-Speicher (`docker system df`) in die Uptime-/Ops-Prüfung aufnehmen.
7. **Code-Hygiene:** ungenutzte Abhängigkeiten und tote Dateien regelmäßig suchen (z. B. `npx depcheck`, `npx knip`), Duplikate in Komponenten zusammenführen.

## Stand der Umsetzung (Paket E1 „Schlank“, 2026-11-14)
- Erledigt: Build-Cache geleert, Zahlen erfasst.
- **Deploy-Aufräumen** (`infra/ops/deploy.sh`): nach erfolgreichem Smoke-Test `docker builder prune -f`, `docker image prune -f`, nur das neue und das vorige `vereine-api/web`-Tag bleiben (`KEEP_IMAGES`). Doku: `docs/BETRIEB.md`, Deploy-Ablauf Schritt 7.
- **Alarm:** `uptime-check.sh` meldet, wenn `docker system df` über `UPTIME_DOCKER_MAX_GB` (15) liegt. Nicht auf dem Server ausgeführt.
- **Bundle-Budget:** `apps/web/scripts/check-bundle.mjs` (`npm run check:bundle -w @vereine/web`, CI-Job `build`): Warnung > 170 KB gzip je Route oder `.next/static` > 3,5 MB, Fehler erst > 320 KB bzw. > 5 MB (`BUNDLE_STRICT=1` macht jede Überschreitung zum Fehler).
- **Web-Image:** `output: "standalone"` (`next.config.ts`) plus Multi-Stage-Endimage. Lokal gemessen: `.next/standalone` 69 MB statt des vollen Wurzel-`node_modules` (590 MB) samt Quellen; Server startet mit `node apps/web/server.js`, liefert Seiten, CSP-Nonce-Header, `/_next/static`, `public/`, `sw.js`. Erwartet: Web-Image ca. 300 MB (Basis `node:22-slim` + 69 MB).
- **API-/Worker-/Chat-Image:** eigene `deps`-Stufe mit `npm ci --omit=dev` (125 MB statt Voll-Installation inkl. vitest, pglite, drizzle-kit, tsx, swc); erwartet ca. 330–360 MB, Ziel < 350 MB knapp. Weitere Hebel falls nötig: `pdf-lib` (22 MB, mehrere Bundle-Varianten), Basis `node:22-slim` gegen `node:22-alpine` (sharp/argon2-Prebuilds für musl prüfen).
- **.dockerignore:** schließt `.claude` (Worktrees), `e2e`, `docs`, `.github`, Build-Reste aus.
- **Gemessen (lokaler Produktionsbuild, gzip, erstes Laden JS):** gemeinsamer Anteil 103 KB; öffentliche Seiten (Impressum, Hilfe, Vereinsseite, Finder, Warteliste) ca. 108 KB (im Budget); eingeloggte App-Routen 236–253 KB (alle 45 über 170 KB, Spitze Feed 253 KB, Verwaltung > Beiträge 251 KB); `.next/static` 2,28 MB (Budget 3,5 MB). Lighthouse nicht gelaufen (kein Chrome-Lauf eingerichtet), stattdessen diese Bundle-Zahlen.
- **Ursache der App-Routen-Größe:** der Chunk `4897` (ca. 100 KB gzip) ist `@vereine/shared` samt Zod als CommonJS-Ausgabe: nicht tree-shakebar, deshalb landet das komplette Schema-Paket im Browser. Größter Einzelhebel (ca. −60 bis −90 KB je App-Route): `packages/shared` zusätzlich als ESM mit `sideEffects: false` bauen und im Web darauf zeigen (Folgeaufgabe, berührt API-Build, deshalb nicht in E1). QR (`qrcode`), Story-Teilen, Befehlspalette, Lightbox, Tag-Auswahl und Neuer Chat werden bereits dynamisch geladen.
- **Code-Hygiene:** `depcheck` für web, api, shared: keine toten Abhängigkeiten (Funde `@tailwindcss/postcss`, `postcss`, `tailwindcss`, `@fontsource-variable/inter` sind Fehlalarme: CSS/Config/Schriftpfad; `@swc/core` ist Peer von `unplugin-swc`). Nichts entfernt.
- **Auf dem Server zu prüfen:** `docker build` aller drei Dateien (api, web), Image-Größen (`docker image ls`), Start der Container samt `smoke.sh`, Migration beim API-Start, Chat-Gateway und Worker (gleiches Image), Bild-Upload (`sharp` unter Linux), PDF-Rechnung.

## Paket F2: ESM-Build von `@vereine/shared` (2026-11-14)
- `packages/shared` baut zusätzlich nach `dist/esm` (`tsconfig.esm.json`, Skript `build` ruft beide `tsc` auf); `package.json` hat eine `exports`-Map (`import` → `dist/esm/index.js`, sonst CJS `dist/index.js`) und `sideEffects` nur für `zod-setup.js`, damit Tree-Shaking greift, aber `z.config({ jitless: true })` (keine eval-Verletzung der CSP) erhalten bleibt. API, tsx, vitest, drizzle-kit und Docker nutzen weiter die CJS-Ausgabe; die Dockerfiles kopieren `packages/shared/dist` und enthalten `dist/esm` damit mit, keine Pfadänderung nötig.
- Gemessen (lokaler Produktionsbuild, gzip, erstes Laden JS), vorher → nachher: App-Routen 236–253 KB → 122–175 KB (Spitze Verwaltung > Beiträge 175 KB, Übersicht 174, Mitglieder 173, Vereinsdaten 171; Feed 170, Chat 164); öffentliche Seiten 108 KB (unverändert, im Budget); `.next/static` 2,28 → 2,06 MB. Noch 4 Routen knapp über 170 KB (Warnung, kein Fehler).
