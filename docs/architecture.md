# Architecture

How the Construction Weather Monitor is structured and why.

## Layers

```
┌───────────────────────────────────────────────────────────────────┐
│ Frontend: React 19 + Vite 6 + Tailwind CSS 4 (lazy-loaded views)   │
│  App.tsx · components/* · services/* (shared engines)              │
└───────────────▲───────────────────────────────────────▲───────────┘
                │ HttpOnly session cookie + CSRF header   │ direct fetch
                │ (server build)                          │ (static/offline)
┌───────────────┴───────────────────────────────────────┴───────────┐
│ API: Express (server.ts)                                          │
│  auth middleware · RBAC · CSRF · rate limits · routes              │
├───────────────────────────────────────────────────────────────────┤
│ Services: monitoringService · alertEngine · riskEngine             │
│           weatherService · emailService · pushService             │
├───────────────────────────────────────────────────────────────────┤
│ Data: src/database/db.ts — SQLite via sql.js (single file)         │
└───────────────────────────────────────────────────────────────────┘
        │                         │                    │
   WeatherAPI              Open-Meteo             SMTP gateway
   (primary, optional)     (cross-ref/fallback)   (optional)
```

## Backend

- **`server.ts`** builds the Express app (`createApp`) separately from listening
  (`startServer`) so tests can run the HTTP surface in-process.
- Middleware order: security headers → request logging → JSON body parse →
  cookie parser → API rate limiter → CSRF (for cookie mutations) → routes.
- Auth resolves a session from an HttpOnly cookie, `x-session-token`, or a
  `Bearer` token. Sessions are held in memory and mirrored to SQLite, so logins
  survive restarts; they are revalidated against the account on load and on
  every account change.
- RBAC is a single `requireRole(...)` middleware; OWNER satisfies every gate.

## Domain / services

- **`riskEngine.ts`** — deterministic, rule-based scoring. Pure function of
  current conditions, the next-6-hours forecast, thresholds and timezone. No
  randomness, so identical inputs always produce identical output.
- **`alertEngine.ts`** — turns risk conditions into alert candidates, dedupes
  against active alerts, escalates severity, applies a per-location cooldown,
  and marks cleared alerts.
- **`weatherService.ts`** — provider fetch and normalisation. WeatherAPI codes
  are mapped to WMO codes; Open-Meteo wall-clock times are converted to UTC
  instants. Cross-reference scoring produces concordance and confidence.
- **`monitoringService.ts`** — the polling loop; per-location try/catch, run
  records, retention, and recovery auditing.
- **`emailService.ts` / `pushService.ts`** — delivery channels with retry queue
  and per-user preferences.

## Data model (SQLite via sql.js)

Key tables: `settings`, `locations`, `weather_observations`,
`forecast_snapshots`, `risk_assessments`, `alerts`, `alert_deliveries`,
`monitor_runs`, `audit_log`, `users`, `sessions`, `push_subscriptions`,
`push_preferences`, `data_retention_log`, plus `schema_migrations`. Migrations
are versioned and applied in order on startup.

## Frontend

- `App.tsx` owns auth state, the active tab, location selection and the polling
  loop. Dashboard data loads through `apiFetch`; if the API is unreachable it
  falls back to a direct Open-Meteo query and labels the data accordingly.
- Heavy views (forecast, history, reports, settings, users, map, performance) are
  code-split with `lazyNamed` and rendered under `Suspense`.
- The UI mirrors server permissions rather than defining its own policy.

## Static build

`npm run build:static` sets `VITE_APP_MODE=static`, swapping the API layer for an
in-browser backend (`src/static/*`) that uses IndexedDB for persistence,
Open-Meteo for weather, the shared engines for risk/alerts, native
notifications, and an optional Cloudflare Worker email relay.

## Verification boundary

All heavy commands run in GitHub Actions (`.github/workflows/ci.yml`): install,
type-check, tests, production build, static build, and Docker build. The
development machine only edits files and runs read-only git commands.
