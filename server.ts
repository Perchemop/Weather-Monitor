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
  addAuditLog
} from './src/database/db.js';
import { DEFAULT_THRESHOLDS } from './src/services/riskEngine.js';
import { searchGeocodingLocations } from './src/services/weatherService.js';
import { isSmtpConfigured, sendTestEmail } from './src/services/emailService.js';
import { monitoringService } from './src/services/monitoringService.js';

dotenv.config();

const PORT = 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'cwm-local-session-secret-key-9988';
// Simple secure in-memory session tokens store
const activeSessions = new Set<string>();

function generateSessionToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.add(token);
  return token;
}

function isValidSession(token?: string): boolean {
  if (!token) return false;
  return activeSessions.has(token);
}

// Authentication middleware - unrestricted local access (gatekeeper screen removed)
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Direct local access permitted
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

  // ----------------- AUTHENTICATION ROUTES -----------------
  app.get('/api/auth/status', async (_req: Request, res: Response) => {
    const owner = await getOwnerInfo();
    res.json({
      authenticated: true,
      ownerEmail: owner?.email || 'Leonardo.L.Scinto@gmail.com',
      ownerName: 'Site Owner'
    });
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
    const token = req.cookies?.cwm_session || req.headers['x-session-token'];
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

      res.json({
        location: targetLoc,
        current: observation,
        risk,
        activeAlerts,
        monitorStatus,
        comparison,
        hasWeatherApiKey: Boolean(process.env.WEATHER_API_KEY),
        activeProvider: comparison?.activeDataSource || (process.env.WEATHER_API_KEY ? 'WeatherAPI (Main Reference)' : 'Open-Meteo'),
        dataStatus: observation ? 'LIVE' : 'UNAVAILABLE'
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
    if (!name || latitude === undefined || longitude === undefined) {
      res.status(400).json({ error: 'Name, latitude, and longitude are required.' });
      return;
    }
    const created = await saveLocation({
      name,
      latitude: Number(latitude),
      longitude: Number(longitude),
      timezone: timezone || 'auto',
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
    res.json({ settings, smtpConfigured });
  });

  app.put('/api/settings', requireAuth, async (req: Request, res: Response) => {
    const updates = req.body;
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
