# Vereine 2.0 – Projektleitfaden für Claude

DSGVO-konforme Social-Media-Plattform für Vereine, Mitglieder und Fans (Betreiber: UG/GmbH, Hosting: Hetzner DE).
Konzept/Plan: `~/.claude/plans/starry-brewing-lollipop.md`. Sprache der UI und Doku: **Deutsch** (Du-Form).

## Aufbau (npm Workspaces + Turborepo)
- `apps/web` – Next.js 15 (App Router, Tailwind v4)
- `apps/api` – NestJS 11 auf Fastify, Drizzle ORM (PostgreSQL), argon2id, Cookie-Sessions
- `packages/shared` – Zod-Schemas/Typen, von Web und API genutzt (nach Änderung `npm run build -w @vereine/shared`)
- `infra/` – Terraform (Hetzner), Ansible, Docker/Compose (`infra/deploy/docker-compose.preview.yml`)
- `e2e/` – Playwright-E2E (`@vereine/e2e`), CI-Jobs in `.github/workflows/ci.yml`: build, api-postgres, e2e

## Befehle
- `npm run typecheck` · `npm run build` · `npm test` (API-Tests nutzen PGlite, kein Docker nötig; Test-DB immer über `createTestDb()` aus `apps/api/src/testing/test-db.ts`)
- API-Tests gegen echtes Postgres: `TEST_DATABASE_URL=postgres://…/postgres npm test -w @vereine/api` (je Spec frische DB `vt_…` mit Migrationen, Aufräumen per `vitest.global-setup.ts`; CI-Job `api-postgres` mit postgres:16)
- E2E: `npm run e2e` (Playwright, Paket `e2e/`, nur Chromium: einmalig `npx playwright install chromium`; startet API mit PGlite + Web-Produktions-Build, Projekte desktop/mobil, axe ohne serious/critical, Fremd-Host-Wächter). `E2E_SKIP_BUILD=1` nutzt vorhandenen Build, `E2E_WEB_DEV=1` next dev; laufende Server auf 3000/4000 werden wiederverwendet
- Lokal ohne Docker: `npm run dev:pglite -w @vereine/api` (API mit In-Memory-DB) + `npm run dev -w @vereine/web`; tsx erzeugt keine Decorator-Metadaten, daher immer `@Inject(Klasse)` im Konstruktor nutzen
- DB: `npm run db:generate -w @vereine/api` (Migration erzeugen), `npm run db:migrate -w @vereine/api`
- Tests laufen auf PGlite, Produktion auf postgres-js: in freien `sql\`…\``-Ausdrücken keine JS-`Date`-Werte interpolieren (dort `now()` bzw. ISO-String mit `::timestamptz`), sonst scheitert die Abfrage erst auf dem Server (statischer Check `src/db/sql-date.spec.ts` prüft das per TypeScript-Typ)
- Module (apps/api/src): auth, privacy, orgs, posts (+Moderation), notifications, events (Termine/Teams), cache (Redis), mail (Treiber log/smtp über `MAIL_DRIVER`, Job `mail.send`, Vorlagen in `mail.templates.ts`, Versand nur über `MailService.send` mit Kostenbremse `mail-limits.ts` und Sperrliste (Schema `mail`), Treiber `memory` im dev:pglite-Server mit `GET /api/__dev/mails`; Auth-Mail-Flows in `auth/email-flows.service.ts`, Sammelmail `notifications/digest.service.ts`), billing (Rechnungen Verein → Mitglied; Schema `billing`, nur eigene Tabellen), members (Stammdaten, Beitragsklassen; Schema `members`, nur eigene Tabellen), dashboard (Kennzahlen über Dienste), metrics (/metrics, nur mit Token), public (öffentlicher Bereich ohne Login: Vereinsseite/Finder, Rate-Limit je IP über X-Real-IP von Caddy, Redis-Cache 60 s, keine Personendaten); ProfileAccessModule (profiles/) gemeinsam für Chat/Profile; auth enthält Zwei-Faktor (TOTP), notifications enthält Web-Push, orgs enthält Einladungen/Stammdaten, events enthält Serien und Kalender-Abo
- Profile/Medien/Feed v2: siehe docs/ARCHITEKTUR.md. Bilder nur über MediaService (Typ am Inhalt, EXIF entfernt, Sichtbarkeit via ProfileAccess); Autoren-Profile über ProfileAccess.ensureMany.
- Löschfristen: täglicher Job `privacy.retention` ruft `purgeExpired` der Bereichsdienste auf (Fristen in `common/retention.ts`: Benachrichtigungen 180 T., gelöschte Beiträge 30 T., Audit 12/24 Mon./10 J., Anwesenheit 24 Mon., Einladungen 30 T.). Neue personenbezogene Tabellen bekommen im eigenen Dienst `exportFor`/`eraseUser`/ggf. `purgeExpired` (privacy-Allowlist in `boundaries.spec.ts` nicht erweitern); Benachrichtigungen mit fremdem Namen mit `notify(..., { actorId })` und Export-Feldern in `EXPORT_KEYS`.
- Plattform-Moderation: Rolle `identity.users.platform_role` nur per CLI (`set-platform-admin`), Guard `PlatformAdminGuard`, Zugriffe auf Chat-Klartext über `AuditService` protokollieren.
- Chat: Schema `chat` (keine FK auf andere Bereiche), Inhalte AES-256-GCM (`CHAT_MASTER_KEYS`), WebSocket-Gateway `src/chat-gateway.ts` (Container `chat-gateway`, ohne Schlüssel). Master-Schlüssel nie loggen/committen.
- Jobs: BullMQ-Worker (src/worker.ts, Container `worker`), Queue-Redis `QUEUE_REDIS_URL` (noeviction); neue Hintergrundarbeit als Job definieren (`JobsService.define/every/enqueue`). Social-Module lesen Nutzerdaten nur über `UsersDirectory` (Test `boundaries.spec.ts`).
- Redis: `REDIS_URL` (Rate-Limit + Session-Cache); ohne Redis Prozess-Cache. Tests nutzen `ioredis-mock`.
- Turbo-Telemetrie aus: `DO_NOT_TRACK=1`

## Architektur
- Ein Server zuerst, Trennung per Container/Schema vorbereitet: siehe `docs/ARCHITEKTUR.md` (Bereiche identity/social/chat/billing, eigene DB-Rolle je Bereich, keine Cross-Schema-Zugriffe, Secrets je Dienst).

## Regeln
- **Datenschutz-Merker:** Jede Etappe mit neuen personenbezogenen Daten trägt Verarbeitung, Rechtsgrundlage, Frist und Austritts-/Löschverhalten in `docs/DATENSCHUTZ-LAUNCH.md` ein (Abschnitt 2/4/5) und offene Rechtsfragen zusätzlich in `docs/OFFENE-PUNKTE.md`.
- **Datenschutz zuerst**: keine Drittanbieter-Requests im Frontend (keine CDNs, Google Fonts, Tracker); Daten minimieren; Einwilligungen append-only in `consents`.
- Keine Geheimnisse einchecken (`.env*`, `*.tfvars`, `inventory.ini` sind ignoriert). Passwörter/Tokens nie in den Chat.
- API-Eingaben immer mit Zod aus `packages/shared` validieren; Auth-Fehler generisch halten.
- Schema-Änderungen nur per Drizzle-Migration; neue Endpunkte brauchen Tests in `apps/api/src/**/*.spec.ts`.
- Frontend: keine Mock-Daten mehr; nicht gebaute Funktionen (z. B. Spenden) zeigen nur „Kommt später“. Bausteine: `components/ui.tsx` (ohne Hooks, auch für Server-Komponenten), `components/ui-client.tsx` (Dialog, DropdownMenu, SegmentedControl, CopyField, useEscapeLayer), `lib/use-media-query.ts` (useIsDesktop), `lib/shell.tsx` (useImmersive für Vollbild am Handy), Utility `hit-area` (Touch-Ziele) und `stackTable`/`CellLabel` (Tabellen als Karten am Handy), Datenladen über `lib/use-api.ts` (`useApi`, `useBusy`), Rückfragen/Hinweise über `ask()`/`toast` (`components/ui-hosts.tsx`). Web-Tests: `npm test -w @vereine/web` (vitest + jsdom).
- Vorschau-Server (Hetzner, HTTPS auf klubnest.de via Caddy, Testdaten): Deploy per `tar` über SSH nach `/opt/vereine`, siehe `infra/README.md`. Kein Commit/Push ohne Auftrag.
