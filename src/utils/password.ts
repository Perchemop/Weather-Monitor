/**
 * Central password strength policy.
 *
 * Deliberately modest (NIST-style length + character-class floor) so it is
 * usable on a construction site without a password manager, while still
 * rejecting trivially weak secrets. Configurable via PASSWORD_MIN_LENGTH.
 */
export const PASSWORD_MIN_LENGTH = 10

/** Resolves the configured minimum length (evaluated lazily for `.env` safety). */
export function getPasswordMinLength(): number {
  const configured = Number(process.env.PASSWORD_MIN_LENGTH)
  return Number.isFinite(configured) && configured >= 8 ? configured : PASSWORD_MIN_LENGTH
}

export interface PasswordPolicyResult {
  valid: boolean
  errors: string[]
}

export function validatePasswordStrength(password: string): PasswordPolicyResult {
  const minLength = getPasswordMinLength()
  const errors: string[] = []
  if (!password || password.length < minLength) {
    errors.push(`be at least ${minLength} characters long`)
  }
  if (!/[A-Za-z]/.test(password || '')) {
    errors.push('include at least one letter')
  }
  if (!/[0-9]/.test(password || '')) {
    errors.push('include at least one number')
  }
  return { valid: errors.length === 0, errors }
}

/** Human-readable policy summary for API error messages and UI hints. */
export function describePasswordPolicy(): string {
  return `Password must be at least ${getPasswordMinLength()} characters and include a letter and a number.`
}
