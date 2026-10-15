/**
 * Browser monitoring service for the static build.
 *
 * Mirrors `src/services/monitoringService.ts`, but instead of running on a Node
 * timer it drives a `setInterval` in the page, and persists to the browser
 * store. In place of email/Web Push delivery it raises native browser
 * notifications for newly triggered and recovered alerts.
 */

import { MonitorStatus } from '../types.js';
import { fetchRealWeatherData } from '../services/weatherService.js';
import { calculateDeterministicRisk } from '../services/riskEngine.js';
import { redactSecretsInError } from '../utils/redact.js';
import { store } from './store.js';
import { evaluateAndProcessAlerts } from './alerts.js';
import { notifyAlert, notifyRecovery } from './notifications.js';

class StaticMonitoringService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private isChecking = false;
  private lastCheckTime: string | null = null;
  private nextCheckTime: string | null = null;
  private lastError: string | null = null;
  private consecutiveFailures = 0;
  private lastRetentionCheck = 0;
  private lifecycleBound = false;

  async start(): Promise<void> {
    await store.whenReady();
    const settings = store.getOwnerSettings();
    if (!settings.monitoringEnabled) {
      this.isRunning = false;
      return;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = true;
    this.lastError = null;

    const intervalMs = Math.max(5, settings.monitorIntervalMinutes || 15) * 60 * 1000;
    this.updateNextCheckTime(intervalMs);
    this.timer = setInterval(() => {
      void this.executeCycle();
    }, intervalMs);

    void this.executeCycle();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    this.nextCheckTime = null;
  }

  updateInterval(): void {
    if (this.isRunning) void this.start();
  }

  /**
   * Keeps monitoring running "constantly" despite browser background-tab
   * throttling. When the page becomes visible again, regains focus, or the
   * network returns, a scheduled check that is already due is run immediately.
   * Safe to call once per page load; repeat calls are ignored.
   */
  watchLifecycle(): void {
    if (this.lifecycleBound || typeof window === 'undefined' || typeof document === 'undefined') return;
    this.lifecycleBound = true;

    const runIfDue = () => {
      if (!this.isRunning || this.isChecking) return;
      const due = !this.nextCheckTime || new Date(this.nextCheckTime).getTime() <= Date.now();
      if (due) void this.executeCycle();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') runIfDue();
    });
    window.addEventListener('online', runIfDue);
    window.addEventListener('focus', runIfDue);
  }

  getStatus(): MonitorStatus {
    let status: MonitorStatus['status'] = 'ACTIVE';
    if (!this.isRunning) status = 'STOPPED';
    else if (this.lastError && this.consecutiveFailures >= 2) status = 'ERROR';

    return {
      status,
      isRunning: this.isRunning,
      isChecking: this.isChecking,
      lastCheckTime: this.lastCheckTime,
      nextCheckTime: this.nextCheckTime,
      lastError: this.lastError,
      consecutiveFailures: this.consecutiveFailures
    };
  }

  private updateNextCheckTime(intervalMs: number): void {
    this.nextCheckTime = new Date(Date.now() + intervalMs).toISOString();
  }

  async executeCycle(
    specificLocationId?: string,
    isManual = false
  ): Promise<{ success: boolean; error?: string; processedCount?: number }> {
    await store.whenReady();
    if (this.isChecking) {
      return { success: false, error: 'Monitoring check already in progress.' };
    }
    this.isChecking = true;
    const startTime = new Date().toISOString();
    let processedCount = 0;
    const errors: string[] = [];

    try {
      const settings = store.getOwnerSettings();
      const allLocations = store.getAllLocations();
      if (allLocations.length === 0) throw new Error('No monitored location defined.');

      const targetLocations = specificLocationId
        ? allLocations.filter((l) => l.id === specificLocationId)
        : allLocations;
      const locationsToProcess = targetLocations.length > 0 ? targetLocations : allLocations.slice(0, 1);

      for (const loc of locationsToProcess) {
        try {
          const payload = await fetchRealWeatherData(
            loc.latitude,
            loc.longitude,
            loc.id,
            loc.name,
            loc.timezone
          );

          store.saveWeatherObservation(loc.id, payload.current);
          store.saveForecastSnapshot(loc.id, payload.hourly, payload.daily);
          if (payload.comparison) store.saveCrossReference(loc.id, payload.comparison);

          const riskAssessment = calculateDeterministicRisk(
            payload.current,
            payload.hourly,
            settings.thresholds,
            loc.timezone
          );
          store.saveRiskAssessment(loc.id, riskAssessment);
          store.updateLocationStatus(loc.id, 'LIVE', new Date().toISOString(), riskAssessment.level);

          const { newAlerts, clearedAlerts } = evaluateAndProcessAlerts(
            loc.id,
            loc.name,
            payload.current,
            payload.hourly,
            settings.thresholds,
            settings.alertCooldownMinutes
          );

          for (const alert of newAlerts) {
            await notifyAlert(alert).catch(() => {});
          }
          if (settings.recoveryNotificationsEnabled) {
            for (const cleared of clearedAlerts) {
              await notifyRecovery(cleared, loc.name).catch(() => {});
            }
          }

          processedCount++;
        } catch (locErr) {
          const raw = locErr instanceof Error ? locErr.message : `Failed monitoring location ${loc.name}`;
          const safe = redactSecretsInError(raw);
          errors.push(`${loc.name}: ${safe}`);
          store.updateLocationStatus(loc.id, 'OFFLINE', new Date().toISOString());
        }
      }

      // Retention cleanup, at most once every 24h.
      const now = Date.now();
      if (now - this.lastRetentionCheck > 24 * 60 * 60 * 1000) {
        this.lastRetentionCheck = now;
        try {
          store.enforceDataRetention(Math.max(1, settings.dataRetentionDays || 30));
        } catch {
          /* non-fatal */
        }
      }

      if (errors.length > 0 && processedCount === 0) {
        const combined = errors.join('; ');
        this.lastError = combined;
        this.consecutiveFailures++;
        store.recordMonitorRun('FAILED', 0, combined, startTime);
        return { success: false, error: combined, processedCount: 0 };
      }

      store.recordMonitorRun(
        errors.length > 0 ? 'FAILED' : 'SUCCESS',
        processedCount,
        errors.length > 0 ? errors.join('; ') : undefined,
        startTime
      );
      if (isManual) store.addAuditLog('MANUAL_WEATHER_CHECK', `Manual weather check completed for ${processedCount} location(s)`);

      this.lastCheckTime = new Date().toISOString();
      this.lastError = errors.length > 0 ? errors.join('; ') : null;
      this.consecutiveFailures = 0;
      this.updateNextCheckTime(Math.max(5, settings.monitorIntervalMinutes || 15) * 60 * 1000);

      return { success: true, processedCount };
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Weather monitoring cycle failed.';
      const safe = redactSecretsInError(raw);
      this.lastError = safe;
      this.consecutiveFailures++;
      store.recordMonitorRun('FAILED', 0, safe, startTime);
      return { success: false, error: safe, processedCount: 0 };
    } finally {
      this.isChecking = false;
    }
  }
}

export const staticMonitor = new StaticMonitoringService();
