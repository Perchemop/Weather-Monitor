# Construction Weather Monitor

Autonomous, local-first microclimate risk evaluation and automated safety alerting system for construction sites, crane operations, and elevated structural works.

---

## Key Highlights

- **Deterministic Safety Engine (AS 2550.1)**: Rule-based calculations evaluate sustained winds, peak gusts, rainfall rate, lightning proximity, thermal stress, and solar UV against strict SWMS envelopes.
- **Dual-Provider Atmospheric Cross-Reference**: Real-time concordance scoring comparing WeatherAPI (primary reference) with Open-Meteo (independent physical model).
- **Resilient AI Superintendent Briefings**: Context-aware daily site briefings powered by Google Gemini (@google/genai) with automated multi-model failover (`gemini-3.8-flash` $\rightarrow$ `gemini-3.1-flash-lite` $\rightarrow$ `gemini-flash-latest`). Non-authoritative AI commentary can never downgrade deterministic risk scores.
- **Private Local Enclave (SQLite / sql.js)**: Runs entirely on-premise or in private containers. Zero telemetry, zero analytics, zero external tracking.
- **Master Security & Scrypt Hashing**: Password-protected access with RFC 7914 Scrypt memory-hard key derivation.
- **Automated Retention & Snapshot Rotation**: 30-minute automated database backups with 10-point rolling history, plus 24-hour retention pruning.

---

## Architecture Overview

```
[ Frontend: React 19 + Tailwind CSS 4 + Vite ]
                   │
                   ▼ (Session Cookies & Bearer Tokens)
[ Express API Gateway (server.ts) ]
   ├── Auth Middleware (Scrypt Hash Verification)
   ├── Monitoring Service (Autonomous Polling Cycle)
   ├── Risk & Alert Engine (Deterministic Decision Logic)
   ├── AI Reasoning Service (Multi-Model Gemini Cascade)
   └── Storage Engine (SQLite via sql.js with Snapshots)
         │
         ├── WeatherAPI (Primary Reference)
         ├── Open-Meteo (Cross-Reference & Offline Fallback)
         └── SMTP Gateway (Automated Site Alert Dispatches)
```

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

# Session cookie signing secret (generated per-boot if omitted)
SESSION_SECRET=

# Emit HSTS headers; enable only when served over HTTPS
ENABLE_HSTS=false
```

---

## Security Hardening

- **Security Headers**: Every response carries a strict `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, cross-origin isolation headers, and a restrictive `Permissions-Policy`. `X-Powered-By` fingerprinting is removed. HSTS is opt-in via `ENABLE_HSTS=true`.
- **Rate Limiting**: Authentication endpoints (`/api/auth/login`, `/api/auth/setup`) are limited to 10 attempts per 15 minutes per client IP to blunt brute-force attacks, while the broader `/api` surface is limited to 300 requests per minute. Limited responses return HTTP `429` with `RateLimit-*` headers.
- **Body Size Cap**: JSON request bodies are capped at 1 MB.
- **Session Isolation**: Sessions require an `HttpOnly` signed cookie, `x-session-token`, or `Authorization: Bearer` token; all monitoring routes are gated by auth middleware.

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
Executes the automated 15-point verification suite covering deterministic risk calculation, secret redaction, daylight savings timezone alignment, data freshness semantics, Scrypt password hashing, and database snapshot backups.

### Building for Production
```bash
npm run build
npm start
```

---

## Safety & Compliance Disclaimer

This application is a real-time weather risk monitoring and situational awareness tool. It does NOT replace site inspections, local Safe Work Method Statements (SWMS), certified crane anemometers, or professional human safety judgement.
