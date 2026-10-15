import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  LocationItem,
  CurrentWeather,
  HourlyForecastItem,
  DailyForecastItem,
  RiskAssessment,
  AlertItem,
  AlertDelivery,
  MonitorRun,
  OwnerSettings,
  RiskThresholds,
  ProviderComparison,
  SchemaMigration,
  DataFreshnessStatus,
  RiskLevel,
  UserAccount,
  UserRole
} from '../types.js';
import { DEFAULT_THRESHOLDS } from '../services/riskEngine.js';
import { generateSecureBootstrapPassword } from '../utils/security.js';

let dbInstance: Database | null = null;
// DATA_DIR allows tests (and advanced deployments) to relocate the SQLite
// database and its backups away from the default `./data` directory.
const DB_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'weather-monitor.sqlite');

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  initializeSchema(dbInstance);
  persistDb();
  return dbInstance;
}

export function persistDb() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error('Failed to persist SQLite database to disk:', err);
  }
}

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '001_initial_core_schema',
    up: (db: Database) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS locations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          timezone TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS weather_observations (
          id TEXT PRIMARY KEY,
          location_id TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          temperature REAL NOT NULL,
          feels_like REAL NOT NULL,
          humidity REAL NOT NULL,
          wind_speed REAL NOT NULL,
          wind_gusts REAL NOT NULL,
          rain_amount REAL NOT NULL,
          rain_prob REAL NOT NULL,
          uv_index REAL NOT NULL,
          weather_code INTEGER NOT NULL,
          weather_desc TEXT NOT NULL,
          pressure REAL NOT NULL,
          visibility REAL NOT NULL,
          raw_json TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS forecast_snapshots (
          id TEXT PRIMARY KEY,
          location_id TEXT NOT NULL,
          fetched_at TEXT NOT NULL,
          hourly_json TEXT NOT NULL,
          daily_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS risk_assessments (
          id TEXT PRIMARY KEY,
          location_id TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          level TEXT NOT NULL,
          score REAL NOT NULL,
          summary TEXT NOT NULL,
          factors_json TEXT NOT NULL,
          activities_json TEXT NOT NULL,
          peak_start TEXT,
          peak_end TEXT,
          peak_metric TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS alerts (
          id TEXT PRIMARY KEY,
          location_id TEXT NOT NULL,
          location_name TEXT NOT NULL,
          alert_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          trigger_condition TEXT NOT NULL,
          observed_value TEXT NOT NULL,
          threshold_value TEXT NOT NULL,
          start_time TEXT NOT NULL,
          expected_duration TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          cleared_at TEXT
        );

        CREATE TABLE IF NOT EXISTS alert_deliveries (
          id TEXT PRIMARY KEY,
          alert_id TEXT NOT NULL,
          alert_type TEXT NOT NULL,
          recipient_email TEXT NOT NULL,
          sent_at TEXT NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT
        );

        CREATE TABLE IF NOT EXISTS monitor_runs (
          id TEXT PRIMARY KEY,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          status TEXT NOT NULL,
          items_processed INTEGER NOT NULL DEFAULT 0,
          error_message TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          event_type TEXT NOT NULL,
          details TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS auth_owner (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_weather_obs_loc_time ON weather_observations (location_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status);
        CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts (alert_type);
        CREATE INDEX IF NOT EXISTS idx_deliveries_alert ON alert_deliveries (alert_id);
      `);
    }
  },
  {
    version: 2,
    name: '002_alert_deliveries_retry_queue',
    up: (db: Database) => {
      const info = db.exec('PRAGMA table_info(alert_deliveries)');
      const columns = info[0]?.values?.map((v) => v[1] as string) || [];
      if (!columns.includes('retry_count')) {
        db.run('ALTER TABLE alert_deliveries ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0');
      }
      if (!columns.includes('max_retries')) {
        db.run('ALTER TABLE alert_deliveries ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 3');
      }
      if (!columns.includes('next_retry_at')) {
        db.run('ALTER TABLE alert_deliveries ADD COLUMN next_retry_at TEXT');
      }
      if (!columns.includes('last_attempt_at')) {
        db.run('ALTER TABLE alert_deliveries ADD COLUMN last_attempt_at TEXT');
      }
    }
  },
  {
    version: 3,
    name: '003_locations_monitoring_status',
    up: (db: Database) => {
      const info = db.exec('PRAGMA table_info(locations)');
      const columns = info[0]?.values?.map((v) => v[1] as string) || [];
      if (!columns.includes('last_checked_at')) {
        db.run('ALTER TABLE locations ADD COLUMN last_checked_at TEXT');
      }
      if (!columns.includes('status')) {
        db.run('ALTER TABLE locations ADD COLUMN status TEXT');
      }
      if (!columns.includes('current_risk_level')) {
        db.run('ALTER TABLE locations ADD COLUMN current_risk_level TEXT');
      }
      if (!columns.includes('last_error')) {
        db.run('ALTER TABLE locations ADD COLUMN last_error TEXT');
      }
    }
  },
  {
    version: 4,
    name: '004_data_retention_log',
    up: (db: Database) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS data_retention_log (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          retention_days INTEGER NOT NULL,
          observations_deleted INTEGER NOT NULL,
          snapshots_deleted INTEGER NOT NULL,
          comparisons_deleted INTEGER NOT NULL,
          alerts_pruned INTEGER NOT NULL
        );
      `);
    }
  },
  {
    version: 5,
    name: '005_users_and_roles',
    up: (db: Database) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          display_name TEXT,
          role TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_login_at TEXT
        );
      `);
    }
  },
  {
    version: 6,
    name: '006_user_mfa',
    up: (db: Database) => {
      const info = db.exec('PRAGMA table_info(users)');
      const columns = info[0]?.values?.map((v) => v[1] as string) || [];
      if (!columns.includes('mfa_secret')) {
        db.run('ALTER TABLE users ADD COLUMN mfa_secret TEXT');
      }
      if (!columns.includes('mfa_enabled')) {
        db.run('ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0');
      }
    }
  },
  {
    version: 7,
    name: '007_persistent_sessions',
    up: (db: Database) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          email TEXT NOT NULL,
          role TEXT NOT NULL,
          display_name TEXT,
          created_at TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
      `);
    }
  },
  {
    version: 8,
    name: '008_push_subscriptions',
    up: (db: Database) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id TEXT PRIMARY KEY,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          user_id TEXT,
          user_email TEXT,
          created_at TEXT NOT NULL
        );
      `);
    }
  }
];

function initializeSchema(db: Database) {
  // Ensure schema_migrations table exists
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  // Query already applied versions
  const appliedRes = db.exec('SELECT version FROM schema_migrations ORDER BY version ASC');
  const appliedVersions = new Set<number>();
  if (appliedRes[0]) {
    for (const v of appliedRes[0].values) {
      appliedVersions.add(v[0] as number);
    }
  }

  // Execute pending migrations in sequential order
  for (const migration of MIGRATIONS) {
    if (!appliedVersions.has(migration.version)) {
      migration.up(db);
      db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        migration.version,
        migration.name,
        new Date().toISOString()
      ]);
    }
  }

  // Seed default location if empty
  const locCount = db.exec('SELECT COUNT(*) as count FROM locations');
  const count = locCount[0]?.values[0]?.[0] as number;
  if (!count || count === 0) {
    const defaultId = 'loc-' + crypto.randomUUID();
    db.run(
      `INSERT INTO locations (id, name, latitude, longitude, timezone, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [defaultId, 'Unconfigured Site', 0, 0, 'UTC', new Date().toISOString()]
    );
  }

  // Seed default owner account if not yet created (strictly without hardcoded static passwords)
  const authCount = db.exec('SELECT COUNT(*) as count FROM auth_owner');
  const hasAuth = authCount[0]?.values[0]?.[0] as number;
  if (!hasAuth || hasAuth === 0) {
    const defaultEmail = process.env.OWNER_EMAIL || 'owner@local';
    const envPassword = process.env.INITIAL_OWNER_PASSWORD || process.env.ADMIN_PASSWORD;
    const initialPass = envPassword || generateSecureBootstrapPassword(16);

    if (!envPassword) {
      console.log('\n============================================================');
      console.log(' [SECURITY NOTICE] Initial Site Owner Account Provisioned:');
      console.log(` Email:    ${defaultEmail}`);
      console.log(` Password: ${initialPass}`);
      console.log(' Please change this password in Settings.');
      console.log('============================================================\n');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPasswordWithSalt(initialPass, salt);
    db.run(
      `INSERT INTO auth_owner (id, email, password_hash, salt, updated_at) VALUES (?, ?, ?, ?, ?)`,
      ['owner-1', defaultEmail, hash, salt, new Date().toISOString()]
    );
  }

  // Migrate the legacy single-owner record into the multi-user `users` table.
  migrateOwnerIntoUsers(db);
}

/**
 * Ensures the primary OWNER account exists in the `users` table, seeding it
 * from the legacy `auth_owner` record when the users table is empty. This is
 * the bridge that upgrades a single-user installation to multi-user access.
 */
function migrateOwnerIntoUsers(db: Database) {
  const userCountRes = db.exec('SELECT COUNT(*) FROM users');
  const userCount = userCountRes[0]?.values[0]?.[0] as number;
  if (userCount && userCount > 0) return;

  const ownerRes = db.exec('SELECT email, password_hash, salt FROM auth_owner LIMIT 1');
  if (!ownerRes[0] || !ownerRes[0].values[0]) return;

  const [email, hash, salt] = ownerRes[0].values[0] as [string, string, string];
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO users (id, email, display_name, role, password_hash, salt, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ['usr-owner-1', email, 'Site Owner', 'OWNER', hash, salt, now, now]
  );
}

export async function getAppliedMigrations(): Promise<SchemaMigration[]> {
  const db = await getDb();
  const res = db.exec('SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC');
  if (!res[0]) return [];
  return res[0].values.map((v) => ({
    version: v[0] as number,
    name: v[1] as string,
    appliedAt: v[2] as string
  }));
}

// Password hashing using Scrypt (RFC 7914 memory-hard KDF)
export function hashPasswordWithSalt(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
}

export async function verifyOwnerPassword(password: string): Promise<{ valid: boolean; email?: string }> {
  const db = await getDb();
  const res = db.exec('SELECT email, password_hash, salt FROM auth_owner LIMIT 1');
  if (!res[0] || !res[0].values[0]) return { valid: false };

  const [email, hash, salt] = res[0].values[0] as [string, string, string];
  const candidateHash = hashPasswordWithSalt(password, salt);

  const hashBuf = Buffer.from(hash, 'hex');
  const candidateBuf = Buffer.from(candidateHash, 'hex');

  if (hashBuf.length === candidateBuf.length && crypto.timingSafeEqual(hashBuf, candidateBuf)) {
    return { valid: true, email };
  }
  return { valid: false };
}

export async function updateOwnerPassword(newPassword: string, newEmail?: string): Promise<boolean> {
  const db = await getDb();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPasswordWithSalt(newPassword, salt);
  const now = new Date().toISOString();

  if (newEmail) {
    db.run(
      `UPDATE auth_owner SET email = ?, password_hash = ?, salt = ?, updated_at = ? WHERE id = 'owner-1'`,
      [newEmail, hash, salt, now]
    );
  } else {
    db.run(
      `UPDATE auth_owner SET password_hash = ?, salt = ?, updated_at = ? WHERE id = 'owner-1'`,
      [hash, salt, now]
    );
  }
  persistDb();
  return true;
}

export async function isOwnerPasswordConfigured(): Promise<boolean> {
  const db = await getDb();
  const confRes = db.exec("SELECT value FROM settings WHERE key = 'owner_configured'");
  return confRes[0]?.values[0]?.[0] === 'true';
}

export async function setupInitialPassword(password: string, email?: string): Promise<boolean> {
  await updateOwnerPassword(password, email);
  const db = await getDb();
  db.run(
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('owner_configured', 'true', ?)",
    [new Date().toISOString()]
  );
  persistDb();
  return true;
}

export async function getOwnerInfo(): Promise<{ email: string; isConfigured: boolean } | null> {
  const db = await getDb();
  const res = db.exec('SELECT email FROM auth_owner LIMIT 1');
  if (!res[0] || !res[0].values[0]) return null;
  const isConfigured = await isOwnerPasswordConfigured();
  return { email: res[0].values[0][0] as string, isConfigured };
}

// Locations
// ---------------------------------------------------------------------------
// Multi-user account management
// ---------------------------------------------------------------------------

const USER_PUBLIC_COLS = 'id, email, display_name, role, active, created_at, updated_at, last_login_at';

function mapUserRow(v: any[]): UserAccount {
  return {
    id: v[0] as string,
    email: v[1] as string,
    displayName: (v[2] as string) || undefined,
    role: v[3] as UserRole,
    active: (v[4] as number) === 1,
    createdAt: v[5] as string,
    updatedAt: v[6] as string,
    lastLoginAt: (v[7] as string) ?? null
  };
}

export async function getAllUsers(): Promise<UserAccount[]> {
  const db = await getDb();
  const res = db.exec(
    `SELECT ${USER_PUBLIC_COLS} FROM users ORDER BY
       CASE role WHEN 'OWNER' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END, email ASC`
  );
  if (!res[0]) return [];
  return res[0].values.map(mapUserRow);
}

export async function getUserById(id: string): Promise<UserAccount | null> {
  const db = await getDb();
  const res = db.exec(`SELECT ${USER_PUBLIC_COLS} FROM users WHERE id = ? LIMIT 1`, [id]);
  if (!res[0] || !res[0].values[0]) return null;
  return mapUserRow(res[0].values[0]);
}

/** Internal: returns the credential record for a single user by email. */
async function getUserCredentialByEmail(email: string) {
  const db = await getDb();
  const res = db.exec(
    `SELECT id, email, display_name, role, password_hash, salt, active FROM users WHERE email = ? LIMIT 1`,
    [email]
  );
  if (!res[0] || !res[0].values[0]) return null;
  const v = res[0].values[0];
  return {
    id: v[0] as string,
    email: v[1] as string,
    displayName: (v[2] as string) || undefined,
    role: v[3] as UserRole,
    passwordHash: v[4] as string,
    salt: v[5] as string,
    active: (v[6] as number) === 1
  };
}

async function getFirstActiveOwner() {
  const db = await getDb();
  const res = db.exec(
    `SELECT id, email, display_name, role, password_hash, salt, active FROM users
     WHERE role = 'OWNER' AND active = 1 ORDER BY created_at ASC LIMIT 1`
  );
  if (!res[0] || !res[0].values[0]) return null;
  const v = res[0].values[0];
  return {
    id: v[0] as string,
    email: v[1] as string,
    displayName: (v[2] as string) || undefined,
    role: v[3] as UserRole,
    passwordHash: v[4] as string,
    salt: v[5] as string,
    active: (v[6] as number) === 1
  };
}

function timingSafeHashEquals(expectedHash: string, candidateHash: string): boolean {
  const a = Buffer.from(expectedHash, 'hex');
  const b = Buffer.from(candidateHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Verifies a password against a user account. When `email` is omitted the
 * primary OWNER account is used, preserving the original single-password login
 * behaviour for backwards compatibility.
 */
export async function verifyUserCredentials(
  password: string,
  email?: string
): Promise<{ valid: boolean; user?: UserAccount }> {
  if (!password) return { valid: false };

  const record = email ? await getUserCredentialByEmail(email.trim()) : await getFirstActiveOwner();
  if (!record || !record.active) return { valid: false };

  const candidate = hashPasswordWithSalt(password, record.salt);
  if (!timingSafeHashEquals(record.passwordHash, candidate)) return { valid: false };

  const user: UserAccount = {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    role: record.role,
    active: record.active,
    createdAt: '',
    updatedAt: ''
  };
  return { valid: true, user };
}

export async function countUsers(): Promise<number> {
  const db = await getDb();
  const res = db.exec('SELECT COUNT(*) FROM users');
  return (res[0]?.values[0]?.[0] as number) || 0;
}

export async function countActiveOwners(excludeUserId?: string): Promise<number> {
  const db = await getDb();
  const res = excludeUserId
    ? db.exec("SELECT COUNT(*) FROM users WHERE role = 'OWNER' AND active = 1 AND id != ?", [excludeUserId])
    : db.exec("SELECT COUNT(*) FROM users WHERE role = 'OWNER' AND active = 1");
  return (res[0]?.values[0]?.[0] as number) || 0;
}

export async function createUserAccount(input: {
  email: string;
  password: string;
  role: UserRole;
  displayName?: string;
}): Promise<UserAccount> {
  const db = await getDb();
  const now = new Date().toISOString();
  const id = 'usr-' + crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPasswordWithSalt(input.password, salt);

  db.run(
    `INSERT INTO users (id, email, display_name, role, password_hash, salt, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, input.email, input.displayName || null, input.role, hash, salt, now, now]
  );
  persistDb();

  return {
    id,
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    active: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  };
}

export async function updateUserRole(id: string, role: UserRole): Promise<boolean> {
  // Refuse to demote the last active OWNER, which would lock out administration.
  const existing = await getUserById(id);
  if (!existing) return false;
  if (existing.role === 'OWNER' && role !== 'OWNER' && (await countActiveOwners(id)) === 0) {
    return false;
  }

  const db = await getDb();
  const now = new Date().toISOString();
  db.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, now, id]);
  persistDb();
  return true;
}

export async function updateUserPassword(id: string, newPassword: string): Promise<boolean> {
  const db = await getDb();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPasswordWithSalt(newPassword, salt);
  const now = new Date().toISOString();
  db.run('UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?', [hash, salt, now, id]);
  persistDb();
  return true;
}

/** Updates a user's email and password in a single operation. */
export async function updateUserCredentials(id: string, email: string, newPassword: string): Promise<boolean> {
  const db = await getDb();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPasswordWithSalt(newPassword, salt);
  const now = new Date().toISOString();
  db.run('UPDATE users SET email = ?, password_hash = ?, salt = ?, updated_at = ? WHERE id = ?', [
    email,
    hash,
    salt,
    now,
    id
  ]);
  persistDb();
  return true;
}

export async function setUserActive(id: string, active: boolean): Promise<boolean> {
  // Prevent deactivating the last active OWNER.
  if (!active) {
    const existing = await getUserById(id);
    if (existing?.role === 'OWNER' && (await countActiveOwners(id)) === 0) {
      return false;
    }
  }
  const db = await getDb();
  const now = new Date().toISOString();
  db.run('UPDATE users SET active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, now, id]);
  persistDb();
  return true;
}

export async function deleteUserAccount(id: string): Promise<boolean> {
  const existing = await getUserById(id);
  if (!existing) return false;
  // Never allow removing the last active OWNER.
  if (existing.role === 'OWNER' && (await countActiveOwners(id)) === 0) {
    return false;
  }
  const db = await getDb();
  db.run('DELETE FROM users WHERE id = ?', [id]);
  persistDb();
  return true;
}

export async function recordUserLogin(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  db.run('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
  persistDb();
}

// ---------------------------------------------------------------------------
// Multi-factor authentication (TOTP)
// ---------------------------------------------------------------------------

export async function setUserMfaSecret(id: string, secret: string): Promise<void> {
  const db = await getDb();
  db.run('UPDATE users SET mfa_secret = ?, updated_at = ? WHERE id = ?', [secret, new Date().toISOString(), id]);
  persistDb();
}

export async function setUserMfaEnabled(id: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  // Clearing the secret when disabling ensures a fresh enrolment next time.
  if (enabled) {
    db.run('UPDATE users SET mfa_enabled = 1, updated_at = ? WHERE id = ?', [now, id]);
  } else {
    db.run('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, updated_at = ? WHERE id = ?', [now, id]);
  }
  persistDb();
}

export async function getUserMfaByEmail(
  email: string
): Promise<{ id: string; email: string; mfaEnabled: boolean; mfaSecret: string | null } | null> {
  const db = await getDb();
  const res = db.exec('SELECT id, email, mfa_enabled, mfa_secret FROM users WHERE email = ? LIMIT 1', [email]);
  if (!res[0] || !res[0].values[0]) return null;
  const v = res[0].values[0];
  return {
    id: v[0] as string,
    email: v[1] as string,
    mfaEnabled: (v[2] as number) === 1,
    mfaSecret: (v[3] as string) || null
  };
}

export async function getUserMfaById(
  id: string
): Promise<{ id: string; email: string; mfaEnabled: boolean; mfaSecret: string | null } | null> {
  const db = await getDb();
  const res = db.exec('SELECT id, email, mfa_enabled, mfa_secret FROM users WHERE id = ? LIMIT 1', [id]);
  if (!res[0] || !res[0].values[0]) return null;
  const v = res[0].values[0];
  return {
    id: v[0] as string,
    email: v[1] as string,
    mfaEnabled: (v[2] as number) === 1,
    mfaSecret: (v[3] as string) || null
  };
}

// ---------------------------------------------------------------------------
// Persistent sessions
// ---------------------------------------------------------------------------

export interface StoredSession {
  token: string;
  userId: string;
  email: string;
  role: UserRole;
  displayName?: string;
  createdAt: string;
  expiresAt: number;
}

export async function saveSession(session: StoredSession): Promise<void> {
  const db = await getDb();
  db.run(
    `INSERT OR REPLACE INTO sessions (token, user_id, email, role, display_name, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      session.token,
      session.userId,
      session.email,
      session.role,
      session.displayName || null,
      session.createdAt,
      session.expiresAt
    ]
  );
  persistDb();
}

export async function deleteSession(token: string): Promise<void> {
  const db = await getDb();
  db.run('DELETE FROM sessions WHERE token = ?', [token]);
  persistDb();
}

export async function deleteSessionsForUser(userId: string): Promise<number> {
  const db = await getDb();
  const before = db.exec('SELECT COUNT(*) FROM sessions WHERE user_id = ?', [userId]);
  const count = (before[0]?.values[0]?.[0] as number) || 0;
  db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
  persistDb();
  return count;
}

export async function loadActiveSessions(): Promise<StoredSession[]> {
  const db = await getDb();
  const res = db.exec(
    `SELECT token, user_id, email, role, display_name, created_at, expires_at
     FROM sessions WHERE expires_at > ? ORDER BY created_at DESC`,
    [Date.now()]
  );
  if (!res[0]) return [];
  return res[0].values.map((v) => ({
    token: v[0] as string,
    userId: v[1] as string,
    email: v[2] as string,
    role: v[3] as UserRole,
    displayName: (v[4] as string) || undefined,
    createdAt: v[5] as string,
    expiresAt: v[6] as number
  }));
}

export async function pruneExpiredSessions(): Promise<void> {
  const db = await getDb();
  db.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
  persistDb();
}

// ---------------------------------------------------------------------------
// Web Push subscriptions
// ---------------------------------------------------------------------------

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userId?: string;
  userEmail?: string;
  createdAt: string;
}

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userId?: string;
  userEmail?: string;
}): Promise<PushSubscriptionRecord> {
  const db = await getDb();
  const id = 'push-' + crypto.randomUUID();
  const now = new Date().toISOString();
  db.run(
    `INSERT OR REPLACE INTO push_subscriptions (id, endpoint, p256dh, auth, user_id, user_email, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.endpoint, input.p256dh, input.auth, input.userId || null, input.userEmail || null, now]
  );
  persistDb();
  return { id, ...input, createdAt: now };
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const db = await getDb();
  db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
  persistDb();
}

export async function getPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const db = await getDb();
  const res = db.exec(
    'SELECT id, endpoint, p256dh, auth, user_id, user_email, created_at FROM push_subscriptions'
  );
  if (!res[0]) return [];
  return res[0].values.map((v) => ({
    id: v[0] as string,
    endpoint: v[1] as string,
    p256dh: v[2] as string,
    auth: v[3] as string,
    userId: (v[4] as string) || undefined,
    userEmail: (v[5] as string) || undefined,
    createdAt: v[6] as string
  }));
}

export async function countPushSubscriptions(): Promise<number> {
  const db = await getDb();
  const res = db.exec('SELECT COUNT(*) FROM push_subscriptions');
  return (res[0]?.values[0]?.[0] as number) || 0;
}
export async function getAllLocations(): Promise<LocationItem[]> {
  const db = await getDb();
  const res = db.exec('SELECT id, name, latitude, longitude, timezone, is_default, created_at, last_checked_at, status, current_risk_level FROM locations ORDER BY is_default DESC, name ASC');
  if (!res[0]) return [];

  return res[0].values.map((v) => ({
    id: v[0] as string,
    name: v[1] as string,
    latitude: v[2] as number,
    longitude: v[3] as number,
    timezone: v[4] as string,
    isDefault: (v[5] as number) === 1,
    createdAt: v[6] as string,
    lastCheckedAt: (v[7] as string) || undefined,
    status: (v[8] as DataFreshnessStatus) || undefined,
    currentRiskLevel: (v[9] as RiskLevel) || undefined
  }));
}

export async function getDefaultLocation(): Promise<LocationItem | null> {
  const db = await getDb();
  const res = db.exec('SELECT id, name, latitude, longitude, timezone, is_default, created_at, last_checked_at, status, current_risk_level FROM locations WHERE is_default = 1 LIMIT 1');
  if (!res[0] || !res[0].values[0]) {
    const anyLoc = await getAllLocations();
    return anyLoc[0] || null;
  }
  const v = res[0].values[0];
  return {
    id: v[0] as string,
    name: v[1] as string,
    latitude: v[2] as number,
    longitude: v[3] as number,
    timezone: v[4] as string,
    isDefault: true,
    createdAt: v[6] as string,
    lastCheckedAt: (v[7] as string) || undefined,
    status: (v[8] as DataFreshnessStatus) || undefined,
    currentRiskLevel: (v[9] as RiskLevel) || undefined
  };
}

export async function updateLocationStatus(
  locationId: string,
  status: DataFreshnessStatus,
  lastCheckedAt: string,
  currentRiskLevel?: RiskLevel,
  lastError?: string
): Promise<void> {
  const db = await getDb();
  db.run(
    `UPDATE locations
     SET status = ?, last_checked_at = ?, current_risk_level = ?, last_error = ?
     WHERE id = ?`,
    [status, lastCheckedAt, currentRiskLevel || null, lastError || null, locationId]
  );
  persistDb();
}

export async function saveLocation(loc: Omit<LocationItem, 'id' | 'createdAt'>): Promise<LocationItem> {
  const db = await getDb();
  const id = 'loc-' + crypto.randomUUID();
  const now = new Date().toISOString();

  if (loc.isDefault) {
    db.run('UPDATE locations SET is_default = 0');
  }

  db.run(
    `INSERT INTO locations (id, name, latitude, longitude, timezone, is_default, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, loc.name, loc.latitude, loc.longitude, loc.timezone, loc.isDefault ? 1 : 0, now]
  );
  persistDb();

  return { id, ...loc, createdAt: now };
}

export async function setDefaultLocation(id: string): Promise<boolean> {
  const db = await getDb();
  db.run('UPDATE locations SET is_default = 0');
  db.run('UPDATE locations SET is_default = 1 WHERE id = ?', [id]);
  persistDb();
  return true;
}

export async function deleteLocation(id: string): Promise<boolean> {
  const db = await getDb();
  db.run('DELETE FROM locations WHERE id = ? AND is_default = 0', [id]);
  persistDb();
  return true;
}

// Weather Observations
export async function saveWeatherObservation(locId: string, current: CurrentWeather): Promise<string> {
  const db = await getDb();
  const id = 'obs-' + crypto.randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO weather_observations (
      id, location_id, timestamp, temperature, feels_like, humidity,
      wind_speed, wind_gusts, rain_amount, rain_prob, uv_index,
      weather_code, weather_desc, pressure, visibility, raw_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      locId,
      current.timestamp,
      current.temperature,
      current.feelsLike,
      current.humidity,
      current.windSpeed,
      current.windGusts,
      current.rainAmount,
      current.rainProbability,
      current.uvIndex,
      current.weatherCode,
      current.weatherDescription,
      current.pressure,
      current.visibility,
      JSON.stringify(current),
      now
    ]
  );
  persistDb();
  return id;
}

export async function getLatestObservation(locId: string): Promise<CurrentWeather | null> {
  const db = await getDb();
  const res = db.exec(
    `SELECT timestamp, temperature, feels_like, humidity, wind_speed, wind_gusts,
            rain_amount, rain_prob, uv_index, weather_code, weather_desc, pressure, visibility, raw_json
     FROM weather_observations WHERE location_id = ? ORDER BY timestamp DESC LIMIT 1`,
    [locId]
  );
  if (!res[0] || !res[0].values[0]) return null;
  const v = res[0].values[0];
  return {
    timestamp: v[0] as string,
    temperature: v[1] as number,
    feelsLike: v[2] as number,
    humidity: v[3] as number,
    windSpeed: v[4] as number,
    windGusts: v[5] as number,
    rainAmount: v[6] as number,
    rainProbability: v[7] as number,
    uvIndex: v[8] as number,
    weatherCode: v[9] as number,
    weatherDescription: v[10] as string,
    pressure: v[11] as number,
    visibility: v[12] as number,
    isDay: true
  };
}

export async function getHistoricalObservations(
  locId: string,
  range: 'today' | 'yesterday' | '7days' | '30days' | 'all' = 'today'
): Promise<CurrentWeather[]> {
  const db = await getDb();
  let timeClause = '';
  const now = new Date();

  if (range === 'today') {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    timeClause = `AND timestamp >= '${startOfDay}'`;
  } else if (range === 'yesterday') {
    const startYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
    const endYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    timeClause = `AND timestamp >= '${startYesterday}' AND timestamp < '${endYesterday}'`;
  } else if (range === '7days') {
    const d = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
    timeClause = `AND timestamp >= '${d}'`;
  } else if (range === '30days') {
    const d = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
    timeClause = `AND timestamp >= '${d}'`;
  }

  const query = `
    SELECT timestamp, temperature, feels_like, humidity, wind_speed, wind_gusts,
           rain_amount, rain_prob, uv_index, weather_code, weather_desc, pressure, visibility
    FROM weather_observations
    WHERE location_id = ? ${timeClause}
    ORDER BY timestamp ASC
  `;

  const res = db.exec(query, [locId]);
  if (!res[0]) return [];

  return res[0].values.map((v) => ({
    timestamp: v[0] as string,
    temperature: v[1] as number,
    feelsLike: v[2] as number,
    humidity: v[3] as number,
    windSpeed: v[4] as number,
    windGusts: v[5] as number,
    rainAmount: v[6] as number,
    rainProbability: v[7] as number,
    uvIndex: v[8] as number,
    weatherCode: v[9] as number,
    weatherDescription: v[10] as string,
    pressure: v[11] as number,
    visibility: v[12] as number,
    isDay: true
  }));
}

// Cross Reference Storage
export async function saveCrossReference(locId: string, comparison: ProviderComparison): Promise<void> {
  const db = await getDb();
  const key = `crossref_${locId}`;
  const now = new Date().toISOString();
  db.run(
    `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`,
    [key, JSON.stringify(comparison), now]
  );
  persistDb();
}

export async function getLatestCrossReference(locId: string): Promise<ProviderComparison | null> {
  const db = await getDb();
  const key = `crossref_${locId}`;
  const res = db.exec(`SELECT value FROM settings WHERE key = ? LIMIT 1`, [key]);
  if (!res[0] || !res[0].values[0]) return null;
  try {
    return JSON.parse(res[0].values[0][0] as string);
  } catch {
    return null;
  }
}

// Forecast Snapshots
export async function saveForecastSnapshot(
  locId: string,
  hourly: HourlyForecastItem[],
  daily: DailyForecastItem[]
): Promise<void> {
  const db = await getDb();
  const id = 'snap-' + crypto.randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO forecast_snapshots (id, location_id, fetched_at, hourly_json, daily_json)
     VALUES (?, ?, ?, ?, ?)`,
    [id, locId, now, JSON.stringify(hourly), JSON.stringify(daily)]
  );
  persistDb();
}

export async function getLatestForecastSnapshot(
  locId: string
): Promise<{ hourly: HourlyForecastItem[]; daily: DailyForecastItem[]; fetchedAt: string } | null> {
  const db = await getDb();
  const res = db.exec(
    `SELECT fetched_at, hourly_json, daily_json FROM forecast_snapshots
     WHERE location_id = ? ORDER BY fetched_at DESC LIMIT 1`,
    [locId]
  );
  if (!res[0] || !res[0].values[0]) return null;
  const [fetchedAt, hourlyJson, dailyJson] = res[0].values[0] as [string, string, string];

  try {
    return {
      fetchedAt,
      hourly: JSON.parse(hourlyJson),
      daily: JSON.parse(dailyJson)
    };
  } catch {
    return null;
  }
}

// Risk Assessments
export async function saveRiskAssessment(locId: string, assessment: RiskAssessment): Promise<void> {
  const db = await getDb();
  const id = 'risk-' + crypto.randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO risk_assessments (
      id, location_id, timestamp, level, score, summary,
      factors_json, activities_json, peak_start, peak_end, peak_metric, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      locId,
      assessment.calculatedAt,
      assessment.level,
      assessment.score,
      assessment.summary,
      JSON.stringify(assessment.factors),
      JSON.stringify(assessment.affectedActivities),
      assessment.peakPeriod?.start || null,
      assessment.peakPeriod?.end || null,
      assessment.peakPeriod?.metric || null,
      now
    ]
  );
  persistDb();
}

export async function getLatestRiskAssessment(locId: string): Promise<RiskAssessment | null> {
  const db = await getDb();
  const res = db.exec(
    `SELECT timestamp, level, score, summary, factors_json, activities_json,
            peak_start, peak_end, peak_metric
     FROM risk_assessments WHERE location_id = ? ORDER BY timestamp DESC LIMIT 1`,
    [locId]
  );
  if (!res[0] || !res[0].values[0]) return null;
  const v = res[0].values[0];

  try {
    return {
      calculatedAt: v[0] as string,
      level: v[1] as any,
      score: v[2] as number,
      summary: v[3] as string,
      factors: JSON.parse(v[4] as string),
      affectedActivities: JSON.parse(v[5] as string),
      peakPeriod: v[6]
        ? {
            start: v[6] as string,
            end: v[7] as string,
            metric: v[8] as string
          }
        : undefined,
      safetyDisclaimer:
        'Review applicable site procedures, SWMS, equipment requirements and manufacturer limits. The system is a weather-risk monitoring tool. It is not a replacement for professional safety judgement.'
    };
  } catch {
    return null;
  }
}

// Alerts & Deliveries
export async function saveAlert(alert: Omit<AlertItem, 'id' | 'createdAt'>): Promise<AlertItem> {
  const db = await getDb();
  const id = 'alt-' + crypto.randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO alerts (
      id, location_id, location_name, alert_type, severity, title,
      message, trigger_condition, observed_value, threshold_value,
      start_time, expected_duration, status, created_at, cleared_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      alert.locationId,
      alert.locationName,
      alert.alertType,
      alert.severity,
      alert.title,
      alert.message,
      alert.triggerCondition,
      alert.observedValue,
      alert.thresholdValue,
      alert.startTime,
      alert.expectedDuration,
      alert.status,
      now,
      alert.clearedAt || null
    ]
  );
  persistDb();

  return { id, ...alert, createdAt: now };
}

export async function getActiveAlerts(locId?: string): Promise<AlertItem[]> {
  const db = await getDb();
  const query = locId
    ? `SELECT id, location_id, location_name, alert_type, severity, title,
              message, trigger_condition, observed_value, threshold_value,
              start_time, expected_duration, status, created_at, cleared_at
       FROM alerts WHERE status = 'ACTIVE' AND location_id = ? ORDER BY created_at DESC`
    : `SELECT id, location_id, location_name, alert_type, severity, title,
              message, trigger_condition, observed_value, threshold_value,
              start_time, expected_duration, status, created_at, cleared_at
       FROM alerts WHERE status = 'ACTIVE' ORDER BY created_at DESC`;

  const res = locId ? db.exec(query, [locId]) : db.exec(query);
  if (!res[0]) return [];

  return res[0].values.map((v) => ({
    id: v[0] as string,
    locationId: v[1] as string,
    locationName: v[2] as string,
    alertType: v[3] as any,
    severity: v[4] as any,
    title: v[5] as string,
    message: v[6] as string,
    triggerCondition: v[7] as string,
    observedValue: v[8] as string,
    thresholdValue: v[9] as string,
    startTime: v[10] as string,
    expectedDuration: v[11] as string,
    status: v[12] as any,
    createdAt: v[13] as string,
    clearedAt: v[14] as string | null
  }));
}

export async function getAlertHistory(limit = 50): Promise<AlertItem[]> {
  const db = await getDb();
  const res = db.exec(
    `SELECT id, location_id, location_name, alert_type, severity, title,
            message, trigger_condition, observed_value, threshold_value,
            start_time, expected_duration, status, created_at, cleared_at
     FROM alerts ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
  if (!res[0]) return [];

  return res[0].values.map((v) => ({
    id: v[0] as string,
    locationId: v[1] as string,
    locationName: v[2] as string,
    alertType: v[3] as any,
    severity: v[4] as any,
    title: v[5] as string,
    message: v[6] as string,
    triggerCondition: v[7] as string,
    observedValue: v[8] as string,
    thresholdValue: v[9] as string,
    startTime: v[10] as string,
    expectedDuration: v[11] as string,
    status: v[12] as any,
    createdAt: v[13] as string,
    clearedAt: v[14] as string | null
  }));
}

export async function updateAlertStatus(alertId: string, status: 'CLEARED' | 'DISMISSED'): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  db.run(`UPDATE alerts SET status = ?, cleared_at = ? WHERE id = ?`, [status, now, alertId]);
  persistDb();
}

export async function recordAlertDelivery(delivery: {
  alertId: string;
  alertType: string;
  recipientEmail: string;
  sentAt: string;
  status: 'SUCCESS' | 'PENDING_RETRY' | 'FAILED';
  errorMessage?: string;
  retryCount?: number;
  maxRetries?: number;
  nextRetryAt?: string;
  lastAttemptAt?: string;
}): Promise<string> {
  const db = await getDb();
  const id = 'del-' + crypto.randomUUID();

  db.run(
    `INSERT INTO alert_deliveries (
      id, alert_id, alert_type, recipient_email, sent_at, status, error_message,
      retry_count, max_retries, next_retry_at, last_attempt_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      delivery.alertId,
      delivery.alertType,
      delivery.recipientEmail,
      delivery.sentAt,
      delivery.status,
      delivery.errorMessage || null,
      delivery.retryCount || 0,
      delivery.maxRetries || 3,
      delivery.nextRetryAt || null,
      delivery.lastAttemptAt || delivery.sentAt
    ]
  );
  persistDb();
  return id;
}

export async function getAlertDeliveries(limit = 50): Promise<AlertDelivery[]> {
  const db = await getDb();
  const res = db.exec(
    `SELECT id, alert_id, alert_type, recipient_email, sent_at, status, error_message,
            retry_count, max_retries, next_retry_at, last_attempt_at
     FROM alert_deliveries ORDER BY sent_at DESC LIMIT ?`,
    [limit]
  );
  if (!res[0]) return [];

  return res[0].values.map((v) => ({
    id: v[0] as string,
    alertId: v[1] as string,
    alertType: v[2] as string,
    recipientEmail: v[3] as string,
    sentAt: v[4] as string,
    status: v[5] as any,
    errorMessage: (v[6] as string) || undefined,
    retryCount: (v[7] as number) || 0,
    maxRetries: (v[8] as number) || 3,
    nextRetryAt: (v[9] as string) || undefined,
    lastAttemptAt: (v[10] as string) || undefined
  }));
}

export async function getPendingAlertDeliveries(): Promise<AlertDelivery[]> {
  const db = await getDb();
  const nowIso = new Date().toISOString();
  const res = db.exec(
    `SELECT id, alert_id, alert_type, recipient_email, sent_at, status, error_message,
            retry_count, max_retries, next_retry_at, last_attempt_at
     FROM alert_deliveries
     WHERE status = 'PENDING_RETRY' AND retry_count < max_retries AND (next_retry_at IS NULL OR next_retry_at <= ?)
     ORDER BY next_retry_at ASC LIMIT 10`,
    [nowIso]
  );
  if (!res[0]) return [];

  return res[0].values.map((v) => ({
    id: v[0] as string,
    alertId: v[1] as string,
    alertType: v[2] as string,
    recipientEmail: v[3] as string,
    sentAt: v[4] as string,
    status: v[5] as any,
    errorMessage: (v[6] as string) || undefined,
    retryCount: (v[7] as number) || 0,
    maxRetries: (v[8] as number) || 3,
    nextRetryAt: (v[9] as string) || undefined,
    lastAttemptAt: (v[10] as string) || undefined
  }));
}

export async function updateAlertDeliveryAttempt(
  deliveryId: string,
  status: 'SUCCESS' | 'PENDING_RETRY' | 'FAILED',
  retryCount: number,
  nextRetryAt?: string,
  errorMessage?: string
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  db.run(
    `UPDATE alert_deliveries
     SET status = ?, retry_count = ?, next_retry_at = ?, last_attempt_at = ?, error_message = ?
     WHERE id = ?`,
    [status, retryCount, nextRetryAt || null, now, errorMessage || null, deliveryId]
  );
  persistDb();
}

// Monitor Runs
export async function recordMonitorRun(
  status: 'SUCCESS' | 'FAILED' | 'RUNNING',
  itemsProcessed = 0,
  errorMessage?: string,
  startedAt?: string
): Promise<string> {
  const db = await getDb();
  const id = 'run-' + crypto.randomUUID();
  const now = new Date().toISOString();
  const start = startedAt || now;

  db.run(
    `INSERT INTO monitor_runs (id, started_at, completed_at, status, items_processed, error_message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, start, status === 'RUNNING' ? null : now, status, itemsProcessed, errorMessage || null]
  );
  persistDb();
  return id;
}

export async function getRecentMonitorRuns(limit = 10): Promise<MonitorRun[]> {
  const db = await getDb();
  const res = db.exec(
    `SELECT id, started_at, completed_at, status, items_processed, error_message
     FROM monitor_runs ORDER BY started_at DESC LIMIT ?`,
    [limit]
  );
  if (!res[0]) return [];

  return res[0].values.map((v) => ({
    id: v[0] as string,
    startedAt: v[1] as string,
    completedAt: (v[2] as string) || undefined,
    status: v[3] as any,
    itemsProcessed: v[4] as number,
    errorMessage: (v[5] as string) || undefined
  }));
}

// Settings
export async function getOwnerSettings(): Promise<OwnerSettings> {
  const db = await getDb();
  const res = db.exec('SELECT key, value FROM settings');
  const map: Record<string, string> = {};
  if (res[0]) {
    for (const [k, v] of res[0].values) {
      map[k as string] = v as string;
    }
  }

  const defaultLoc = await getDefaultLocation();
  const ownerInfo = await getOwnerInfo();

  let thresholds: RiskThresholds = { ...DEFAULT_THRESHOLDS };
  if (map['risk_thresholds']) {
    try {
      thresholds = { ...thresholds, ...JSON.parse(map['risk_thresholds']) };
    } catch {}
  }

  return {
    ownerEmail: map['owner_email'] || ownerInfo?.email || process.env.OWNER_EMAIL || 'owner@local',
    ownerName: map['owner_name'] || 'Site Manager',
    defaultLocationId: map['default_location_id'] || defaultLoc?.id || '',
    temperatureUnit: (map['temperature_unit'] as any) || 'C',
    windUnit: (map['wind_unit'] as any) || 'km/h',
    emailAlertsEnabled: map['email_alerts_enabled'] !== 'false',
    monitoringEnabled: map['monitoring_enabled'] !== 'false',
    monitorIntervalMinutes: map['monitor_interval_minutes'] ? parseInt(map['monitor_interval_minutes'], 10) : 15,
    alertCooldownMinutes: map['alert_cooldown_minutes'] ? parseInt(map['alert_cooldown_minutes'], 10) : 60,
    recoveryNotificationsEnabled: map['recovery_notifications_enabled'] === 'true',
    dataRetentionDays: map['data_retention_days'] ? parseInt(map['data_retention_days'], 10) : 30,
    thresholds
  };
}

export async function saveOwnerSettings(settings: Partial<OwnerSettings>): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  const setK = (k: string, v: any) => {
    const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
    db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [k, valStr, now]
    );
  };

  if (settings.ownerEmail !== undefined) setK('owner_email', settings.ownerEmail);
  if (settings.ownerName !== undefined) setK('owner_name', settings.ownerName);
  if (settings.defaultLocationId !== undefined) setK('default_location_id', settings.defaultLocationId);
  if (settings.temperatureUnit !== undefined) setK('temperature_unit', settings.temperatureUnit);
  if (settings.windUnit !== undefined) setK('wind_unit', settings.windUnit);
  if (settings.emailAlertsEnabled !== undefined) setK('email_alerts_enabled', settings.emailAlertsEnabled);
  if (settings.monitoringEnabled !== undefined) setK('monitoring_enabled', settings.monitoringEnabled);
  if (settings.monitorIntervalMinutes !== undefined) setK('monitor_interval_minutes', settings.monitorIntervalMinutes);
  if (settings.alertCooldownMinutes !== undefined) setK('alert_cooldown_minutes', settings.alertCooldownMinutes);
  if (settings.recoveryNotificationsEnabled !== undefined)
    setK('recovery_notifications_enabled', settings.recoveryNotificationsEnabled);
  if (settings.dataRetentionDays !== undefined) setK('data_retention_days', settings.dataRetentionDays);
  if (settings.thresholds !== undefined) setK('risk_thresholds', settings.thresholds);

  persistDb();
}

// Audit Logs
export async function addAuditLog(eventType: string, details: string): Promise<void> {
  const db = await getDb();
  const id = 'aud-' + crypto.randomUUID();
  const now = new Date().toISOString();

  db.run(`INSERT INTO audit_log (id, timestamp, event_type, details) VALUES (?, ?, ?, ?)`, [
    id,
    now,
    eventType,
    details
  ]);
  persistDb();
}

export async function getAuditLogs(limit = 40): Promise<Array<{ id: string; timestamp: string; eventType: string; details: string }>> {
  const db = await getDb();
  const res = db.exec(`SELECT id, timestamp, event_type, details FROM audit_log ORDER BY timestamp DESC LIMIT ?`, [limit]);
  if (!res[0]) return [];

  return res[0].values.map((v) => ({
    id: v[0] as string,
    timestamp: v[1] as string,
    eventType: v[2] as string,
    details: v[3] as string
  }));
}

// Data Retention
/** Fixed retention windows for the shorter-lived derived tables. */
export const SNAPSHOT_RETENTION_DAYS = 14;
export const ALERT_RETENTION_DAYS = 90;
export const MONITOR_RUN_RETENTION_DAYS = 30;

export async function enforceDataRetention(retentionDays = 30): Promise<{
  observationsDeleted: number;
  snapshotsDeleted: number;
  comparisonsDeleted: number;
  alertsPruned: number;
}> {
  const db = await getDb();
  const now = new Date();
  const obsCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const snapCutoff = new Date(now.getTime() - SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const alertsCutoff = new Date(now.getTime() - ALERT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const monitorCutoff = new Date(now.getTime() - MONITOR_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // 1. Observations
  const obsCountRes = db.exec('SELECT COUNT(*) FROM weather_observations WHERE created_at < ?', [obsCutoff]);
  const obsToDelete = (obsCountRes[0]?.values[0]?.[0] as number) || 0;
  if (obsToDelete > 0) {
    db.run('DELETE FROM weather_observations WHERE created_at < ?', [obsCutoff]);
  }

  // 2. Snapshots
  const snapCountRes = db.exec('SELECT COUNT(*) FROM forecast_snapshots WHERE fetched_at < ?', [snapCutoff]);
  const snapsToDelete = (snapCountRes[0]?.values[0]?.[0] as number) || 0;
  if (snapsToDelete > 0) {
    db.run('DELETE FROM forecast_snapshots WHERE fetched_at < ?', [snapCutoff]);
  }

  // 3. Monitor runs
  db.run('DELETE FROM monitor_runs WHERE started_at < ?', [monitorCutoff]);

  // 4. Old cleared alerts
  const alertCountRes = db.exec("SELECT COUNT(*) FROM alerts WHERE status IN ('CLEARED', 'DISMISSED') AND created_at < ?", [alertsCutoff]);
  const alertsToPrune = (alertCountRes[0]?.values[0]?.[0] as number) || 0;
  if (alertsToPrune > 0) {
    db.run("DELETE FROM alerts WHERE status IN ('CLEARED', 'DISMISSED') AND created_at < ?", [alertsCutoff]);
  }

  // Log in data_retention_log
  const logId = 'ret-' + crypto.randomUUID();
  db.run(
    `INSERT INTO data_retention_log (id, timestamp, retention_days, observations_deleted, snapshots_deleted, comparisons_deleted, alerts_pruned)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [logId, now.toISOString(), retentionDays, obsToDelete, snapsToDelete, 0, alertsToPrune]
  );

  persistDb();

  await addAuditLog(
    'DATA_RETENTION_CLEANUP',
    `Retention run completed (${retentionDays}d window): pruned ${obsToDelete} observations, ${snapsToDelete} snapshots, ${alertsToPrune} resolved alerts.`
  );

  return {
    observationsDeleted: obsToDelete,
    snapshotsDeleted: snapsToDelete,
    comparisonsDeleted: 0,
    alertsPruned: alertsToPrune
  };
}

export async function getDataRetentionLogs(limit = 10): Promise<Array<{
  id: string;
  timestamp: string;
  retentionDays: number;
  observationsDeleted: number;
  snapshotsDeleted: number;
  alertsPruned: number;
}>> {
  const db = await getDb();
  const res = db.exec(
    `SELECT id, timestamp, retention_days, observations_deleted, snapshots_deleted, alerts_pruned
     FROM data_retention_log ORDER BY timestamp DESC LIMIT ?`,
    [limit]
  );
  if (!res[0]) return [];

  return res[0].values.map((v) => ({
    id: v[0] as string,
    timestamp: v[1] as string,
    retentionDays: v[2] as number,
    observationsDeleted: v[3] as number,
    snapshotsDeleted: v[4] as number,
    alertsPruned: v[5] as number
  }));
}

// Data clearance
export async function clearCachedData(): Promise<void> {
  const db = await getDb();
  db.run('DELETE FROM forecast_snapshots');
  persistDb();
}

export async function clearHistoricalObservations(): Promise<void> {
  const db = await getDb();
  db.run('DELETE FROM weather_observations');
  db.run('DELETE FROM risk_assessments');
  persistDb();
}

export async function clearAllApplicationData(): Promise<void> {
  const db = await getDb();
  db.run('DELETE FROM forecast_snapshots');
  db.run('DELETE FROM weather_observations');
  db.run('DELETE FROM risk_assessments');
  db.run('DELETE FROM alerts');
  db.run('DELETE FROM alert_deliveries');
  db.run('DELETE FROM monitor_runs');
  persistDb();
}

// Backup & restore
export async function getDatabaseBinary(): Promise<Buffer> {
  await getDb();
  persistDb();
  return fs.readFileSync(DB_FILE);
}

const BACKUP_DIR = path.join(DB_DIR, 'backups');

export async function createDatabaseBackup(): Promise<string> {
  await getDb();
  persistDb();
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `weather-monitor-${timestamp}.sqlite`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);
  if (fs.existsSync(DB_FILE)) {
    fs.copyFileSync(DB_FILE, backupFilePath);
  }

  // Keep last 10 backups
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('weather-monitor-') && f.endsWith('.sqlite'))
      .sort();
    if (files.length > 10) {
      const toDelete = files.slice(0, files.length - 10);
      for (const file of toDelete) {
        fs.unlinkSync(path.join(BACKUP_DIR, file));
      }
    }
  } catch (err) {
    console.error('Backup rotation error:', err);
  }

  return backupFileName;
}

export function getDatabaseBackupsList(): { filename: string; size: number; createdAt: string }[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('weather-monitor-') && f.endsWith('.sqlite'))
      .map((f) => {
        const fullPath = path.join(BACKUP_DIR, f);
        const stat = fs.statSync(fullPath);
        return {
          filename: f,
          size: stat.size,
          createdAt: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/**
 * Restores the live database from a previously created backup snapshot.
 *
 * A safety snapshot of the current database is taken first, so a restore is
 * itself reversible. The filename is strictly validated to prevent traversal.
 */
export async function restoreDatabaseBackup(filename: string): Promise<boolean> {
  if (typeof filename !== 'string' || !/^weather-monitor-[A-Za-z0-9._-]+\.sqlite$/.test(filename)) {
    return false;
  }
  const backupFilePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(backupFilePath)) return false;

  // Take a safety snapshot of the current state before overwriting.
  await createDatabaseBackup();

  // Drop the in-memory handle so the next getDb() reloads from the restored file.
  dbInstance = null;
  fs.copyFileSync(backupFilePath, DB_FILE);
  await getDb();
  return true;
}
