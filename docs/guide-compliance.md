# Guide Compliance

Rule-by-rule record of how this project satisfies the local operating guide
(`guide.md`, kept local and never committed), plus every place a guide rule was
**adapted** to suit this project. Adaptations are deliberate and recorded as
decisions — the guide is not silently overridden.

Legend: **Met** = implemented as written; **Adapted** = implemented with a
recorded deviation; **Deferred** = tracked gap with rationale.

## §0 First-run discovery

| Rule | Status | Where |
| --- | --- | --- |
| Discovery conversation recorded before code | Met | `docs/project-brief.md`, `docs/scope.md`, `docs/inspiration.md`, `docs/product-name.md`, `docs/assumptions-and-questions.md` |
| Never commit the guide file | Met | `guide.md` is untracked; only its requirements live in this repo |

## §1 Mission

| Rule | Status | Where |
| --- | --- | --- |
| Real data models, persistence, validation, error handling | Met | `src/database/db.ts`, route validation in `server.ts` |
| Runnable/testable/buildable from a clean checkout | Met | CI: install → type-check → 88 tests → server build → static build |
| Free and open-source tools and dependencies | Met | `ATTRIBUTION.md`; no proprietary runtime |
| Traceability capability → implementation + tests | Met | `REQUIREMENTS_TRACEABILITY.md` |
| No proprietary code, assets or reverse-engineered internals | Met | `docs/inspiration.md` (clean-room statement) |

**Adapted — "all practical platforms".** The guide's default stack is Rust +
egui/eframe. Discovery fixed TypeScript/React + Express, so "all practical
platforms" is delivered as: web (server build and GitHub Pages static build),
plus Windows/macOS/Linux via Node and the Docker image. The build/test matrix
runs on all three OSes. Recorded as D-18.

## §2 Clean-room rules

| Rule | Status | Where |
| --- | --- | --- |
| Inspiration limited to documented standards, black-box behaviour, and the recorded docs | Met | `docs/inspiration.md` (AS 2550.1, WMO codes, WeatherAPI/Open-Meteo API docs) |
| Original data models, UI and interaction | Met | all first-party code |
| Third-party assets permissively licensed and listed | Met | `ATTRIBUTION.md`; icons are Lucide (ISC), map tiles Leaflet/OSM/ RainViewer |
| Clear open-source licence recorded | Met | `LICENSE` (MIT — see A-01/Q-01, decision D-13) |

## §3 Technology stack

| Rule | Status | Where |
| --- | --- | --- |
| Stack choices recorded | Met | `docs/architecture.md` |
| Lightweight local persistence | Met | SQLite via `sql.js`, single file, `DATA_DIR` overridable |
| Command-centric or clear use-case layer | **Adapted** | see below |
| No panics in non-test code; never lose user data | Met | errors caught per route/location; persistence failures surfaced, never swallowed silently |
| Testing: unit, property-based, integration, manual QC | Met | 59 system (incl. property tests + persistence health), 29 HTTP integration, `docs/qc/` |
| CI on multiple OS runners | Met | `format-check` + matrix `build-test` (Windows/macOS/Linux) + `docker` |

**Adapted — command-centric.** The guide prefers a command layer. This app is an
HTTP API plus a polling service, so the use-case layer is the service module
boundary (`riskEngine`, `alertEngine`, `weatherService`, `monitoringService`)
with pure, headless functions. That is the "clear use-case layer" the rule allows
and keeps every mutation testable without HTTP. Recorded as D-19.

**Adapted — never lose user data.** `persistDb()` cannot block a request on a
disk failure, so a failed write is recorded and exposed (`getPersistenceStatus`,
`/api/health.databaseStatus`, `cwm_database_persist_healthy`) instead of being
reported as healthy. Recorded as D-20.

## §4 Local machine protection + GitHub Actions

| Rule | Status | Where |
| --- | --- | --- |
| All heavy work in GitHub Actions | Met | CI is the only build/test path; local work is edits + read-only git |
| Public repository | Met | <https://github.com/Perchemop/Weather-Monitor> |
| Commit and push after every meaningful change; CI is the source of truth | Met | every slice pushed and verified; `ci.sh run "…"` |
| CI: format check | Met | `scripts/check-format.mjs`, `format-check` job |
| CI: lint with warnings denied | Met | `npm run lint` (`tsc --noEmit`) fails on any diagnostic |
| CI: full test suite | Met | 88 tests in both suites |
| CI: dependency + build caching | Met | `actions/setup-node` with `cache: npm` |
| CI: clear summaries and artefacts | Met | job summary step, `upload-artifact` for `dist/` + `dist-static/` |

**Adapted — format check.** No opinionated formatter is configured, so the check
is a dependency-free hygiene script (line endings, conflict markers, final
newline, spaces-not-tabs, trailing whitespace on added lines only). Adopting
Prettier would require a one-off whole-repo reformat, which conflicts with the
"small and reviewable" rule. Recorded as D-12.

## §5 CTO.new-style operating model

| Rule | Status | Where |
| --- | --- | --- |
| Chat (plan) and Task (execute) kept separate | Met | `docs/development.md` §"Two Modes" |
| Daily flow, PR for review, human merges | Met | open PR per slice; nothing merged without review |
| Orchestrator plans only | Met | `.opencode/agents/orchestrator.md` — edit and shell denied |
| Coder executes, commits, pushes | Met | `.opencode/agents/coder.md` |
| Explorer read-only | Met | `.opencode/agents/explorer.md` — edit denied |
| Reviewer read-only, does not fix | Met | `.opencode/agents/reviewer.md` — edit denied |
| Discover available free models; assign per role; record mapping | Met | orchestrator instructions + `docs/current-model-map.md` |
| No Ollama / local model hosting | Met | stated in every agent file |

**Adapted — extra roles.** `tester`, `fixer`, `docs-writer` and `ci-runner` were
added beyond the guide's four. They are supporting cast for the same flow, not a
deviation from it.

## §6 Source of truth and tracking files

All required paths exist: `docs/project-brief.md`, `docs/scope.md`,
`docs/inspiration.md`, `docs/product-name.md`, `docs/architecture.md`,
`docs/parity.md`, `docs/assumptions-and-questions.md`,
`docs/current-model-map.md`, `IMPLEMENTATION_PLAN.md`,
`REQUIREMENTS_TRACEABILITY.md`, `DECISIONS.md`, `PROGRESS.md`,
`CHANGELOG.md`, `ATTRIBUTION.md`, `docs/qc/`, `docs/development.md`,
`docs/design/brand.md`, `docs/research/README.md`, `ROADMAP.md`,
`CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md` (plus `LICENSE`).
Facts, assumptions and decisions are kept apart.

## §6a Progressive releases & roadmap (guide §6)

| Rule | Status | Where |
| --- | --- | --- |
| Release workflow from day one | Met | `.github/workflows/release.yml` — tag `v*.*.*` → gated build, artefacts, checksums, CHANGELOG-derived notes |
| Hard v0.1.0 gate (installable, real workflow, crash stub, update-check stub, CI, docs, legal baseline, tag) | Met | `v0.1.0` release; crash stub = ErrorBoundary + server process handlers; update-check stub = Settings → About |
| Release notes standard (summary, Added/Changed/Fixed, limitations, checksums) | Met | `release.yml` extraction step + standard recorded in `docs/qc/release-checklist.md` |
| Readiness % only from evidence | Met | `ROADMAP.md` ties every Done claim to CI runs/tests |
| Human gate on research before dependent feature work | Met | `docs/research/README.md` rules; 0.2.x research-gated items marked "Blocked on research" in `ROADMAP.md` |

## §6b Suite infrastructure — crash reporting & update check (guide §7)

**Adapted to the web/TS stack** (recorded as D-22). The guide's shared Rust
crates are delivered as first-party TypeScript:

| Rule | Status | Where |
| --- | --- | --- |
| Crash stub (log, minimal surface; full submit later OK) | Met | React `ErrorBoundary` (wired in `main.tsx`); server `unhandledRejection` structured log; `uncaughtException` → log + SQLite flush + bounded exit; graceful SIGTERM/SIGINT flush |
| Update check (GitHub Releases, compare, fail soft, no API abuse) | Met | `src/utils/updateCheck.ts` (pure, unit-tested) + Settings → About (hourly cache, manual button, honest `unknown` state) |
| Fallback: pre-filled New Issue URL, never a privileged token | Met | About → "Open a GitHub issue" (user reviews before sending) |
| Privacy documented | Met | README "Staying current" + About copy ("never sends any information from this device") |

## §7 Architecture principles

| Rule | Status | Where |
| --- | --- | --- |
| Domain/engine separated from UI | Met | `src/services/*` vs `src/components/*` |
| Headless core usable by tests and CLI | Met | services are pure functions called by tests without HTTP |
| Simplest architecture that supports the behaviour | Met | documented in `docs/architecture.md` |
| Data-driven configuration where it reduces hard-coding | Met | thresholds, intervals, retention, rate limits and lockout policy are settings/env-driven |

## §8 Vertical slices / Tasks

Definition of done per slice: requirements implemented ✅, tests for normal and
failure paths ✅, committed and pushed ✅, CI green ✅, PR opened/updated ✅,
tracking docs updated ✅, no fake success or dead controls ✅, small and
reviewable ✅, no local heavy work ✅.

## §9 Quality control

| Rule | Status | Where |
| --- | --- | --- |
| Automated tests in CI | Met | both suites |
| Living parity / traceability tracker | Met | `docs/parity.md`, `REQUIREMENTS_TRACEABILITY.md` |
| Manual QC checklists | Met | `docs/qc/manual-checklist.md`, `docs/qc/release-checklist.md` |
| Never claim unverified work | Met | every claim in these docs points at a CI run |
| Human reviews PRs before merge | Met | PR stays open until reviewed |

Final gates: capability status ✅ (parity + traceability), main workflows
end-to-end ✅, persistence integrity tested ✅, no fake functionality ✅
(404/400 for unknown targets, honest UI failures), full suite + clean build ✅,
no secrets committed ✅ (`.env*` ignored except `.env.example`), dependencies and
licences listed ✅, README accurate ✅ (reconciled counts and role claims),
known limitations documented ✅ (`docs/scope.md`, assumptions and questions).

## §10–§14 UI/UX, structure, sequencing

| Rule | Status | Where |
| --- | --- | --- |
| Every visible control works or is explained | Met | role-mirrored UI; deleted/disabled controls removed |
| Original visual design; marks described in `docs/design/brand.md`; SVG icons | Met | own Tailwind token set; `docs/design/brand.md`; `public/icon*.svg` are agent-authored; Lucide (ISC) in `ATTRIBUTION.md` |
| PR template with review checklist | Met | `.github/PULL_REQUEST_TEMPLATE.md` (guide §8.3) |
| Suggested repository structure | Met | matches §11 layout |
| Create public repo, don't push the guide, then CI + agents + tracking | Met | history shows skeleton → CI → agents → docs → slices |
| Evidence-based report at the end of a phase | Met | this file plus `docs/qc/release-checklist.md` |
| Secret scanning / leak protection | Met | GitHub push protection + secret scanning; PR checklist line |

## Part II — §15 Coverage map & §16 required files

| Rule | Status | Where |
| --- | --- | --- |
| Required repository files present | Met | `LICENSE`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `ACCESSIBILITY.md`, `VISION.md`, `GOVERNANCE.md`, `CONTRIBUTORS.md`, `CITATION.cff`, `CHANGELOG.md`, `ATTRIBUTION.md`, `docs/qc/` |
| Issue templates (bug, feature, accessibility) | Met | `.github/ISSUE_TEMPLATE/{bug_report,feature_request,accessibility_report,config}.yml` |
| Licence choice deliberate | Met | MIT-only, recorded in `ATTRIBUTION.md` and D-28 (§26.6) |

## Part II — §17–§18 community, naming

| Rule | Status | Where |
| --- | --- | --- |
| Contributor funnel, README for a stranger | Met | `README.md` (what/why/how/help + Community & policies) |
| CONTRIBUTING beyond mechanics (bug/feature/setup/tests/tone) | Met | `CONTRIBUTING.md` (incl. §26.1 resolution) |
| Expectations & boundaries (7 days, few hours/week) | Met | `CONTRIBUTING.md`, `GOVERNANCE.md` |
| Labels that invite contribution | Met | `good first issue`, `help wanted`, `documentation`, `first-timers-only`, plus area labels |
| Keep discussion public; name conflict check | Met | `GOVERNANCE.md`, `docs/product-name.md` conflict record |

## Part II — §19 legal

| Rule | Status | Where |
| --- | --- | --- |
| Dependency licence classes recorded | Met | `ATTRIBUTION.md` (D-24) |
| Non-code asset licences (icons, data, map) | Met | `ATTRIBUTION.md`; Open-Meteo CC BY 4.0 shown in UI footer + map |
| Automated licence + SBOM checks | Met | `scripts/check-licences.mjs`; `security-compliance` job (CycloneDX SBOM) |
| Contributor agreement / DCO decision | Met | inbound=outbound via MIT; recorded in `CONTRIBUTING.md` |
| Employer/IP check recorded | Adapted | assumed unchecked; `docs/assumptions-and-questions.md` A-07 |
| AI/model terms recorded | Met | `ATTRIBUTION.md` provenance section |

## Part II — §20 security

| Rule | Status | Where |
| --- | --- | --- |
| MFA + two admins | Human action | recorded in `docs/assumptions-and-questions.md`, `GOVERNANCE.md` |
| SAST | Met | CodeQL workflow (JS/TS) on push/PR/weekly |
| Protected branch + required checks | Met | branch protection on `main` (6 required checks; no force-push/deletion) |
| SCA / dependency updates | Met | Dependabot (npm/actions/docker) + Dependabot security updates; `dependency-review` job |
| Pin build inputs | Met | all `uses:` pinned to commit SHAs |
| Private vulnerability reporting + threat model | Met | enabled on GitHub; `SECURITY.md` threat model + incident response |
| Secret scanning | Met | secret scanning + push protection enabled (validity/non-provider patterns need GHAS) |

## Part II — §21–§25 accessibility, governance, launch, sustainability, DoD

| Rule | Status | Where |
| --- | --- | --- |
| Accessibility statement + separate report path | Met | `ACCESSIBILITY.md`, `accessibility_report.yml`, `accessibility` label |
| A11y PR checklist + DoD + release smoke test | Met | `.github/PULL_REQUEST_TEMPLATE.md`, `docs/qc/release-checklist.md` |
| Governance roles, decision model, tiebreaker | Met | `GOVERNANCE.md` |
| Vision/message, one home URL, metrics recorded | Met | `VISION.md`, Pages site, `docs/assumptions-and-questions.md` A-08/A-09 |
| Sustainability (response expectations, pause policy) | Met | `GOVERNANCE.md`, `CONTRIBUTING.md` |
| Updated DoD + pre-launch checklist | Met | `docs/qc/release-checklist.md` (Part II gates + a11y smoke test) |
| Tracking files updated | Met | `CHANGELOG.md`, `PROGRESS.md`, `REQUIREMENTS_TRACEABILITY.md` (R-37…R-44) |
| Git identity `"<App Name> Dev"` | Met | `ci.sh` asserts; PR template + `docs/development.md` (D-23) |

## Part II — §26 conflicts (resolved, recorded)

All six conflicts recorded in `DECISIONS.md` D-28: local tests documented with
CI authoritative; public-from-day-one kept with hard gates; PR flow + protected
branch adopted; agent credentials least-privilege with two-admins flagged;
guide stays local with process mirrored publicly; MIT-only licence confirmed.

**Remaining human decisions (not silently resolved):** enabling MFA and adding a
second admin; whether to pursue a domain/handles beyond GitHub; and the
employer/IP check (A-07).

## Deferred

- In-app crash report submission via user token / device flow (0.2.x, research-gated — the pre-filled issue URL is the shipped fallback).
- Browser-level (DOM) UI tests (Playwright) — covered today by type-check, build and manual QC; research slice 4 of 5.
- Repository secret-scanning validity checks / non-provider patterns (need GitHub Advanced Security).
