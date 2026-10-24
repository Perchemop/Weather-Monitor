# Requirements Traceability

Maps each requirement to where it is implemented and how it is verified.
Status: **Met** (implemented and covered), **Partial**, or **Planned**.

Automated verification runs in GitHub Actions (`npm test`): 59 unit/system tests
(`src/tests/system.test.ts`) and 29 HTTP integration tests
(`src/tests/api.test.ts`), 88 total.

| #     | Requirement                                                     | Implementation                                                                                                         | Verification                                | Status |
| ----- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------ |
| R-01  | Deterministic construction risk assessment                      | `src/services/riskEngine.ts`                                                                                           | system tests (risk, UV, DST windowing)      | Met    |
| R-02  | Construction activity impact matrix                             | `riskEngine.ts`, `src/components/ActivityRiskView.tsx`                                                                 | system tests                                | Met    |
| R-03  | Dual-provider weather with cross-reference                      | `src/services/weatherService.ts`                                                                                       | system tests (WMO mapping, Open-Meteo time) | Met    |
| R-04  | Automatic provider fallback                                     | `weatherService.ts` (`fetchRealWeatherData`)                                                                           | code review; live provider paths            | Met    |
| R-05  | Alert generation, dedupe, escalation, recovery                  | `src/services/alertEngine.ts`                                                                                          | system tests; api tests                     | Met    |
| R-06  | Per-location alert cooldown                                     | `alertEngine.ts`, `db.getAlertHistory`                                                                                 | api tests (integrity)                       | Met    |
| R-07  | Autonomous monitoring loop with run history                     | `src/services/monitoringService.ts`                                                                                    | system tests; api tests                     | Met    |
| R-08  | Data persistence (SQLite / sql.js)                              | `src/database/db.ts`                                                                                                   | system tests (sessions, retention, backups) | Met    |
| R-09  | Rotating backups and restore                                    | `db.ts`, server `/api/data/backup/*`                                                                                   | api tests (create/list/traversal/restore)   | Met    |
| R-10  | Data retention & privacy controls                               | `db.enforceDataRetention`, server `/api/data/*`                                                                        | system + api tests                          | Met    |
| R-11  | Multi-user roles OWNER/MANAGER/VIEWER                           | `server.ts` `requireRole`, `src/utils/roles.ts`                                                                        | api tests (RBAC)                            | Met    |
| R-12  | Scrypt password hashing                                         | `db.hashPasswordWithSalt`                                                                                              | system test                                 | Met    |
| R-13  | Cookie sessions + CSRF protection                               | `server.ts` session/CSRF middleware                                                                                    | api tests                                   | Met    |
| R-14  | One-time bootstrap setup                                        | `server.ts` `/api/auth/setup`, `db.getDb` backfill                                                                     | api test (setup replay 409)                 | Met    |
| R-15  | Live session revocation on account change                       | `server.ts` `reconcileUserSessions` / `revokeUserSessions`                                                             | api tests (role change, password change)    | Met    |
| R-16  | TOTP two-factor authentication                                  | `server.ts`, `src/utils/totp.ts`                                                                                       | system + api tests                          | Met    |
| R-17  | Per-account login lockout                                       | `server.ts` lockout helpers                                                                                            | api test                                    | Met    |
| R-18  | Active-session review and revoke                                | `server.ts` `/api/auth/sessions*`                                                                                      | api test                                    | Met    |
| R-19  | Web Push notifications + preferences                            | `src/services/pushService.ts`, `db` push prefs                                                                         | system + api tests                          | Met    |
| R-20  | Optional SMTP alert email                                       | `src/services/emailService.ts`                                                                                         | system tests (config validation)            | Met    |
| R-21  | Prometheus metrics + liveness probe                             | `server.ts` `/metrics`, `/healthz`                                                                                     | api tests                                   | Met    |
| R-22  | PWA / static browser build                                      | `src/static/*`, `vite.config.ts`                                                                                       | CI static build step                        | Met    |
| R-23  | Live weather map (radar/rain/wind/lightning)                    | `src/components/WeatherMapView.tsx`                                                                                    | CI build; lazy-load smoke                   | Met    |
| R-24  | Honest failure reporting (no fake success)                      | `server.ts` routes, `src/App.tsx`, `LocationModal.tsx`                                                                 | api tests (integrity)                       | Met    |
| R-25  | Role-mirrored UI                                                | `Navbar.tsx`, `SettingsView.tsx`, `LocationModal.tsx`                                                                  | CI build; manual QC checklist               | Met    |
| R-26  | CI-first verification, no heavy local work                      | `.github/workflows/ci.yml`                                                                                             | every CI run                                | Met    |
| R-26a | CI format check (guide §4)                                      | `scripts/check-format.mjs`, `format-check` job                                                                         | every CI run                                | Met    |
| R-26b | CI: multi-OS matrix, permissions, caching, summaries, artefacts | `.github/workflows/ci.yml`                                                                                             | every CI run                                | Met    |
| R-26c | Cross-platform build scripts                                    | `package.json`, `vite.config.ts`                                                                                       | Windows/macOS/Linux matrix                  | Met    |
| R-27  | Operating-guide tracking documents                              | this file and the `docs/` set                                                                                          | review                                      | Met    |
| R-28  | Licence and attribution recorded                                | `LICENSE`, `ATTRIBUTION.md`                                                                                            | review                                      | Met    |
| R-29  | Persistence failures are visible (no silent data loss)          | `db.ts` persistence status, `server.ts` health + metrics                                                               | system + api tests                          | Met    |
| R-30  | Property-based checks (determinism, monotonicity, disclaimer)   | `src/tests/system.test.ts`                                                                                             | system tests                                | Met    |
| R-31  | Operating-guide rules tracked, with adaptations recorded        | `docs/guide-compliance.md`, `DECISIONS.md`                                                                             | review                                      | Met    |
| R-32  | Crash stub: never silent, never loses unsaved data              | `ErrorBoundary` (wired in `main.tsx`), `server.ts` process handlers + graceful flush                                   | review + CI; manual QC                      | Met    |
| R-33  | Update check vs GitHub Releases, fail-soft, rate-courteous      | `src/utils/updateCheck.ts`, Settings → About                                                                           | system tests (comparison) + manual QC       | Met    |
| R-34  | Running version surfaced                                        | `src/version.ts`, `/healthz`, `/api/health`, About panel                                                               | api test (health version)                   | Met    |
| R-35  | Release path: tag → artefacts + checksums + changelog notes     | `.github/workflows/release.yml`                                                                                        | release workflow run for `v0.1.0`           | Met    |
| R-36  | PR template, CONTRIBUTING, ROADMAP, brand doc, research gate    | `.github/PULL_REQUEST_TEMPLATE.md`, `CONTRIBUTING.md`, `ROADMAP.md`, `docs/design/brand.md`, `docs/research/README.md` | files + review                              | Met    |

## Gaps / planned

- No browser-level (DOM) test harness; UI behaviour is verified by type-check,
  production build and the manual QC checklist in `docs/qc/`.
- The format check is a hygiene script (line endings, tabs, conflict markers,
  final newline, trailing whitespace on added lines) rather than an opinionated
  formatter; adopting Prettier would require a one-off whole-repository reformat.
- Container images are built for a single architecture; a multi-arch matrix is
  not yet configured.
