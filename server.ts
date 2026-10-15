import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import dotenv from 'dotenv';
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
  setupInitialPassword,
  addAuditLog,
  enforceDataRetention,
  getDataRetentionLogs,
  // Multi-user account management
  countUsers,
  getAllUsers,
  getUserById,
  createUserAccount,
  updateUserRole,
  updateUserPassword,
  updateUserCredentials,
  setUserActive,
  deleteUserAccount,
  recordUserLogin,
  verifyUserCredentials
} from './src/database/db.js';
import { DEFAULT_THRESHOLDS } from './src/services/riskEngine.js';
import { searchGeocodingLocations } from './src/services/weatherService.js';
import { isSmtpConfigured, sendTestEmail, getPublicSmtpStatus } from './src/services/emailService.js';
import { monitoringService } from './src/services/monitoringService.js';
import { evaluateDataFreshness } from './src/utils/time.js';
import { maskSecret } from './src/utils/security.js';
import { securityHeaders } from './src/utils/securityHeaders.js';
import { createRateLimiter } from './src/utils/rateLimiter.js';
import { UserAccount, UserRole } from './src/types.js';
import {
  generateAiWeatherBriefing,
  generateAiAlertExplanation,
  generateAiHistoricalSummary
} from './src/services/aiWeatherService.js';

dotenv.config();

const PORT = 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Simple secure in-memory session store, keyed by token. Each entry is bound
// to a user account and carries an absolute expiry.
interface SessionEntry {
  userId: string;
  email: string;
  role: UserRole;
  displayName?: string;
  createdAt: string;
  expiresAt: number;
}
const activeSessions = new Map<string, SessionEntry>();

// Augments the Express request with the resolved session for downstream handlers.
interface AuthedRequest extends Request {
  session?: SessionEntry;
}

function createSession(user: UserAccount): string {
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, {
    userId: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
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
    return undefined;
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

async function startServer() {
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

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser(SESSION_SECRET));

  // Brute-force protection for the unauthenticated auth endpoints.
  const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many authentication attempts. Please wait before trying again.'
  });

  // Broad safety net for the authenticated API surface.
  const apiLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 300
  });

  app.use('/api/', apiLimiter);

  // Initialize SQLite database
  await getDb();
  console.log('[Server] SQLite database initialized.');

  // Start background monitoring service
  await monitoringService.start();
  console.log('[Server] Background monitoring service started.');

  // Background automated backup snapshot every 30 minutes
  setInterval(() => {
    createDatabaseBackup().catch((e) => console.error('[Server Backup] Automated snapshot error:', e));
  }, 30 * 60 * 1000);

  // ----------------- AUTHENTICATION ROUTES -----------------
  app.get('/api/auth/status', async (req: Request, res: Response) => {
    const session = getSession(extractSessionToken(req));
    const authenticated = Boolean(session);
    const owner = await getOwnerInfo();
    res.json({
      authenticated,
      isFirstRun: !owner?.isConfigured,
      email: session?.email || owner?.email || process.env.OWNER_EMAIL || 'owner@local',
      displayName: session?.displayName || 'Site Owner',
      role: session?.role,
      ownerEmail: owner?.email || process.env.OWNER_EMAIL || 'owner@local',
      ownerName: 'Site Owner'
    });
  });

  app.post('/api/auth/setup', authLimiter, async (req: Request, res: Response) => {
    const { password, email } = req.body;
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Master password must be at least 6 characters.' });
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

    const token = createSession(sessionUser);
    res.cookie('cwm_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // Local environment
      maxAge: SESSION_TTL_MS
    });
    await addAuditLog('AUTH_SETUP', `Initial master password set for ${email || 'owner'}`);
    res.json({ success: true, token, email: sessionUser.email, role: sessionUser.role });
  });

  app.post('/api/auth/login', authLimiter, async (req: Request, res: Response) => {
    const { password, email } = req.body;
    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const { valid, user } = await verifyUserCredentials(password, email);
    if (!valid || !user) {
      await addAuditLog('AUTH_FAILED', `Failed login attempt for ${email || 'owner'}`);
      res.status(401).json({ error: 'Invalid credentials. Please try again.' });
      return;
    }

    const token = createSession(user);
    res.cookie('cwm_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // Local environment
      maxAge: SESSION_TTL_MS // 7 days
    });

    await recordUserLogin(user.id);
    await addAuditLog('AUTH_SUCCESS', `Successful login for ${user.email} (${user.role})`);
    res.json({
      success: true,
      token,
      email: user.email,
      displayName: user.displayName,
      role: user.role
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = extractSessionToken(req);
    if (token) activeSessions.delete(token);
    res.clearCookie('cwm_session');
    res.json({ success: true });
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

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }

    await updateUserCredentials(session.userId, newEmail || session.email, newPassword);
    // Keep the live session in sync with the new email.
    const token = extractSessionToken(req);
    const entry = token ? activeSessions.get(token) : undefined;
    if (entry && newEmail) entry.email = newEmail;

    await addAuditLog('PASSWORD_CHANGED', `Password updated for ${session.email}`);
    res.json({ success: true, message: 'Password updated successfully.' });
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
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
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
    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
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
        hasWeatherApiKey: Boolean(process.env.WEATHER_API_KEY),
        activeProvider: comparison?.activeDataSource || (process.env.WEATHER_API_KEY ? 'WeatherAPI (Main Reference)' : 'Open-Meteo'),
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
        hasWeatherApiKey: Boolean(process.env.WEATHER_API_KEY),
        activeProvider: comparison?.activeDataSource || (process.env.WEATHER_API_KEY ? 'WeatherAPI (Main Reference)' : 'Open-Meteo')
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

  // ----------------- AI WEATHER ADVISORY (GEMINI) -----------------
  app.post('/api/ai/briefing', requireAuth, async (req: Request, res: Response) => {
    try {
      const locId = (req.body?.locationId as string) || undefined;
      const locations = await getAllLocations();
      const targetLoc = locId
        ? locations.find((l) => l.id === locId) || locations[0]
        : (await getDefaultLocation()) || locations[0];

      if (!targetLoc) {
        res.status(404).json({ error: 'No location configured.' });
        return;
      }

      let current = await getLatestObservation(targetLoc.id);
      let risk = await getLatestRiskAssessment(targetLoc.id);
      const forecast = await getLatestForecastSnapshot(targetLoc.id);

      if (!current || !risk) {
        await monitoringService.executeCycle(targetLoc.id, true);
        current = await getLatestObservation(targetLoc.id);
        risk = await getLatestRiskAssessment(targetLoc.id);
      }

      if (!current || !risk) {
        res.status(503).json({ error: 'Weather data not yet available.' });
        return;
      }

      const briefing = await generateAiWeatherBriefing(
        targetLoc.name,
        current,
        risk,
        forecast?.hourly || []
      );

      res.json(briefing);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to generate AI weather briefing.' });
    }
  });

  app.post('/api/ai/alert-explanation', requireAuth, async (req: Request, res: Response) => {
    try {
      const { alertId } = req.body;
      if (!alertId) {
        res.status(400).json({ error: 'alertId is required.' });
        return;
      }

      const activeAlerts = await getActiveAlerts();
      const alert = activeAlerts.find((a) => a.id === alertId);

      if (!alert) {
        const history = await getAlertHistory(20);
        const pastAlert = history.find((a) => a.id === alertId);
        if (!pastAlert) {
          res.status(404).json({ error: 'Alert not found.' });
          return;
        }
        const risk = (await getLatestRiskAssessment(pastAlert.locationId)) || {
          level: pastAlert.severity,
          score: 50,
          factors: [],
          affectedActivities: [],
          summary: pastAlert.message,
          assessedAt: pastAlert.startTime
        };
        const explanation = await generateAiAlertExplanation(pastAlert, risk as any);
        res.json(explanation);
        return;
      }

      const risk = (await getLatestRiskAssessment(alert.locationId)) || {
        level: alert.severity,
        score: 50,
        factors: [],
        affectedActivities: [],
        summary: alert.message,
        assessedAt: alert.startTime
      };

      const explanation = await generateAiAlertExplanation(alert, risk as any);
      res.json(explanation);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to generate AI alert explanation.' });
    }
  });

  app.get('/api/ai/history-summary', requireAuth, async (req: Request, res: Response) => {
    try {
      const locId = (req.query.locationId as string) || undefined;
      const range = (req.query.range as any) || 'today';
      const locations = await getAllLocations();
      const targetLoc = locId
        ? locations.find((l) => l.id === locId) || locations[0]
        : (await getDefaultLocation()) || locations[0];

      if (!targetLoc) {
        res.status(404).json({ error: 'Location not found.' });
        return;
      }

      const observations = await getHistoricalObservations(targetLoc.id, range);
      const summary = await generateAiHistoricalSummary(targetLoc.name, observations);
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to generate historical summary.' });
    }
  });

  // ----------------- DATA RETENTION & PRIVACY -----------------
  app.post('/api/data/retention/run', requireAuth, requireRole('OWNER'), async (req: Request, res: Response) => {
    try {
      const days = Number(req.body?.retentionDays) || 30;
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
      const geminiKey = process.env.GEMINI_API_KEY || '';

      res.json({
        weatherApiKeyConfigured: Boolean(weatherKey.trim()),
        weatherApiKeyMasked: weatherKey ? maskSecret(weatherKey, 4) : 'Not configured',
        smtpConfigured: smtpInfo.configured,
        smtpHost: smtpInfo.host || 'Not configured',
        geminiKeyConfigured: Boolean(geminiKey.trim())
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

  // ----------------- VITE MIDDLEWARE (DEV) / STATIC (PROD) -----------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Construction Weather Monitor running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server Startup Error]:', err);
});
