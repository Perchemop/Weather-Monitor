import { test, expect, type Page } from '@playwright/test'

/**
 * Visual evidence for the designer agent (guide.md section 27.12).
 *
 * Artefacts, not assertions: the job uploads `snapshots/` so a human or the
 * designer can look at the rendered product. Two things are still enforced,
 * because they are real bugs rather than taste:
 *
 *   1. no uncaught exception or console error, and
 *   2. the expected screen actually rendered.
 *
 * The credential form doubles as the empty state: on a fresh server it is the
 * first-run setup screen, which is the first thing a new operator ever sees.
 */

const OUT = 'snapshots'
const OWNER_EMAIL = 'owner@local'
const OWNER_PASSWORD = 'StrongPass123'

const VIEWPORTS = [
  ['desktop', 1280, 800],
  ['tablet', 768, 1024],
  ['phone', 390, 844],
] as const

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
}

async function waitForCredentialForm(page: Page) {
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 20000 })
}

async function fillCredentialForm(page: Page, email: string, password: string) {
  await page.locator('input[type="email"]').fill(email)
  const passwordInputs = page.locator('input[type="password"]')
  await passwordInputs.first().fill(password)
  if ((await passwordInputs.count()) > 1) {
    await passwordInputs.nth(1).fill(password)
  }
  await page.locator('button[type="submit"]').click()
}

test('credential screen at three viewports', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  for (const [name, width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await waitForCredentialForm(page)
    await settle(page)
    const shot = `${OUT}/credentials-${name}.png`
    await page.screenshot({ path: shot, fullPage: true })
    console.log(`captured ${shot} at ${width}x${height}`)
  }

  expect(errors, `the credential screen must load without errors:\n${errors.join('\n')}`).toEqual([])
})

test('dashboard after signing in, at three viewports', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await waitForCredentialForm(page)
  await fillCredentialForm(page, OWNER_EMAIL, OWNER_PASSWORD)

  // The shell renders whether or not a weather provider answers, so this is
  // data-independent (same assumption as tests/ui/smoke.spec.ts).
  await expect(page.locator('nav, [role="navigation"]').first()).toBeVisible({ timeout: 30000 })

  for (const [name, width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height })
    await settle(page)
    const shot = `${OUT}/dashboard-${name}.png`
    await page.screenshot({ path: shot, fullPage: true })
    console.log(`captured ${shot} at ${width}x${height}`)
  }
})
