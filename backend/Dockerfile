# syntax=docker/dockerfile:1
#
# Three stages, not two, because two dependency sets have genuinely different
# needs: `node-pg-migrate` is a devDependency (package.json) since the
# *running* API process never touches it — only a one-off "run the
# migrations" step does. Baking it into the image that stays up and serves
# traffic would be shipping tooling nothing at runtime uses. `migrator` and
# `runner` are built from the same source but never share a dependency
# install, so the image that actually serves traffic never needs the dev
# tooling stage.
#
# `migrator` is meant to be run once per deploy (`docker compose --profile
# full run --rm migrate`, or the equivalent one-off command on a real
# platform), not left running — see docker-compose.yml's `migrate` service.

# ---- migrator: `npm run migrate:up` against $DATABASE_URL, nothing else ----
FROM node:20-alpine AS migrator
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY migrations ./migrations
CMD ["npm", "run", "migrate:up"]

# ---- prod-deps: production-only node_modules for the runtime image ----
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runner: the actual API process ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Runs as a non-root user — the image's default is root, and this process
# has no reason to be able to write anywhere in its own container beyond
# what npm ci already wrote as root during the build.
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
# Read by api/routes/docs.routes.js at startup to serve GET /docs and
# GET /openapi — not part of src/, so it needs its own explicit COPY.
COPY openapi.yaml ./openapi.yaml
# config/redis.js reads scripts/rateLimit.lua at startup (registers it as a
# Redis command) — missing this crashed the container on boot with ENOENT,
# caught directly running the containerised stack for the first time.
COPY scripts ./scripts
USER nodejs
EXPOSE 4500
# 127.0.0.1, not localhost — see frontend/Dockerfile's identical note; the
# frontend container hit this for real (wget resolving ::1 first against an
# IPv4-only listener), so pinned this one too rather than relying on Node's
# dual-stack default bind behaving the same way in every environment.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4500/healthz || exit 1
CMD ["node", "src/server.js"]
