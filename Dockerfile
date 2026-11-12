# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage — install all dependencies and produce the production bundle.
# The base image is digest-pinned so a moved `22-slim` tag cannot silently
# change what ships; Dependabot's docker ecosystem opens PRs for new digests.
# ---------------------------------------------------------------------------
FROM node:22-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS build
WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source and build the client + server bundles.
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage — minimal image with production dependencies only.
# ---------------------------------------------------------------------------
FROM node:22-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Built SPA assets + bundled server entry point.
COPY --from=build /app/dist ./dist

# Never run as root: drop to the unprivileged `node` user (uid/gid 1000) the
# official image already ships, and make the writable state directory (SQLite
# database, backups, generated secrets) owned by it.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

# SQLite database, backups, and persisted secrets live here.
VOLUME ["/app/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.cjs"]
