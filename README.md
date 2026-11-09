# Vereine 2.0 (Klubnest)

DSGVO-konforme Social-Media-Plattform für Vereine, Mitglieder und Fans (Hetzner, Deutschland).
Konzept: siehe Plan-Datei `~/.claude/plans/starry-brewing-lollipop.md`, Architektur: `docs/ARCHITEKTUR.md`.

## Struktur
- `apps/web` – Next.js Frontend
- `apps/api` – NestJS/Fastify API
- `packages/shared` – gemeinsame Zod-Schemas und Typen
- `e2e` – Playwright-E2E-Tests
- `infra/` – Terraform/Ansible/Docker für Hetzner (Vorschau: https://klubnest.de)

## Entwicklung
```bash
npm install
npm run build -w @vereine/shared
npm run dev:pglite -w @vereine/api   # API mit In-Memory-DB, ohne Docker
npm run dev -w @vereine/web
```
Mit Docker statt PGlite: `cp .env.example .env`, `docker compose up -d`, `npm run dev`.
Web: http://localhost:3000 · API-Health: http://localhost:4000/health

## Tests
```bash
npm run typecheck && npm test                     # Unit/Integration (API auf PGlite)
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test -w @vereine/api   # gegen echtes Postgres
npx playwright install chromium && npm run e2e    # E2E (startet API + Web selbst)
```
