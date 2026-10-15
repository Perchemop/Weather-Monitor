# Construction Weather Monitor — Exhaustive Audit & Comprehensive Implementation Plan

**Document Version:** 1.0  
**Date:** 3 October 2026  
**Application:** Construction Weather Monitor (Weather-Monitor-main)  
**Stack:** React 19 + Vite 6 + Tailwind CSS 4 + Express + sql.js (SQLite) + Nodemailer + Lucide + Recharts + Motion  

---

## 1. Application Overview

The application is a **private, single-user, local-first construction weather monitoring and automated alerting system**.  

Primary goals:
- Monitor weather conditions at one or more construction sites.
- Calculate deterministic risk scores focused on construction activities (crane operations, formwork, concrete pours, roofing, working at heights, etc.).
- Generate and deliver email alerts when thresholds are breached.
- Store all data locally in SQLite (via sql.js) with no cloud dependency for core functionality.
- Support dual weather providers (WeatherAPI as primary reference + Open-Meteo as cross-reference / fallback).

Default location shipped with the code: Unconfigured Site (−34.9285, 0, UTC).

---

## 2. Complete Feature Inventory

### 2.1 Core Weather & Risk Features
- Dual-provider fetching (WeatherAPI + Open-Meteo)
- Provider variance / concordance scoring and confidence score
- Current conditions (temperature, feels-like, humidity, wind, gusts, rain, UV, pressure, visibility, WMO weather code)
- Hourly forecast (temperature, wind, gusts, rain probability, precipitation, UV, risk level per hour)
- Daily forecast (7-day)
- Deterministic risk engine with categories: WIND, GUST, RAIN, TEMPERATURE, UV, STORM
- Activity impact matrix (crane lift, formwork, concrete, roofing, external works, etc.)
- Peak risk period detection
- Safety disclaimer that is always shown

### 2.2 Alerting & Monitoring
- Alert generation from risk engine
- Alert states: ACTIVE, CLEARED, DISMISSED
- Email delivery with retry queue and cooldown
- Recovery notifications
- Background monitoring service (configurable interval, default 15 minutes)
- Manual “Check Now”
- Monitor run history and consecutive failure tracking

### 2.3 Locations
- Multi-location support
- Geocoding search
- Default location
- Per-location status (LIVE / CACHED / STALE / OFFLINE)

### 2.4 User Interface Views
- Dashboard (Hero Risk Card, Active Alerts, Cross-Reference Card, Hourly Bar, Current Conditions, compact System Health strip)
- Forecast View
- Alert History + Delivery log
- Historical Observations
- Printable Site Risk Report
- System Health Diagnostics
- Settings (owner details, units, monitoring, thresholds, SMTP, data management)
- Location Modal

### 2.5 Persistence & System
- Full SQLite schema with migrations
- Audit logs
- Data retention enforcement
- System health endpoint
- Local-only privacy posture (no analytics, no tracking)

---

## 3. Implementation Plan Phases

### Phase 0 — Immediate Stabilisation (Highest Priority)
- **Step 0.1: Restore Authentication**
  - Implement full session verification in Express `requireAuth` middleware supporting Cookies, `Authorization: Bearer`, and `x-session-token`.
  - Add `/api/auth/status`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/setup`.
  - Create `LoginScreen.tsx` with first-run setup & master password unlock.
- **Step 0.2: Global Error Handling & User Feedback**
  - Create `ToastProvider.tsx` with floating contextual alerts.
  - Create `ErrorBoundary.tsx` to guard against unexpected render errors.
  - Replace silent failure catches in UI with toast feedback.
- **Step 0.3: Remove Hard-coded Values**
  - Replace static interval labels with dynamic settings (`monitorIntervalMinutes`).
  - Centralize constants across frontend and backend.

### Phase 1 — Core Reliability & Data Layer
- **Step 1.1: Strengthen SQLite Persistence & Backups**
  - Automated timestamped backup rotation in `data/backups/`.
- **Step 1.2: Loading, Empty, and Error States**
  - Add skeleton loaders and error states to all cards.
- **Step 1.3: Consistent Unit Conversion**
  - Implement `src/utils/units.ts` for °C/°F, km/h / mph / m/s conversions.
- **Step 1.4: Expand Automated Tests**
  - Add unit conversion, auth, and persistence tests to `system.test.ts`.

### Phase 2 — UI/UX Overhaul
- **Step 2.1: Responsive & Accessible Navigation**
  - Mobile hamburger navigation, ARIA attributes, keyboard accessibility.
- **Step 2.2: Dashboard Polish**
  - Live data status tags, instant action feedback.
- **Step 2.3: Settings Redesign**
  - Tabbed organization, live threshold preview, destructive action confirmation modals.
- **Step 2.4: Location Modal Improvements**
  - Debounced geocoding search, validation.
- **Step 2.5: Reports & History Export**
  - CSV export for historical observations & alert logs, print-ready CSS.

### Phase 3 & 4 — Hardening & Documentation
- **Step 3.1: Security Headers & Rate Limiting** ✅ (strict CSP + hardening headers; auth endpoints 10/15min, API 300/min)
- **Step 3.2: Comprehensive README.md** ✅

### Phase 5 — Multi-User, Offline & Performance ✅
- **Step 5.1: Role-Based Access Control**
  - `users` table + migration (005) with per-account Scrypt credentials.
  - Roles OWNER / MANAGER / VIEWER enforced by `requireRole` middleware.
  - Users management API + Owner-only UI (`UsersView`).
  - Last-owner protections (cannot demote/deactivate/delete the final Owner).
  - Legacy single-owner installations auto-migrate to the first OWNER account.
- **Step 5.2: PWA & Offline Mode**
  - Installable manifest + themed SVG/maskable icons.
  - Service worker: precached shell, cache-first assets, network-first read-only
    API with cached fallback, and network-only auth/user/backup endpoints.
  - Offline connectivity banner in the UI.
- **Step 5.3: Frontend Performance**
  - `React.lazy` + `Suspense` code-splitting for all non-dashboard views.
  - Vendor chunking for recharts and icon libraries.
  - Initial bundle reduced from ~820 kB to ~317 kB (~92 kB gzip).

### Phase 6 — Security, Push & Operations ✅
- **Step 6.1: Security Hardening**
  - Cookie-only sessions: the session token is no longer returned in JSON bodies
    or stored in `localStorage`; the `HttpOnly` cookie is the sole browser credential.
  - CSRF double-submit protection (`cwm_csrf` cookie + `x-csrf-token` header) for
    cookie-authenticated state changes.
  - Env-driven `Secure` cookie flag (`SECURE_COOKIES`).
  - Per-account failed-login lockout (`LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES`).
  - Configurable password policy (length + letter + number) enforced across setup,
    create, reset, and change flows (server and client).
  - Optional RFC 6238 TOTP two-factor authentication (migration 006) with setup /
    enable / disable endpoints and an MFA prompt at sign-in.
  - `/api/auth/status` no longer discloses the owner email while unauthenticated.
  - AI endpoints rate-limited (20/min) and cached (10-minute TTL) to control cost.
- **Step 6.2: Web Push Notifications**
  - `push_subscriptions` table (migration 008) and VAPID key persistence
    (`data/vapid.json`) via `web-push`.
  - Subscribe / unsubscribe / test endpoints, plus HIGH & CRITICAL alert delivery
    from the monitoring service.
  - Service worker `push` + `notificationclick` handlers.
  - Device enrolment card in Settings → Security & Auth.
- **Step 6.3: Operations & Delivery**
  - Structured JSON logging with request timing (`src/utils/logger.ts`).
  - Persistent session signing secret (`data/session-secret`) and sessions that
    survive restarts (`sessions` table, migration 007) with a logout-all endpoint.
  - Unauthenticated `/healthz` liveness probe.
  - Backup restore from a stored snapshot (with path-traversal validation and an
    automatic pre-restore safety snapshot).
  - GitHub Actions CI (type-check, tests, build, container build).
  - Multi-stage `Dockerfile`, `docker-compose.yml`, and `.dockerignore`.
  - Configurable observation retention window (`dataRetentionDays`); the retention
    toast now reads the correct API fields and the policy text matches the code.
  - `LOCAL_ONLY` privacy mode now skips the third-party WeatherAPI provider.
  - Repo standardised on npm (`package-lock.json`, `engines`, `.nvmrc`); package
    renamed from `react-example` to `construction-weather-monitor`.

### Phase 7 — Test Depth & Testability ✅
- **Step 7.1: Importable application**
  - `server.ts` now exports `createApp(options)` (no port binding on import) and
    `startServer()`; the process bootstrap moved to `server-entry.ts`, which the
    production bundle targets. `createApp` accepts `staticMode` / `startMonitoring`
    / `scheduleBackups` so tests run without pollers or a Vite dev server.
- **Step 7.2: HTTP integration suite** (`src/tests/api.test.ts`, 20 checks)
  - Boots the real app in-process on an ephemeral port and drives it over HTTP:
    `/healthz`, account-enumeration resistance, cookie-only sessions, CSRF
    double-submit (missing / wrong / correct header), header-token CSRF exemption,
    per-account lockout, TOTP enrol→enable→login→disable, RBAC 401/403 gates,
    active-session listing/revocation with cross-user isolation, settings
    validation, Web Push subscription lifecycle, traversal-safe backup restore,
    and retention.
- **Step 7.3: Isolation & tunability**
  - `DATA_DIR` env override relocates the SQLite database, backups, and generated
    secrets (used by tests via a shared `src/tests/setup.ts` bootstrap, so the
    developer's real `./data` is never touched).
  - Rate-limit caps are now env-configurable (`AUTH_RATE_LIMIT_MAX`,
    `API_RATE_LIMIT_MAX`).
  - Test total: 33 unit + 20 integration = **53 checks**.

### Phase 8 — Active Session Management ✅
- **Step 8.1: Session metadata** (migration `009_session_metadata`)
  - The `sessions` table gains `user_agent`, `ip`, and `last_seen_at` columns via
    `ALTER TABLE` (backward-compatible upgrade verified against a pre-009 schema).
    `saveSession` persists them; `touchSession` refreshes `last_seen_at` at most
    once per minute per session to bound write cost.
- **Step 8.2: Review & revoke endpoints**
  - `GET /api/auth/sessions` lists the caller's own devices, each tagged with a
    non-reversible `sha256(token)` digest — the bearer token is never returned,
    even to its owner. The current session is flagged and sorted first.
  - `DELETE /api/auth/sessions/:id` revokes a single device; ids are matched only
    within the caller's own sessions (cross-user revocation returns `404`).
    Revoking the current session clears the auth cookies.
- **Step 8.3: Settings UI**
  - The Security tab renders an **Active Sessions** card: friendly browser/OS
    labels, IP, last-active time, a per-device Revoke action, and a guarded
    "Sign Out All" (reuses the existing confirmation modal).

### Phase 9 — Serverless Pages, Observability & Delivery ✅
- **Step 9.1: Static / serverless build (GitHub Pages)**
  - `VITE_APP_MODE=static` selects a client-side backend (`src/static/*`): an
    IndexedDB store mirroring `db.ts`, the shared deterministic risk/alert engine,
    an Open-Meteo fetcher, a browser notification channel, and a `window.fetch`
    interceptor that serves the existing `/api/*` contract. `npm run build:static`
    emits `dist-static/`; `VITE_BASE` sets the project base path. Server-only UI
    (users, MFA, SMTP, storage, security) is hidden and degrades gracefully.
- **Step 9.2: Prometheus metrics**
  - `GET /metrics` exposes gauge/counter families (uptime, memory, monitor state,
    aggregate counts, runs by status) in the text exposition format. Access is
    session-gated by default, or via a shared `METRICS_TOKEN` bearer for scrapers.
- **Step 9.3: Per-user push preferences** (migration `010_push_preferences`)
  - A per-user `push_preferences` row (master switch, minimum severity, recovery
    opt-in) filters `sendPushToAll`; the API is `GET`/`PUT /api/push/preferences`.
- **Step 9.4: Legacy `auth_owner` retirement** (migration `011_drop_legacy_auth_owner`)
  - Credentials are preserved into `users` if still needed, then the redundant
    single-owner table is dropped; owner bootstrap/setup now use `users` directly.

