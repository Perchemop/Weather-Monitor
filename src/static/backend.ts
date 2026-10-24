/**
 * In-browser implementation of the `/api/*` contract for the static build.
 *
 * The React UI was written against the Express gateway, so rather than rewrite
 * every component this module faithfully answers the endpoints the UI consumes,
 * sourcing weather from Open-Meteo, evaluating risk/alerts with the shared
 * engines, and persisting everything in the browser store.
 *
 * Server-only concerns (SMTP, Web Push fan-out, MFA, multi-user accounts,
 * backups, AI providers) return explicit, non-fatal "not available" answers so
 * the UI degrades gracefully instead of hanging on 500s.
 */

import { CurrentWeather, HourlyForecastItem, LocationItem, SystemHealth, UserAccount } from '../types.js'
import { searchGeocodingLocations } from '../services/weatherService.js'
import { DEFAULT_THRESHOLDS } from '../services/riskEngine.js'
import { buildWeeklyPerformanceSummary } from '../services/performanceSummary.js'
import { store } from './store.js'
import { staticMonitor } from './monitor.js'

export interface StaticApiRequest {
  method: string
  pathname: string
  search: URLSearchParams
  body: any
}

export interface StaticApiResponse {
  status: number
  body: unknown
}

const APP_STARTED_AT = Date.now()

function asArrayBufferSize(state: unknown): number {
  try {
    return new Blob([JSON.stringify(state)]).size
  } catch {
    return 0
  }
}

function resolveLocation(locationId?: string | null): LocationItem | null {
  const locations = store.getAllLocations()
  if (locationId) return locations.find((l) => l.id === locationId) || locations[0] || null
  return store.getDefaultLocation() || locations[0] || null
}

function evaluateFreshness(observation: CurrentWeather | null, intervalMinutes: number) {
  if (!observation)
    return {
      status: 'UNAVAILABLE' as const,
      ageMinutes: null,
      intervalMinutes,
      message: 'No observation recorded yet.',
    }
  const ageMs = Date.now() - new Date(observation.timestamp).getTime()
  const ageMinutes = Math.max(0, Math.round(ageMs / 60000))
  const staleAfter = Math.max(intervalMinutes * 2, 30)
  const status =
    ageMinutes <= intervalMinutes + 5
      ? ('LIVE' as const)
      : ageMinutes <= staleAfter
        ? ('CACHED' as const)
        : ('STALE' as const)
  return { status, ageMinutes, intervalMinutes, message: `${ageMinutes} min old` }
}

function buildHealth(): SystemHealth {
  const status = staticMonitor.getStatus()
  const settings = store.getOwnerSettings()
  return {
    weatherApiStatus: navigator.onLine ? 'HEALTHY' : 'DEGRADED',
    databaseStatus: 'HEALTHY',
    monitorStatus: status.status,
    emailStatus: 'NOT_CONFIGURED',
    lastCheckTime: status.lastCheckTime,
    nextCheckTime: status.nextCheckTime,
    totalAlertsSent: store.countDeliveries(),
    activeAlertsCount: store.countActiveAlerts(),
    totalObservationsCount: store.countObservations(),
    memoryUsageMb: 0,
    uptimeSeconds: Math.round((Date.now() - APP_STARTED_AT) / 1000),
    databaseSizeBytes: asArrayBufferSize(store.getAllLocations()) + store.countObservations() * 240,
  }
}

/**
 * Handles a single `/api/*` request and returns a JSON-serialisable response.
 */
export async function handleStaticApi(req: StaticApiRequest): Promise<StaticApiResponse> {
  await store.whenReady()
  const { method, pathname, search, body } = req
  const settings = store.getOwnerSettings()

  // ----------------------------- Auth -----------------------------
  if (pathname === '/api/auth/status' && method === 'GET') {
    return {
      status: 200,
      body: {
        authenticated: true,
        email: settings.ownerEmail,
        displayName: settings.ownerName,
        role: 'OWNER',
        ownerEmail: settings.ownerEmail,
        ownerName: settings.ownerName,
        isFirstRun: false,
      },
    }
  }
  if (pathname === '/api/auth/logout' || pathname === '/api/auth/logout-all') {
    return { status: 200, body: { success: true } }
  }
  if (pathname === '/api/auth/login' || pathname === '/api/auth/setup') {
    return { status: 200, body: { success: true, role: 'OWNER' } }
  }
  if (pathname === '/api/auth/change-password') {
    return { status: 400, body: { error: 'Authentication is disabled in the local static build.' } }
  }
  if (pathname === '/api/auth/mfa/status') {
    return { status: 200, body: { enabled: false, supported: false } }
  }
  if (pathname.startsWith('/api/auth/mfa/')) {
    return {
      status: 400,
      body: { error: 'Multi-factor authentication is not available in the static build.' },
    }
  }
  if (pathname === '/api/auth/sessions' && method === 'GET') {
    const now = new Date().toISOString()
    return {
      status: 200,
      body: {
        sessions: [
          {
            id: 'local-browser',
            current: true,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            ip: null,
            createdAt: now,
            lastSeenAt: now,
            expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
          },
        ],
      },
    }
  }
  if (pathname.startsWith('/api/auth/sessions/')) {
    return { status: 200, body: { success: true } }
  }

  // ----------------------------- Settings -----------------------------
  if (pathname === '/api/settings' && method === 'GET') {
    return {
      status: 200,
      body: { settings, smtpConfigured: false, smtpStatus: { configured: false, host: '', fromAddress: '' } },
    }
  }
  if (pathname === '/api/settings' && method === 'PUT') {
    const updates = { ...(body || {}) }
    if (updates.monitorIntervalMinutes !== undefined) {
      const interval = Number(updates.monitorIntervalMinutes)
      if (Number.isNaN(interval) || interval < 5 || interval > 1440) {
        return { status: 400, body: { error: 'Monitor interval must be between 5 and 1440 minutes.' } }
      }
      updates.monitorIntervalMinutes = interval
    }
    if (updates.dataRetentionDays !== undefined) {
      const days = Number(updates.dataRetentionDays)
      if (!Number.isFinite(days) || days < 1 || days > 3650) {
        return { status: 400, body: { error: 'Data retention must be between 1 and 3650 days.' } }
      }
      updates.dataRetentionDays = Math.floor(days)
    }
    store.saveOwnerSettings(updates)
    staticMonitor.updateInterval()
    return { status: 200, body: { success: true, message: 'Settings saved.' } }
  }
  if (pathname === '/api/settings/restore-defaults') {
    store.saveOwnerSettings({
      thresholds: { ...DEFAULT_THRESHOLDS },
      monitorIntervalMinutes: 15,
      alertCooldownMinutes: 60,
      recoveryNotificationsEnabled: true,
    })
    staticMonitor.updateInterval()
    return { status: 200, body: { success: true, message: 'Default thresholds restored.' } }
  }
  if (pathname === '/api/secrets/status') {
    return {
      status: 200,
      body: {
        weatherApiKeyConfigured: false,
        weatherApiKeyMasked: '',
        smtpConfigured: false,
        smtpHost: '',
      },
    }
  }
  if (pathname === '/api/email/test') {
    return { status: 400, body: { error: 'Email delivery is not available in the static build.' } }
  }

  // ----------------------------- Push -----------------------------
  if (pathname === '/api/push/status') {
    return { status: 200, body: { configured: false, subscribed: false, subscriptions: 0 } }
  }
  if (pathname === '/api/push/public-key') {
    return { status: 200, body: { publicKey: '', configured: false } }
  }
  if (pathname === '/api/push/unsubscribe') {
    return { status: 200, body: { success: true } }
  }
  if (pathname.startsWith('/api/push/')) {
    return { status: 400, body: { error: 'Server push is not available in the static build.' } }
  }

  // ----------------------------- Users -----------------------------
  if (pathname === '/api/users' && method === 'GET') {
    const created = store.getAllLocations()[0]?.createdAt || new Date().toISOString()
    const user: UserAccount = {
      id: 'local-user',
      email: settings.ownerEmail,
      displayName: settings.ownerName,
      role: 'OWNER',
      active: true,
      createdAt: created,
      updatedAt: created,
    }
    return { status: 200, body: { users: [user] } }
  }
  if (pathname.startsWith('/api/users')) {
    return { status: 400, body: { error: 'User management is not available in the static build.' } }
  }

  // ----------------------------- Locations -----------------------------
  if (pathname === '/api/locations' && method === 'GET') {
    return { status: 200, body: { locations: store.getAllLocations() } }
  }
  if (pathname === '/api/locations' && method === 'POST') {
    const { name, latitude, longitude, timezone, isDefault } = body || {}
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 100) {
      return { status: 400, body: { error: 'Location name must be between 1 and 100 characters.' } }
    }
    const lat = Number(latitude)
    const lon = Number(longitude)
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      return { status: 400, body: { error: 'Latitude must be between -90 and 90.' } }
    }
    if (Number.isNaN(lon) || lon < -180 || lon > 180) {
      return { status: 400, body: { error: 'Longitude must be between -180 and 180.' } }
    }
    const created = store.saveLocation({
      name: name.trim(),
      latitude: lat,
      longitude: lon,
      timezone: typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'auto',
      isDefault: Boolean(isDefault),
    })
    await staticMonitor.executeCycle(created.id, true)
    return { status: 200, body: { success: true, location: created } }
  }
  if (pathname === '/api/locations/search') {
    const query = search.get('query') || search.get('q') || ''
    const results = await searchGeocodingLocations(query.trim())
    return { status: 200, body: { results } }
  }
  const defaultMatch = pathname.match(/^\/api\/locations\/([^/]+)\/default$/)
  if (defaultMatch) {
    store.setDefaultLocation(defaultMatch[1])
    return { status: 200, body: { success: true } }
  }
  const deleteMatch = pathname.match(/^\/api\/locations\/([^/]+)$/)
  if (deleteMatch && method === 'DELETE') {
    const ok = store.deleteLocation(deleteMatch[1])
    if (!ok) return { status: 400, body: { error: 'The default location cannot be deleted.' } }
    return { status: 200, body: { success: true } }
  }

  // ----------------------------- Weather -----------------------------
  if (pathname === '/api/weather/current') {
    const targetLoc = resolveLocation(search.get('locationId'))
    if (!targetLoc) return { status: 404, body: { error: 'No location configured.' } }

    let observation = store.getLatestObservation(targetLoc.id)
    let risk = store.getLatestRiskAssessment(targetLoc.id)
    if (!observation || !risk) {
      await staticMonitor.executeCycle(targetLoc.id, true)
      observation = store.getLatestObservation(targetLoc.id)
      risk = store.getLatestRiskAssessment(targetLoc.id)
    }
    const monitorStatus = staticMonitor.getStatus()
    const freshness = evaluateFreshness(observation, settings.monitorIntervalMinutes)
    return {
      status: 200,
      body: {
        location: targetLoc,
        current: observation,
        risk,
        activeAlerts: store.getActiveAlerts(targetLoc.id),
        monitorStatus,
        comparison: store.getLatestCrossReference(targetLoc.id),
        hasWeatherApiKey: false,
        activeProvider: 'Open-Meteo',
        dataStatus: freshness.status,
        freshness,
      },
    }
  }

  if (pathname === '/api/weather/forecast') {
    const targetLoc = resolveLocation(search.get('locationId'))
    if (!targetLoc) return { status: 404, body: { error: 'No location configured.' } }
    let forecast = store.getLatestForecastSnapshot(targetLoc.id)
    if (!forecast || !forecast.hourly || forecast.hourly.length === 0) {
      await staticMonitor.executeCycle(targetLoc.id, true)
      forecast = store.getLatestForecastSnapshot(targetLoc.id)
    }
    return {
      status: 200,
      body: {
        location: targetLoc,
        hourly: forecast?.hourly || [],
        daily: forecast?.daily || [],
        fetchedAt: forecast?.fetchedAt || null,
      },
    }
  }

  if (pathname === '/api/weather/cross-reference') {
    const targetLoc = resolveLocation(search.get('locationId'))
    if (!targetLoc) return { status: 404, body: { error: 'No location configured.' } }
    let comparison = store.getLatestCrossReference(targetLoc.id)
    if (!comparison) {
      await staticMonitor.executeCycle(targetLoc.id, true)
      comparison = store.getLatestCrossReference(targetLoc.id)
    }
    return {
      status: 200,
      body: { location: targetLoc, comparison, hasWeatherApiKey: false, activeProvider: 'Open-Meteo' },
    }
  }

  if (pathname === '/api/weather/history') {
    const locId = search.get('locationId')
    const range = search.get('range') || 'today'
    const targetLoc = locId ? store.getLocation(locId) : store.getDefaultLocation()
    if (!targetLoc) return { status: 404, body: { error: 'Location not found.' } }
    const observations = store.getHistoricalObservations(
      targetLoc.id,
      (range as 'today' | 'yesterday' | '7days' | '30days') || 'today',
    )
    return { status: 200, body: { location: targetLoc, range, observations } }
  }

  // ----------------------------- Monitor controls -----------------------------
  if (pathname === '/api/monitor/check-now') {
    const result = await staticMonitor.executeCycle(body?.locationId, true)
    if (!result.success) return { status: 500, body: { error: result.error } }
    return { status: 200, body: { success: true, message: 'Weather check completed successfully.' } }
  }
  if (pathname === '/api/monitor/toggle') {
    const enable = Boolean(body?.enable)
    store.saveOwnerSettings({ monitoringEnabled: enable })
    if (enable) await staticMonitor.start()
    else staticMonitor.stop()
    return { status: 200, body: { success: true, status: staticMonitor.getStatus() } }
  }

  // ----------------------------- Alerts -----------------------------
  if (pathname === '/api/alerts' || pathname === '/api/alerts/history') {
    return {
      status: 200,
      body: { alerts: store.getAlertHistory(50), deliveries: store.getAlertDeliveries(50) },
    }
  }
  const dismissMatch = pathname.match(/^\/api\/alerts\/([^/]+)\/dismiss$/)
  if (dismissMatch) {
    store.updateAlertStatus(dismissMatch[1], 'DISMISSED')
    return { status: 200, body: { success: true } }
  }

  // ----------------------------- Performance report -----------------------------
  if (pathname === '/api/reports/weekly') {
    const targetLoc = resolveLocation(search.get('locationId'))
    if (!targetLoc) return { status: 404, body: { error: 'Location not found.' } }

    const summary = buildWeeklyPerformanceSummary({
      locationId: targetLoc.id,
      locationName: targetLoc.name,
      monitoringEnabled: settings.monitoringEnabled,
      intervalMinutes: settings.monitorIntervalMinutes,
      monitorStatus: staticMonitor.getStatus(),
      observations: store.getHistoricalObservations(targetLoc.id, '7days'),
      alerts: store.getAlertHistory(200),
      runs: store.getRecentMonitorRuns(200),
    })
    return { status: 200, body: summary }
  }

  // ----------------------------- Health -----------------------------
  if (pathname === '/api/health') {
    return { status: 200, body: buildHealth() }
  }

  // ----------------------------- Data management -----------------------------
  if (pathname === '/api/data/backup/list') {
    return { status: 200, body: { backups: [] } }
  }
  if (pathname === '/api/data/backup/create' || pathname === '/api/data/backup') {
    return { status: 400, body: { error: 'Server-side backups are not available in the static build.' } }
  }
  if (pathname === '/api/data/retention/run') {
    const result = store.enforceDataRetention(settings.dataRetentionDays || 30)
    return { status: 200, body: { success: true, result } }
  }
  if (pathname === '/api/data/clear') {
    const target = body?.target
    if (target === 'cache') {
      store.enforceDataRetention(settings.dataRetentionDays || 30)
    } else {
      store.clearData()
    }
    return { status: 200, body: { success: true } }
  }

  return { status: 404, body: { error: `No static handler for ${method} ${pathname}` } }
}
