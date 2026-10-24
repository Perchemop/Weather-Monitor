import crypto from 'crypto'

// Redaction helpers are pure and live in ./redact.ts so browser-targeted modules
// can import them without pulling in Node's crypto. Re-exported to preserve the
// existing `utils/security` import surface.
export { maskSecret, redactSecretsInError } from './redact.js'

/**
 * Generates a cryptographically strong random password for bootstrap if none was supplied in env
 */
export function generateSecureBootstrapPassword(length = 16): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length)
}

/**
 * Generates a random session secret
 */
export function generateSessionSecret(): string {
  return crypto.randomBytes(32).toString('hex')
}
