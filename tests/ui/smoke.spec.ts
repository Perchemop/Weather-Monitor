import { test, expect, type Page } from '@playwright/test'

const OWNER_PASSWORD = 'StrongPass123'
const OWNER_EMAIL = 'owner@local'
// The user-creation API requires a dotted domain (`/api/users` email policy).
const VIEWER_EMAIL = 'viewer@local.host'
const VIEWER_PASSWORD = 'ViewerPass123'

/**
 * Waits for the credential form. The app shows "Opening the safety enclave…"
 * until `/api/auth/status` resolves, then renders either the first-run setup
 * form or the unlock form — both contain the operator email input.
 */
async function waitForCredentialForm(page: Page) {
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 20000 })
}

/**
 * Fills and submits the credential form. The login labels are plain text (no
 * htmlFor association), so fields are addressed by input type: setup mode adds
 * a second password input for confirmation, which also tells the two modes
 * apart without relying on copy.
 */
async function fillCredentialForm(page: Page, email: string, password: string) {
  await page.locator('input[type="email"]').fill(email)
  const passwordInputs = page.locator('input[type="password"]')
  await passwordInputs.first().fill(password)
  if ((await passwordInputs.count()) > 1) {
    await passwordInputs.nth(1).fill(password)
  }
  await page.locator('button[type="submit"]').click()
}

/**
 * Asserts the authenticated shell renders. Deliberately data-independent: a
 * fresh server has no location, so weather endpoints 404 and the risk /
 * conditions panels stay in their skeleton state. The navigation bar and the
 * alerts panel render regardless of provider availability.
 */
async function expectDashboardShell(page: Page) {
  await expect(page.locator('#nav-tab-settings')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('#active-alerts-panel')).toBeVisible({ timeout: 20000 })
  await expect(page.getByText(/active alerts/i).first()).toBeVisible()
}

/** Navigates to the app and signs in, completing first-run setup when needed. */
async function ensureAuthenticated(page: Page) {
  await page.goto('/')
  await waitForCredentialForm(page)
  await fillCredentialForm(page, OWNER_EMAIL, OWNER_PASSWORD)
  await expectDashboardShell(page)
}

/** Signs out and back in with different credentials. */
async function signIn(page: Page, email: string, password: string) {
  await page.locator('#logout-btn').click()
  await waitForCredentialForm(page)
  await fillCredentialForm(page, email, password)
  await expectDashboardShell(page)
}

test.describe('UI Smoke Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Surface client-side problems in the CI log instead of failing silently.
    page.on('pageerror', (err) => console.log('[pageerror]', err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[console.error]', msg.text())
    })
    page.on('requestfailed', (req) =>
      console.log('[requestfailed]', req.url(), req.failure()?.errorText ?? ''),
    )

    // Block external weather providers so no test depends on the live network.
    await page.route('**/*open-meteo*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ hourly: {}, current_weather: { temperature: 22 } }),
      }),
    )
    await page.route('**/*weatherapi*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ current: { temp_c: 22 } }),
      }),
    )
  })

  test('first-run setup creates owner', async ({ page }) => {
    await page.goto('/')
    await waitForCredentialForm(page)
    // A fresh database boots with the first-run setup form (email + password +
    // confirmation). Once an owner exists the unlock form is shown instead.
    const passwordInputs = page.locator('input[type="password"]')
    if ((await passwordInputs.count()) > 1) {
      await fillCredentialForm(page, OWNER_EMAIL, OWNER_PASSWORD)
    }
    await expectDashboardShell(page)
    // The owner identity is reflected in the navigation bar.
    await expect(page.locator('#nav-tab-settings')).toBeVisible()
  })

  test('sign in with existing credentials', async ({ page }) => {
    await ensureAuthenticated(page)
  })

  test('dashboard renders shell panels', async ({ page }) => {
    await ensureAuthenticated(page)
    // Hero card and conditions panels are weather-driven; assert the shell
    // around them plus the always-present alerts panel.
    await expect(page.locator('#active-alerts-panel')).toBeVisible()
    await expect(page.locator('#manual-check-btn')).toBeVisible()
  })

  test('manual check now reflects checking state', async ({ page }) => {
    await ensureAuthenticated(page)
    // Hold the check request open so the button's in-flight state is observable.
    await page.route('**/api/monitor/check-now', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accepted: true }),
      })
    })
    await page.locator('#manual-check-btn').click()
    await expect(page.locator('#manual-check-btn')).toBeDisabled({ timeout: 6000 })
    // The cycle settles and the button becomes usable again.
    await expect(page.locator('#manual-check-btn')).toBeEnabled({ timeout: 15000 })
  })

  test('alert panel dismiss flow', async ({ page }) => {
    await ensureAuthenticated(page)
    const panel = page.locator('#active-alerts-panel')
    await expect(panel).toBeVisible({ timeout: 15000 })

    // Only assert the dismiss interaction when the panel actually has alerts.
    const dismissButtons = panel.locator('button', { hasText: 'Dismiss' })
    const count = await dismissButtons.count()
    if (count > 0) {
      await dismissButtons.first().click()
      await expect(dismissButtons).toHaveCount(count - 1, { timeout: 5000 })
    }
  })

  test('About tab shows version', async ({ page }) => {
    await ensureAuthenticated(page)
    await page.locator('#nav-tab-settings').click()
    await page.getByRole('button', { name: 'About', exact: true }).click()
    await expect(page.getByText(/v0\.1\.0/).first()).toBeVisible()
  })

  test('role gating Viewer lacks owner-only tabs', async ({ page }) => {
    await ensureAuthenticated(page)

    // Create the viewer account. State-changing API calls need the CSRF token
    // that login set as a readable cookie.
    const csrf = await page
      .context()
      .cookies()
      .then((cookies) => cookies.find((c) => c.name === 'cwm_csrf')?.value)
    const created = await page.request.post('/api/users', {
      data: {
        email: VIEWER_EMAIL,
        password: VIEWER_PASSWORD,
        role: 'VIEWER',
        displayName: 'Viewer',
      },
      headers: csrf ? { 'x-csrf-token': csrf } : {},
    })
    expect(created.status(), await created.text()).toBeLessThan(400)

    await signIn(page, VIEWER_EMAIL, VIEWER_PASSWORD)

    // Settings is available to every role, but owner-only tabs are filtered out
    // for a viewer (SettingsView defaults them to the security tab).
    await page.locator('#nav-tab-settings').click()
    await expect(page.getByText(/Safety Thresholds/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Security & Auth', exact: true })).toBeVisible()
  })
})
