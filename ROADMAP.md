# Roadmap

Public roadmap for the Construction Weather Monitor. Readiness is updated
**only from evidence** (CI runs and local verification) — never optimism
(operating guide §6.2).

## Milestone: v0.1.0 — first tagged functional build

**Status: shipped.** First tagged release; every claim below is backed by the
CI workflow (format-check, build-test matrix on Windows/macOS/Linux, docker)
and the 86-check automated suite.

| Capability | State | Evidence |
| --- | --- | --- |
| Deterministic risk engine (AS 2550.1 envelopes, DST-aware) | Done | system tests; property tests (determinism, monotonicity) |
| Dual-provider weather (WeatherAPI + Open-Meteo, automatic fallback) | Done | system + API tests; CI |
| Autonomous monitoring cycle + alert engine (WIND/GUST/RAIN/UV/TEMP/STORM) | Done | API tests; manual QC checklist |
| Role-based access (Owner/Manager/Viewer), hardened auth, TOTP MFA, sessions | Done | API tests (auth, RBAC, CSRF, MFA, sessions) |
| SQLite persistence, backup rotation + restore, retention pruning | Done | API tests; persistence-health monitoring |
| Web Push alerts, per-device preferences, PWA install/offline | Done | API tests; manual QC |
| Live weather map (radar/rain/wind/lightning), lightning forecasting | Done | manual QC; system tests for alert candidates |
| Reports, activity risk matrix, weekly performance summary | Done | system tests; manual QC |
| Dashboard redesign: clear hierarchy, decluttered, consistent tokens | Done | PR #2; manual QC |
| Observable persistence health (`/api/health`, `cwm_database_persist_healthy`) | Done | API + system tests |
| Crash stub: React ErrorBoundary + server process handlers + graceful flush | Done | code review; CI |
| Update check: Settings → About vs GitHub Releases, fail-soft, cached | Done | system tests (comparison logic); manual QC |
| In-app version surfacing (`/healthz`, `/api/health`, Settings) | Done | API tests |
| CI: format-check + 3-OS build-test + docker + Pages deploy | Done | GitHub Actions runs |
| Release path: `release.yml` on `v*` tags, checksummed artefacts, changelog notes | Done | release workflow run for this tag |
| Governance: PR template, CONTRIBUTING, roadmap, legal checklist | Done | files in tree |

**Readiness: 100% of the v0.1.0 scope above, verified.**

## Milestone: v0.2.x — hardening & shared-capability deepening

Planned items. Anything requiring public research waits for research notes
(original summaries + URLs) and the **human gate** before implementation.

| Candidate | Ready for work | Notes |
| --- | --- | --- |
| In-app crash report submission (GitHub Issues via user token/device flow) | Blocked on research + human gate | §7.1 full flow; pre-filled issue link already shipped as fallback |
| Multi-architecture container images (arm64) | Ready | purely CI work |
| Opinionated formatter (Prettier) adoption | Ready | one-off whole-repo reformat, separate release |
| Browser-level (DOM) UI tests (e.g. Playwright) | Ready | complements the two existing suites |
| Prometheus alert examples + runbook doc | Ready | docs only |

## Milestone: 1.0.0 — stability declaration

Declared when: v0.2.x hardening lands, one full release cycle runs without a
data-loss or security defect, and the operating guide's finished-product gates
(§9) plus the legal checklist (§2.5) pass on the release commit.

## Release cadence

Frequent semver releases (`0.1.1`, `0.2.0`, …). Each GitHub Release body
follows the standard in `docs/qc/release-checklist.md` (summary, Added /
Changed / Fixed, known limitations, artefact checksums). The app's update
check (Settings → About) reads these releases.
