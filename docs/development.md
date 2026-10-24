# Development

How to work on the Construction Weather Monitor, following the operating guide's
CTO.new-style model: **Chat (plan) → Task (execute) → Pull Request (review)**.

## Two modes

- **Chat (Orchestrator / planning)** — clarifies requirements, produces a written
  plan and a precise Task brief (requirement IDs, files likely touched,
  acceptance criteria). Makes no large code changes and runs no builds.
- **Task (Coder / execution)** — implements one bounded, reviewable slice,
  updates tests, commits and pushes, and relies on GitHub Actions to verify.

Never mix the two carelessly: plan first, then execute.

## Daily flow

1. Chat with the Orchestrator to agree the plan and success criteria.
2. Read `IMPLEMENTATION_PLAN.md`, `REQUIREMENTS_TRACEABILITY.md`, `DECISIONS.md`
   and `PROGRESS.md` before editing.
3. Implement the slice; write or update tests with every behavioural change.
4. Commit and push; GitHub Actions is the Task Runner.
5. Open or update a pull request for review.
6. Update the tracking files with exact results, then repeat.

## CI-first rule (read this first)

The development machine is memory-constrained and restarts under load. **All
heavy commands run in GitHub Actions, never locally.** That includes
`npm ci` / `npm install`, `npm test`, `npm run build*`, `tsc`, and
`docker build`.

Use the helper to run the repository's CI on a branch and wait for the result:

```bash
~/.config/opencode/scripts/ci.sh run "<short description of the change>"
```

It commits the working tree, pushes the branch, opens or updates a pull request,
waits for checks, and prints the outcome (with failing logs when something
breaks). `ci.sh status`, `ci.sh logs`, and `ci.sh diff` provide the current
checks, failing logs, and a preview of what would be committed.

Allowed locally: editing and reading files, searching, and read-only git
(`git status`, `git diff`, `git log`, `git show`).

## Requirements

- Node.js 20+ (see `.nvmrc`).
- A browser for manual checks.

## Project layout

```
server.ts                  Express API + app assembly
server-entry.ts            Node entry point
src/
  components/              React views
  services/                risk, alert, weather, monitoring, email, push
  database/db.ts           SQLite (sql.js) persistence + migrations
  static/                  browser-only backend for the static build
  utils/                   helpers (auth, time, units, rate limit, …)
  tests/                   system.test.ts + api.test.ts
public/                    PWA assets (service worker, manifest)
integrations/              optional Cloudflare Worker email relay
docs/                      this documentation set
Dockerfile / docker-compose.yml
```

## Environment

Copy `.env.example` to `.env` and fill in only what you need. Nothing is
required for a local run: without `WEATHER_API_KEY` the app uses Open-Meteo, and
without SMTP it skips email. Notable variables:

- `WEATHER_API_KEY` — optional primary provider.
- `LOCAL_ONLY=true` — skip the third-party provider entirely.
- `OWNER_EMAIL`, `INITIAL_OWNER_PASSWORD` — first-run owner account.
- `SESSION_SECRET`, `SECURE_COOKIES`, `ENABLE_HSTS`, `TRUST_PROXY` — security.
- `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD` — email alerts.
- `METRICS_TOKEN` — shared token for `/metrics`.
- `DATA_DIR` — relocate the SQLite database and generated secrets.

## Format & style checks

```bash
npm run format:check      # whole-repository hygiene (no dependencies)
npm run prettier:check    # Prettier style (`.prettierrc.json`, `.prettierignore`)
npm run prettier:fix      # apply Prettier locally (already formatted in CI)
```

Both run in CI's `format-check` job. Two layers, distinct jobs:

- **Hygiene** (`scripts/check-format.mjs`, dependency-free): no CRLF, no
  merge-conflict markers, a final newline, spaces-not-tabs, and no trailing
  whitespace on lines *you* added (Markdown is exempt — two trailing spaces
  there are a hard line break).
- **Style** (Prettier): formatting of code, Markdown prose, JSON and YAML.
  `docs/`, generated output, lockfiles, `public/sw.js` and `opencode.jsonc`
  are excluded via `.prettierignore` (see the file for why).

## Running the suites (in CI)

`npm test` runs both suites in order:

- `src/tests/system.test.ts` — 59 unit/system tests (risk engine incl. property
  tests, weather normalisation, time, sessions, retention, push,
  performance summary, persistence health).
- `src/tests/api.test.ts` — 29 HTTP integration tests (auth, RBAC, CSRF, MFA,
  sessions, backups, metrics, health, integrity).

## Workflow conventions

- Build in **small vertical slices**; each slice ends with green CI and updated
  tracking docs (`PROGRESS.md`, `CHANGELOG.md`, `DECISIONS.md`,
  `REQUIREMENTS_TRACEABILITY.md`).
- Never report a feature as working unless CI verified it.
- Do not commit secrets, `.env`, or `guide.md`.
- The UI must mirror server permissions; no visible control should fail
  server-side, and no action should report success when it did not happen.
