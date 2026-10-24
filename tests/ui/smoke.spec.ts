import { test, expect } from '@playwright/test'

const OWNER_PASSWORD = 'StrongPass123'
const OWNER_EMAIL = 'owner@local'
const VIEWER_EMAIL = 'viewer@local'
const VIEWER_PASSWORD = 'ViewerPass123'

/**
 * Ensure the app is in an authenticated dashboard state.
 * Handles first-run setup (if owner not yet created) and login.
 */
async function ensureAuthenticated(page) {
  // Wait for the login shell to hydrate (setup vs login determined by API)
  await expect(page.locator('text=Initial Master Password Setup, text=Site Supervisor Lock')).toBeVisible({
    timeout: 10000,
  })

  const isSetup = await page
    .locator('text=Initial Master Password Setup')
    .isVisible()
    .catch(() => false)

  if (isSetup) {
    await page.getByLabel(/Supervisor Email/i).fill(OWNER_EMAIL)
    await page.getByLabel(/New Master Password/i).fill(OWNER_PASSWORD)
    await page.getByLabel(/Confirm Master Password/i).fill(OWNER_PASSWORD)
    await page.getByRole('button', { name: /create/i }).click()
  } else {
    await page.getByLabel(/Operator Email/i).fill(OWNER_EMAIL)
    await page.getByLabel(/Master Password/i).fill(OWNER_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()
  }

  await expect(page.locator('#hero-risk-card')).toBeVisible({ timeout: 15000 })
  // Let the dashboard finish hydrating async data (alerts panel, etc.)
  await page.waitForLoadState('networkidle')
}

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
    await ensureAuthenticated(page)
  })

  test('dashboard renders hero and conditions', async ({ page }) => {
    await page.goto('/')
    await ensureAuthenticated(page)
    await expect(page.locator('#hero-risk-card')).toBeVisible()
    // Conditions panel is rendered on dashboard
    await expect(page.getByText(/Current Conditions/i)).toBeVisible()
  })

  test('manual Check now reflects checking state', async ({ page }) => {
    await page.goto('/')
    await ensureAuthenticated(page)
    await expect(page.locator('#manual-check-btn')).toBeVisible()
    await page.locator('#manual-check-btn').click()
    // Button should show checking state temporarily
    await expect(page.locator('#manual-check-btn')).toBeDisabled({ timeout: 5000 })
  })

  test('alert card dismiss flow', async ({ page }) => {
    await page.goto('/')
    await ensureAuthenticated(page)
    // Ensure alerts panel exists (renders on dashboard tab)
    await expect(page.locator('#active-alerts-panel')).toBeVisible({ timeout: 15000 })
    // If an alert is present, dismiss it
    const dismissBtn = page.locator('#active-alerts-panel >> button:has-text("Dismiss")').first()
    if (await dismissBtn.isVisible().catch(() => false)) {
      await dismissBtn.click()
      await expect(page.getByText(/Active Alerts/i)).toBeVisible()
    }
  })

  test('About tab shows version', async ({ page }) => {
    await page.goto('/')
    await ensureAuthenticated(page)
    await page.locator('#nav-tab-settings').click()
    // About sub-tab is inside settings view
    await page.getByRole('button', { name: /about/i }).click()
    await expect(page.getByText(/v0\.1\.0/)).toBeVisible()
  })

  test('role gating Viewer lacks owner-only tabs', async ({ page }) => {
    await page.goto('/')
    await ensureAuthenticated(page)

    // Create viewer account via API as owner
    await page.request.post('/api/users', {
      data: { email: VIEWER_EMAIL, password: VIEWER_PASSWORD, role: 'VIEWER', displayName: 'Viewer' },
    })

    // Logout
    await page.locator('#logout-btn').click()

    // Login as viewer
    await page.getByLabel(/Operator Email/i).fill(VIEWER_EMAIL)
    await page.getByLabel(/Master Password/i).fill(VIEWER_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.locator('#hero-risk-card')).toBeVisible({ timeout: 15000 })

    // Settings tab should exist but owner-only sections hidden
    await page.locator('#nav-tab-settings').click()
    await expect(page.getByText(/Safety Thresholds/i)).toBeHidden()
  })
})
