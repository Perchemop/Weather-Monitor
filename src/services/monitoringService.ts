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
  addAuditLog,
  updateLocationStatus,
  enforceDataRetention
} from '../database/db.js';
import { fetchRealWeatherData } from './weatherService.js';
import { calculateDeterministicRisk } from './riskEngine.js';
import { evaluateAndProcessAlerts } from './alertEngine.js';
import { sendAlertEmail, sendRecoveryEmail, processAlertRetryQueue } from './emailService.js';
import { redactSecretsInError } from '../utils/security.js';

class MonitoringService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isChecking = false;
  private lastCheckTime: string | null = null;
  private nextCheckTime: string | null = null;
  private lastError: string | null = null;
  private consecutiveFailures = 0;
  private lastRetentionCheck = 0;

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

  public async executeCycle(
    specificLocationId?: string,
    isManual = false
  ): Promise<{ success: boolean; error?: string; processedCount?: number }> {
    if (this.isChecking) {
      return { success: false, error: 'Monitoring check already in progress.' };
    }

    this.isChecking = true;
    const startTime = new Date().toISOString();
    let processedCount = 0;
    const errors: string[] = [];

    try {
      const settings = await getOwnerSettings();
      const allLocations = await getAllLocations();

      if (allLocations.length === 0) {
        throw new Error('No monitored location defined.');
      }

      // Filter target locations: specific location if requested, otherwise ALL locations
      const targetLocations = specificLocationId
        ? allLocations.filter((l) => l.id === specificLocationId)
        : allLocations;

      const locationsToProcess = targetLocations.length > 0 ? targetLocations : allLocations.slice(0, 1);

      for (const loc of locationsToProcess) {
        try {
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

          // 3. Run Deterministic Risk Engine with location's timezone
          const riskAssessment = calculateDeterministicRisk(
            payload.current,
            payload.hourly,
            settings.thresholds,
            loc.timezone
          );
          await saveRiskAssessment(loc.id, riskAssessment);

          // Update location operational status
          await updateLocationStatus(
            loc.id,
            'LIVE',
            new Date().toISOString(),
            riskAssessment.level
          );

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

          processedCount++;
        } catch (locErr: any) {
          const rawLocErr = locErr?.message || `Failed monitoring location ${loc.name}`;
          const safeLocErr = redactSecretsInError(rawLocErr);
          errors.push(`${loc.name}: ${safeLocErr}`);

          await updateLocationStatus(
            loc.id,
            'OFFLINE',
            new Date().toISOString(),
            undefined,
            safeLocErr
          );
        }
      }

      // 6. Process pending alert email retry queue
      try {
        await processAlertRetryQueue();
      } catch (retryErr) {
        console.warn('[MonitoringService] Alert retry queue processing error:', retryErr);
      }

      // 7. Data retention cleanup (once every 24 hours)
      const now = Date.now();
      if (now - this.lastRetentionCheck > 24 * 60 * 60 * 1000) {
        this.lastRetentionCheck = now;
        try {
          await enforceDataRetention(30);
        } catch (retErr) {
          console.warn('[MonitoringService] Data retention cleanup error:', retErr);
        }
      }

      // Record monitor run result
      if (errors.length > 0 && processedCount === 0) {
        // Complete failure
        const combinedError = errors.join('; ');
        this.lastError = combinedError;
        this.consecutiveFailures++;
        await recordMonitorRun('FAILED', 0, combinedError, startTime);
        return { success: false, error: combinedError, processedCount: 0 };
      }

      // Partial or total success
      const runStatus = errors.length > 0 ? 'PARTIAL' : 'SUCCESS';
      await recordMonitorRun(
        runStatus as any,
        processedCount,
        errors.length > 0 ? errors.join('; ') : undefined,
        startTime
      );

      if (isManual) {
        await addAuditLog(
          'MANUAL_WEATHER_CHECK',
          `Manual weather check completed for ${processedCount} location(s)`
        );
      }

      // Handle recovery if previously failing
      if (this.consecutiveFailures > 0) {
        await addAuditLog(
          'MONITORING_RECOVERED',
          `Monitoring service successfully recovered after ${this.consecutiveFailures} consecutive failure(s).`
        );
      }

      this.lastCheckTime = new Date().toISOString();
      this.lastError = errors.length > 0 ? errors.join('; ') : null;
      this.consecutiveFailures = 0;

      const intervalMs = Math.max(5, settings.monitorIntervalMinutes || 15) * 60 * 1000;
      this.updateNextCheckTime(intervalMs);

      return { success: true, processedCount };
    } catch (err: any) {
      const rawError = err?.message || 'Weather monitoring cycle failed.';
      const safeError = redactSecretsInError(rawError);
      this.lastError = safeError;
      this.consecutiveFailures++;

      await recordMonitorRun('FAILED', 0, safeError, startTime);
      console.error(`[Weather Monitor Run Failed]: ${safeError}`);

      return { success: false, error: safeError, processedCount: 0 };
    } finally {
      this.isChecking = false;
    }
  }
}

export const monitoringService = new MonitoringService();
