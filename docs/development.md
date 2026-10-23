# Development

How to work on the Construction Weather Monitor.

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

## Running the suites (in CI)

`npm test` runs both suites in order:

- `src/tests/system.test.ts` — 53 unit/system tests (risk engine, weather
  normalisation, time, sessions, retention, push, performance summary).
- `src/tests/api.test.ts` — 28 HTTP integration tests (auth, RBAC, CSRF, MFA,
  sessions, backups, metrics, integrity).

## Workflow conventions

- Build in **small vertical slices**; each slice ends with green CI and updated
  tracking docs (`PROGRESS.md`, `CHANGELOG.md`, `DECISIONS.md`,
  `REQUIREMENTS_TRACEABILITY.md`).
- Never report a feature as working unless CI verified it.
- Do not commit secrets, `.env`, or `guide.md`.
- The UI must mirror server permissions; no visible control should fail
  server-side, and no action should report success when it did not happen.
