# Construction Weather Monitor

Autonomous, local-first microclimate risk evaluation and automated safety alerting system for construction sites, crane operations, and elevated structural works.

---

## Key Highlights

- **Deterministic Safety Engine (AS 2550.1)**: Rule-based calculations evaluate sustained winds, peak gusts, rainfall rate, lightning proximity, thermal stress, and solar UV against strict SWMS envelopes.
- **Dual-Provider Atmospheric Cross-Reference**: Real-time concordance scoring comparing WeatherAPI (primary reference) with Open-Meteo (independent physical model).
- **Resilient AI Superintendent Briefings**: Context-aware daily site briefings powered by Google Gemini (@google/genai) with automated multi-model failover (`gemini-3.8-flash` $\rightarrow$ `gemini-3.1-flash-lite` $\rightarrow$ `gemini-flash-latest`). Non-authoritative AI commentary can never downgrade deterministic risk scores.
- **Private Local Enclave (SQLite / sql.js)**: Runs entirely on-premise or in private containers. Zero telemetry, zero analytics, zero external tracking.
- **Role-Based Access Control**: Owner / Manager / Viewer roles with least-privilege route gating, per-account Scrypt credentials, and last-owner protections.
- **Hardened Authentication**: Cookie-only sessions (no tokens in `localStorage`), CSRF double-submit protection, per-account login lockout, a configurable password policy, and optional TOTP two-factor authentication for every account.
- **Installable, Offline-Capable & Push-Enabled (PWA)**: A service worker precaches the app shell, caches read-only API responses, and delivers Web Push safety alerts to subscribed devices even when the app is closed.
- **Master Security & Scrypt Hashing**: Password-protected access with RFC 7914 Scrypt memory-hard key derivation.
- **Automated Retention & Snapshot Rotation**: 30-minute automated database backups with 10-point rolling history, 24-hour retention pruning with a configurable observation window, and one-click restore-from-backup.
- **Operational Delivery**: Structured JSON logging, an unauthenticated `/healthz` liveness probe, GitHub Actions CI, and a Dockerfile + Compose stack.

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
   ├── AI Reasoning Service (Multi-Model Gemini Cascade)
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
  owner becomes the first `OWNER` account on first boot.
- Any account may enable **TOTP two-factor authentication** from Settings →
  Security & Auth; when enabled, sign-in requires a 6-digit authenticator code.

---

## Environment Configuration

Configure credentials in `.env` (refer to `.env.example`):

```env
# Optional WeatherAPI Key (auto-falls back to Open-Meteo if omitted)
WEATHER_API_KEY=

# Optional Gemini API Key for AI Superintendent Briefings
GEMINI_API_KEY=

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

# Privacy mode: skip the third-party WeatherAPI and use Open-Meteo only
LOCAL_ONLY=false
```

---

## Security Hardening

- **Security Headers**: Every response carries a strict `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, cross-origin isolation headers, and a restrictive `Permissions-Policy`. `X-Powered-By` fingerprinting is removed. HSTS is opt-in via `ENABLE_HSTS=true`.
- **Cookie-only Sessions**: The session lives solely in an `HttpOnly` cookie — no token is ever written to `localStorage`, so script injection cannot exfiltrate it. Set `SECURE_COOKIES=true` when serving over HTTPS.
- **CSRF Protection**: Cookie-authenticated state changes must echo the readable `cwm_csrf` cookie in the `x-csrf-token` header (double-submit pattern). Token-header clients are exempt.
- **Rate Limiting**: Authentication endpoints (`/api/auth/login`, `/api/auth/setup`) are limited to 10 attempts per 15 minutes per client IP, the broader `/api` surface to 300 requests per minute, and the cost-bearing `/api/ai/*` endpoints to 20 requests per minute. Limited responses return HTTP `429` with `RateLimit-*` headers.
- **Account Lockout**: After `LOGIN_MAX_ATTEMPTS` failed attempts, an account is locked for `LOGIN_LOCKOUT_MINUTES` minutes.
- **Password Policy**: Passwords must meet `PASSWORD_MIN_LENGTH` (default 10) and contain a letter and a number.
- **Two-Factor Authentication**: Optional RFC 6238 TOTP for any account, verifiable with Google Authenticator, Authy, or 1Password.
- **AI Cost Controls**: Gemini responses are cached for 10 minutes and rate-limited, so briefings are not re-billed on every page view.
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
  are generated and persisted automatically on first boot.
- **Never cached**: authentication, user management, and backup endpoints always
  hit the live server (no stale or cross-session data is ever served).
- The service worker registers in **production builds only**, so it never
  interferes with Vite HMR during development.

---

## Operations & Deployment

- **Structured logging**: JSON lines by default (set `LOG_FORMAT=pretty` for local
  readability, `LOG_LEVEL` to tune verbosity). Every request is logged with method,
  path, status, and latency.
- **Liveness probe**: unauthenticated `GET /healthz` for container orchestrators.
- **Container image**: `docker build -t construction-weather-monitor .` or
  `docker compose up --build` (persists state in `./data`).
- **CI**: `.github/workflows/ci.yml` type-checks, runs the test suite, builds, and
  builds the container image on every push and pull request.
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

### Running the System Test Suite
```bash
npm test
```
Executes the automated **33-point** verification suite covering deterministic risk
calculation, secret redaction, daylight savings timezone alignment, data freshness
semantics, Scrypt password hashing, database snapshot backups, security headers,
rate limiting, role hierarchy, the multi-user account lifecycle, password policy,
TOTP two-factor authentication, persistent sessions, Web Push subscriptions, the
TTL cache, and configurable data retention.

### Building for Production
```bash
npm run build
npm start
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
