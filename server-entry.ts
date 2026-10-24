/**
 * Production/dev entry point.
 *
 * Kept separate from `server.ts` so that `server.ts` can export an importable
 * `createApp()` (used by the HTTP integration tests) without binding a port as
 * an import side effect. The esbuild production bundle targets this file.
 */
import './src/env.js'
import { startServer } from './server.js'
import { logger } from './src/utils/logger.js'

startServer().catch((err) => {
  logger.error('server_startup_failed', { error: err?.message || String(err) })
  process.exit(1)
})
