# Construction Weather Monitor

Autonomous, local-first microclimate risk evaluation and automated safety alerting system for construction sites, crane operations, and elevated structural works.

---

## Key Highlights

- **Deterministic Safety Engine (AS 2550.1)**: Rule-based calculations evaluate sustained winds, peak gusts, rainfall rate, lightning proximity, thermal stress, and solar UV against strict SWMS envelopes.
- **Dual-Provider Atmospheric Cross-Reference**: Real-time concordance scoring comparing WeatherAPI (primary reference) with Open-Meteo (independent physical model).
- **Private Local Enclave (SQLite / sql.js)**: Runs entirely on-premise or in private containers. Zero telemetry, zero analytics, zero external tracking.
- **Role-Based Access Control**: Owner / Manager / Viewer roles with least-privilege route gating, per-account Scrypt credentials, and last-owner protections.
- **Hardened Authentication**: Cookie-only sessions (no tokens in `localStorage`), CSRF double-submit protection, per-account login lockout, a configurable password policy, optional TOTP two-factor authentication for every account, and self-service **active session management** (review and revoke individual signed-in devices).
- **Installable, Offline-Capable & Push-Enabled (PWA)**: A service worker precaches the app shell, caches read-only API responses, and delivers Web Push safety alerts to subscribed devices even when the app is closed.
- **Master Security & Scrypt Hashing**: Password-protected access with RFC 7914 Scrypt memory-hard key derivation.
- **Automated Retention & Snapshot Rotation**: 30-minute automated database backups with 10-point rolling history, 24-hour retention pruning with a configurable observation window, and one-click restore-from-backup.
- **Per-User Push Preferences**: Each operator controls their own Web Push delivery — a master switch, a minimum alert severity floor, and an opt-in for recovery (all-clear) notifications — without unsubscribing their devices.
- **Serverless Static Build (GitHub Pages)**: The same UI can be built with `npm run build:static` to run entirely in the browser — no server, no database. Weather comes straight from Open-Meteo, risk/alerts use the shared deterministic engine, state persists in IndexedDB, and alerts use native browser notifications. Monitoring keeps running while the page is open and catches up when the tab regains focus or the network returns.
- **Activity Risk Matrix & Weekly Performance**: The construction activity risk matrix lives in its own tab (condensed to a summary link on the dashboard), and a rolling 7-day performance summary — monitoring coverage, monitor-run reliability, observed condition extremes and an alert breakdown — is available on-screen and exportable as text.
- **Operational Delivery**: Structured JSON logging, an unauthenticated `/healthz` liveness probe, an auth-or-token-gated Prometheus `/metrics` endpoint, GitHub Actions CI, and a Dockerfile + Compose stack.

---

## Architecture Overview

```
[ Frontend: React 19 + Tailwind CSS 4 + Vite (lazy-loaded views) ]
                   │
                   ▼ (HttpOnly session cookie + CSRF token)
[ Express API Gateway (server.ts) ]
   ├── Auth Middleware (Scrypt Verification + Role Gates + TOTP MFA)
   ├── Monitoring Service (Autonomous Polling Cycle)
   ├── Risk & Alert Engine (Deterministic Decision Logic)
   ├── Web Push Service (VAPID device notifications)
   └── Storage Engine (SQLite via sql.js with Snapshots)
         │
         ├── WeatherAPI (Primary Reference)
         ├── Open-Meteo (Cross-Reference & Offline Fallback)
         └── SMTP Gateway (Automated Site Alert Dispatches)
```

---

## Roles & Access Control

Access is enforced on the server for every route; the UI simply mirrors the
same policy by hiding tabs an operator cannot use.

| Capability | Viewer | Manager | Owner |
| --- | :---: | :---: | :---: |
| View dashboard, forecast, history, reports, alerts | ✅ | ✅ | ✅ |
| Run manual checks, dismiss alerts, manage locations | — | ✅ | ✅ |
| System health diagnostics | — | ✅ | ✅ |
| Settings, safety thresholds, email gateway | — | — | ✅ |
| User & role management, data purge, backups | — | — | ✅ |

- Accounts are stored per-user in SQLite with individual Scrypt-hashed passwords.
- The **last active Owner** cannot be demoted, deactivated, or deleted.
- Owners may reset any operator's password; operators may change their own.
- Existing single-user installations are migrated automatically: the legacy
  `auth_owner` record becomes the first `OWNER` account on first boot. The
  legacy table is retired (dropped) once migrated.
- Any account may enable **TOTP two-factor authentication** from Settings →
  Security & Auth; when enabled, sign-in requires a 6-digit authenticator code.

---

## Environment Configuration

Configure credentials in `.env` (refer to `.env.example`):

```env
# Optional WeatherAPI Key (auto-falls back to Open-Meteo if omitted)
WEATHER_API_KEY=

# Optional SMTP Gateway for Automated Alert Dispatches
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="Weather Alert <alerts@site.local>"
OWNER_EMAIL=supervisor@site.local

# Session cookie signing secret. If omitted, a secret is generated once and
# persisted to data/session-secret so sessions survive restarts.
SESSION_SECRET=

# Emit HSTS headers; enable only when served over HTTPS
ENABLE_HSTS=false

# Mark cookies Secure; enable only when served over HTTPS
SECURE_COOKIES=false

# Failed-login lockout and password policy
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15
PASSWORD_MIN_LENGTH=10

# Optional VAPID keys for Web Push. If omitted, a key pair is generated once
# and persisted to data/vapid.json.
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:owner@localhost

# Logging (debug | info | warn | error) and format (json | pretty)
LOG_LEVEL=info
LOG_FORMAT=json

# Optional shared token for scraping Prometheus metrics. When set, GET /metrics
# accepts `Authorization: Bearer <token>` (or `?token=<token>`) for scrapers;
# otherwise the endpoint requires an authenticated session.
METRICS_TOKEN=

# Privacy mode: skip the third-party WeatherAPI and use Open-Meteo only
LOCAL_ONLY=false
```

---

## Security Hardening

- **Security Headers**: Every response carries a strict `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, cross-origin isolation headers, and a restrictive `Permissions-Policy`. `X-Powered-By` fingerprinting is removed. HSTS is opt-in via `ENABLE_HSTS=true`.
- **Cookie-only Sessions**: The session lives solely in an `HttpOnly` cookie — no token is ever written to `localStorage`, so script injection cannot exfiltrate it. Set `SECURE_COOKIES=true` when serving over HTTPS.
- **Active Session Management**: Each account can review every signed-in device (derived browser/OS label, IP, last-active time) and revoke individual sessions or all sessions at once. Sessions are keyed by a non-reversible digest, so the bearer token is never exposed — even to its owner.
- **CSRF Protection**: Cookie-authenticated state changes must echo the readable `cwm_csrf` cookie in the `x-csrf-token` header (double-submit pattern). Token-header clients are exempt.
- **Rate Limiting**: Authentication endpoints (`/api/auth/login`, `/api/auth/setup`) are limited to 10 attempts per 15 minutes per client IP, and the broader `/api` surface to 300 requests per minute. Both limits are tunable via `AUTH_RATE_LIMIT_MAX` and `API_RATE_LIMIT_MAX`. Limited responses return HTTP `429` with `RateLimit-*` headers.
- **Account Lockout**: After `LOGIN_MAX_ATTEMPTS` failed attempts, an account is locked for `LOGIN_LOCKOUT_MINUTES` minutes.
- **Password Policy**: Passwords must meet `PASSWORD_MIN_LENGTH` (default 10) and contain a letter and a number.
- **Two-Factor Authentication**: Optional RFC 6238 TOTP for any account, verifiable with Google Authenticator, Authy, or 1Password.
- **Body Size Cap**: JSON request bodies are capped at 1 MB.

---

## Offline Mode, Installation & Push

The app is an installable Progressive Web App (`public/manifest.webmanifest` +
`public/sw.js`):

- **Installable**: use the browser's "Install" action to add it as a standalone
  desktop/mobile app. Theme colour, icons, and display mode are declared in the manifest.
- **Offline shell**: the service worker precaches the HTML shell, manifest, and
  icons so the app opens even with no network.
- **Cached conditions**: read-only API `GET`s are network-first with a cached
  fallback, so the last known risk/weather snapshot remains visible offline. An
  amber "Offline mode" banner appears whenever connectivity is lost.
- **Web Push alerts**: enable device notifications in Settings → Security & Auth
  to receive HIGH/CRITICAL safety alerts even when the tab is closed. VAPID keys
  are generated and persisted automatically on first boot. Each operator can tune
  their own delivery in the same panel: a master switch, a minimum alert severity,
  and an opt-in for recovery (all-clear) notifications.
- **Never cached**: authentication, user management, and backup endpoints always
  hit the live server (no stale or cross-session data is ever served).
- The service worker registers in **production builds only**, so it never
  interferes with Vite HMR during development.

---

## Serverless Static Build (GitHub Pages)

The monitor can also run with **no backend at all**, as a static site hosted on
GitHub Pages. The browser performs the work the Express server would otherwise do.

```bash
npm run build:static        # emits dist-static/
```

- **Weather source**: Open-Meteo is called directly from the browser (geocoding +
  forecast); no WeatherAPI key is required.
- **Risk & alerts**: the same deterministic AS 2550.1 risk engine and alert logic
  are reused, running client-side.
- **Storage**: state (locations, observations, forecasts, alerts, settings) is
  persisted in **IndexedDB** (with a `localStorage` fallback). No server, no
  SQLite, no telemetry.
- **Alerts**: delivered via the browser **Notification API** — opt in under
  Settings → Cycle & Alerts. Notifications fire only while the page/tab is open
  (a background server is what enables closed-tab push in the server build).
- **API shim**: a `window.fetch` interceptor serves the existing `/api/*` contract
  from the in-browser backend, so the UI is shared verbatim with the server build.
- **Graceful degradation**: server-only features (multi-user, roles, MFA, SMTP
  email, Web Push fan-out, server backups, the AI briefing) are hidden or return
  explicit non-fatal responses. The AI briefing card is shown as
  **Deterministic Rules** and produces rule-based output, not model output.
- **Backup**: Settings → Storage exports the full local state as JSON.

### Deploying to GitHub Pages

`.github/workflows/pages.yml` builds the static variant and publishes it. To use it:

1. Push the repository to GitHub (the workflow files require the `workflow` token
   scope — run `gh auth refresh -s workflow` if pushing as a CLI OAuth app).
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. The correct project base path (`/<repo>/`) is computed automatically; a
   user/org root site (`<owner>.github.io`) uses `/`.

For a manual/local preview of the project-page layout:

```bash
VITE_APP_MODE=static VITE_BASE=/Weather-Monitor/ npx vite build
npx vite preview --outDir dist-static --base /Weather-Monitor/
```

---

## Operations & Deployment

- **Structured logging**: JSON lines by default (set `LOG_FORMAT=pretty` for local
  readability, `LOG_LEVEL` to tune verbosity). Every request is logged with method,
  path, status, and latency.
- **Liveness probe**: unauthenticated `GET /healthz` for container orchestrators.
- **Prometheus metrics**: `GET /metrics` exposes uptime, memory, monitoring-loop
  state, and counts for locations, observations, alerts, sessions, users, push
  subscriptions, and monitor runs by status. Access requires an authenticated
  session by default, or a shared `METRICS_TOKEN` bearer for scrapers.
- **Container image**: `docker build -t construction-weather-monitor .` or
  `docker compose up --build` (persists state in `./data`).
- **CI**: `.github/workflows/ci.yml` type-checks, runs the test suite, builds both
  the server and static variants, and builds the container image on every push and
  pull request.
- **Pages**: `.github/workflows/pages.yml` builds the serverless static variant and
  deploys it to GitHub Pages (see below).
- **Backup & restore**: snapshots are created automatically every 30 minutes and on
  demand; Owners can download any snapshot or restore one directly from Settings → Storage.

---

## Performance & Code Splitting

Non-dashboard views are loaded on demand via `React.lazy` + `Suspense`, and heavy
libraries are split into dedicated cached chunks:

- Forecast and Historical charts pull **recharts** (~404 kB) only when opened.
- The initial application shell stays small (~317 kB raw / ~92 kB gzip).

---

## Getting Started

### Development Mode
```bash
npm install
npm run dev
```
The server will start on port 3000 (`http://localhost:3000`).

### Running the Test Suites
```bash
npm test              # both suites
npm run test:unit     # deterministic engine + utilities (34 checks)
npm run test:api      # HTTP integration surface (22 checks)
```
The suite is now a **56-point** verification run split across two layers:

- **Unit suite** — deterministic risk calculation, secret redaction, daylight
  savings timezone alignment, data freshness, Scrypt hashing, snapshot backups,
  security headers, rate limiting, role hierarchy, the multi-user lifecycle,
  password policy, TOTP, persistent sessions, the TTL cache, data retention, and
  per-user push preferences.
- **HTTP integration suite** — boots the real Express app in-process against an
  isolated temporary data directory and exercises the security surface over
  real HTTP: `/healthz`, account-enumeration resistance, cookie-only sessions,
  CSRF double-submit enforcement, header-token CSRF exemption, per-account
  lockout, the full TOTP login flow, RBAC 401/403 gates, active-session listing
  and revocation (including cross-user isolation), settings validation, the Web
  Push subscription lifecycle and preference access control, traversal-safe backup
  restore, retention, and Prometheus `/metrics` access control.

Tests never touch your working `./data` directory — they run in a fresh temp
directory via the `DATA_DIR` override.

### Building for Production
```bash
npm run build           # server build -> dist/ (Express + API)
npm start
```
For the serverless GitHub Pages build:
```bash
npm run build:static    # static build -> dist-static/ (no backend)
```

### Container Deployment
```bash
cp .env.example .env   # then edit your credentials
docker compose up --build
```
State (SQLite database, backups, and generated secrets) persists in `./data`.

---

## Safety & Compliance Disclaimer

This application is a real-time weather risk monitoring and situational awareness tool. It does NOT replace site inspections, local Safe Work Method Statements (SWMS), certified crane anemometers, or professional human safety judgement.
