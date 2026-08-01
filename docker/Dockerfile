# syntax=docker/dockerfile:1

# Ledgerly production image
# Build-time: dummy DATABASE_URL (Prisma generate + Next build tanpa hit Neon)
# Runtime: DATABASE_URL asli dari .env / compose → entrypoint prisma migrate deploy

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma schema requires env("DATABASE_URL") at generate/build.
# Real Neon URL is injected only at runtime (see entrypoint).
ARG DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
ENV DATABASE_URL=$DATABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PRIVATE_STANDALONE=false

RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/ecosystem.config.cjs ./
COPY docker/entrypoint.sh /entrypoint.sh
RUN mkdir -p /app/logs /app/.next/cache \
  && chown -R node:node /app \
  && chmod +x /entrypoint.sh

EXPOSE 3000
USER node
ENTRYPOINT ["/entrypoint.sh"]
