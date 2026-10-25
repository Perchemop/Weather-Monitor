# Roadmap

Public roadmap for the Construction Weather Monitor. Readiness is updated
**only from evidence** (CI runs and local verification) — never optimism
(operating guide §6.2). This file is the exhaustive completion plan: every
remaining piece of work to a declared-finished 1.0.0 is staged below with its
research note (where applicable), owner of the next step, and readiness.

## Stage 0.1.x — shipped (v0.1.0, tagged)

First tagged release; every claim below is backed by the CI workflow
(format-check, build-test matrix on Windows/macOS/Linux, docker, Pages deploy)
and the 88-check automated suite.

| Capability                                                                       | State | Evidence                                                 |
| -------------------------------------------------------------------------------- | ----- | -------------------------------------------------------- |
| Deterministic risk engine (AS 2550.1 envelopes, DST-aware)                       | Done  | system tests; property tests (determinism, monotonicity) |
| Dual-provider weather (WeatherAPI + Open-Meteo, automatic fallback)              | Done  | system + API tests; CI                                   |
| Autonomous monitoring cycle + alert engine (WIND/GUST/RAIN/UV/TEMP/STORM)        | Done  | API tests; manual QC checklist                           |
| Role-based access (Owner/Manager/Viewer), hardened auth, TOTP MFA, sessions      | Done  | API tests (auth, RBAC, CSRF, MFA, sessions)              |
| SQLite persistence, backup rotation + restore, retention pruning                 | Done  | API tests; persistence-health monitoring                 |
| Web Push alerts, per-device preferences, PWA install/offline                     | Done  | API tests; manual QC                                     |
| Live weather map (radar/rain/wind/lightning), lightning forecasting              | Done  | manual QC; system tests for alert candidates             |
| Reports, activity risk matrix, weekly performance summary                        | Done  | system tests; manual QC                                  |
| Dashboard redesign: clear hierarchy, decluttered, consistent tokens              | Done  | PR #2; manual QC                                         |
| Observable persistence health (`/api/health`, `cwm_database_persist_healthy`)    | Done  | API + system tests                                       |
| Crash stub: React ErrorBoundary + server process handlers + graceful flush       | Done  | code review; CI                                          |
| Update check: Settings → About vs GitHub Releases, fail-soft, cached             | Done  | system tests (comparison logic); manual QC               |
| In-app version surfacing (`/healthz`, `/api/health`, Settings)                   | Done  | API tests                                                |
| CI: format-check + 3-OS build-test + docker + Pages deploy                       | Done  | GitHub Actions runs                                      |
| Release path: `release.yml` on `v*` tags, checksummed artefacts, changelog notes | Done  | release run for `v0.1.0`                                 |
| Governance: PR template, CONTRIBUTING, ROADMAP, brand doc, research gate         | Done  | files in tree                                            |

**Feature breadth: 100% of the v1 in-scope scope, implemented and verified.**
**Ready-for-work: n/a — stage closed.**

## Stage 0.2.x — hardening & shared-capability deepening

Every item now carries its research note (`docs/research/<capability>.md`).
**All notes await the human gate** (guide §2.3/§8.4): nothing below is
implemented until the human approves the note it depends on. Approval
criteria: original wording, URLs present, no copyrighted paste, no UI cloning.

| #   | Item                                                                 | Research note                                                                    | Next step                                       | Ready-for-work                                          |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| 1   | In-app crash report submission (device-flow user token, memory-only) | [`crash-report-submission.md`](docs/research/crash-report-submission.md)         | Implement per approved design (B)               | 100% — implemented                                      |
| 2   | Multi-architecture container images (amd64 + arm64 via Buildx)       | [`multi-arch-container-images.md`](docs/research/multi-arch-container-images.md) | Verify at the `v0.1.1` tag (manifest + compose) | 95% — workflow written; awaiting tag evidence           |
| 3   | Prettier adoption (dedicated reformat release)                       | [`prettier-adoption.md`](docs/research/prettier-adoption.md)                     | Done                                            | 100% — PR #6, CI green (reformat-only; tests unchanged) |
| 4   | Browser-level (DOM) smoke tests (Playwright)                         | [`dom-ui-tests.md`](docs/research/dom-ui-tests.md)                               | Verify at each release (keep green)             | 100% — 7 tests + `ui-tests` CI job, green               |
| 5   | Prometheus alert examples + operations runbook                       | [`prometheus-runbook.md`](docs/research/prometheus-runbook.md)                   | Implement rules + runbook + promtool            | 100% — runbook + example rules implemented              |

**Feature breadth: unchanged (no new in-scope features in this stage).**
**Ready-for-work: 4/5 done (Prettier, crash report, Prometheus runbook, DOM UI
tests — all green in CI), 1/5 awaiting tag evidence (multi-arch images).**

## Stage 1.0.0 — stability declaration

Declared when all of the following hold on the release commit — no date
promises, evidence only:

- [ ] All 0.2.x items merged and verified in CI.
- [ ] One full release cycle (tag → release → in-app update check observes it)
      completes without a data-loss or security defect.
- [ ] `docs/qc/release-checklist.md` fully ticked, including the §2.5 legal
      checklist, on the release commit.
- [ ] `docs/parity.md` and `REQUIREMENTS_TRACEABILITY.md` show every
      requirement Met with verification.
- [ ] Manual QC checklist completed against the deployed build.
- [ ] Operating guide finished-product gates (§9) reviewed one final time.

**Feature breadth: gate criteria only — no new features planned for 1.0.0.**

## Out of scope for 1.0.0 (recorded so "exhaustive" stays honest)

Multi-instance/HA deployments, external schedulers for the monitor cycle,
in-app WeatherAPI key management, native desktop/mobile store packaging, and
any SaaS/telemetry component. These contradict the local-first, private-enclave
discovery decisions; reopening them is a discovery-level change, not a task.

## Release cadence

Frequent semver releases (`0.1.1`, `0.2.0`, …). Each GitHub Release body
follows the standard in `docs/qc/release-checklist.md` (summary, Added /
Changed / Fixed, known limitations, artefact checksums). The app's update
check (Settings → About) reads these releases.
