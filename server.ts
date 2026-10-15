import './src/env.js';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';

import {
  getDb,
  getOwnerInfo,
  getAllLocations,
  getDefaultLocation,
  saveLocation,
  setDefaultLocation,
  deleteLocation,
  getLatestObservation,
  getHistoricalObservations,
  getLatestForecastSnapshot,
  getLatestRiskAssessment,
  getLatestCrossReference,
  getActiveAlerts,
  getAlertHistory,
  updateAlertStatus,
  getAlertDeliveries,
  getOwnerSettings,
  saveOwnerSettings,
  getRecentMonitorRuns,
  getAuditLogs,
  clearCachedData,
  clearHistoricalObservations,
  clearAllApplicationData,
  getDatabaseBinary,
  createDatabaseBackup,
  getDatabaseBackupsList,
  restoreDatabaseBackup,
  setupInitialPassword,
  addAuditLog,
  enforceDataRetention,
  getDataRetentionLogs,
  // Multi-user account management
  getAllUsers,
  getUserById,
  createUserAccount,
  updateUserRole,
  updateUserPassword,
  updateUserCredentials,
  setUserActive,
  deleteUserAccount,
  recordUserLogin,
  verifyUserCredentials,
  // MFA
  setUserMfaSecret,
  setUserMfaEnabled,
  getUserMfaByEmail,
  getUserMfaById,
  // Persistent sessions
  saveSession,
  deleteSession,
  deleteSessionsForUser,
  loadActiveSessions,
  pruneExpiredSessions,
  touchSession,
  // Web push
  countPushSubscriptions,
  // Metrics aggregates
  countObservations,
  countAlertDeliveries,
  countMonitorRunsByStatus,
  countUsers,
  // Per-user push preferences
  getPushPreferences,
  savePushPreferences
} from './src/database/db.js';
import { DEFAULT_THRESHOLDS } from './src/services/riskEngine.js';
import { searchGeocodingLocations } from './src/services/weatherService.js';
import { isSmtpConfigured, sendTestEmail, getPublicSmtpStatus } from './src/services/emailService.js';
import { monitoringService } from './src/services/monitoringService.js';
import {
  initPush,
  getVapidPublicKey,
  isPushConfigured,
  subscribeToPush,
  unsubscribeFromPush,
  sendPushToAll
} from './src/services/pushService.js';
import { evaluateDataFreshness } from './src/utils/time.js';
import { maskSecret } from './src/utils/security.js';
import { securityHeaders } from './src/utils/securityHeaders.js';
import { createRateLimiter } from './src/utils/rateLimiter.js';
import { logger, requestLogger } from './src/utils/logger.js';
import { validatePasswordStrength, describePasswordPolicy } from './src/utils/password.js';
import { generateTotpSecret, verifyTotp, buildOtpauthUrl } from './src/utils/totp.js';
import { loadOrCreateSessionSecret } from './src/utils/secretStore.js';
import { UserAccount, UserRole } from './src/types.js';

const PORT = 3000;
const SESSION_SECRET = loadOrCreateSessionSecret();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Cookies are marked Secure only when explicitly enabled, because the default
// deployment is a plain-HTTP local enclave where Secure cookies are never sent.
const SECURE_COOKIES = process.env.SECURE_COOKIES === 'true';

// When enabled, the third-party WeatherAPI provider is skipped entirely.
const LOCAL_ONLY = process.env.LOCAL_ONLY === 'true';

// Simple secure in-memory session store, keyed by token. Each entry is bound
// to a user account and carries an absolute expiry. Entries are mirrored to
// SQLite so logins survive process restarts.
interface SessionEntry {
  userId: string;
  email: string;
  role: UserRole;
  displayName?: string;
  createdAt: string;
  expiresAt: number;
  userAgent?: string;
  ip?: string;
  lastSeenAt: number;
}
const activeSessions = new Map<string, SessionEntry>();

// How long a session may go before its "last seen" timestamp is flushed to
// SQLite. Keeps the per-request cost to a best-effort write every minute.
const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

// A non-reversible public identifier for a session token. The raw token is the
// bearer credential and must never be exposed to the client; this digest lets
// the UI reference (and revoke) a session without revealing it.
function sessionPublicId(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Augments the Express request with the resolved session for downstream handlers.
interface AuthedRequest extends Request {
  session?: SessionEntry;
}

function createSession(
  user: UserAccount,
  meta: { userAgent?: string; ip?: string } = {}
): string {
  const token = crypto.randomBytes(32).toString('hex');
  const entry: SessionEntry = {
    userId: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    userAgent: meta.userAgent,
    ip: meta.ip,
    lastSeenAt: Date.now()
  };
  activeSessions.set(token, entry);
  // Write-through persistence (best-effort; a failure must not block login).
  saveSession({ token, ...entry }).catch((err) =>
    logger.warn('session_persist_failed', { error: String(err) })
  );
  return token;
}

// Extracts display metadata for the connecting device, used by the active
// sessions view. Best-effort and truncated to keep stored values bounded.
function extractClientMeta(req: Request): { userAgent?: string; ip?: string } {
  const ua = req.headers['user-agent'];
  return {
    userAgent: typeof ua === 'string' ? ua.slice(0, 400) : undefined,
    ip: req.ip
  };
}

function extractSessionToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.cwm_session;
  if (cookieToken) return cookieToken;
  const headerToken = req.headers['x-session-token'];
  if (typeof headerToken === 'string' && headerToken) return headerToken;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return undefined;
}

function getSession(token?: string): SessionEntry | undefined {
  if (!token) return undefined;
  const entry = activeSessions.get(token);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    activeSessions.delete(token);
    deleteSession(token).catch(() => {});
    return undefined;
  }
  // Record activity at most once per interval to avoid a write on every request.
  const now = Date.now();
  if (now - entry.lastSeenAt > SESSION_TOUCH_INTERVAL_MS) {
    entry.lastSeenAt = now;
    touchSession(token, now).catch(() => {});
  }
  return entry;
}

// Authentication middleware - verifies signed session cookie, x-session-token, or Bearer auth
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const session = getSession(extractSessionToken(req));
  if (!session) {
    res.status(401).json({ error: 'Authentication required. Safety enclave locked.' });
    return;
  }
  (req as AuthedRequest).session = session;
  next();
}

/**
 * CSRF defence for cookie-authenticated state changes.
 *
 * Requests authenticated with an explicit token header (x-session-token /
 * Bearer) are exempt because they cannot be forged cross-site. Cookie-based
 * requests must echo the readable `cwm_csrf` cookie in the `x-csrf-token`
 * header (double-submit pattern).
 */
function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  // Only cookie-authenticated requests are vulnerable to CSRF. Unauthenticated
  // requests (login/setup) and explicit token-header clients are exempt.
  if (!req.cookies?.cwm_session) {
    next();
    return;
  }
  const cookieToken = req.cookies?.cwm_csrf;
  const headerToken = req.headers['x-csrf-token'];
  if (!cookieToken || typeof headerToken !== 'string' || cookieToken !== headerToken) {
    res.status(403).json({ error: 'Invalid or missing CSRF token.' });
    return;
  }
  next();
}

/** Issues the readable double-submit CSRF cookie alongside a login. */
function issueCsrfCookie(res: Response): void {
  const csrfToken = crypto.randomBytes(24).toString('hex');
  res.cookie('cwm_csrf', csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure: SECURE_COOKIES,
    maxAge: SESSION_TTL_MS
  });
}


/**
 * Role-gating middleware. The OWNER role always satisfies any gate; otherwise
 * the session role must be one of `roles`. Must run after `requireAuth`.
 */
function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const session = (req as AuthedRequest).session || getSession(extractSessionToken(req));
    if (!session) {
      res.status(401).json({ error: 'Authentication required. Safety enclave locked.' });
      return;
    }
    (req as AuthedRequest).session = session;
    if (session.role !== 'OWNER' && !roles.includes(session.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this action.' });
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Per-account login lockout
// ---------------------------------------------------------------------------
const LOGIN_MAX_ATTEMPTS = Math.max(3, Number(process.env.LOGIN_MAX_ATTEMPTS) || 5);
const LOGIN_LOCKOUT_MS = Math.max(1, Number(process.env.LOGIN_LOCKOUT_MINUTES) || 15) * 60 * 1000;
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function lockoutRemainingMs(key: string): number {
  const entry = loginAttempts.get(key);
  if (!entry) return 0;
  if (entry.lockedUntil > Date.now()) return entry.lockedUntil - Date.now();
  return 0;
}

function recordLoginFailure(key: string): void {
  const entry = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    entry.count = 0;
  }
  loginAttempts.set(key, entry);
}

function clearLoginFailures(key: string): void {
  loginAttempts.delete(key);
}


export type StaticMode = 'vite' | 'static' | 'none';

export interface CreateAppOptions {
  /**
   * How to serve the frontend. Defaults to the Vite dev middleware outside
   * production and the built `dist/` assets in production. Tests pass 'none'.
   */
  staticMode?: StaticMode;
  /** Start the periodic monitoring poller (default true). */
  startMonitoring?: boolean;
  /** Schedule the 30-minute backup snapshot timer (default true). */
  scheduleBackups?: boolean;
}

async function createApp(options: CreateAppOptions = {}): Promise<express.Express> {
  const staticMode: StaticMode =
    options.staticMode ?? (process.env.NODE_ENV === 'production' ? 'static' : 'vite');
  const startMonitoring = options.startMonitoring ?? true;
  const scheduleBackups = options.scheduleBackups ?? true;

  const app = express();

  // Disable fingerprinting and trust the first proxy hop for accurate client IPs.
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Apply baseline security headers to every response. HSTS is opt-in because
  // the default deployment is a plain-HTTP local enclave.
  app.use(securityHeaders({
    enableHsts: process.env.ENABLE_HSTS === 'true',
    dev: process.env.NODE_ENV !== 'production'
  }));

  app.use(requestLogger);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser(SESSION_SECRET));

  // Brute-force protection for the unauthenticated auth endpoints.
  const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: Math.max(1, Number(process.env.AUTH_RATE_LIMIT_MAX) || 10),
    message: 'Too many authentication attempts. Please wait before trying again.'
  });

  // Broad safety net for the authenticated API surface.
  const apiLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: Math.max(1, Number(process.env.API_RATE_LIMIT_MAX) || 300)
  });

  app.use('/api/', apiLimiter);

  // CSRF double-submit protection for cookie-authenticated state changes.
  app.use('/api/', requireCsrf);

  // Initialize SQLite database
  await getDb();
  logger.info('database_initialised');

  // Restore persistent sessions so logins survive restarts.
  try {
    await pruneExpiredSessions();
    const stored = await loadActiveSessions();
    for (const s of stored) {
      activeSessions.set(s.token, {
        userId: s.userId,
        email: s.email,
        role: s.role,
        displayName: s.displayName,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        userAgent: s.userAgent,
        ip: s.ip,
        lastSeenAt: s.lastSeenAt ?? Date.parse(s.createdAt)
      });
    }
    logger.info('sessions_restored', { count: stored.length });
  } catch (err) {
    logger.warn('session_restore_failed', { error: String(err) });
  }

  // Initialize Web Push (generates/persists VAPID keys on first boot).
  initPush();

  // Start background monitoring service
  if (startMonitoring) {
    await monitoringService.start();
    logger.info('monitoring_started');
  }

  // Background automated backup snapshot every 30 minutes
  if (scheduleBackups) {
    setInterval(() => {
      createDatabaseBackup().catch((e) => logger.error('backup_snapshot_failed', { error: String(e) }));
    }, 30 * 60 * 1000);
  }

  // ----------------- LIVENESS (UNAUTHENTICATED) -----------------
  // Deliberately minimal and unauthenticated so container orchestrators and
  // load balancers can probe the process without credentials.
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
  });

  // ----------------- METRICS (PROMETHEUS) -----------------
  // Operational metrics in the Prometheus text exposition format. Scrapers may
  // authenticate with a shared bearer token (`METRICS_TOKEN`); otherwise the
  // caller must hold a valid session so metrics are never exposed by default.
  app.get('/metrics', async (req: Request, res: Response) => {
    const metricsToken = process.env.METRICS_TOKEN;
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
    const tokenOk = Boolean(metricsToken) && (bearer === metricsToken || queryToken === metricsToken);

    if (!tokenOk && !getSession(extractSessionToken(req))) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const monitor = monitoringService.getStatus();
      const smtpConfigured = await isSmtpConfigured();
      const [
        locations,
        activeAlerts,
        deliveries,
        sessions,
        users,
        observations,
        runsByStatus,
        pushSubscriptions,
        settings
      ] = await Promise.all([
        getAllLocations(),
        getActiveAlerts(),
        countAlertDeliveries(),
        loadActiveSessions(),
        countUsers(),
        countObservations(),
        countMonitorRunsByStatus(),
        countPushSubscriptions(),
        getOwnerSettings()
      ]);

      const mem = process.memoryUsage();
      const lastCheckSeconds = monitor.lastCheckTime
        ? Math.floor(new Date(monitor.lastCheckTime).getTime() / 1000)
        : 0;
      const weatherApiConfigured = Boolean(process.env.WEATHER_API_KEY) && !LOCAL_ONLY;

      const lines: string[] = [];
      const gauge = (name: string, help: string, value: number | string) => {
        lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${value}`);
      };
      const counter = (name: string, help: string) => {
        lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} counter`);
      };

      gauge('cwm_uptime_seconds', 'Process uptime in seconds.', Math.floor(process.uptime()));
      gauge('cwm_memory_rss_bytes', 'Resident set size in bytes.', mem.rss);
      gauge('cwm_memory_heap_used_bytes', 'V8 heap used in bytes.', mem.heapUsed);
      gauge('cwm_monitor_running', '1 when the monitoring loop is running, else 0.', monitor.isRunning ? 1 : 0);
      gauge(
        'cwm_monitor_consecutive_failures',
        'Consecutive failed monitoring cycles.',
        monitor.consecutiveFailures
      );
      gauge(
        'cwm_monitor_last_check_timestamp_seconds',
        'Unix timestamp of the last completed monitoring cycle (0 if never).',
        lastCheckSeconds
      );
      gauge('cwm_locations_total', 'Configured monitoring locations.', locations.length);
      gauge('cwm_observations_total', 'Stored weather observations.', observations);
      gauge('cwm_active_alerts', 'Currently active alerts.', activeAlerts.length);
      gauge('cwm_sessions_active', 'Active login sessions.', sessions.length);
      gauge('cwm_users_total', 'User accounts.', users);
      gauge('cwm_push_subscriptions_total', 'Stored Web Push subscriptions.', pushSubscriptions);
      gauge(
        'cwm_weather_api_configured',
        '1 when a primary WeatherAPI key is configured, else 0.',
        weatherApiConfigured ? 1 : 0
      );
      gauge('cwm_smtp_configured', '1 when SMTP delivery is configured, else 0.', smtpConfigured ? 1 : 0);
      gauge(
        'cwm_settings_monitor_interval_minutes',
        'Configured monitoring interval in minutes.',
        settings.monitorIntervalMinutes
      );
      gauge(
        'cwm_settings_data_retention_days',
        'Configured data retention window in days.',
        settings.dataRetentionDays
      );

      counter('cwm_alert_deliveries_total', 'Total alert delivery records.');
      lines.push(`cwm_alert_deliveries_total ${deliveries}`);

      counter('cwm_monitor_runs_total', 'Completed monitoring cycles by outcome.');
      for (const status of ['SUCCESS', 'FAILED', 'RUNNING']) {
        lines.push(`cwm_monitor_runs_total{status="${status}"} ${runsByStatus[status] || 0}`);
      }

      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(lines.join('\n') + '\n');
    } catch (err) {
      logger.error('metrics_failed', { error: String(err) });
      res.status(500).send('# metrics collection failed\n');
    }
  });

  // ----------------- AUTHENTICATION ROUTES -----------------
  app.get('/api/auth/status', async (req: Request, res: Response) => {
    const session = getSession(extractSessionToken(req));
    const authenticated = Boolean(session);
    const owner = await getOwnerInfo();

    // While unauthenticated, avoid disclosing the owner email (account
    // enumeration) or operator display name.
    res.json({
      authenticated,
      isFirstRun: !owner?.isConfigured,
      email: authenticated ? session!.email : undefined,
      displayName: authenticated ? session!.displayName || 'Site Owner' : undefined,
      role: authenticated ? session!.role : undefined,
      ownerEmail: authenticated ? owner?.email || process.env.OWNER_EMAIL || 'owner@local' : undefined,
      ownerName: authenticated ? 'Site Owner' : undefined,
      mfaSupported: true
    });
  });

  app.post('/api/auth/setup', authLimiter, async (req: Request, res: Response) => {
    const { password, email } = req.body;
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      res.status(400).json({ error: describePasswordPolicy() });
      return;
    }
    await setupInitialPassword(password, email);

    // Synchronize the primary OWNER user account with the new credentials.
    const ownerUser = (await getAllUsers()).find((u) => u.role === 'OWNER');
    if (ownerUser) {
      await updateUserCredentials(ownerUser.id, email || ownerUser.email, password);
    }
    const refreshed = ownerUser ? await getUserById(ownerUser.id) : null;
    const sessionUser: UserAccount =
      refreshed || {
        id: 'usr-owner-1',
        email: email || 'owner@local',
        displayName: 'Site Owner',
        role: 'OWNER',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

    const token = createSession(sessionUser, extractClientMeta(req));
    res.cookie('cwm_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: SECURE_COOKIES,
      maxAge: SESSION_TTL_MS
    });
    issueCsrfCookie(res);
    await addAuditLog('AUTH_SETUP', `Initial master password set for ${email || 'owner'}`);
    // The session token is intentionally NOT returned in the body; the HttpOnly
    // cookie is the sole credential for browser clients.
    res.json({ success: true, email: sessionUser.email, role: sessionUser.role });
  });

  app.post('/api/auth/login', authLimiter, async (req: Request, res: Response) => {
    const { password, email, mfaCode } = req.body;
    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const lockKey = String(email || 'owner').toLowerCase();
    const remaining = lockoutRemainingMs(lockKey);
    if (remaining > 0) {
      res.status(429).json({
        error: `Account temporarily locked. Try again in ${Math.ceil(remaining / 60000)} minute(s).`,
        lockedForSeconds: Math.ceil(remaining / 1000)
      });
      return;
    }

    const { valid, user } = await verifyUserCredentials(password, email);
    if (!valid || !user) {
      recordLoginFailure(lockKey);
      await addAuditLog('AUTH_FAILED', `Failed login attempt for ${email || 'owner'}`);
      res.status(401).json({ error: 'Invalid credentials. Please try again.' });
      return;
    }

    // Second factor: if enabled, require a valid TOTP code in the same request.
    const mfa = await getUserMfaByEmail(user.email);
    if (mfa?.mfaEnabled) {
      if (!mfaCode) {
        res.status(401).json({ error: 'Multi-factor code required.', mfaRequired: true });
        return;
      }
      if (!mfa.mfaSecret || !verifyTotp(mfa.mfaSecret, String(mfaCode))) {
        recordLoginFailure(lockKey);
        await addAuditLog('AUTH_MFA_FAILED', `Invalid MFA code for ${user.email}`);
        res.status(401).json({ error: 'Invalid multi-factor code.', mfaRequired: true });
        return;
      }
    }

    clearLoginFailures(lockKey);
    const token = createSession(user, extractClientMeta(req));
    res.cookie('cwm_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: SECURE_COOKIES,
      maxAge: SESSION_TTL_MS // 7 days
    });
    issueCsrfCookie(res);

    await recordUserLogin(user.id);
    await addAuditLog('AUTH_SUCCESS', `Successful login for ${user.email} (${user.role})`);
    res.json({
      success: true,
      email: user.email,
      displayName: user.displayName,
      role: user.role
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = extractSessionToken(req);
    if (token) {
      activeSessions.delete(token);
      deleteSession(token).catch(() => {});
    }
    res.clearCookie('cwm_session');
    res.clearCookie('cwm_csrf');
    res.json({ success: true });
  });

  // Revokes every session for the caller (e.g. after a suspected compromise).
  app.post('/api/auth/logout-all', requireAuth, async (req: Request, res: Response) => {
    const session = (req as AuthedRequest).session!;
    for (const [token, entry] of activeSessions) {
      if (entry.userId === session.userId) activeSessions.delete(token);
    }
    await deleteSessionsForUser(session.userId);
    res.clearCookie('cwm_session');
    res.clearCookie('cwm_csrf');
    await addAuditLog('AUTH_LOGOUT_ALL', `All sessions revoked for ${session.email}`);
    res.json({ success: true, message: 'All sessions have been revoked.' });
  });

  // Lists the caller's own active sessions/devices for review. Tokens are
  // represented by a non-reversible digest so the credential never leaves the
  // server, even to its owner.
  app.get('/api/auth/sessions', requireAuth, (req: Request, res: Response) => {
    const session = (req as AuthedRequest).session!;
    const currentToken = extractSessionToken(req);
    const sessions = [];
    for (const [token, entry] of activeSessions) {
      if (entry.userId !== session.userId) continue;
      sessions.push({
        id: sessionPublicId(token),
        current: token === currentToken,
        userAgent: entry.userAgent || null,
        ip: entry.ip || null,
        createdAt: entry.createdAt,
        lastSeenAt: new Date(entry.lastSeenAt).toISOString(),
        expiresAt: new Date(entry.expiresAt).toISOString()
      });
    }
    // Current session first, then most-recently active.
    sessions.sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      return Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
    });
    res.json({ sessions });
  });

  // Revokes a single session belonging to the caller, identified by its public
  // digest. Sessions belonging to other users can never be targeted.
  app.delete('/api/auth/sessions/:id', requireAuth, async (req: Request, res: Response) => {
    const session = (req as AuthedRequest).session!;
    const targetId = req.params.id;
    const currentToken = extractSessionToken(req);

    let targetToken: string | undefined;
    for (const [token, entry] of activeSessions) {
      if (entry.userId === session.userId && sessionPublicId(token) === targetId) {
        targetToken = token;
        break;
      }
    }
    if (!targetToken) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    activeSessions.delete(targetToken);
    await deleteSession(targetToken).catch(() => {});
    const wasCurrent = targetToken === currentToken;
    if (wasCurrent) {
      res.clearCookie('cwm_session');
      res.clearCookie('cwm_csrf');
    }
    await addAuditLog('AUTH_SESSION_REVOKED', `Session revoked for ${session.email}`);
    res.json({ success: true, revokedCurrent: wasCurrent });
  });

  app.post('/api/auth/change-password', requireAuth, async (req: Request, res: Response) => {
    const { currentPassword, newPassword, newEmail } = req.body;
    const session = (req as AuthedRequest).session!;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new password are required.' });
      return;
    }

    const { valid } = await verifyUserCredentials(currentPassword, session.email);
    if (!valid) {
      res.status(403).json({ error: 'Current password does not match.' });
      return;
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      res.status(400).json({ error: describePasswordPolicy() });
      return;
    }

    await updateUserCredentials(session.userId, newEmail || session.email, newPassword);
    // Keep the live session in sync with the new email.
    const token = extractSessionToken(req);
    const entry = token ? activeSessions.get(token) : undefined;
    if (entry && newEmail) {
      entry.email = newEmail;
      const stored = { token, ...entry };
      saveSession(stored).catch(() => {});
    }

    await addAuditLog('PASSWORD_CHANGED', `Password updated for ${session.email}`);
    res.json({ success: true, message: 'Password updated successfully.' });
  });

  // ----------------- MULTI-FACTOR AUTHENTICATION (TOTP) -----------------
  app.get('/api/auth/mfa/status', requireAuth, async (req: Request, res: Response) => {
    const session = (req as AuthedRequest).session!;
    const mfa = await getUserMfaById(session.userId);
    res.json({ enabled: Boolean(mfa?.mfaEnabled) });
  });

  app.post('/api/auth/mfa/setup', requireAuth, async (req: Request, res: Response) => {
    const session = (req as AuthedRequest).session!;
    const secret = generateTotpSecret();
    await setUserMfaSecret(session.userId, secret);
    res.json({
      secret,
      otpauthUrl: buildOtpauthUrl(secret, session.email),
      message: 'Scan the secret in your authenticator app, then verify a code to enable MFA.'
    });
  });

  app.post('/api/auth/mfa/enable', requireAuth, async (req: Request, res: Response) => {
    const session = (req as AuthedRequest).session!;
    const { code } = req.body;
    const mfa = await getUserMfaById(session.userId);
    if (!mfa?.mfaSecret) {
      res.status(400).json({ error: 'Start MFA setup before enabling.' });
      return;
    }
    if (!verifyTotp(mfa.mfaSecret, String(code || ''))) {
      res.status(400).json({ error: 'That code is not valid. Check your device clock and try again.' });
      return;
    }
    await setUserMfaEnabled(session.userId, true);
    await addAuditLog('MFA_ENABLED', `Multi-factor authentication enabled for ${session.email}`);
    res.json({ success: true, message: 'Multi-factor authentication enabled.' });
  });

  app.post('/api/auth/mfa/disable', requireAuth, async (req: Request, res: Response) => {
    const session = (req as AuthedRequest).session!;
    const { password } = req.body;
    const { valid } = await verifyUserCredentials(String(password || ''), session.email);
    if (!valid) {
      res.status(403).json({ error: 'Password confirmation failed.' });
      return;
    }
    await setUserMfaEnabled(session.userId, false);
    await addAuditLog('MFA_DISABLED', `Multi-factor authentication disabled for ${session.email}`);
    res.json({ success: true, message: 'Multi-factor authentication disabled.' });
  });

  // ----------------- USER & ACCESS MANAGEMENT (OWNER ONLY) -----------------
  app.get('/api/users', requireAuth, requireRole('OWNER'), async (_req: Request, res: Response) => {
    const users = await getAllUsers();
    res.json({ users });
  });

  app.post('/api/users', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
    const { email, password, role, displayName } = req.body;

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: 'A valid email address is required.' });
      return;
    }
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      res.status(400).json({ error: describePasswordPolicy() });
      return;
    }
    if (!['OWNER', 'MANAGER', 'VIEWER'].includes(role)) {
      res.status(400).json({ error: 'Role must be OWNER, MANAGER, or VIEWER.' });
      return;
    }

    const existing = (await getAllUsers()).find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (existing) {
      res.status(409).json({ error: 'A user with that email already exists.' });
      return;
    }

    const created = await createUserAccount({
      email: email.trim(),
      password,
      role: role as UserRole,
      displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : undefined
    });
    const actor = (req as AuthedRequest).session!;
    await addAuditLog('USER_CREATED', `${actor.email} created ${created.email} as ${created.role}`);
    res.json({ success: true, user: created });
  });

  app.put('/api/users/:id', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
    const { id } = req.params;
    const { role, active, displayName } = req.body;
    const target = await getUserById(id);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const actor = (req as AuthedRequest).session!;

    if (role !== undefined) {
      if (!['OWNER', 'MANAGER', 'VIEWER'].includes(role)) {
        res.status(400).json({ error: 'Role must be OWNER, MANAGER, or VIEWER.' });
        return;
      }
      const ok = await updateUserRole(id, role as UserRole);
      if (!ok) {
        res.status(409).json({ error: 'Cannot demote the last remaining OWNER account.' });
        return;
      }
      await addAuditLog('USER_ROLE_CHANGED', `${actor.email} set ${target.email} role to ${role}`);
    }

    if (active !== undefined) {
      if (id === actor.userId && active === false) {
        res.status(409).json({ error: 'You cannot deactivate your own account.' });
        return;
      }
      const ok = await setUserActive(id, Boolean(active));
      if (!ok) {
        res.status(409).json({ error: 'Cannot deactivate the last remaining OWNER account.' });
        return;
      }
      await addAuditLog('USER_STATUS_CHANGED', `${actor.email} set ${target.email} active=${Boolean(active)}`);
    }

    // displayName updates are cosmetic; handle without dedicated helper.
    if (displayName !== undefined && typeof displayName === 'string') {
      const db = await getDb();
      db.run('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?', [
        displayName.trim() || null,
        new Date().toISOString(),
        id
      ]);
    }

    const updated = await getUserById(id);
    res.json({ success: true, user: updated });
  });

  app.post('/api/users/:id/password', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
    const { id } = req.params;
    const { newPassword } = req.body;
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      res.status(400).json({ error: describePasswordPolicy() });
      return;
    }
    const target = await getUserById(id);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    await updateUserPassword(id, newPassword);
    const actor = (req as AuthedRequest).session!;
    await addAuditLog('USER_PASSWORD_RESET', `${actor.email} reset the password for ${target.email}`);
    res.json({ success: true, message: `Password reset for ${target.email}.` });
  });

  app.delete('/api/users/:id', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
    const { id } = req.params;
    const actor = (req as AuthedRequest).session!;
    if (id === actor.userId) {
      res.status(409).json({ error: 'You cannot delete your own account.' });
      return;
    }
    const target = await getUserById(id);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const ok = await deleteUserAccount(id);
    if (!ok) {
      res.status(409).json({ error: 'Cannot delete the last remaining OWNER account.' });
      return;
    }
    await addAuditLog('USER_DELETED', `${actor.email} deleted ${target.email}`);
    res.json({ success: true });
  });

  // ----------------- WEATHER & MONITOR DATA -----------------
  app.get('/api/weather/current', requireAuth, async (req: Request, res: Response) => {
    try {
      const locId = (req.query.locationId as string) || undefined;
      const locations = await getAllLocations();
      const targetLoc = locId
        ? locations.find((l) => l.id === locId) || locations[0]
        : (await getDefaultLocation()) || locations[0];

      if (!targetLoc) {
        res.status(404).json({ error: 'No location configured.' });
        return;
      }

      let observation = await getLatestObservation(targetLoc.id);
      let risk = await getLatestRiskAssessment(targetLoc.id);

      // If missing observation or risk, trigger immediate cycle to guarantee fresh data
      if (!observation || !risk) {
        await monitoringService.executeCycle(targetLoc.id, true);
        observation = await getLatestObservation(targetLoc.id);
        risk = await getLatestRiskAssessment(targetLoc.id);
      }

      const activeAlerts = await getActiveAlerts(targetLoc.id);
      const monitorStatus = monitoringService.getStatus();
      const comparison = await getLatestCrossReference(targetLoc.id);
      const settings = await getOwnerSettings();

      // Precise data freshness evaluation based on actual timestamp and interval
      const freshness = evaluateDataFreshness(
        observation?.timestamp,
        targetLoc.timezone,
        !monitorStatus.isRunning
      );

      res.json({
        location: targetLoc,
        current: observation,
        risk,
        activeAlerts,
        monitorStatus,
        comparison,
        hasWeatherApiKey: !LOCAL_ONLY && Boolean(process.env.WEATHER_API_KEY),
        activeProvider: comparison?.activeDataSource || (!LOCAL_ONLY && process.env.WEATHER_API_KEY ? 'WeatherAPI (Main Reference)' : 'Open-Meteo'),
        dataStatus: freshness.status,
        freshness
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch weather data' });
    }
  });

  app.get('/api/weather/forecast', requireAuth, async (req: Request, res: Response) => {
    try {
      const locId = (req.query.locationId as string) || undefined;
      const locations = await getAllLocations();
      const targetLoc = locId
        ? locations.find((l) => l.id === locId) || locations[0]
        : (await getDefaultLocation()) || locations[0];

      if (!targetLoc) {
        res.status(404).json({ error: 'No location configured.' });
        return;
      }

      let forecast = await getLatestForecastSnapshot(targetLoc.id);
      if (!forecast || !forecast.hourly || forecast.hourly.length === 0) {
        await monitoringService.executeCycle(targetLoc.id, true);
        forecast = await getLatestForecastSnapshot(targetLoc.id);
      }

      res.json({
        location: targetLoc,
        hourly: forecast?.hourly || [],
        daily: forecast?.daily || [],
        fetchedAt: forecast?.fetchedAt || null
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch forecast snapshot' });
    }
  });

  app.get('/api/weather/cross-reference', requireAuth, async (req: Request, res: Response) => {
    try {
      const locId = (req.query.locationId as string) || undefined;
      const locations = await getAllLocations();
      const targetLoc = locId
        ? locations.find((l) => l.id === locId) || locations[0]
        : (await getDefaultLocation()) || locations[0];

      if (!targetLoc) {
        res.status(404).json({ error: 'No location configured.' });
        return;
      }

      let comparison = await getLatestCrossReference(targetLoc.id);
      if (!comparison) {
        await monitoringService.executeCycle(targetLoc.id, true);
        comparison = await getLatestCrossReference(targetLoc.id);
      }

      res.json({
        location: targetLoc,
        comparison,
        hasWeatherApiKey: !LOCAL_ONLY && Boolean(process.env.WEATHER_API_KEY),
        activeProvider: comparison?.activeDataSource || (!LOCAL_ONLY && process.env.WEATHER_API_KEY ? 'WeatherAPI (Main Reference)' : 'Open-Meteo')
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch cross reference' });
    }
  });

  app.get('/api/weather/history', requireAuth, async (req: Request, res: Response) => {
    try {
      const locId = req.query.locationId as string;
      const range = (req.query.range as any) || 'today';
      const targetLoc = locId
        ? (await getAllLocations()).find((l) => l.id === locId)
        : await getDefaultLocation();

      if (!targetLoc) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      const history = await getHistoricalObservations(targetLoc.id, range);
      res.json({
        location: targetLoc,
        range,
        observations: history
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch historical observations' });
    }
  });

  // ----------------- MONITOR CONTROLS -----------------
  app.post('/api/monitor/check-now', requireAuth, requireRole('MANAGER'), async (req: Request, res: Response) => {
    const locId = req.body?.locationId;
    const result = await monitoringService.executeCycle(locId, true);
    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }
    res.json({ success: true, message: 'Weather check completed successfully.' });
  });

  app.post('/api/monitor/toggle', requireAuth, requireRole('MANAGER'), async (req: Request, res: Response) => {
    const { enable } = req.body;
    await saveOwnerSettings({ monitoringEnabled: Boolean(enable) });
    if (enable) {
      await monitoringService.start();
    } else {
      monitoringService.stop();
    }
    res.json({ success: true, status: monitoringService.getStatus() });
  });

  // ----------------- ALERTS & DELIVERIES -----------------
  app.get(['/api/alerts', '/api/alerts/history'], requireAuth, async (req: Request, res: Response) => {
    const alerts = await getAlertHistory(50);
    const deliveries = await getAlertDeliveries(50);
    res.json({ alerts, deliveries });
  });

  app.post('/api/alerts/:id/dismiss', requireAuth, requireRole('MANAGER'), async (req: Request, res: Response) => {
    await updateAlertStatus(req.params.id, 'DISMISSED');
    res.json({ success: true });
  });

  // ----------------- LOCATIONS -----------------
  app.get('/api/locations', requireAuth, async (_req: Request, res: Response) => {
    const locations = await getAllLocations();
    res.json({ locations });
  });

  app.post('/api/locations', requireAuth, requireRole('MANAGER'), async (req: Request, res: Response) => {
    const { name, latitude, longitude, timezone, isDefault } = req.body;
    
    // Strict input validation
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 100) {
      res.status(400).json({ error: 'Location name must be a string between 1 and 100 characters.' });
      return;
    }
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      res.status(400).json({ error: 'Latitude must be a valid number between -90 and 90.' });
      return;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      res.status(400).json({ error: 'Longitude must be a valid number between -180 and 180.' });
      return;
    }

    const created = await saveLocation({
      name: name.trim(),
      latitude: lat,
      longitude: lon,
      timezone: typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'auto',
      isDefault: Boolean(isDefault)
    });
    // Trigger initial check for new location
    await monitoringService.executeCycle(created.id, true);
    res.json({ success: true, location: created });
  });

  app.post('/api/locations/:id/default', requireAuth, requireRole('MANAGER'), async (req: Request, res: Response) => {
    await setDefaultLocation(req.params.id);
    res.json({ success: true });
  });

  app.delete('/api/locations/:id', requireAuth, requireRole('MANAGER'), async (req: Request, res: Response) => {
    await deleteLocation(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/locations/search', requireAuth, async (req: Request, res: Response) => {
    const query = ((req.query.query || req.query.q) as string) || '';
    const results = await searchGeocodingLocations(query.trim());
    res.json({ results });
  });

  // ----------------- SETTINGS -----------------
  app.get('/api/settings', requireAuth, async (_req: Request, res: Response) => {
    const settings = await getOwnerSettings();
    const smtpConfigured = await isSmtpConfigured();
    const smtpStatus = getPublicSmtpStatus();
    res.json({ settings, smtpConfigured, smtpStatus });
  });

  app.put('/api/settings', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
    const updates = req.body;
    
    // Validate monitor interval
    if (updates.monitorIntervalMinutes !== undefined) {
      const interval = Number(updates.monitorIntervalMinutes);
      if (isNaN(interval) || interval < 5 || interval > 1440) {
        res.status(400).json({ error: 'Monitor interval must be between 5 and 1440 minutes.' });
        return;
      }
      updates.monitorIntervalMinutes = interval;
    }

    // Validate data retention window
    if (updates.dataRetentionDays !== undefined) {
      const days = Number(updates.dataRetentionDays);
      if (!Number.isFinite(days) || days < 1 || days > 3650) {
        res.status(400).json({ error: 'Data retention must be between 1 and 3650 days.' });
        return;
      }
      updates.dataRetentionDays = Math.floor(days);
    }

    await saveOwnerSettings(updates);
    if (updates.monitorIntervalMinutes !== undefined) {
      monitoringService.updateInterval(updates.monitorIntervalMinutes);
    }
    res.json({ success: true, message: 'Settings saved successfully.' });
  });

  app.post('/api/settings/restore-defaults', requireAuth, requireRole('OWNER'), async (_req: Request, res: Response) => {
    await saveOwnerSettings({
      thresholds: DEFAULT_THRESHOLDS,
      monitorIntervalMinutes: 15,
      alertCooldownMinutes: 60,
      emailAlertsEnabled: true,
      recoveryNotificationsEnabled: true
    });
    monitoringService.updateInterval(15);
    res.json({ success: true, message: 'Default thresholds restored.' });
  });

  app.post('/api/email/test', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
    const settings = await getOwnerSettings();
    const recipient = req.body?.email || settings.ownerEmail;
    const result = await sendTestEmail(recipient);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ success: true, message: `Test email sent to ${recipient}` });
  });

  // ----------------- DATA RETENTION & PRIVACY -----------------
  app.post('/api/data/retention/run', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
    try {
      const settings = await getOwnerSettings();
      const days = Number(req.body?.retentionDays) || settings.dataRetentionDays || 30;
      const result = await enforceDataRetention(days);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to enforce data retention.' });
    }
  });

  app.get('/api/data/retention/logs', requireAuth, requireRole('OWNER'), async (_req: Request, res: Response) => {
    try {
      const logs = await getDataRetentionLogs();
      res.json({ logs });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch retention logs.' });
    }
  });

  // ----------------- SECRETS STATUS (MASKED) -----------------
  app.get('/api/secrets/status', requireAuth, requireRole('OWNER'), async (_req: Request, res: Response) => {
    try {
      const weatherKey = process.env.WEATHER_API_KEY || '';
      const smtpInfo = getPublicSmtpStatus();

      res.json({
        weatherApiKeyConfigured: Boolean(weatherKey.trim()),
        weatherApiKeyMasked: weatherKey ? maskSecret(weatherKey, 4) : 'Not configured',
        smtpConfigured: smtpInfo.configured,
        smtpHost: smtpInfo.host || 'Not configured',
        pushConfigured: isPushConfigured()
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to retrieve secrets status.' });
    }
  });

  // ----------------- SYSTEM HEALTH & DIAGNOSTICS -----------------
  app.get(['/api/health', '/api/system/health'], requireAuth, async (_req: Request, res: Response) => {
    const monitor = monitoringService.getStatus();
    const smtpConfigured = await isSmtpConfigured();
    const recentRuns = await getRecentMonitorRuns(10);
    const auditLogs = await getAuditLogs(15);
    const activeAlerts = await getActiveAlerts();
    const deliveries = await getAlertDeliveries(1);

    const mem = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());

    res.json({
      weatherApiStatus: monitor.status === 'ERROR' ? 'DEGRADED' : 'HEALTHY',
      databaseStatus: 'HEALTHY',
      monitorStatus: monitor.status,
      emailStatus: smtpConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
      lastCheckTime: monitor.lastCheckTime,
      nextCheckTime: monitor.nextCheckTime,
      totalAlertsSent: deliveries.length,
      activeAlertsCount: activeAlerts.length,
      memoryUsageMb: Math.round(mem.rss / 1024 / 1024),
      uptimeSeconds: uptimeSec,
      recentRuns,
      auditLogs
    });
  });

  // ----------------- PRIVACY & DATA CONTROLS -----------------
  app.post('/api/data/clear', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
    const { target } = req.body;
    if (target === 'cache') {
      await clearCachedData();
      await addAuditLog('DATA_CLEARED', 'Cached forecasts cleared');
    } else if (target === 'history') {
      await clearHistoricalObservations();
      await addAuditLog('DATA_CLEARED', 'Historical observations cleared');
    } else if (target === 'all') {
      await clearAllApplicationData();
      await addAuditLog('DATA_CLEARED', 'All application data wiped');
    }
    res.json({ success: true });
  });

  app.get('/api/data/backup', requireAuth, requireRole('OWNER'), async (_req: Request, res: Response) => {
    const buffer = await getDatabaseBinary();
    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader('Content-Disposition', `attachment; filename="weather-monitor-backup-${new Date().toISOString().slice(0, 10)}.sqlite"`);
    res.send(buffer);
  });

  app.post('/api/data/backup/create', requireAuth, requireRole('OWNER'), async (_req: Request, res: Response) => {
    try {
      const filename = await createDatabaseBackup();
      await addAuditLog('BACKUP_CREATED', `Database snapshot created: ${filename}`);
      res.json({ success: true, filename, message: 'Database backup snapshot created successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to create database backup snapshot.' });
    }
  });

  app.get('/api/data/backup/list', requireAuth, requireRole('OWNER'), async (_req: Request, res: Response) => {
    try {
      const backups = getDatabaseBackupsList();
      res.json({ backups });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to list backups.' });
    }
  });

  app.post('/api/data/backup/restore', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
    try {
      const { filename } = req.body;
      if (!filename || typeof filename !== 'string') {
        res.status(400).json({ error: 'A backup filename is required.' });
        return;
      }
      const actor = (req as AuthedRequest).session!;
      const ok = await restoreDatabaseBackup(filename);
      if (!ok) {
        res.status(404).json({ error: 'Backup not found or invalid filename.' });
        return;
      }
      // Sessions may reference users that no longer exist in the restored file.
      activeSessions.clear();
      await pruneExpiredSessions();
      await addAuditLog('BACKUP_RESTORED', `${actor.email} restored database from ${filename}`);
      res.clearCookie('cwm_session');
      res.clearCookie('cwm_csrf');
      res.json({
        success: true,
        message: 'Database restored. Please sign in again.',
        signedOut: true
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to restore database backup.' });
    }
  });

  // ----------------- WEB PUSH NOTIFICATIONS -----------------
  app.get('/api/push/public-key', requireAuth, (_req: Request, res: Response) => {
    res.json({ publicKey: getVapidPublicKey(), configured: isPushConfigured() });
  });

  app.get('/api/push/status', requireAuth, async (_req: Request, res: Response) => {
    const count = await countPushSubscriptions();
    res.json({ configured: isPushConfigured(), subscriptions: count });
  });

  // Per-user push notification preferences. Applies to every device the user
  // has subscribed, letting them mute, set a severity floor, or opt out of
  // recovery notifications without unsubscribing.
  app.get('/api/push/preferences', requireAuth, async (req: Request, res: Response) => {
    const session = (req as AuthedRequest).session!;
    const preferences = await getPushPreferences(session.userId);
    res.json({ preferences });
  });

  app.put('/api/push/preferences', requireAuth, async (req: Request, res: Response) => {
    const session = (req as AuthedRequest).session!;
    const { enabled, minSeverity, notifyRecovery } = req.body || {};

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      res.status(400).json({ error: '`enabled` must be a boolean.' });
      return;
    }
    if (notifyRecovery !== undefined && typeof notifyRecovery !== 'boolean') {
      res.status(400).json({ error: '`notifyRecovery` must be a boolean.' });
      return;
    }
    const allowedSeverities = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
    if (minSeverity !== undefined && !allowedSeverities.includes(minSeverity)) {
      res.status(400).json({ error: '`minSeverity` must be one of LOW, MODERATE, HIGH, CRITICAL.' });
      return;
    }

    const preferences = await savePushPreferences(session.userId, { enabled, minSeverity, notifyRecovery });
    await addAuditLog('PUSH_PREFERENCES_UPDATED', `Push preferences updated for ${session.email}`);
    res.json({ success: true, preferences });
  });

  app.post('/api/push/subscribe', requireAuth, async (req: Request, res: Response) => {
    try {
      const session = (req as AuthedRequest).session!;
      const { endpoint, keys } = req.body || {};
      await subscribeToPush({
        endpoint,
        keys,
        userId: session.userId,
        userEmail: session.email
      });
      res.json({ success: true, message: 'Device subscribed to safety alerts.' });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to store push subscription.' });
    }
  });

  app.post('/api/push/unsubscribe', requireAuth, async (req: Request, res: Response) => {
    await unsubscribeFromPush(req.body?.endpoint);
    res.json({ success: true });
  });

  app.post('/api/push/test', requireAuth, async (req: Request, res: Response) => {
    if (!isPushConfigured()) {
      res.status(400).json({ error: 'Push notifications are not configured.' });
      return;
    }
    const result = await sendPushToAll({
      title: 'Test notification',
      body: 'Push notifications are working on this device.',
      tag: 'push-test',
      url: '/'
    });
    res.json({ success: true, ...result });
  });

  // ----------------- VITE MIDDLEWARE (DEV) / STATIC (PROD) -----------------
  if (staticMode === 'vite') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else if (staticMode === 'static') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

/**
 * Builds the application and begins listening. Kept separate from `createApp`
 * so the HTTP surface can be exercised in-process by the integration tests
 * without binding a fixed port or starting background pollers.
 */
async function startServer(): Promise<void> {
  const app = await createApp();
  app.listen(PORT, '0.0.0.0', () => {
    logger.info('server_listening', { url: `http://localhost:${PORT}`, port: PORT });
  });
}

export { createApp, startServer };
