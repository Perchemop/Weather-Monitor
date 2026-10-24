import { test, expect, type Page } from '@playwright/test'

const OWNER_PASSWORD = 'StrongPass123'
const OWNER_EMAIL = 'owner@local'
const VIEWER_EMAIL = 'viewer@local'
const VIEWER_PASSWORD = 'ViewerPass123'

/**
 * Login shell: the app renders "Opening the safety enclave…" until
 * `/api/auth/status` resolves, then shows either the first-run setup screen or
 * the unlock screen. Both are acceptable entry states.
 */
function loginShell(page: Page) {
  return page.getByText('Initial Master Password Setup').or(page.getByText('Site Supervisor Lock'))
}

/** True when the first-run setup screen is currently shown. */
async function isSetupScreen(page: Page): Promise<boolean> {
  return (await page.getByText('Initial Master Password Setup').count()) > 0
}

/**
 * Fills the master-credential form. The login screen labels are plain text
 * (no htmlFor association), so fields are addressed by input type: setup mode
 * has a second password input for confirmation.
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

/** Navigates to the app and signs in, completing first-run setup when needed. */
async function ensureAuthenticated(page: Page) {
  await page.goto('/')
  await expect(loginShell(page)).toBeVisible({ timeout: 20000 })
  await fillCredentialForm(page, OWNER_EMAIL, OWNER_PASSWORD)
  await expect(page.locator('#hero-risk-card')).toBeVisible({ timeout: 20000 })
}

/** Logs out and signs in again with different credentials. */
async function signIn(page: Page, email: string, password: string) {
  await page.locator('#logout-btn').click()
  await expect(loginShell(page)).toBeVisible({ timeout: 20000 })
  await fillCredentialForm(page, email, password)
  await expect(page.locator('#hero-risk-card')).toBeVisible({ timeout: 20000 })
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
    await expect(loginShell(page)).toBeVisible({ timeout: 20000 })
    // First run presents the setup screen unless a previous run already created it.
    if (await isSetupScreen(page)) {
      await fillCredentialForm(page, OWNER_EMAIL, OWNER_PASSWORD)
    }
    await expect(page.locator('#hero-risk-card')).toBeVisible({ timeout: 20000 })
  })

  test('dashboard renders hero and conditions', async ({ page }) => {
    await ensureAuthenticated(page)
    await expect(page.locator('#hero-risk-card')).toBeVisible()
    // The current-conditions panel sits below the hero card on the dashboard.
    await expect(page.getByText(/current conditions/i).first()).toBeVisible()
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
    await expect(page.locator('#manual-check-btn')).toBeEnabled({ timeout: 10000 })
  })

  test('alert card dismiss flow', async ({ page }) => {
    await ensureAuthenticated(page)
    const panel = page.locator('#active-alerts-panel')
    await expect(panel).toBeVisible({ timeout: 15000 })
    await expect(panel.getByText(/active alerts/i)).toBeVisible()

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
    await expect(page.getByText('v0.1.0').first()).toBeVisible()
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
      data: { email: VIEWER_EMAIL, password: VIEWER_PASSWORD, role: 'VIEWER', displayName: 'Viewer' },
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
