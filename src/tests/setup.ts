/**
 * Test bootstrap — imported first by every test file.
 *
 * ES modules evaluate dependencies in import order, so putting this import at
 * the very top of a test file guarantees the environment is configured before
 * `server.ts`, `db.ts`, or `secretStore.ts` are evaluated. It redirects all
 * filesystem state (SQLite database, backups, generated secrets) into a fresh
 * temporary directory so running the tests never touches a real `./data`.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-test-'))
process.env.SESSION_SECRET ||= 'test-session-secret'
process.env.NODE_ENV = 'test'
// Keep test output readable; the logger otherwise emits one line per request.
process.env.LOG_LEVEL ||= 'error'

// Raise rate limits so many rapid assertions from one IP are not throttled.
// (The per-account lockout path is exercised explicitly and is unaffected.)
process.env.AUTH_RATE_LIMIT_MAX ||= '1000'
process.env.API_RATE_LIMIT_MAX ||= '100000'
