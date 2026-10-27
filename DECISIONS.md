# Decisions

Implementation decisions for the Construction Weather Monitor, newest first.
Each entry records _what_ was decided and _why_. Facts, assumptions and open
questions live in `docs/project-brief.md` and
`docs/assumptions-and-questions.md`.

---

## D-28 — Part II §26 open questions resolved (2026-10-24)

The operating guide's Part II records six conflicts and leaves them to the human.
Decisions taken (all reversible):

- **§26.1 local tests vs no heavy local work:** keep the local-build restriction
  for the maintainer's machine, and document the exact commands in
  `CONTRIBUTING.md`, stating CI is authoritative here _only_ because that machine
  is constrained. Implemented.
- **§26.2 public-from-day-one:** keep public (Part I requires it for the release
  and update-check flows) with the added hard gates — secret scanning + push
  protection, SAST, branch protection from the start. Implemented.
- **§26.3 direct push vs protected branch:** adopt the pull-request flow for every
  change and enable branch protection requiring the CI checks. Implemented
  (required: format-check, security-compliance, build-test ×3, docker).
- **§26.4 agent credentials vs two admins:** agent automation uses repo-local
  identity and least privilege; at least two human admins is a human action item
  recorded in `GOVERNANCE.md`/`docs/assumptions-and-questions.md`.
- **§26.5 guide stays local vs publishing process:** `guide.md` stays local; the
  contributor-relevant parts are mirrored into `CONTRIBUTING.md`/`GOVERNANCE.md`.
- **§26.6 licence:** deliberately **MIT-only** (not "MIT OR Apache-2.0");
  recorded here and in `ATTRIBUTION.md`.

## D-27 — Security posture: SAST, SCA, SBOM, protected branch (2026-10-24)

Per Part II §20: CodeQL (SAST) and dependency-review run on every PR; Dependabot
(npm/actions/docker) plus Dependabot security updates are enabled; a licence-policy
check and a CycloneDX SBOM are produced in a dedicated `security-compliance` CI job;
private vulnerability reporting is enabled; and `main` is protected (no force-push,
no deletion, conversation resolution, required checks). `enforce_admins` is left
`false` as a documented break-glass valve for the single maintainer.

## D-26 — Community files and accessibility practice adopted (2026-10-24)

Per Part II §16–17, §21–25: added `CODE_OF_CONDUCT.md`, `SECURITY.md`,
`ACCESSIBILITY.md`, `VISION.md`, `GOVERNANCE.md`, `CONTRIBUTORS.md`, `CITATION.cff`,
issue templates (bug/feature/accessibility), a PR accessibility checklist,
contributor labels, and response-time expectations (7 days). Accessibility is written
into the Definition of Done and the release checklist. Bilingual CoC wording is
original, in the spirit of the Contributor Covenant (not a copy).

## D-25 — Open-Meteo data attribution (CC BY 4.0) (2026-10-24)

Open-Meteo data is CC BY 4.0 and requires attribution next to displayed data. The UI
footer now links "Weather data by Open-Meteo" (with the licence noted) and the map
credits OpenStreetMap with a link. `ATTRIBUTION.md` records the data licences and the
free-tier non-commercial caveat.

## D-24 — Dependency licence policy and AI provenance recorded (2026-10-24)

`ATTRIBUTION.md` classifies dependencies (permissive; MPL-2.0 weak copyleft tracked;
CC-BY-4.0 usage data) and records the model/API terms used during the build (§19.7).
`scripts/check-licences.mjs` enforces an allowlist in CI.

## D-23 — Git identity enforcement (guide §5.5) (2026-10-24)

Every app git action is authored as `Construction Weather Monitor Dev
<dev@example.com>`. `ci.sh` asserts the repository-local identity before committing
and refuses otherwise; the PR template and `docs/development.md` restate it.

## D-22 — Suite infrastructure adapted to the web/TS stack (2026-10-24)

The guide's shared `crash-report` / `update-check` Rust crates are implemented
for this stack as first-party TypeScript: a React `ErrorBoundary` plus server
process handlers (`unhandledRejection` log, `uncaughtException` → log + SQLite
flush + bounded exit) form the crash stub; Settings → About provides the
update check (GitHub Releases API, hourly cache, fail-soft) and a pre-filled
GitHub issue form as the crash-report fallback (no token embedded, nothing
sent automatically).

**Why:** the discovery fixed a TypeScript web app, so a Rust crate is not
consumable. The web-app equivalents deliver the same capabilities at the
v0.1.0 gate level; the full in-app report flow (user token / device flow) is
roadmapped for 0.2.x behind the research human gate.

## D-21 — Versioning and release path: semver tags from v0.1.0 (2026-10-24)

`package.json` version is `0.1.0` (was the untagged `1.0.0`), kept in sync with
`src/version.ts` and git tags. A tag-triggered `release.yml` gates on the full
verification suite, builds the server and static bundles, attaches SHA-256
checksummed artefacts, and publishes a GitHub Release whose notes are
extracted from the matching `CHANGELOG.md` section. The in-app update check
compares `src/version.ts` against the latest release tag.

**Why:** the guide requires the release path to exist from day one (§4) and a
hard, honest v0.1.0 gate (§6.1). Starting the semver story at 0.1.0 keeps the
pre-1.0 contract explicit and makes the update check meaningful.

## D-20 — Persistence failures are observable (2026-10-23)

`persistDb()` records a failed write (`getPersistenceStatus()`) and exposes it
through `/api/health.databaseStatus` and the `cwm_database_persist_healthy`
metric, instead of reporting `HEALTHY` unconditionally.

**Why:** the guide requires "never lose user data" and no fake success. A
swallowed write failure leaves the SQLite file behind the in-memory database,
which is exactly the silent data loss the rule forbids — and the previous health
response asserted `databaseStatus: 'HEALTHY'` regardless.

## D-19 — Use-case layer instead of a command layer (2026-10-23)

The guide prefers command-centric architecture. This app is an HTTP API plus a
polling loop, so mutations are service functions with explicit inputs
(`riskEngine`, `alertEngine`, `weatherService`, `monitoringService`) and every
route handler is a thin adapter.

**Why:** it is the "clear use-case layer" the same rule allows, keeps the domain
headless and directly testable without HTTP, and avoids a command indirection
that would add ceremony without a dispatcher to justify it.

## D-18 — Platform targets: web plus all desktop OSes via Node/Docker (2026-10-23)

The guide's default stack is Rust + egui/eframe. Discovery fixed
TypeScript/React/Express, so "all practical platforms" is delivered as a web
application (server build and GitHub Pages static build) plus Windows, macOS and
Linux via Node and the container image, with a CI matrix on all three.

**Why:** the discovery answers are the project's source of truth; re-platforming
to satisfy a default recommendation would discard a working system. This records
the adaptation rather than silently overriding the guide.

## D-17 — Format check via a dependency-free hygiene script (2026-10-23)

`scripts/check-format.mjs` implements the guide's "format check" CI requirement
without adding an opinionated formatter.

- Whole repository: no CRLF, no merge-conflict markers, a final newline, spaces
  (not tabs) for indentation in code files.
- Changed lines only: no trailing whitespace. Markdown is exempt because two
  trailing spaces are a meaningful hard line break there.
- A dedicated `format-check` GitHub Actions job runs it against the PR base ref.

**Why:** adopting Prettier would force a whole-repository reformat — a large,
unreviewable diff — while a no-op check would not satisfy the requirement.
Enforcing trailing whitespace only on lines a change introduces keeps legacy
files from failing the gate.

**Superseded in part (2026-10-24):** Prettier is now adopted as the style
authority in its own dedicated release (see `docs/research/prettier-adoption.md`,
approved via the research gate). The hygiene script above is unchanged and stays
in force — the two layers are distinct jobs in the `format-check` CI job.
`docs/`, generated output, lockfiles, `public/sw.js` and `opencode.jsonc` are
excluded from Prettier via `.prettierignore`.

## D-16 — Coder may commit, push and open the PR (2026-10-23)

The `coder` subagent now has permissions for `git add/commit/push` and for the
repository's `ci.sh`; the `ci-runner` subagent remains available but is no longer
required.

**Why:** the guide's Task mode (§5.5) defines the Coder as owning commit and push
so the free Task Runner (GitHub Actions) can verify immediately; the previous
"never commit" rule added a routing hop with no safety benefit, since the
CI-first rule is enforced independently.

## D-15 — CI hardened and multi-OS (2026-10-23)

The build/test job runs as a `fail-fast: false` matrix on Windows, macOS and
Linux, with `permissions: contents: read`, concurrency cancellation, job
timeouts, a job summary and artefact upload. `npm run build:static` uses
`vite build --mode static` instead of a POSIX-only `VAR=value command` prefix.

**Why:** the guide's required CI design (multi-OS, caching, summaries,
artefacts), and the static build was silently broken on Windows — the matrix
caught it on its first run.

## D-14 — One-time bootstrap setup (2026-10-23)

`POST /api/auth/setup` may run only while setup has not completed. A fresh
install seeds a bootstrap OWNER and a `bootstrap_owner_generated` marker;
completing setup writes `owner_configured`. Existing databases that predate the
marker and already contain an OWNER are backfilled to configured on load.

**Why:** the endpoint previously accepted requests at any time and reset the
primary OWNER's credentials, which is a full account takeover by an
unauthenticated caller.

## D-13 — Live session reconciliation on account changes (2026-10-23)

Role changes, deactivation, renames, password resets and deletions reconcile
in-memory sessions immediately; deactivated or deleted accounts have every
session revoked. Changing your own password keeps your current device and
revokes the rest.

**Why:** sessions carried a snapshot of role/email, so a demotion or
deactivation did not take effect until the session expired.

## D-12 — Opt-in proxy trust (2026-10-23)

`TRUST_PROXY` is unset by default. When set it configures Express `trust proxy`.

**Why:** unconditionally trusting one hop let any direct client spoof
`X-Forwarded-For` and evade IP-based rate limiting and lockout.

## D-11 — WeatherAPI condition codes are mapped to WMO (2026-10-23)

`weatherApiCodeToWmo` translates WeatherAPI condition codes to WMO codes before
they enter the risk and alert engines.

**Why:** the engines test numeric thresholds such as `weatherCode >= 95`, and
WeatherAPI's clear-sky code is `1000`. Passing the raw code through made every
clear day a critical thunderstorm whenever a WeatherAPI key was configured.

## D-10 — Open-Meteo times are converted to UTC (2026-10-23)

Wall-clock strings from Open-Meteo are parsed as UTC and offset by the
response's `utc_offset_seconds`.

**Why:** `new Date("2026-10-23T12:00")` parses in the _server's_ timezone, so
current and hourly values shifted whenever the server did not share the site's
clock.

## D-09 — Per-location alert cooldown (2026-10-23)

Alert history used for dedupe and cooldown is fetched per location.

**Why:** a shared global history let a recently fired alert at one site suppress
the same alert type at another site.

## D-08 — No fake success (2026-10-23)

Mutating endpoints report the real outcome: unknown targets are `404`/`400`, the
default location cannot be deleted, unknown `locationId` values are `404`, and
the UI keeps an alert on screen when the dismiss call fails.

**Why:** a success response for a no-op hides real state and misleads operators
about safety conditions.

## D-07 — `PARTIAL` monitor run status (2026-10-23)

A monitoring cycle that completes some locations but fails others records
`PARTIAL`; metrics expose it and the weekly summary counts it as success.

**Why:** the previous code smuggled a non-union value through `as any`, and
dashboards could not distinguish a clean run from a degraded one.

## D-06 — Settings is available to every role; site config stays OWNER-only (2026-10-23)

The Settings tab is shown to all authenticated roles because each account owns
its password, MFA, active sessions and push preferences. The site-configuration
tabs are OWNER-only and hidden for MANAGER/VIEWER.

**Why:** the server already allowed self-service security for every role, but
the UI hid Settings from non-owners and let them see location controls the
server rejected.

## D-05 — Licence: MIT (assumed)

The project is released under the MIT licence.

**Why:** it is the most permissive common default for a public repository.
This is an assumption pending owner confirmation — see
`docs/assumptions-and-questions.md`.

## D-04 — SQLite via `sql.js` with periodic snapshots

Data persists to a single SQLite file through `sql.js`, with write-through
persistence and rotating 30-minute backup snapshots.

**Why:** no native dependency, works in constrained environments, and keeps the
enclave local-first with no external database.

## D-03 — Deterministic risk engine, no probabilistic model

Risk is rule-based and reproducible for identical inputs.

**Why:** construction safety decisions must be explainable and auditable, and
the output is used to trigger alerts.

## D-02 — Dual weather providers with automatic fallback

WeatherAPI is the primary reference when a key is present; Open-Meteo is always
cross-referenced and becomes the sole source when WeatherAPI fails or when
`LOCAL_ONLY` is set.

**Why:** independent models give a concordance signal, and the open provider
removes the hard dependency on a paid key.

## D-01 — Vertical slices with CI-first verification

Work proceeds in small end-to-end slices; every slice is verified by the
repository's GitHub Actions workflow.

**Why:** the development host is memory-constrained, and CI gives an
authoritative, reproducible signal before a slice is considered done.

## D-19 — No personal or maintainer-identifying data ships in the app or repo

Owner directive (2026-10-27): nothing about the maintainer — location, name,
username, or machine layout — may be revealed by this repository or by any
deployment built from it.

- The bundled default location is a neutral **Unconfigured Site** placeholder
  (0, 0, UTC) with an in-app prompt to configure a real site. A safety tool must
  not present invented or borrowed readings as if they were the operator's site,
  and it must not carry a maintainer's home town as its shipped default.
- `CONTRIBUTORS.md` credits the public GitHub handle only; the owner's legal name
  is not published.
- Tracked agent configs use `~/…` for the local `ci.sh` path; absolute
  home-directory paths are never committed.
- Test fixtures avoid the maintainer's locale; the half-hour-offset DST case is
  covered with a neutral zone.

**Why:** the repository is public and its Pages build is publicly reachable, so
any value compiled into the bundle or committed to the tree is world-readable.
Personal data in the tree is information disclosure, and by the operating
guide's own severity scale (II.20.2) it is fixed before the next release.

**Note:** this decision changes the working tree only. Removing the same data
from already-published history is a separate, destructive operation and needs
explicit owner approval (recorded when decided).

## D-18 — DOM smoke tests assert the shell, not provider data

The Playwright suite (`tests/ui/smoke.spec.ts`) verifies navigation, forms,
in-flight control states and role gating — never values that depend on a
weather provider or a configured location. The CI server starts with an empty
temporary `DATA_DIR`, so `/api/weather/*` answers 404 and `HeroRiskCard` /
`CurrentConditions` stay in their skeleton state; the tests therefore key on
elements that always render (`#nav-tab-settings`, `#active-alerts-panel`).

**Why:** smoke tests must be deterministic and independent of live network and
of seeded data, otherwise they fail for reasons unrelated to the UI. Weather-dependent
rendering stays covered by the system/api suites.

The Playwright `webServer` raises `AUTH_RATE_LIMIT_MAX` / `API_RATE_LIMIT_MAX`
for the test server only.

**Why:** each test re-authenticates in a fresh browser context; the default
limit of 10 auth attempts per 15 minutes otherwise turns retries into 429s.
The limits stay at their hardened production defaults everywhere else.
