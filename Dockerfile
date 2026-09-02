# --- Build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Platzhalter, damit der Build nicht an fehlender DB scheitert (Seiten sind dynamisch)
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
RUN npm run build

# --- Runtime ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY next.config.ts tsconfig.json ./
COPY drizzle ./drizzle
COPY src/db ./src/db
EXPOSE 3000
# Beim Start: Migrationen anwenden, Erstdaten anlegen (idempotent), App starten
CMD ["sh", "-c", "npx tsx src/db/migrate.ts && npx tsx src/db/seed.ts && npx next start -p 3000"]
