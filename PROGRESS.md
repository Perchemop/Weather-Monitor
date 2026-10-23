# Progress

Current state of the Construction Weather Monitor build. Kept short; the
detailed history lives in `CHANGELOG.md`.

## Where we are

- **Branch:** `opencode/ci`, with an open pull request (#1) into `main`. Nothing
  is merged until a human reviews it.
- **CI:** green on every slice. The workflow now runs `format-check`, a
  multi-OS `build-test` matrix (Windows, macOS, Linux — type-check, 81 tests,
  production build, static build with artefact upload), and `docker`.
- **Operating model:** the guide's CTO.new-style flow —
  **Chat (plan) → Task (execute) → Pull Request (review)**; see
  `docs/development.md`.
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

1. Merge the open PR once a human has reviewed it (guide §9: trust but verify).
2. Optional follow-ups recorded in `docs/assumptions-and-questions.md`
   (licence confirmation, multi-arch images, SMS channel, CSV export, proxy hop
   count).
3. Keep `docs/parity.md` and `REQUIREMENTS_TRACEABILITY.md` current as slices land.

## Active provider / model map

See `docs/current-model-map.md`. Provider order is OpenCode free -> NVIDIA free
-> paid API keys; changing the model never changes the process.
