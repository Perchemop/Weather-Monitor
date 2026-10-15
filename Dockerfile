# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage — install all dependencies and produce the production bundle.
# ---------------------------------------------------------------------------
FROM node:22-slim AS build
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
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Built SPA assets + bundled server entry point.
COPY --from=build /app/dist ./dist

# SQLite database, backups, and persisted secrets live here.
VOLUME ["/app/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.cjs"]
