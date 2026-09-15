import {
  getDefaultLocation,
  getAllLocations,
  saveWeatherObservation,
  saveForecastSnapshot,
  saveRiskAssessment,
  saveCrossReference,
  recordMonitorRun,
  getOwnerSettings,
  getRecentMonitorRuns,
  addAuditLog
} from '../database/db.js';
import { fetchRealWeatherData } from './weatherService.js';
import { calculateDeterministicRisk } from './riskEngine.js';
import { evaluateAndProcessAlerts } from './alertEngine.js';
import { sendAlertEmail, sendRecoveryEmail } from './emailService.js';

class MonitoringService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isChecking = false;
  private lastCheckTime: string | null = null;
  private nextCheckTime: string | null = null;
  private lastError: string | null = null;
  private consecutiveFailures = 0;

  public async start(): Promise<void> {
    const settings = await getOwnerSettings();
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

    // Schedule periodic run
    const intervalMs = Math.max(5, settings.monitorIntervalMinutes || 15) * 60 * 1000;
    this.updateNextCheckTime(intervalMs);

    this.timer = setInterval(() => {
      this.executeCycle();
    }, intervalMs);

    // Run immediate check on start
    this.executeCycle();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    this.nextCheckTime = null;
  }

  public updateInterval(minutes: number): void {
    if (this.isRunning) {
      this.start();
    }
  }

  public getStatus() {
    let status: 'ACTIVE' | 'STOPPED' | 'ERROR' = 'ACTIVE';
    if (!this.isRunning) {
      status = 'STOPPED';
    } else if (this.lastError && this.consecutiveFailures >= 2) {
      status = 'ERROR';
    }

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

  private updateNextCheckTime(intervalMs: number) {
    this.nextCheckTime = new Date(Date.now() + intervalMs).toISOString();
  }

  public async executeCycle(specificLocationId?: string, isManual = false): Promise<{ success: boolean; error?: string }> {
    if (this.isChecking) {
      return { success: false, error: 'Monitoring check already in progress.' };
    }

    this.isChecking = true;
    const startTime = new Date().toISOString();

    try {
      const settings = await getOwnerSettings();
      const locations = await getAllLocations();

      if (locations.length === 0) {
        throw new Error('No monitored location defined.');
      }

      // Determine which location to run
      const targetLocations = specificLocationId
        ? locations.filter((l) => l.id === specificLocationId)
        : locations.filter((l) => l.isDefault || locations.length === 1);

      const loc = targetLocations[0] || locations[0];

      // 1. Fetch real weather data
      const payload = await fetchRealWeatherData(
        loc.latitude,
        loc.longitude,
        loc.id,
        loc.name,
        loc.timezone
      );

      // 2. Persist raw observation & forecast snapshot to SQLite
      await saveWeatherObservation(loc.id, payload.current);
      await saveForecastSnapshot(loc.id, payload.hourly, payload.daily);
      if (payload.comparison) {
        await saveCrossReference(loc.id, payload.comparison);
      }

      // 3. Run Deterministic Risk Engine
      const riskAssessment = calculateDeterministicRisk(
        payload.current,
        payload.hourly,
        settings.thresholds
      );
      await saveRiskAssessment(loc.id, riskAssessment);

      // 4. Run Alert Engine (with deduplication & cooldown)
      const { newAlerts, clearedAlerts } = await evaluateAndProcessAlerts(
        loc.id,
        loc.name,
        payload.current,
        payload.hourly,
        settings.thresholds,
        settings.alertCooldownMinutes
      );

      // 5. Send Alert Emails if alerts found & email enabled
      if (settings.emailAlertsEnabled && settings.ownerEmail) {
        const affectedNames = riskAssessment.affectedActivities
          .filter((a) => a.riskLevel === 'HIGH' || a.riskLevel === 'CRITICAL')
          .map((a) => a.activity);

        for (const alert of newAlerts) {
          await sendAlertEmail(alert, settings.ownerEmail, affectedNames);
        }

        if (settings.recoveryNotificationsEnabled) {
          for (const cleared of clearedAlerts) {
            await sendRecoveryEmail(
              cleared,
              settings.ownerEmail,
              `${Math.round(payload.current.windGusts)} km/h gusts, ${payload.current.temperature.toFixed(1)}°C`
            );
          }
        }
      }

      // Record successful monitor run
      await recordMonitorRun('SUCCESS', 1, undefined, startTime);
      if (isManual) {
        await addAuditLog('MANUAL_WEATHER_CHECK', `Manual weather check completed for ${loc.name}`);
      }

      this.lastCheckTime = new Date().toISOString();
      this.lastError = null;
      this.consecutiveFailures = 0;

      const intervalMs = Math.max(5, settings.monitorIntervalMinutes || 15) * 60 * 1000;
      this.updateNextCheckTime(intervalMs);

      return { success: true };
    } catch (err: any) {
      const errorMsg = err?.message || 'Weather monitoring cycle failed.';
      this.lastError = errorMsg;
      this.consecutiveFailures++;

      await recordMonitorRun('FAILED', 0, errorMsg, startTime);
      console.error(`[Weather Monitor Run Failed]: ${errorMsg}`);

      return { success: false, error: errorMsg };
    } finally {
      this.isChecking = false;
    }
  }
}

export const monitoringService = new MonitoringService();
