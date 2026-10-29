# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Hardening pass from a source audit of the whole application.** Fixed:
  - **Server source was downloadable by anyone.** `/server.cjs` and its
    source map (which embeds full `sourcesContent`) sat in the served `dist/`;
    the map is no longer built for production and the web root now refuses
    `/server.cjs*` with a 404.
  - **Per-account lockout was bypassable** by submitting the account email with
    surrounding whitespace — the lockout key is now trimmed, matching the
    credential lookup.
  - **Push endpoints were an SSRF primitive.** `POST /api/push/subscribe`
    accepted any endpoint, and the server later issued an authenticated POST to
    it on every alert; endpoints are now restricted to HTTPS URLs on known push
    services.
  - **Push authorisation gaps.** Unsubscribing no longer works across accounts,
    and the broadcast test notification now requires the Manager role.
  - **Alert emails interpolated unescaped values** into HTML, so an
    operator-set location name could inject markup into the safety email;
    every interpolated value is escaped.
  - **CSV exports were open to formula injection and mis-quoting.** One shared
    serializer now quotes every field and neutralises leading `= + - @`.
  - **Unvalidated safety thresholds could silently disable the engine.** A
    cleared numeric field became `null`, every comparison went false and no
    severe-weather alert could fire; thresholds and alert cooldown are now
    validated server-side.
  - **SMTP TLS verification was disabled** (`rejectUnauthorized: false`),
    exposing alert mail and SMTP credentials to a network attacker; it now
    verifies by default with an explicit `SMTP_TLS_INSECURE` opt-out.
  - **`/metrics` accepted a token in the query string** and compared it
    byte-wise; it is now header-only and compared in constant time.
  - **The SQLite file was world-readable** — it holds password hashes, session
    tokens and MFA secrets; it is now written `0600`.
  - **`.dockerignore` missed renamed data directories** (`data*`), which would
    have copied the database and private keys into a local image build.
  - **`visual.yml` ran unpinned actions** without a `permissions` block.

### Added

- **Unified personal-data and secret scanner covering all four II.29 surfaces.**
  `scripts/scan-personal-data.mjs` replaces the earlier tree-only shell scan and
  covers what II.29.2 defines: the working tree (dot-directories included), the
  whole git history (deduplicated blobs across every ref), the commit/tag
  metadata, and extracted release artefacts. Two behaviour changes matter: it
  **masks every matched value**, because this repository is public and echoing a
  hit into a CI log would re-publish the value being removed (II.29.4.2); and it
  **classifies** each hit as failing, informational (obviously-synthetic
  fixtures) or third-party (upstream lockfile/vendored authorship), instead of
  failing on every match. A `PERSONAL_DENYLIST` repository secret lets the gate
  block values this project has had to remove without writing those values into
  the tree. The pull-request check keeps the name `Personal data scan`, so
  `.ci-required.txt` and branch protection stay valid; the release job now runs
  the full scan — history and built artefacts included — before any asset is
  attached (II.29.5).

### Changed

- **Privacy: no maintainer location or identity ships in the app (owner directive).**
  The bundled default site is now a neutral **Unconfigured Site** placeholder
  (0, 0, UTC) in every code path — the server seed, the browser-only static
  build, the dashboard fallback and the map fallback — replacing a real place
  that was visible to anyone on the public Pages deployment. The dashboard now
  shows a "No site configured" prompt with an **Add site** action until the
  operator configures their own site, so a placeholder is never mistaken for a
  real site reading. Location-field placeholders no longer use examples drawn
  from a real place.

### Fixed

- **Privacy: removed maintainer-identifying data from the repository.** Deleted
  the owner's real name from `CONTRIBUTORS.md`, and removed the home-directory
  paths (`/home/<user>/…`) that disclosed the maintainer's OS username from the
  tracked `.opencode/agents/*.md` configs (the equivalent `~/…` rules remain).
  Timezone and coordinate fixtures in the unit suite were moved off the
  maintainer's locale to a neutral half-hour-offset zone with identical test
  intent.

### Added

- **Browser-level (DOM) smoke tests (0.2.x, Playwright).** Added
  `tests/ui/smoke.spec.ts` (7 tests) plus `tests/ui/playwright.config.ts`,
  which builds the app and boots the production server against a temporary
  `DATA_DIR` with stubbed external weather providers and raised auth/API rate
  limits. Coverage: first-run setup, sign-in with existing credentials,
  dashboard shell panels, manual-check in-flight state, alert-panel dismiss
  flow, Settings → About version, and viewer role gating (owner-only tabs
  filtered). New `ui-tests` CI job runs it on Chromium and uploads the HTML
  report and traces as artifacts; `docker` now depends on `build-test` and
  `ui-tests`. Also fixed a bug the tests exposed: a successful manual check left
  the "Check now" button permanently disabled because `isChecking` was never
  reset on the success path.
- **Crash/bug report submission (0.2.x, device-flow).** Settings → About now offers opt-in
  GitHub device-flow connection (user token held in memory only), in-app report preview modal
  with payload scrubbing, and direct issue creation via GitHub REST API. Falls back to pre-filled
  URL if not connected or on failure. Added `src/utils/crashReport.ts` with pure poll state machine
  and scrubber, unit-tested. Privacy note updated.

- **Observability — Prometheus runbook + example alerts (slice 0.2.x).** Added
  `docs/runbook.md` documenting every `cwm_*` metric, scrape config with `METRICS_TOKEN`,
  normal ranges, and per-alert first actions. Added `deploy/prometheus/alerts.example.yml`
  with copy-ready rules (`CwmDatabasePersistUnhealthy`, `CwmMonitorStalled`, `CwmMonitorConsecutiveFailures`,
  `CwmMemoryHigh`, etc.) and `runbook_url` annotations. Rules validate the app's single-node
  semantics and auth-gated `/metrics` endpoint.

- **Open-source project readiness (Part II of operating guide).** Added
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, `ACCESSIBILITY.md`, `VISION.md`,
  `GOVERNANCE.md`, `CONTRIBUTORS.md`, `CITATION.cff`; GitHub issue templates
  (bug, feature, accessibility) with private security reporting; `dependabot.yml`,
  `CodeQL` workflow; licence policy checker (`scripts/check-licences.mjs`); PR
  template expanded with accessibility checklist and git-identity reminder;
  `CONTRIBUTING.md` expanded with local setup, identity instructions and
  response expectations.
- **Security & supply chain (guide §20).** CodeQL SAST and a dependency-review
  gate run on every PR; Dependabot (npm/actions/docker) and Dependabot security
  updates enabled; a `security-compliance` CI job runs the dependency licence
  policy check and produces a CycloneDX SBOM; all workflow actions are pinned to
  commit SHAs; `main` is protected (required checks, no force-push, conversation
  resolution); private vulnerability reporting enabled.
- **Legal/compliance.** Open-Meteo data attribution added to the UI footer and
  map (CC BY 4.0); `ATTRIBUTION.md` extended with dependency classes, AI/model
  provenance and deliberate MIT-only licensing. Map tiles attribution clarified.
- **Research phase complete (guide §2.3).** Five research notes in
  `docs/research/` — in-app crash report submission (device-flow user token,
  memory-only), multi-architecture container images, Prettier adoption,
  Playwright DOM smoke tests, and Prometheus alert examples + runbook. Each
  note is an original summary with acceptance criteria, edge cases, and source
  URLs only. **All five notes are approved** (human gate passed 2026-10-24);
  implementation proceeds one slice per PR.
- `docs/current-model-map.md` documents the research method (guide §2.4):
  orchestrator web access first, CI fetch assist second, human-pasted excerpts
  last; notes human-gated before dependent implementation.
- `ROADMAP.md` expanded into the exhaustive completion plan: staged
  0.1.x → 0.2.x → 1.0.0 with feature-breadth and ready-for-work percentages
  updated from evidence only, plus an explicit out-of-scope record.

## [0.1.1] — 2026-10-24

### Added

- **Multi-architecture container images** (research-gated slice 2 of 5). The
  release workflow now builds and publishes `linux/amd64` **and** `linux/arm64`
  images to `ghcr.io/perchemop/weather-monitor` (version tags + `latest`),
  via QEMU + Buildx. PR verification stays build-only (no registry push).

### Changed

- **Prettier is now the style authority** (research-gated slice 1 of 5). One
  dedicated reformat across code, Markdown, JSON and YAML with no behavioural
  change. Config in `.prettierrc.json` (no semicolons, single quotes, width
  110); `npm run prettier:check` runs in CI alongside the unchanged hygiene
  checker (`scripts/check-format.mjs`); `.prettierignore` keeps docs,
  generated output, lockfiles, the service worker and the harness config
  (`.opencode/`, `opencode.jsonc` — files the harness owns and rewrites) out
  of the formatter.

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

### Known limitations

- The WeatherAPI key (optional) must be provided as a server environment
  variable; there is no in-app key entry by design (keys never reach the
  browser).
- Autonomous monitoring runs only while the server (or, in the static build,
  the browser tab) is running — there is no external scheduler.
- Static (GitHub Pages) mode has no accounts, no shared database and no push
  service; it is a single-browser companion to the server build.
- The in-app update check reads only the latest published release; it does not
  auto-install anything.
- In-app crash report submission requires a user GitHub token (planned 0.2.x,
  research-gated); until then the pre-filled issue form is the reporting path.
- Container images are published for the CI runner architecture (amd64) only.
