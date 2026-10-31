# Vereine 2.0 – Projektleitfaden für Claude

DSGVO-konforme Social-Media-Plattform für Vereine, Mitglieder und Fans (Betreiber: UG/GmbH, Hosting: Hetzner DE).
Konzept/Plan: `~/.claude/plans/starry-brewing-lollipop.md`. Sprache der UI und Doku: **Deutsch** (Du-Form).

## Aufbau (npm Workspaces + Turborepo)
- `apps/web` – Next.js 15 (App Router, Tailwind v4)
- `apps/api` – NestJS 11 auf Fastify, Drizzle ORM (PostgreSQL), argon2id, Cookie-Sessions
- `packages/shared` – Zod-Schemas/Typen, von Web und API genutzt (nach Änderung `npm run build -w @vereine/shared`)
- `infra/` – Terraform (Hetzner), Ansible, Docker/Compose (`infra/deploy/docker-compose.preview.yml`)

## Befehle
- `npm run typecheck` · `npm run build` · `npm test` (API-Tests nutzen PGlite, kein Docker nötig)
- Lokal ohne Docker: `npm run dev:pglite -w @vereine/api` (API mit In-Memory-DB) + `npm run dev -w @vereine/web`; tsx erzeugt keine Decorator-Metadaten, daher immer `@Inject(Klasse)` im Konstruktor nutzen
- DB: `npm run db:generate -w @vereine/api` (Migration erzeugen), `npm run db:migrate -w @vereine/api`
- Module (apps/api/src): auth, privacy, orgs, posts (+Moderation), notifications, events (Termine/Teams), cache (Redis)
- Profile/Medien/Feed v2: siehe docs/ARCHITEKTUR.md. Bilder nur über MediaService (Typ am Inhalt, EXIF entfernt, Sichtbarkeit via ProfileAccess); Autoren-Profile über ProfileAccess.ensureMany.
- Plattform-Moderation: Rolle `identity.users.platform_role` nur per CLI (`set-platform-admin`), Guard `PlatformAdminGuard`, Zugriffe auf Chat-Klartext über `AuditService` protokollieren.
- Chat: Schema `chat` (keine FK auf andere Bereiche), Inhalte AES-256-GCM (`CHAT_MASTER_KEYS`), WebSocket-Gateway `src/chat-gateway.ts` (Container `chat-gateway`, ohne Schlüssel). Master-Schlüssel nie loggen/committen.
- Jobs: BullMQ-Worker (src/worker.ts, Container `worker`), Queue-Redis `QUEUE_REDIS_URL` (noeviction); neue Hintergrundarbeit als Job definieren (`JobsService.define/every/enqueue`). Social-Module lesen Nutzerdaten nur über `UsersDirectory` (Test `boundaries.spec.ts`).
- Redis: `REDIS_URL` (Rate-Limit + Session-Cache); ohne Redis Prozess-Cache. Tests nutzen `ioredis-mock`.
- Turbo-Telemetrie aus: `DO_NOT_TRACK=1`

## Architektur
- Ein Server zuerst, Trennung per Container/Schema vorbereitet: siehe `docs/ARCHITEKTUR.md` (Bereiche identity/social/chat/billing, eigene DB-Rolle je Bereich, keine Cross-Schema-Zugriffe, Secrets je Dienst).

## Regeln
- **Datenschutz zuerst**: keine Drittanbieter-Requests im Frontend (keine CDNs, Google Fonts, Tracker); Daten minimieren; Einwilligungen append-only in `consents`.
- Keine Geheimnisse einchecken (`.env*`, `*.tfvars`, `inventory.ini` sind ignoriert). Passwörter/Tokens nie in den Chat.
- API-Eingaben immer mit Zod aus `packages/shared` validieren; Auth-Fehler generisch halten.
- Schema-Änderungen nur per Drizzle-Migration; neue Endpunkte brauchen Tests in `apps/api/src/**/*.spec.ts`.
- Frontend: Seiten sind bewusst Konzept-Shells mit Mock-Daten (`apps/web/lib/mock.ts`), die schrittweise an echte Funktionen/Dienste angebunden werden.
- Vorschau-Server (Hetzner, nur HTTP, Testdaten): Deploy per `tar` über SSH nach `/opt/vereine`, siehe `infra/README.md`. Kein Commit/Push ohne Auftrag.
