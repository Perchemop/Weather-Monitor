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
  a multi-OS `build-test` matrix (Windows, macOS, Linux — type-check, 95 checks
  = 66 system + 29 integration, production build, static build with artefact
  upload), `ui-tests` (7 Playwright DOM smoke tests, Chromium; 102 automated
  checks total), and `docker`. CodeQL
  (SAST) runs on push/PR/weekly; Dependabot covers npm, actions and Docker.
  Actions are pinned to commit SHAs.
- **Open-source readiness (guide Part II):** community, security, accessibility,
  governance and legal files are in place (`CODE_OF_CONDUCT`, `SECURITY`,
  `ACCESSIBILITY`, `VISION`, `GOVERNANCE`, `CONTRIBUTORS`, `CITATION.cff`),
  issue templates and contributor labels exist, and Open-Meteo data attribution
  (CC BY 4.0) is shown in the UI footer and map.
- **Releases:** `release.yml` turns `v*` tags into GitHub Releases with
  checksummed artefacts and CHANGELOG-derived notes. `v0.1.0` was the first
  tagged release; the latest release is **`v0.1.3`** (2026-10-30 — release
  workflow run 40966882206). The app checks for updates in Settings → About.
- **Operating model:** the guide's CTO.new-style flow —
  **Chat (plan) → Task (execute) → Pull Request (review)**; see
  `docs/development.md`.
- **Release readiness:** feature-complete against `ROADMAP.md` Stages 0.1.x and
  0.2.x; current focus is the ranked audit queue (`docs/gaps.md`) and Stage
  1.0.0 stability gates.

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

## Per-release legal & quality gates (latest: v0.1.3)

The guide's §2.5 per-release legal checklist was completed for the **v0.1.3**
release (2026-10-30), verified by the `Release` workflow run
**40966882206** (<https://github.com/Perchemop/Weather-Monitor/actions/runs/40966882206>,
conclusion: success):

- No proprietary source, assets, or substantial copied text in tree.
- No reverse-engineering tools or output used as implementation input.
- Product name/logo original; no vendor marks in UI or artefacts; UI is
  original expression.
- App licence clear (MIT-only, D-28); `ATTRIBUTION.md` complete (dependencies,
  Open-Meteo CC BY 4.0, AI/model provenance).
- No API keys, tokens, or credentials in git or release artefacts — the unified
  `Personal data scan` gate covers tree, history, metadata and built artefacts
  before any asset is attached (guide II.29.5).
- Crash/bug reports are user-initiated only (device flow, memory-only token);
  privacy documented in the README.
- No false certification, affiliation, or "drop-in replacement" claims in
  README/ROADMAP; research notes remain summaries + URLs only.
- Release notes follow the `docs/qc/release-checklist.md` standard; artefacts
  carry SHA-256 checksums; the multi-arch image (`amd64` + `arm64`) published
  to GHCR.

Checklist source: `docs/qc/release-checklist.md` (§2.5 legal checklist +
release-notes standard). Repeat this section for every future tag.

## Next

1. All Stage 0.2.x items are verified (multi-arch images confirmed via v0.1.2
   release). Proceed to Stage 1.0.0 stability gates per `docs/qc/release-checklist.md`
   and the §2.5 legal checklist.
2. Keep the `ui-tests` job green as slices land; extend `tests/ui/smoke.spec.ts`
   alongside new interactive behaviour.
3. Work the ranked audit queue in `docs/gaps.md` (accessibility blockers and
   backend security mediums first). Licence questions are resolved (see
   `docs/assumptions-and-questions.md` A-01/Q-01); remaining optional
   follow-ups there: SMS channel, CSV export, proxy hop count.
4. Keep `docs/parity.md` and `REQUIREMENTS_TRACEABILITY.md` current as slices land.

## Active provider / model map

See `docs/current-model-map.md`. Provider order is OpenCode free -> NVIDIA free
-> paid API keys; changing the model never changes the process.
