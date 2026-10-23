# Project Brief

One-line purpose: a private, local-first construction-site weather monitoring
and safety-alerting system that turns live microclimate data into deterministic
risk decisions for crane, height, excavation, concrete and general site works.

## Facts

- **Application:** Construction Weather Monitor.
- **Repository:** <https://github.com/Perchemop/Weather-Monitor> (public).
- **Stack:** TypeScript; React 19 + Vite 6 + Tailwind CSS 4 (frontend); Express 4
  (API); SQLite via `sql.js`; Nodemailer (SMTP); `web-push` (VAPID); Leaflet
  with RainViewer radar; Recharts.
- **Deployment shapes:**
  1. **Server enclave** — Express API + SQLite + optional SMTP + Web Push.
  2. **Static browser build** — GitHub Pages, Open-Meteo only, IndexedDB,
     native notifications, optional Cloudflare Worker email relay.
- **Data providers:** WeatherAPI (primary reference when a key is configured)
  cross-referenced with Open-Meteo (independent model and automatic fallback).
- **Roles:** OWNER, MANAGER, VIEWER, enforced server-side.
- **Safety posture:** deterministic, rule-based risk engine with an always-shown
  safety disclaimer; not a substitute for professional safety judgement.

## Purpose

- Monitor weather at one or more construction sites.
- Evaluate conditions against construction-specific thresholds.
- Notify operators (in-app, Web Push, email) when thresholds are breached and
  when conditions recover.
- Keep all operational data local and free of third-party analytics.

## Non-goals

- Replacing formal SWMS risk assessment or professional judgement.
- Forecast trading, insurance or financial modelling.
- Multi-tenant SaaS hosting or cross-organisation data sharing.

See `scope.md` for the in/out-of-scope detail, `architecture.md` for the design,
and `assumptions-and-questions.md` for unconfirmed points.
