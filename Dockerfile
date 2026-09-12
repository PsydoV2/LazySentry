# syntax=docker/dockerfile:1

# Pinned scanner binaries (docs/CONCEPT.md 3.2) — exact tags, never `latest`:
# both tools' JSON output has changed across releases, and an unpinned image
# would silently break parsing on a rebuild months from now. Keep these in
# sync with SCANNER_VERSIONS in apps/api/src/scanner/versions.ts.
FROM ghcr.io/google/osv-scanner:v2.5.1 AS osv-scanner
FROM ghcr.io/trufflesecurity/trufflehog:3.97.4 AS trufflehog

# -----------------------------------------------------------------------------
# Build stage — compiles all three workspace packages, then uses
# `pnpm deploy` to turn the api app's workspace:* dependency on
# @lazysentry/shared into a real, self-contained node_modules (no symlinks
# back into the monorepo, which the runtime stage would not have).
# -----------------------------------------------------------------------------
FROM node:22-alpine AS build

# better-sqlite3 and argon2 compile a native addon on install; Alpine (musl)
# ships no prebuilt binary for either, so a toolchain is required here.
RUN apk add --no-cache python3 make g++
# Pinned directly (not via corepack + package.json's packageManager field) so
# the build doesn't depend on pnpm's own package-manager-self-install feature
# rewriting the lockfile.
RUN npm install -g pnpm@12.3.4

WORKDIR /repo

# Manifests first so `pnpm install` stays cached across builds that only
# change application source.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @lazysentry/shared build \
 && pnpm --filter @lazysentry/api build \
 && pnpm --filter @lazysentry/web build

# Self-contained, production-only copy of the api app. Must run after the
# build above — it packages whatever is currently on disk, dist included.
RUN pnpm --filter @lazysentry/api deploy --prod /out/api

# -----------------------------------------------------------------------------
# Runtime stage
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runtime

# git: the worker clones scanned repositories — needs the real binary, not a
# JS reimplementation (docs/CONCEPT.md 0.3).
# tini: becomes PID 1 so SIGTERM/SIGINT reach node correctly and orphaned
# git/scanner child processes get reaped; both entrypoints already handle
# the signals themselves (graceful shutdown), tini just delivers them.
RUN apk add --no-cache git tini

COPY --from=osv-scanner /osv-scanner /usr/local/bin/osv-scanner
COPY --from=trufflehog /usr/bin/trufflehog /usr/local/bin/trufflehog

WORKDIR /app
COPY --from=build --chown=node:node /out/api ./api
COPY --from=build --chown=node:node /repo/apps/web/dist ./web/dist

# The database volume — created and owned by the `node` user up front since
# both services run as non-root (docs/CONCEPT.md 6.2) and read_only
# containers (docker-compose.yml) cannot create it themselves at runtime.
RUN mkdir -p /data && chown node:node /data
VOLUME /data

ENV NODE_ENV=production \
    DATABASE_PATH=/data/lazysentry.db \
    HOST=0.0.0.0 \
    PORT=3000

WORKDIR /app/api
USER node
EXPOSE 3000

ENTRYPOINT ["tini", "--"]
# The worker service overrides this to `node dist/worker.js`
# (docker-compose.yml) — same image, same non-root user, different process.
CMD ["node", "dist/api.js"]
