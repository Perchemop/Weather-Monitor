import dotenv from 'dotenv'

/**
 * Environment bootstrap.
 *
 * Imported first by the server entry point so that `.env` values are available
 * before any other module evaluates `process.env` at import time (for example
 * the logger level or the password policy length).
 */
dotenv.config({ quiet: true })
