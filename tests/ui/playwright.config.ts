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
    command: `npm --prefix ../.. run build && NODE_ENV=production DATA_DIR=${dataDir} node ../../dist/server.cjs`,
    url: `http://localhost:${port}/healthz`,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
