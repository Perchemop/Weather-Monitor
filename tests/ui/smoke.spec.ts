import { test, expect } from '@playwright/test'

const OWNER_PASSWORD = 'StrongPass123'
const OWNER_EMAIL = 'owner@local'
const VIEWER_EMAIL = 'viewer@local'
const VIEWER_PASSWORD = 'ViewerPass123'

/**
 * Helper to perform first-run setup if needed.
 */
async function ensureSetup(page) {
  const status = await page.request
    .get('/api/auth/status')
    .then((r) => r.json())
    .catch(() => ({ isFirstRun: true }))
  // If first run UI is shown, complete setup
  const isSetup = await page
    .locator('text=Initial Master Password Setup')
    .isVisible()
    .catch(() => false)
  if (isSetup) {
    await page.getByLabel(/Supervisor Email/i).fill(OWNER_EMAIL)
    await page.getByLabel(/New Master Password/i).fill(OWNER_PASSWORD)
    await page.getByLabel(/Confirm Master Password/i).fill(OWNER_PASSWORD)
    await page.getByRole('button', { name: /create/i }).click()
    await expect(page.locator('#hero-risk-card')).toBeVisible({ timeout: 15000 })
  }
}

/**
 * Smoke tests for Construction Weather Monitor UI.
 * Covers first-run, login, dashboard render, role gating, manual check, alert dismiss, About version.
 */
test.describe('UI Smoke Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Block external weather providers to avoid real network.
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
    await expect(page.locator('text=Initial Master Password Setup')).toBeVisible()
    await page.getByLabel(/Supervisor Email/i).fill(OWNER_EMAIL)
    await page.getByLabel(/New Master Password/i).fill(OWNER_PASSWORD)
    await page.getByLabel(/Confirm Master Password/i).fill(OWNER_PASSWORD)
    await page.getByRole('button', { name: /create/i }).click()
    await expect(page.locator('#hero-risk-card')).toBeVisible({ timeout: 15000 })
  })

  test('login works after setup', async ({ page }) => {
    await page.goto('/')
    // If already set up, we should be at login screen
    const isLogin = await page
      .locator('text=Site Supervisor Lock')
      .isVisible()
      .catch(() => false)
    if (isLogin) {
      await page.getByLabel(/Operator Email/i).fill(OWNER_EMAIL)
      await page.getByLabel(/Master Password/i).fill(OWNER_PASSWORD)
      await page.getByRole('button', { name: /sign in/i }).click()
      await expect(page.locator('#hero-risk-card')).toBeVisible({ timeout: 15000 })
    }
  })

  test('dashboard renders hero and conditions', async ({ page }) => {
    await page.goto('/')
    await ensureSetup(page)
    // Login if needed
    if (
      await page
        .locator('text=Site Supervisor Lock')
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByLabel(/Operator Email/i).fill(OWNER_EMAIL)
      await page.getByLabel(/Master Password/i).fill(OWNER_PASSWORD)
      await page.getByRole('button', { name: /sign in/i }).click()
    }
    await expect(page.locator('#hero-risk-card')).toBeVisible()
    // Conditions panel is rendered on dashboard
    await expect(page.getByText(/Current Conditions/i)).toBeVisible()
  })

  test('role gating Viewer lacks owner-only tabs', async ({ page }) => {
    // Create viewer account via API as owner first
    await page.goto('/')
    await ensureSetup(page)
    // Ensure logged in as owner
    await page.getByLabel(/Operator Email/i).fill(OWNER_EMAIL)
    await page.getByLabel(/Master Password/i).fill(OWNER_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.locator('#hero-risk-card')).toBeVisible()

    // Create viewer via API
    await page.request.post('/api/users', {
      data: { email: VIEWER_EMAIL, password: VIEWER_PASSWORD, role: 'VIEWER', displayName: 'Viewer' },
    })

    // Logout
    await page.locator('#logout-btn').click()

    // Login as viewer
    await page.getByLabel(/Operator Email/i).fill(VIEWER_EMAIL)
    await page.getByLabel(/Master Password/i).fill(VIEWER_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.locator('#hero-risk-card')).toBeVisible()

    // Owner-only tabs should be hidden (e.g., Settings owner tabs)
    const settingsTab = page.locator('#nav-tab-settings')
    await settingsTab.click()
    // Viewer should not see owner-only sections like thresholds
    await expect(page.getByText(/Safety Thresholds/i)).toBeHidden()
  })

  test('manual Check now reflects checking state', async ({ page }) => {
    await page.goto('/')
    await ensureSetup(page)
    if (
      await page
        .locator('text=Site Supervisor Lock')
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByLabel(/Operator Email/i).fill(OWNER_EMAIL)
      await page.getByLabel(/Master Password/i).fill(OWNER_PASSWORD)
      await page.getByRole('button', { name: /sign in/i }).click()
    }
    await expect(page.locator('#manual-check-btn')).toBeVisible()
    await page.locator('#manual-check-btn').click()
    // Button should show checking state temporarily
    await expect(page.locator('#manual-check-btn')).toBeDisabled({ timeout: 5000 })
  })

  test('alert card dismiss flow', async ({ page }) => {
    await page.goto('/')
    await ensureSetup(page)
    if (
      await page
        .locator('text=Site Supervisor Lock')
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByLabel(/Operator Email/i).fill(OWNER_EMAIL)
      await page.getByLabel(/Master Password/i).fill(OWNER_PASSWORD)
      await page.getByRole('button', { name: /sign in/i }).click()
    }
    // Ensure alerts panel exists
    await expect(page.locator('#active-alerts-panel')).toBeVisible()
    // If an alert is present, dismiss it
    const dismissBtn = page.locator('#active-alerts-panel >> button:has-text("Dismiss")').first()
    if (await dismissBtn.isVisible().catch(() => false)) {
      await dismissBtn.click()
      await expect(page.locator('text=Active Alerts')).toBeVisible()
    }
  })

  test('About tab shows version', async ({ page }) => {
    await page.goto('/')
    await ensureSetup(page)
    if (
      await page
        .locator('text=Site Supervisor Lock')
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByLabel(/Operator Email/i).fill(OWNER_EMAIL)
      await page.getByLabel(/Master Password/i).fill(OWNER_PASSWORD)
      await page.getByRole('button', { name: /sign in/i }).click()
    }
    await page.locator('#nav-tab-settings').click()
    // About sub-tab is inside settings view
    await page.getByRole('button', { name: /about/i }).click()
    await expect(page.getByText(/v0\.1\.0/)).toBeVisible()
  })
})
