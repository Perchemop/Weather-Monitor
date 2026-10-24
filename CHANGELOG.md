# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet — changes land here between tagged releases._

## [0.1.0] — 2026-10-24

First tagged release: a deterministic construction weather risk monitor with
autonomous alerting, hardened multi-user auth, and a local-first SQLite store.
Includes the initial baseline (risk engine, dual-provider weather, alerting,
multi-user auth, monitoring loop, backups, PWA and static build) plus the
hardening and governance work below.

### Added

- **About panel with update check** (Settings → About, all roles): shows the
  running version, checks GitHub Releases on demand (cached hourly, fails soft
  offline) and offers a pre-filled GitHub issue form for bug reports — the
  crash/bug-report fallback that sends nothing automatically (guide §7).
- **Crash stub and graceful shutdown** (server): structured logging on
  `unhandledRejection`, log + database flush + bounded exit on
  `uncaughtException`, and SIGTERM/SIGINT handlers that persist the database
  before closing (guide §6.1/§7.1).
- **Version surfacing:** `/healthz` and `/api/health` now report the running
  `version`, verified by tests.
- **Dashboard design pass:** reordered by operator priority (risk hero →
  alerts → conditions → hourly → quick-cards → diagnostics), provider
  cross-reference collapsed to a one-line summary with an expandable table,
  engineering status strip removed, consistent card anatomy and typography,
  per-hour weather icons, and semantic colour reserved for risk state.
- **Observable persistence health.** A failed SQLite write is now recorded and
  surfaced through `GET /api/health` (`databaseStatus`, `databasePersistError`)
  and the `cwm_database_persist_healthy` Prometheus gauge. Previously the health
  response asserted `databaseStatus: 'HEALTHY'` unconditionally, which hid the
  exact silent data-loss case the guide forbids.
- **Property-based tests.** The risk engine is now checked for determinism
  (identical inputs → identical assessment), monotonicity (a stronger hazard
  never ranks safer) and the unconditional safety disclaimer.
- `docs/guide-compliance.md` — a rule-by-rule record of how the project meets
  the operating guide, including every deliberate adaptation to a guide rule.

- **CI format check.** A dependency-free hygiene checker
  (`scripts/check-format.mjs`, `npm run format:check`) enforces no CRLF, no
  merge markers, a final newline, spaces-not-tabs in code, and no trailing
  whitespace on lines a change introduces. It runs as a dedicated
  `format-check` job (guide §4, "Required CI Design").
- **CI hardening.** The build/test job now runs as a multi-OS matrix (Windows,
  macOS, Linux) with `fail-fast: false`, job timeouts, least-privilege
  `permissions`, concurrency cancellation, dependency caching, a job summary and
  uploaded build artefacts.
- Guide-required tracking documents: `PROGRESS.md`, `CHANGELOG.md`,
  `DECISIONS.md`, `REQUIREMENTS_TRACEABILITY.md`, `ATTRIBUTION.md`, `LICENSE`, and
  the `docs/` set (project brief, scope, inspiration, product name, architecture,
  parity, assumptions and questions, development, QC checklists).

### Changed

- Operating model documented as the guide's CTO.new-style flow
  **Chat (plan) → Task (execute) → Pull Request (review)**; `docs/development.md`
  describes both modes, the two-mode rule, and the daily flow.
- The `coder` agent may now commit, push and open a pull request directly
  (guide §5.5), instead of being blocked from GitHub interaction.

### Fixed

- **Authentication:** `POST /api/auth/setup` is now a one-time bootstrap. It
  returns `409` once setup has completed, closing an unauthenticated path that
  could overwrite the primary OWNER's credentials. Legacy databases that predate
  the setup marker are backfilled as configured.
- **Authentication:** changing your own password now revokes your other sessions
  and keeps the current device signed in.
- **Authentication:** role changes, deactivation, renames, password resets and
  account deletion now reconcile or revoke live sessions immediately instead of
  waiting for session expiry.
- **Authentication:** email lookup is case-insensitive for login and MFA.
- **Security:** proxy trust is now opt-in via `TRUST_PROXY`; the default no
  longer trusts a forwarded `X-Forwarded-For`, which could previously spoof the
  client IP used for rate limiting and per-account lockout.
- **Security:** restoring a database backup now deletes all persisted sessions,
  so tokens minted before the restore cannot come back after a restart.
- **Weather:** WeatherAPI condition codes are mapped onto WMO codes for current,
  hourly and daily data. This fixes every clear day being treated as a critical
  thunderstorm when a WeatherAPI key was configured.
- **Weather:** Open-Meteo wall-clock times are converted to true UTC instants
  using the response's `utc_offset_seconds`, fixing misaligned current and
  hourly values when the server timezone differs from the site.
- **Risk:** extremely high UV now raises the overall risk level to `HIGH`, and
  very-high UV moves the level and score instead of being displayed without
  affecting the headline level.
- **Alerts:** alert history and cooldown are scoped per location, so one busy
  site can no longer suppress the same alert type at another site.
- **Monitoring:** monitor runs can be `PARTIAL`; the `/metrics` endpoint and the
  weekly performance summary account for that outcome.
- **API integrity:** unknown alert, location and data-clear targets now return
  `404`/`400` instead of a fake success. The default location cannot be deleted.
  Weather endpoints return `404` for an unknown `locationId`.
- **UI:** the interface now mirrors server permissions — VIEWERs no longer see
  add/delete/default location controls, owner-only Settings tabs are hidden for
  MANAGER/VIEWER, and failed dismiss or location-switch actions no longer report
  false success.
- **Tooling:** the `docs-writer` subagent's edit permission was corrected from
  deny to allow.
