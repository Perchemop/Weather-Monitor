# Research: Browser-Level (DOM) UI Tests — Playwright

Status: **ready for work**. Target milestone: 0.2.x.

## Behaviour (original summary)

Verification currently has three layers — type-check, the 88-check system/API
suites, and manual QC — but nothing executes the rendered React UI. The
capability is a small Playwright smoke suite that drives the real built app in
a real browser: first-run setup, login, dashboard render, role-gated
navigation, alert acknowledge, and the Settings → About update-check states.

Playwright's documented CI pattern: a GitHub Actions workflow that installs
dependencies and browsers, starts the app via the `webServer` option, runs the
tests, and uploads the HTML report and failure traces on failure.

## Project-specific design

- **Target the production build, not the dev server.** The suite runs
  `npm run build` output (`node dist/server.cjs`) with `DATA_DIR` pointed at a
  throwaway directory — the same isolation rule the API suite already uses, so
  the developer's `./data` is never touched.
- **Existing element IDs are the locators.** The dashboard redesign preserved
  stable IDs (`#hero-risk-card`, `#manual-check-btn`, `#nav-tab-*`,
  `#location-selector-btn`, `#logout-btn`, `#toggle-risk-factors-btn`,
  `#view-6h-btn` …). Tests assert against these; no new test-only attributes
  are needed for the first pass.
- **Service worker/PWA caching** must be disabled or bypassed in tests
  (fresh browser context per test, `serviceWorkers: 'block'` in the context
  options) so cached shells can't mask regressions.
- **Scope discipline.** First pass is a smoke suite (~10–15 tests), Chromium
  only, on the ubuntu CI lane. Cross-browser expansion is a later, optional
  step — the goal is render-level confidence, not a UI test pyramid.

## Acceptance criteria

1. `tests/ui/` contains a Playwright project with `webServer` configured to
   build and serve the production bundle with a temp `DATA_DIR`.
2. Smoke coverage: first-run setup creates the owner; login; dashboard renders
   hero + conditions; role gating (Viewer lacks owner-only tabs); manual
   "Check now" reflects the checking state; alert card dismiss flow (with a
   stubbed alert or a real threshold breach fixture); About tab shows the
   version.
3. CI: a dedicated job (ubuntu, Chromium) runs after the API suite; report +
   traces uploaded as artefacts; failures are actionable via trace.
4. No test talks to the real internet for weather: the suite either points the
   app at an Open-Meteo-free configuration (fallback behaviour is honest) or
   intercepts provider routes with Playwright's route interception.
5. Flake policy: retries capped at 2, `trace: 'retain-on-failure'`; a test
   that flakes twice gets quarantined, not ignored silently.
6. README/`docs/development.md` gain a "UI suite" line with the exact counts.

## Edge cases

- Port collision in CI: the server must read an ephemeral/port env override
  or the `webServer` waits on a URL that includes the chosen port.
- The 30-second dashboard poll re-renders cards; assertions must use
  Playwright's auto-waiting locators rather than fixed sleeps.
- First-run state is one-time (`POST /api/auth/setup` returns 409 afterwards) —
  each test run needs a fresh `DATA_DIR` to see the setup screen; otherwise
  start from the login screen.
- Wake Lock and notifications APIs don't exist headless — the UI already
  degrades gracefully; tests assert the degraded state is shown, not absent.

## Sources (public, URLs only)

- CI setup (GitHub Actions): <https://playwright.dev/docs/ci>
- CI introduction: <https://playwright.dev/docs/ci-intro>
- Official GitHub Action: <https://github.com/marketplace/actions/run-playwright-tests>
- Project docs root (config/webServer/APIs): <https://playwright.dev/docs/intro>
