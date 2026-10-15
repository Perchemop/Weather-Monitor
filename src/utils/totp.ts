import crypto from 'crypto';

/**
 * Dependency-free RFC 6238 Time-based One-Time Password (TOTP) implementation,
 * compatible with Google Authenticator, Authy, 1Password and similar apps.
 *
 * Uses HMAC-SHA1 / 30-second steps / 6 digits (the universal defaults).
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_DIGITS = 6;

/** Encodes a buffer as an unpadded RFC 4648 base32 string. */
function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** Decodes an RFC 4648 base32 string (padding and spacing tolerated). */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generates a fresh base32-encoded TOTP secret (default 160 bits). */
export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(crypto.randomBytes(byteLength));
}

/** Computes the HOTP value for a given counter. */
function hotp(secret: string, counter: number, digits = DEFAULT_DIGITS): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

/** Generates the current TOTP code for a secret at a given timestamp. */
export function generateTotp(secret: string, atMs = Date.now(), stepSeconds = DEFAULT_STEP_SECONDS): string {
  const counter = Math.floor(atMs / 1000 / stepSeconds);
  return hotp(secret, counter);
}

/**
 * Verifies a submitted token against the secret, allowing +/- `window` steps of
 * clock drift. Comparison is constant-time to avoid timing side channels.
 */
export function verifyTotp(secret: string, token: string, window = 1): boolean {
  if (!secret || !token) return false;
  const normalized = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;

  const counter = Math.floor(Date.now() / 1000 / DEFAULT_STEP_SECONDS);
  for (let offset = -window; offset <= window; offset++) {
    const expected = hotp(secret, counter + offset);
    const a = Buffer.from(expected);
    const b = Buffer.from(normalized);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

/** Builds the otpauth:// provisioning URI consumed by authenticator apps. */
export function buildOtpauthUrl(secret: string, accountLabel: string, issuer = 'Construction Weather Monitor'): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_STEP_SECONDS)
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
