import {
  AlertItem,
  AlertSeverity,
  CurrentWeather,
  MonitorRun,
  MonitorStatus,
  WeeklyPerformanceSummary
} from '../types.js';

const ALERT_SEVERITIES: AlertSeverity[] = ['CRITICAL', 'HIGH', 'MODERATE', 'INFORMATION'];

function withinWindow(iso: string | undefined | null, sinceMs: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= sinceMs;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Builds the rolling weekly performance summary from already-gathered data.
 *
 * Deliberately side-effect free so both the SQLite server and the browser
 * (IndexedDB) build can share it. Callers pass raw observations/alerts/runs;
 * this function windows them, aggregates, and writes human-readable highlights.
 */
export function buildWeeklyPerformanceSummary(params: {
  locationId: string | null;
  locationName: string;
  monitoringEnabled: boolean;
  intervalMinutes: number;
  monitorStatus: MonitorStatus;
  observations: CurrentWeather[];
  alerts: AlertItem[];
  runs: MonitorRun[];
  windowDays?: number;
  now?: Date;
}): WeeklyPerformanceSummary {
  const windowDays = params.windowDays ?? 7;
  const now = params.now ?? new Date();
  const sinceMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const intervalMinutes = Math.max(1, params.intervalMinutes || 15);

  const observations = params.observations.filter((o) => withinWindow(o.timestamp, sinceMs));
  const alerts = params.alerts.filter(
    (a) => withinWindow(a.createdAt, sinceMs) && (!params.locationId || a.locationId === params.locationId)
  );
  const runs = params.runs.filter((r) => withinWindow(r.startedAt, sinceMs));

  // ---- Monitoring reliability ----
  const runsSucceeded = runs.filter((r) => r.status === 'SUCCESS').length;
  const runsFailed = runs.filter((r) => r.status === 'FAILED').length;
  const expectedObservations = Math.max(1, Math.floor((windowDays * 24 * 60) / intervalMinutes));
  const successRatePct = runs.length > 0 ? round((runsSucceeded / runs.length) * 100) : 0;
  const coveragePct = round(Math.min(100, (observations.length / expectedObservations) * 100));

  // ---- Condition extremes ----
  const temps = observations.map((o) => o.temperature).filter((n) => Number.isFinite(n));
  const gusts = observations.map((o) => o.windGusts).filter((n) => Number.isFinite(n));
  const winds = observations.map((o) => o.windSpeed).filter((n) => Number.isFinite(n));
  const uvs = observations.map((o) => o.uvIndex).filter((n) => Number.isFinite(n));
  const rain = observations.map((o) => o.rainAmount).filter((n) => Number.isFinite(n));

  const conditions = {
    maxTempC: temps.length ? round(Math.max(...temps)) : null,
    minTempC: temps.length ? round(Math.min(...temps)) : null,
    peakGustKmh: gusts.length ? round(Math.max(...gusts)) : null,
    avgWindKmh: winds.length ? round(winds.reduce((a, b) => a + b, 0) / winds.length) : null,
    totalRainMm: rain.length ? round(rain.reduce((a, b) => a + b, 0)) : 0,
    maxUvIndex: uvs.length ? round(Math.max(...uvs)) : null
  };

  // ---- Alert activity ----
  const bySeverity = ALERT_SEVERITIES.reduce(
    (acc, sev) => {
      acc[sev] = alerts.filter((a) => a.severity === sev).length;
      return acc;
    },
    {} as Record<AlertSeverity, number>
  );
  const severe = bySeverity.CRITICAL + bySeverity.HIGH;
  const open = alerts.filter((a) => a.status === 'ACTIVE').length;

  const typeCounts = new Map<string, number>();
  for (const a of alerts) typeCounts.set(a.alertType, (typeCounts.get(a.alertType) || 0) + 1);
  const byType = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const lastTriggeredAt = alerts.length
    ? alerts.reduce((latest, a) => (a.createdAt > latest ? a.createdAt : latest), alerts[0].createdAt)
    : null;

  // ---- Highlights ----
  const highlights: string[] = [];
  const status = params.monitorStatus.status;
  if (!params.monitoringEnabled) {
    highlights.push('Continuous monitoring is currently disabled — no new observations are being collected.');
  } else if (status === 'ERROR') {
    highlights.push(
      `Monitoring reported ${params.monitorStatus.consecutiveFailures} consecutive failed cycle(s); investigate upstream connectivity.`
    );
  } else {
    highlights.push(
      `Monitoring active on a ${intervalMinutes}-minute cycle with ${coveragePct}% data coverage over the last ${windowDays} days.`
    );
  }

  if (severe > 0) {
    highlights.push(
      `${severe} severe alert(s) (HIGH/CRITICAL) raised — review the activity risk matrix for affected works.`
    );
  } else {
    highlights.push('No severe (HIGH/CRITICAL) alerts were raised during this window.');
  }

  if (conditions.peakGustKmh !== null) {
    highlights.push(
      `Peak gust reached ${conditions.peakGustKmh} km/h, with a maximum temperature of ${
        conditions.maxTempC ?? '—'
      }°C and ${conditions.totalRainMm} mm total rainfall.`
    );
  }

  return {
    generatedAt: now.toISOString(),
    windowDays,
    locationId: params.locationId,
    locationName: params.locationName,
    monitoring: {
      enabled: params.monitoringEnabled,
      status,
      intervalMinutes,
      lastCheckTime: params.monitorStatus.lastCheckTime,
      nextCheckTime: params.monitorStatus.nextCheckTime,
      consecutiveFailures: params.monitorStatus.consecutiveFailures,
      runsTotal: runs.length,
      runsSucceeded,
      runsFailed,
      successRatePct,
      observations: observations.length,
      expectedObservations,
      coveragePct
    },
    conditions,
    alerts: {
      total: alerts.length,
      severe,
      open,
      bySeverity,
      byType,
      lastTriggeredAt
    },
    highlights
  };
}
