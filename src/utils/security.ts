import crypto from 'crypto';

/**
 * Utility for masking secrets in UI and API responses
 */
export function maskSecret(secret?: string, visibleChars = 4): string {
  if (!secret || secret.trim().length === 0) return '';
  const trimmed = secret.trim();
  if (trimmed.length <= visibleChars * 2) {
    return '••••••••';
  }
  return `${trimmed.slice(0, visibleChars)}••••••••${trimmed.slice(-visibleChars)}`;
}

/**
 * Redacts known patterns of API keys or specific sensitive keys from log messages and error strings
 */
export function redactSecretsInError(message: string, knownKeys: (string | undefined)[] = []): string {
  if (!message) return '';
  let redacted = message;

  // Redact any passed explicit keys
  for (const k of knownKeys) {
    if (k && k.length >= 8) {
      redacted = redacted.split(k).join('[REDACTED_SECRET]');
    }
  }

  // Redact WeatherAPI query param key=...
  redacted = redacted.replace(/key=([a-zA-Z0-9_-]+)/gi, 'key=[REDACTED_API_KEY]');

  // Redact 32-char hex tokens
  redacted = redacted.replace(/\b[a-f0-9]{32}\b/gi, '[REDACTED_KEY]');

  return redacted;
}

/**
 * Generates a cryptographically strong random password for bootstrap if none was supplied in env
 */
export function generateSecureBootstrapPassword(length = 16): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

/**
 * Generates a random session secret
 */
export function generateSessionSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}
