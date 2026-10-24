# UI Smoke Test Suite

Playwright browser-level DOM smoke tests for Construction Weather Monitor milestone 0.2.x.

**Test count:** 7 smoke tests (first-run setup, login, dashboard render, role gating, manual check, alert dismiss, About version).

**Configuration:**

- Chromium only, retries capped at 2, trace retain-on-failure
- webServer builds production bundle with throwaway DATA_DIR
- Service workers blocked
- Offline provider stubbed via route interception

Run locally with `npx playwright test tests/ui` (requires Playwright installed).
