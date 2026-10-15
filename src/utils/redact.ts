/**
 * Pure, dependency-free secret redaction helpers.
 *
 * Kept separate from `security.ts` (which imports Node's `crypto`) so that
 * browser-targeted modules — notably `services/weatherService.ts` — can import
 * redaction without pulling a Node builtin into the static web build.
 */

/**
 * Masks a secret for display, revealing only the first/last few characters.
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
 * Redacts known patterns of API keys or specific sensitive keys from log
 * messages or error strings.
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
