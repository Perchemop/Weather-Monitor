import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

import {
  getDb,
  verifyOwnerPassword,
  updateOwnerPassword,
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
  getDataRetentionLogs
} from './src/database/db.js';
import { DEFAULT_THRESHOLDS } from './src/services/riskEngine.js';
import { searchGeocodingLocations } from './src/services/weatherService.js';
import { isSmtpConfigured, sendTestEmail, getPublicSmtpStatus } from './src/services/emailService.js';
import { monitoringService } from './src/services/monitoringService.js';
import { evaluateDataFreshness } from './src/utils/time.js';
import { maskSecret } from './src/utils/security.js';
import {
  generateAiWeatherBriefing,
  generateAiAlertExplanation,
  generateAiHistoricalSummary
} from './src/services/aiWeatherService.js';

dotenv.config();

const PORT = 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
// Simple secure in-memory session tokens store
const activeSessions = new Set<string>();

function generateSessionToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.add(token);
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

function isValidSession(token?: string): boolean {
  if (!token) return false;
  return activeSessions.has(token);
}

// Authentication middleware - verifies signed session cookie, x-session-token, or Bearer auth
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractSessionToken(req);
  if (!isValidSession(token)) {
    res.status(401).json({ error: 'Authentication required. Safety enclave locked.' });
    return;
  }
  return next();
}

async function startServer() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser(SESSION_SECRET));

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
    const token = extractSessionToken(req);
    const authenticated = isValidSession(token);
    const owner = await getOwnerInfo();
    res.json({
      authenticated,
      isFirstRun: !owner?.isConfigured,
      ownerEmail: owner?.email || process.env.OWNER_EMAIL || 'owner@local',
      ownerName: 'Site Owner'
    });
  });

  app.post('/api/auth/setup', async (req: Request, res: Response) => {
    const { password, email } = req.body;
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Master password must be at least 6 characters.' });
      return;
    }
    await setupInitialPassword(password, email);
    const token = generateSessionToken();
    res.cookie('cwm_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // Local environment
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    await addAuditLog('AUTH_SETUP', `Initial master password set for ${email || 'owner'}`);
    res.json({ success: true, token, email: email || 'owner@local' });
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const { valid, email } = await verifyOwnerPassword(password);
    if (!valid) {
      await addAuditLog('AUTH_FAILED', 'Failed login attempt');
      res.status(401).json({ error: 'Invalid password. Please try again.' });
      return;
    }

    const token = generateSessionToken();
    res.cookie('cwm_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // Local environment
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    await addAuditLog('AUTH_SUCCESS', `Successful login for ${email}`);
    res.json({
      success: true,
      token,
      email
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
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new password are required.' });
      return;
    }

    const { valid } = await verifyOwnerPassword(currentPassword);
    if (!valid) {
      res.status(403).json({ error: 'Current password does not match.' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }

    await updateOwnerPassword(newPassword, newEmail);
    await addAuditLog('PASSWORD_CHANGED', 'Owner password updated');
    res.json({ success: true, message: 'Password updated successfully.' });
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
  app.post('/api/monitor/check-now', requireAuth, async (req: Request, res: Response) => {
    const locId = req.body?.locationId;
    const result = await monitoringService.executeCycle(locId, true);
    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }
    res.json({ success: true, message: 'Weather check completed successfully.' });
  });

  app.post('/api/monitor/toggle', requireAuth, async (req: Request, res: Response) => {
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

  app.post('/api/alerts/:id/dismiss', requireAuth, async (req: Request, res: Response) => {
    await updateAlertStatus(req.params.id, 'DISMISSED');
    res.json({ success: true });
  });

  // ----------------- LOCATIONS -----------------
  app.get('/api/locations', requireAuth, async (_req: Request, res: Response) => {
    const locations = await getAllLocations();
    res.json({ locations });
  });

  app.post('/api/locations', requireAuth, async (req: Request, res: Response) => {
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

  app.post('/api/locations/:id/default', requireAuth, async (req: Request, res: Response) => {
    await setDefaultLocation(req.params.id);
    res.json({ success: true });
  });

  app.delete('/api/locations/:id', requireAuth, async (req: Request, res: Response) => {
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

  app.put('/api/settings', requireAuth, async (req: Request, res: Response) => {
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

  app.post('/api/settings/restore-defaults', requireAuth, async (_req: Request, res: Response) => {
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

  app.post('/api/email/test', requireAuth, async (req: Request, res: Response) => {
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
  app.post('/api/data/retention/run', requireAuth, async (req: Request, res: Response) => {
    try {
      const days = Number(req.body?.retentionDays) || 30;
      const result = await enforceDataRetention(days);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to enforce data retention.' });
    }
  });

  app.get('/api/data/retention/logs', requireAuth, async (_req: Request, res: Response) => {
    try {
      const logs = await getDataRetentionLogs();
      res.json({ logs });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch retention logs.' });
    }
  });

  // ----------------- SECRETS STATUS (MASKED) -----------------
  app.get('/api/secrets/status', requireAuth, async (_req: Request, res: Response) => {
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
  app.post('/api/data/clear', requireAuth, async (req: Request, res: Response) => {
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

  app.get('/api/data/backup', requireAuth, async (_req: Request, res: Response) => {
    const buffer = await getDatabaseBinary();
    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader('Content-Disposition', `attachment; filename="weather-monitor-backup-${new Date().toISOString().slice(0, 10)}.sqlite"`);
    res.send(buffer);
  });

  app.post('/api/data/backup/create', requireAuth, async (_req: Request, res: Response) => {
    try {
      const filename = await createDatabaseBackup();
      await addAuditLog('BACKUP_CREATED', `Database snapshot created: ${filename}`);
      res.json({ success: true, filename, message: 'Database backup snapshot created successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to create database backup snapshot.' });
    }
  });

  app.get('/api/data/backup/list', requireAuth, async (_req: Request, res: Response) => {
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
