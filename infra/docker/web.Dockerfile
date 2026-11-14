FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @vereine/web --workspace @vereine/shared --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# Oeffentliche Firmendaten (Impressum usw.) werden beim Build eingebettet, siehe apps/web/lib/legal-config.ts
ARG NEXT_PUBLIC_ALLOW_INDEXING
ARG NEXT_PUBLIC_LEGAL_COMPANY
ARG NEXT_PUBLIC_LEGAL_FORM
ARG NEXT_PUBLIC_LEGAL_STREET
ARG NEXT_PUBLIC_LEGAL_POSTAL_CITY
ARG NEXT_PUBLIC_LEGAL_COUNTRY
ARG NEXT_PUBLIC_LEGAL_REPRESENTATIVES
ARG NEXT_PUBLIC_LEGAL_REGISTER
ARG NEXT_PUBLIC_LEGAL_VAT_ID
ARG NEXT_PUBLIC_LEGAL_EMAIL
ARG NEXT_PUBLIC_LEGAL_PHONE
ARG NEXT_PUBLIC_LEGAL_DPO
ARG NEXT_PUBLIC_LEGAL_DSA_EMAIL
ARG NEXT_PUBLIC_LEGAL_AUTHORITY
RUN npm run build -w @vereine/shared && npm run build -w @vereine/web

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/apps/web apps/web
USER node
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["npx", "next", "start", "-p", "3000"]
