/**
 * Browser persistence layer for the static (serverless) build.
 *
 * Mirrors the subset of `src/database/db.ts` that the weather-monitoring UI
 * relies on, but stores everything in IndexedDB (with a localStorage fallback)
 * instead of SQLite. The in-memory `state` object is the source of truth at
 * runtime; writes are coalesced and flushed to storage in the background.
 */

import {
  AlertDelivery,
  AlertItem,
  CurrentWeather,
  DataFreshnessStatus,
  DailyForecastItem,
  HourlyForecastItem,
  LocationItem,
  MonitorRun,
  OwnerSettings,
  ProviderComparison,
  RiskAssessment,
  RiskLevel
} from '../types.js';
import { DEFAULT_THRESHOLDS } from '../services/riskEngine.js';

const DB_NAME = 'construction-weather-monitor';
const DB_STORE = 'kv';
const STATE_KEY = 'state';
const LS_KEY = 'cwm.static.state.v1';

// Fixed retention windows mirroring the server defaults.
export const SNAPSHOT_RETENTION_DAYS = 14;
export const ALERT_RETENTION_DAYS = 90;
export const MONITOR_RUN_RETENTION_DAYS = 30;

export interface ObservationRecord {
  id: string;
  locationId: string;
  current: CurrentWeather;
  createdAt: string;
}

export interface ForecastRecord {
  id: string;
  locationId: string;
  fetchedAt: string;
  hourly: HourlyForecastItem[];
  daily: DailyForecastItem[];
}

export interface RiskRecord {
  id: string;
  locationId: string;
  assessment: RiskAssessment;
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  eventType: string;
  details: string;
}

export interface StaticState {
  version: number;
  settings: OwnerSettings;
  locations: LocationItem[];
  observations: ObservationRecord[];
  forecasts: ForecastRecord[];
  risks: RiskRecord[];
  crossReferences: Record<string, ProviderComparison>;
  alerts: AlertItem[];
  deliveries: AlertDelivery[];
  runs: MonitorRun[];
  audit: AuditRecord[];
}

const STATE_VERSION = 1;

/** The default site seeded on first run so the dashboard has data immediately. */
const SEED_LOCATION = {
  name: 'Adelaide, South Australia',
  latitude: -34.9285,
  longitude: 138.6007,
  timezone: 'Australia/Adelaide'
};

export function uid(prefix: string): string {
  const c = globalThis.crypto as Crypto | undefined;
  const rand =
    c && typeof c.randomUUID === 'function'
      ? c.randomUUID()
      : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `${prefix}-${rand}`;
}

function defaultSettings(): OwnerSettings {
  return {
    ownerEmail: 'operator@local',
    ownerName: 'Site Manager',
    defaultLocationId: '',
    temperatureUnit: 'C',
    windUnit: 'km/h',
    // No mail transport exists in the static build; alerting is via in-app
    // notifications and the alert history.
    emailAlertsEnabled: false,
    monitoringEnabled: true,
    monitorIntervalMinutes: 15,
    alertCooldownMinutes: 60,
    recoveryNotificationsEnabled: true,
    dataRetentionDays: 30,
    thresholds: { ...DEFAULT_THRESHOLDS }
  };
}

function emptyState(): StaticState {
  return {
    version: STATE_VERSION,
    settings: defaultSettings(),
    locations: [],
    observations: [],
    forecasts: [],
    risks: [],
    crossReferences: {},
    alerts: [],
    deliveries: [],
    runs: [],
    audit: []
  };
}

/** Small IndexedDB key/value helper with a localStorage fallback. */
class Persistence {
  private db: IDBDatabase | null = null;
  private opened = false;
  private useLocalStorage = false;

  private open(): Promise<IDBDatabase | null> {
    if (this.opened) return Promise.resolve(this.db);
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        this.useLocalStorage = true;
        this.opened = true;
        resolve(null);
        return;
      }
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        };
        req.onsuccess = () => {
          this.db = req.result;
          this.opened = true;
          resolve(this.db);
        };
        req.onerror = () => {
          this.useLocalStorage = true;
          this.opened = true;
          resolve(null);
        };
      } catch {
        this.useLocalStorage = true;
        this.opened = true;
        resolve(null);
      }
    });
  }

  async read(): Promise<StaticState | null> {
    const db = await this.open();
    if (db) {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(DB_STORE, 'readonly');
          const req = tx.objectStore(DB_STORE).get(STATE_KEY);
          req.onsuccess = () => resolve((req.result as StaticState) || null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    try {
      const raw = globalThis.localStorage?.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as StaticState) : null;
    } catch {
      return null;
    }
  }

  async write(state: StaticState): Promise<void> {
    const db = await this.open();
    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).put(state, STATE_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      });
      return;
    }
    try {
      globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      /* storage full / unavailable — keep operating from memory */
    }
  }
}

/**
 * In-memory data store with coalesced persistence. All accessors return copies
 * where mutation by callers would otherwise corrupt the cache.
 */
class StaticStore {
  private state: StaticState = emptyState();
  private persistence = new Persistence();
  private ready: Promise<void>;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    this.ready = this.hydrate();
  }

  private async hydrate(): Promise<void> {
    try {
      const raw = await this.persistence.read();
      if (raw && typeof raw === 'object') {
        this.state = {
          ...emptyState(),
          ...raw,
          settings: { ...defaultSettings(), ...(raw.settings || {}) },
          crossReferences: raw.crossReferences || {}
        };
      }
    } catch {
      /* start from defaults */
    }

    // First run: seed a default site so the dashboard renders immediately.
    if (this.state.locations.length === 0) {
      const loc: LocationItem = {
        id: uid('loc'),
        ...SEED_LOCATION,
        isDefault: true,
        createdAt: new Date().toISOString()
      };
      this.state.locations.push(loc);
      this.state.settings.defaultLocationId = loc.id;
    }
    if (!this.state.settings.defaultLocationId && this.state.locations[0]) {
      this.state.settings.defaultLocationId = this.state.locations[0].id;
    }
    await this.persistence.write(this.state);
  }

  /** Resolves once the persisted state has been loaded (or defaults seeded). */
  whenReady(): Promise<void> {
    return this.ready;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        /* listener errors must not break the store */
      }
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.persistence.write(this.state);
    }, 250);
  }

  private commit(): void {
    this.scheduleFlush();
    this.emit();
  }

  // ----------------- Locations -----------------
  getAllLocations(): LocationItem[] {
    return [...this.state.locations].sort(
      (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)
    );
  }

  getDefaultLocation(): LocationItem | null {
    return this.state.locations.find((l) => l.isDefault) || this.state.locations[0] || null;
  }

  getLocation(id: string): LocationItem | null {
    return this.state.locations.find((l) => l.id === id) || null;
  }

  saveLocation(loc: Omit<LocationItem, 'id' | 'createdAt'>): LocationItem {
    if (loc.isDefault) for (const l of this.state.locations) l.isDefault = false;
    const created: LocationItem = { id: uid('loc'), ...loc, createdAt: new Date().toISOString() };
    this.state.locations.push(created);
    if (created.isDefault || this.state.locations.length === 1) {
      this.setDefaultLocation(created.id);
    }
    this.commit();
    return created;
  }

  setDefaultLocation(id: string): void {
    for (const l of this.state.locations) l.isDefault = l.id === id;
    if (this.state.locations.some((l) => l.id === id)) {
      this.state.settings.defaultLocationId = id;
    }
    this.commit();
  }

  deleteLocation(id: string): boolean {
    const loc = this.state.locations.find((l) => l.id === id);
    if (!loc || loc.isDefault) return false;
    this.state.locations = this.state.locations.filter((l) => l.id !== id);
    this.state.observations = this.state.observations.filter((o) => o.locationId !== id);
    this.state.forecasts = this.state.forecasts.filter((f) => f.locationId !== id);
    this.state.risks = this.state.risks.filter((r) => r.locationId !== id);
    delete this.state.crossReferences[id];
    this.commit();
    return true;
  }

  updateLocationStatus(
    locationId: string,
    status: DataFreshnessStatus,
    lastCheckedAt: string,
    currentRiskLevel?: RiskLevel
  ): void {
    const loc = this.state.locations.find((l) => l.id === locationId);
    if (loc) {
      loc.status = status;
      loc.lastCheckedAt = lastCheckedAt;
      loc.currentRiskLevel = currentRiskLevel;
    }
    this.commit();
  }

  // ----------------- Observations -----------------
  saveWeatherObservation(locId: string, current: CurrentWeather): string {
    const id = uid('obs');
    this.state.observations.push({ id, locationId: locId, current, createdAt: new Date().toISOString() });
    this.commit();
    return id;
  }

  getLatestObservation(locId: string): CurrentWeather | null {
    const rows = this.state.observations.filter((o) => o.locationId === locId);
    if (rows.length === 0) return null;
    return rows.reduce((a, b) => (a.current.timestamp >= b.current.timestamp ? a : b)).current;
  }

  getHistoricalObservations(
    locId: string,
    range: 'today' | 'yesterday' | '7days' | '30days' | 'all' = 'today'
  ): CurrentWeather[] {
    const now = new Date();
    let from: number | null = null;
    let to: number | null = null;
    if (range === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (range === 'yesterday') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (range === '7days') {
      from = now.getTime() - 7 * 24 * 3600 * 1000;
    } else if (range === '30days') {
      from = now.getTime() - 30 * 24 * 3600 * 1000;
    }

    return this.state.observations
      .filter((o) => {
        if (o.locationId !== locId) return false;
        const t = new Date(o.current.timestamp).getTime();
        if (Number.isNaN(t)) return false;
        if (from !== null && t < from) return false;
        if (to !== null && t >= to) return false;
        return true;
      })
      .sort((a, b) => a.current.timestamp.localeCompare(b.current.timestamp))
      .map((o) => o.current);
  }

  countObservations(): number {
    return this.state.observations.length;
  }

  // ----------------- Forecasts -----------------
  saveForecastSnapshot(locId: string, hourly: HourlyForecastItem[], daily: DailyForecastItem[]): void {
    this.state.forecasts.push({
      id: uid('snap'),
      locationId: locId,
      fetchedAt: new Date().toISOString(),
      hourly,
      daily
    });
    this.commit();
  }

  getLatestForecastSnapshot(
    locId: string
  ): { hourly: HourlyForecastItem[]; daily: DailyForecastItem[]; fetchedAt: string } | null {
    const rows = this.state.forecasts.filter((f) => f.locationId === locId);
    if (rows.length === 0) return null;
    const latest = rows.reduce((a, b) => (a.fetchedAt >= b.fetchedAt ? a : b));
    return { hourly: latest.hourly, daily: latest.daily, fetchedAt: latest.fetchedAt };
  }

  // ----------------- Risk assessments -----------------
  saveRiskAssessment(locId: string, assessment: RiskAssessment): void {
    this.state.risks.push({
      id: uid('risk'),
      locationId: locId,
      assessment,
      createdAt: new Date().toISOString()
    });
    this.commit();
  }

  getLatestRiskAssessment(locId: string): RiskAssessment | null {
    const rows = this.state.risks.filter((r) => r.locationId === locId);
    if (rows.length === 0) return null;
    return rows.reduce((a, b) => (a.assessment.calculatedAt >= b.assessment.calculatedAt ? a : b)).assessment;
  }

  // ----------------- Cross references -----------------
  saveCrossReference(locId: string, comparison: ProviderComparison): void {
    this.state.crossReferences[locId] = comparison;
    this.commit();
  }

  getLatestCrossReference(locId: string): ProviderComparison | null {
    return this.state.crossReferences[locId] || null;
  }

  // ----------------- Alerts -----------------
  saveAlert(alert: Omit<AlertItem, 'id' | 'createdAt'>): AlertItem {
    const created: AlertItem = { id: uid('alt'), ...alert, createdAt: new Date().toISOString() };
    this.state.alerts.push(created);
    this.commit();
    return created;
  }

  getAlert(id: string): AlertItem | null {
    return this.state.alerts.find((a) => a.id === id) || null;
  }

  getActiveAlerts(locId?: string): AlertItem[] {
    return this.state.alerts
      .filter((a) => a.status === 'ACTIVE' && (!locId || a.locationId === locId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getAlertHistory(limit = 50): AlertItem[] {
    return [...this.state.alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  updateAlertStatus(alertId: string, status: 'CLEARED' | 'DISMISSED'): void {
    const alert = this.state.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.status = status;
      alert.clearedAt = new Date().toISOString();
    }
    this.commit();
  }

  addDelivery(delivery: Omit<AlertDelivery, 'id'>): AlertDelivery {
    const created: AlertDelivery = { id: uid('del'), ...delivery };
    this.state.deliveries.push(created);
    this.commit();
    return created;
  }

  getAlertDeliveries(limit = 50): AlertDelivery[] {
    return [...this.state.deliveries].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, limit);
  }

  countActiveAlerts(): number {
    return this.state.alerts.filter((a) => a.status === 'ACTIVE').length;
  }

  countDeliveries(): number {
    return this.state.deliveries.length;
  }

  // ----------------- Monitor runs -----------------
  recordMonitorRun(
    status: 'SUCCESS' | 'FAILED' | 'RUNNING',
    itemsProcessed = 0,
    errorMessage?: string,
    startedAt?: string
  ): string {
    const now = new Date().toISOString();
    const run: MonitorRun = {
      id: uid('run'),
      startedAt: startedAt || now,
      completedAt: status === 'RUNNING' ? undefined : now,
      status,
      itemsProcessed,
      errorMessage
    };
    this.state.runs.push(run);
    this.commit();
    return run.id;
  }

  getRecentMonitorRuns(limit = 10): MonitorRun[] {
    return [...this.state.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
  }

  // ----------------- Settings -----------------
  getOwnerSettings(): OwnerSettings {
    return { ...this.state.settings, thresholds: { ...this.state.settings.thresholds } };
  }

  saveOwnerSettings(updates: Partial<OwnerSettings>): void {
    this.state.settings = {
      ...this.state.settings,
      ...updates,
      thresholds: updates.thresholds
        ? { ...this.state.settings.thresholds, ...updates.thresholds }
        : this.state.settings.thresholds
    };
    this.commit();
  }

  // ----------------- Audit log -----------------
  addAuditLog(eventType: string, details: string): void {
    this.state.audit.unshift({ id: uid('aud'), timestamp: new Date().toISOString(), eventType, details });
    this.state.audit = this.state.audit.slice(0, 200);
    this.commit();
  }

  getAuditLogs(limit = 40): AuditRecord[] {
    return this.state.audit.slice(0, limit);
  }

  /** Full serialisable snapshot, used for client-side export in the static build. */
  exportState(): StaticState {
    return this.state;
  }

  // ----------------- Retention / clearing -----------------
  enforceDataRetention(retentionDays = 30): {
    observationsDeleted: number;
    snapshotsDeleted: number;
    comparisonsDeleted: number;
    alertsPruned: number;
  } {
    const now = Date.now();
    const obsCutoff = now - retentionDays * 24 * 3600 * 1000;
    const snapCutoff = now - SNAPSHOT_RETENTION_DAYS * 24 * 3600 * 1000;
    const alertsCutoff = now - ALERT_RETENTION_DAYS * 24 * 3600 * 1000;
    const runCutoff = now - MONITOR_RUN_RETENTION_DAYS * 24 * 3600 * 1000;

    const before = this.state.observations.length;
    this.state.observations = this.state.observations.filter(
      (o) => new Date(o.current.timestamp).getTime() >= obsCutoff
    );

    const snapsBefore = this.state.forecasts.length;
    this.state.forecasts = this.state.forecasts.filter((f) => new Date(f.fetchedAt).getTime() >= snapCutoff);

    this.state.runs = this.state.runs.filter((r) => new Date(r.startedAt).getTime() >= runCutoff);

    const alertsBefore = this.state.alerts.length;
    this.state.alerts = this.state.alerts.filter(
      (a) => a.status === 'ACTIVE' || new Date(a.createdAt).getTime() >= alertsCutoff
    );

    this.commit();
    return {
      observationsDeleted: before - this.state.observations.length,
      snapshotsDeleted: snapsBefore - this.state.forecasts.length,
      comparisonsDeleted: 0,
      alertsPruned: alertsBefore - this.state.alerts.length
    };
  }

  /** Clears recorded telemetry while preserving configuration and locations. */
  clearData(): { observations: number; alerts: number; runs: number } {
    const counts = {
      observations: this.state.observations.length,
      alerts: this.state.alerts.length,
      runs: this.state.runs.length
    };
    this.state.observations = [];
    this.state.forecasts = [];
    this.state.risks = [];
    this.state.alerts = [];
    this.state.deliveries = [];
    this.state.runs = [];
    this.state.crossReferences = {};
    this.commit();
    return counts;
  }
}

export const store = new StaticStore();
