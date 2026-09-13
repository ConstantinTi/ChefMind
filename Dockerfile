# syntax=docker/dockerfile:1

# better-sqlite3 and sharp are native modules: the builder and the runner must
# share a Node major version, or the compiled .node file will not load.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    CHEFMIND_DB_PATH=/data/chefmind.db \
    CHEFMIND_UPLOAD_DIR=/data/uploads

# tini: signal handling and zombie reaping. gosu: drop root after fixing volume
# ownership. sqlite3: used by the nightly backup sidecar.
RUN apt-get update && apt-get install -y --no-install-recommends tini gosu sqlite3 \
 && rm -rf /var/lib/apt/lists/*

# next build --output standalone emits a self-contained server plus a pruned
# node_modules, so the runtime image stays small.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Migrations run from the entrypoint, so both the SQL and the runner script ship.
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/migrate.mjs ./scripts/migrate.mjs
# next build traces better-sqlite3 (including its prebuilt .node) into the
# standalone output, but NOT drizzle-orm — that gets bundled into the server
# chunks. scripts/migrate.mjs runs outside Next and imports it directly, so it
# has to be copied in explicitly or the entrypoint dies before the server starts.
COPY --from=builder /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

COPY --from=builder /app/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# The data volume holds the database and the photos, and must outlive the image.
# Ownership is fixed at startup by the entrypoint, which then drops to `node` —
# doing it here is not enough, because a mounted volume replaces this directory.
RUN mkdir -p /data/uploads && chown -R node:node /data /app \
 && chmod +x /usr/local/bin/docker-entrypoint.sh
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini reaps zombies and forwards signals, so docker stop is actually graceful.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
# Migrations run to completion BEFORE the server listens. Running them from a
# route handler would mean concurrent requests racing on one SQLite file.
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
