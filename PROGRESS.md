# Progress

Current state of the Construction Weather Monitor build. Kept short; the
detailed history lives in `CHANGELOG.md`.

## Where we are

- **Branch:** `opencode/ci`, with pull requests into `main` reviewed and
  rebase-merged to keep history linear. `main` is protected: pull requests
  required, conversation resolution required, no force-push/deletion, and the
  CI checks required to pass (guide Part II §20.2).
- **CI:** green on every slice. The workflow runs `format-check`,
  `security-compliance` (licence policy + CycloneDX SBOM), `dependency-review`,
  a multi-OS `build-test` matrix (Windows, macOS, Linux — type-check, 86 tests,
  production build, static build with artefact upload), `ui-tests`
  (7 Playwright DOM smoke tests, Chromium), and `docker`. CodeQL
  (SAST) runs on push/PR/weekly; Dependabot covers npm, actions and Docker.
  Actions are pinned to commit SHAs.
- **Open-source readiness (guide Part II):** community, security, accessibility,
  governance and legal files are in place (`CODE_OF_CONDUCT`, `SECURITY`,
  `ACCESSIBILITY`, `VISION`, `GOVERNANCE`, `CONTRIBUTORS`, `CITATION.cff`),
  issue templates and contributor labels exist, and Open-Meteo data attribution
  (CC BY 4.0) is shown in the UI footer and map.
- **Releases:** `release.yml` turns `v*` tags into GitHub Releases with
  checksummed artefacts and CHANGELOG-derived notes; `v0.1.0` is the first
  tagged release. The app checks for updates in Settings → About.
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

1. Tag `v0.1.1` so the multi-architecture image workflow (amd64 + arm64 Buildx
   manifest) has the evidence the roadmap needs for item 2 of Stage 0.2.x.
2. Keep the `ui-tests` job green as slices land; extend `tests/ui/smoke.spec.ts`
   alongside new interactive behaviour.
3. Optional follow-ups recorded in `docs/assumptions-and-questions.md`
   (licence confirmation, multi-arch images, SMS channel, CSV export, proxy hop
   count).
4. Keep `docs/parity.md` and `REQUIREMENTS_TRACEABILITY.md` current as slices land.

## Active provider / model map

See `docs/current-model-map.md`. Provider order is OpenCode free -> NVIDIA free
-> paid API keys; changing the model never changes the process.
