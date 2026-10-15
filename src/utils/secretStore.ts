import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Persists server-side secrets (session signing secret, VAPID key pair) to the
 * local data directory so they survive restarts. Environment variables always
 * take precedence, enabling fully externalised secret management in containers.
 */
const DATA_DIR = path.join(process.cwd(), 'data');

function readSecretFile(fileName: string): string | null {
  try {
    const filePath = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(filePath)) return null;
    const value = fs.readFileSync(filePath, 'utf8').trim();
    return value || null;
  } catch {
    return null;
  }
}

function writeSecretFile(fileName: string, value: string): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, fileName), value, { mode: 0o600 });
  } catch {
    // Non-fatal: we still have a usable in-memory secret for this process.
  }
}

/**
 * Resolves the session signing secret: SESSION_SECRET env var wins, otherwise a
 * generated secret is persisted to data/ so sessions survive process restarts.
 */
export function loadOrCreateSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim()) {
    return process.env.SESSION_SECRET.trim();
  }
  const existing = readSecretFile('session-secret');
  if (existing) return existing;

  const secret = crypto.randomBytes(32).toString('hex');
  writeSecretFile('session-secret', secret);
  return secret;
}

/** Loads a JSON secret file (used for the VAPID key pair). */
export function readJsonSecret<T>(fileName: string): T | null {
  const raw = readSecretFile(fileName);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Persists a JSON secret file with owner-only permissions. */
export function writeJsonSecret(fileName: string, value: unknown): void {
  writeSecretFile(fileName, JSON.stringify(value, null, 2));
}
