import { defineConfig, devices } from '@playwright/test'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-ui-'))
const port = 3000

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  retries: 2,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: `cd ../../ && npm run build && NODE_ENV=production DATA_DIR=${dataDir} node dist/server.cjs`,
    url: `http://localhost:${port}/healthz`,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
      // Smoke tests re-authenticate per test; keep the brute-force limiters from
      // turning legitimate retries into 429 responses.
      AUTH_RATE_LIMIT_MAX: '200',
      API_RATE_LIMIT_MAX: '2000',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
