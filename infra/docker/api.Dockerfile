FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @vereine/api --workspace @vereine/shared --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @vereine/shared && npm run build -w @vereine/api

# Nur Produktionsabhaengigkeiten fuer das Endimage (ohne vitest, pglite, drizzle-kit, tsx, swc, Typen usw.)
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# pglite kommt nur als Peer-Abhaengigkeit von drizzle-orm mit (Tests/dev:pglite) und wird zur Laufzeit nie geladen (26 MB)
RUN npm ci --omit=dev --workspace @vereine/api --workspace @vereine/shared --include-workspace-root \
    && rm -rf node_modules/@electric-sql

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
# (ohne Dev-Abhaengigkeiten ist alles ins Wurzel-node_modules gehoben, apps/api/node_modules entfaellt)
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/api/package.json apps/api/
# Medienverzeichnis (Docker-Volume) gehoert dem unprivilegierten Nutzer
RUN mkdir -p /data/media && chown -R node:node /data
ENV MEDIA_DIR=/data/media
USER node
EXPOSE 4000
CMD ["sh", "-c", "node apps/api/dist/db/migrate.js && node apps/api/dist/main.js"]
