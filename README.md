# Vereine 2.0

DSGVO-konforme Social-Media-Plattform für Vereine, Mitglieder und Fans (Hetzner, Deutschland).
Konzept: siehe Plan-Datei `~/.claude/plans/starry-brewing-lollipop.md`.

## Struktur
- `apps/web` – Next.js Frontend
- `apps/api` – NestJS/Fastify API
- `packages/shared` – gemeinsame Zod-Schemas und Typen
- `infra/` – Terraform/Ansible für Hetzner (folgt)

## Entwicklung
```bash
cp .env.example .env
docker compose up -d   # Postgres (pgvector), Redis, Meilisearch
npm install
npm run dev
```
Web: http://localhost:3000 · API-Health: http://localhost:4000/health
