# Progress

Current state of the Construction Weather Monitor build. Kept short; the
detailed history lives in `CHANGELOG.md`.

## Where we are

- **Branch:** `opencode/ci` (2 commits ahead of `main` at the start of this
  work, now further ahead), open pull request into `main`.
- **CI:** green in GitHub Actions on every slice (type-check, 81 tests,
  production build, static build, Docker build). All verification runs in CI,
  never on the developer machine.
- **Release readiness:** feature-complete against `IMPLEMENTATION_PLAN.md`;
  current focus is correctness, security hardening and documentation.

## What works

- Multi-account auth (OWNER / MANAGER / VIEWER) with scrypt passwords, TOTP MFA,
  per-account lockout, persisted HttpOnly cookie sessions, active-session review
  and revoke, and CSRF protection. "Approved as working."
- Deterministic construction risk engine and activity matrix.
- Dual-provider weather (WeatherAPI primary + Open-Meteo cross-reference and
  fallback) with correct WMO code semantics.
- Alert engine with per-location dedupe, cooldown, escalation and recovery.
- Autonomous monitoring loop, retention, rotating backups and restore.
- Live map, PWA offline shell, Web Push, optional SMTP email.
- Browser-only static build for GitHub Pages.

## Recently fixed (this session)

See `CHANGELOG.md` → **Unreleased**. Highlights: one-time bootstrap setup,
immediate session reconciliation on account changes, real 404/400 outcomes
instead of fake success, per-location alert cooldown, WeatherAPI→WMO code
mapping, Open-Meteo timezone-correct timestamps, UV risk-level correction, and
UI permission mirroring.

## Next

1. Merge the open PR once the reviewer is satisfied.
2. Optional follow-ups recorded in `docs/assumptions-and-questions.md`.
3. Keep `docs/parity.md` and `REQUIREMENTS_TRACEABILITY.md` current as slices land.

## Active provider / model map

See `docs/current-model-map.md`. Provider order is OpenCode free -> NVIDIA free
-> paid API keys; changing the model never changes the process.
