import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { Navbar } from './components/Navbar'
import { HeroRiskCard } from './components/HeroRiskCard'
import { CurrentConditions } from './components/CurrentConditions'
import { HourlyForecastBar } from './components/HourlyForecastBar'
import { ActiveAlertsPanel } from './components/ActiveAlertsPanel'
import { LocationModal } from './components/LocationModal'
import { LoginScreen } from './components/LoginScreen'
import { LightningQuickCard } from './components/LightningQuickCard'
import { useToast } from './components/ToastProvider'
import { lazyNamed, ViewLoadingFallback } from './components/LazyBoundary'
import type { MapLayer } from './components/WeatherMapView'

// Code-split non-dashboard views. Recharts (used by ForecastView and
// HistoricalView) and the large settings/report surfaces are only fetched
// when the operator navigates to them.
const ForecastView = lazyNamed(() => import('./components/ForecastView'), 'ForecastView')
const AlertHistoryView = lazyNamed(() => import('./components/AlertHistoryView'), 'AlertHistoryView')
const HistoricalView = lazyNamed(() => import('./components/HistoricalView'), 'HistoricalView')
const ReportsView = lazyNamed(() => import('./components/ReportsView'), 'ReportsView')
const SettingsView = lazyNamed(() => import('./components/SettingsView'), 'SettingsView')
const UsersView = lazyNamed(() => import('./components/UsersView'), 'UsersView')
const ActivityRiskView = lazyNamed(() => import('./components/ActivityRiskView'), 'ActivityRiskView')
const PerformanceView = lazyNamed(() => import('./components/PerformanceView'), 'PerformanceView')
const WeatherMapView = lazyNamed(() => import('./components/WeatherMapView'), 'WeatherMapView')
import {
  CurrentWeather,
  RiskAssessment,
  AlertItem,
  AlertDelivery,
  HourlyForecastItem,
  DailyForecastItem,
  LocationItem,
  MonitorStatus,
  ProviderComparison,
  OwnerSettings,
  UserRole,
} from './types'
import { fetchRealWeatherData } from './services/weatherService'
import { calculateDeterministicRisk } from './services/riskEngine'
import { CrossReferenceCard } from './components/CrossReferenceCard'
import { apiFetch } from './utils/api'
import { deepEqual, setStateIfChanged } from './utils/state'
import { initKeepAwake } from './utils/wakeLock'
import { STATIC_MODE } from './static/mode'
import { ShieldCheck, HardHat, WifiOff } from 'lucide-react'

const FALLBACK_SITE: LocationItem = {
  id: 'loc-default',
  name: 'Adelaide, South Australia',
  latitude: -34.9285,
  longitude: 138.6007,
  timezone: 'Australia/Adelaide',
  isDefault: true,
  createdAt: new Date().toISOString(),
}

export default function App() {
  const toast = useToast()

  // Authentication State
  const [authChecking, setAuthChecking] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isFirstRun, setIsFirstRun] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState('owner@local')
  const [userRole, setUserRole] = useState<UserRole>('VIEWER')

  // App Navigation & Modals
  const [activeTab, setActiveTab] = useState('dashboard')
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false)
  // Map tab focus: the lightning quick-card opens the map with the storm layer on.
  const [mapInitialLayers, setMapInitialLayers] = useState<MapLayer[]>(['radar', 'wind'])
  const [mapKey, setMapKey] = useState(0)

  // Weather & Risk State
  const [currentLocation, setCurrentLocation] = useState<LocationItem | null>(FALLBACK_SITE)
  const [allLocations, setAllLocations] = useState<LocationItem[]>([FALLBACK_SITE])
  const [currentWeather, setCurrentWeather] = useState<CurrentWeather | null>(null)
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessment | null>(null)
  const [activeAlerts, setActiveAlerts] = useState<AlertItem[]>([])
  const [allAlerts, setAllAlerts] = useState<AlertItem[]>([])
  const [alertDeliveries, setAlertDeliveries] = useState<AlertDelivery[]>([])
  const [hourlyForecast, setHourlyForecast] = useState<HourlyForecastItem[]>([])
  const [dailyForecast, setDailyForecast] = useState<DailyForecastItem[]>([])
  const [isDashboardLoading, setIsDashboardLoading] = useState<boolean>(true)
  const [ownerSettings, setOwnerSettings] = useState<OwnerSettings | null>(null)

  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus>({
    status: 'ACTIVE',
    isRunning: true,
    isChecking: false,
    lastCheckTime: null,
    nextCheckTime: null,
    lastError: null,
    consecutiveFailures: 0,
  })
  const [dataStatus, setDataStatus] = useState<'LIVE' | 'CACHED' | 'OFFLINE' | 'UNAVAILABLE'>('LIVE')
  const [providerComparison, setProviderComparison] = useState<ProviderComparison | null>(null)
  const [hasWeatherApiKey, setHasWeatherApiKey] = useState<boolean>(true)
  const [activeProvider, setActiveProvider] = useState<string>('WeatherAPI (Main Reference)')
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  // Track connectivity so operators know when they are viewing cached data.
  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // `currentLocationRef` always holds the freshest location so the polling
  // callback never needs `currentLocation` in its dependency list. Depending on
  // it previously created a fetch/render feedback loop: every poll replaced the
  // location object, which changed the callback identity, which re-ran the
  // effect, which fetched again — the source of the constant flicker.
  const currentLocationRef = useRef<LocationItem | null>(currentLocation)

  const applyLocation = useCallback((loc: LocationItem) => {
    currentLocationRef.current = loc
    // Keep the previous state object when the payload is unchanged so memoised
    // children receiving `currentLocation` don't re-render on every poll.
    setStateIfChanged(setCurrentLocation, loc)
  }, [])

  // Broadcast newly triggered alerts to the operator while the dashboard is
  // open. The in-browser monitor also raises OS notifications; this keeps
  // severe alerts visible in-app even when notifications are off or unsupported.
  const seenAlertIds = useRef<Set<string>>(new Set())
  const alertsSeeded = useRef(false)
  const markAlertsSeen = useCallback((list: AlertItem[]) => {
    for (const alert of list) seenAlertIds.current.add(alert.id)
  }, [])
  useEffect(() => {
    for (const alert of activeAlerts) {
      if (seenAlertIds.current.has(alert.id)) continue
      seenAlertIds.current.add(alert.id)
      const label = `${alert.severity} · ${alert.title} (${alert.locationName})`
      if (alert.severity === 'CRITICAL') toast.error(label)
      else if (alert.severity === 'HIGH') toast.warning(label)
      else toast.info(label)
    }
  }, [activeAlerts, toast])

  // Authorized API caller. Authentication rides on the HttpOnly session cookie;
  // CSRF is handled automatically inside apiFetch.
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        const res = await apiFetch('/api/auth/status')
        if (res.ok) {
          const data = await res.json()
          setIsAuthenticated(Boolean(data.authenticated))
          setIsFirstRun(Boolean(data.isFirstRun))
          if (data.email) setOwnerEmail(data.email)
          if (data.role) setUserRole(data.role)
        } else {
          setIsAuthenticated(false)
        }
      } catch {
        setIsAuthenticated(false)
      } finally {
        setAuthChecking(false)
      }
    }
    verifyAuth()
  }, [])

  // Handle successful login or first-run setup
  const handleAuthenticated = useCallback(
    (email: string, role: UserRole = 'OWNER') => {
      setIsAuthenticated(true)
      setIsFirstRun(false)
      setOwnerEmail(email)
      setUserRole(role)
      toast.success('Site Safety Enclave unlocked.')
      // `loadDashboardData` is referentially stable; calling it from here keeps
      // this callback stable too without a TDZ-sensitive dependency entry.
      void loadDashboardData({ showLoading: true })
    },
    [toast],
  )

  // Handle logout / session lock
  const handleLogout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {}
    setIsAuthenticated(false)
    setUserRole('VIEWER')
    toast.info('Safety Enclave session locked.')
  }, [toast])

  // Resiliently load weather data from backend or fallback to direct Open-Meteo client fetching.
  // The callback is referentially stable (it reads the location from a ref and
  // only writes state through `setStateIfChanged`), so the polling effect below
  // runs once instead of on every render.
  const loadDashboardData = useCallback(
    async (options: { showLoading?: boolean } = {}) => {
      const { showLoading = false } = options
      const loc = currentLocationRef.current || FALLBACK_SITE
      let weatherLoaded = false
      // Only show the skeleton for explicit/initial loads; background polls
      // refresh silently so the dashboard never flashes.
      if (showLoading) setIsDashboardLoading(true)

      // 0. Fetch Owner Settings for units and intervals
      try {
        const setRes = await apiFetch('/api/settings')
        if (setRes.ok) {
          const setData = await setRes.json()
          if (setData.settings) setStateIfChanged(setOwnerSettings, setData.settings)
        }
      } catch {}

      // 1. Try to fetch Current Weather & Risk from backend API
      try {
        const currentRes = await apiFetch(`/api/weather/current?locationId=${loc.id}`)
        if (currentRes.ok) {
          const data = await currentRes.json()
          if (data.location) applyLocation(data.location)
          if (data.current) {
            setStateIfChanged(setCurrentWeather, data.current)
            weatherLoaded = true
          }
          if (data.risk) setStateIfChanged(setRiskAssessment, data.risk)
          if (data.activeAlerts) {
            // Seed the "already notified" set on the first load so pre-existing
            // alerts don't spam toasts; later polls surface only genuinely new ones.
            if (!alertsSeeded.current) {
              markAlertsSeen(data.activeAlerts)
              alertsSeeded.current = true
            }
            setStateIfChanged(setActiveAlerts, data.activeAlerts)
          }
          if (data.monitorStatus) {
            setMonitorStatus((prev) => {
              const next = { ...data.monitorStatus, isChecking: prev.isChecking }
              return deepEqual(prev, next) ? prev : next
            })
          }
          if (data.dataStatus) setDataStatus(data.dataStatus)
          if (data.comparison) setStateIfChanged(setProviderComparison, data.comparison)
          if (typeof data.hasWeatherApiKey === 'boolean') setHasWeatherApiKey(data.hasWeatherApiKey)
          if (data.activeProvider) setActiveProvider(data.activeProvider)
        }
      } catch {
        // Backend temporarily unavailable / restarting
      }

      // 2. Fetch Cross-Reference Comparison if not already in current
      try {
        const crossRes = await apiFetch(`/api/weather/cross-reference?locationId=${loc.id}`)
        if (crossRes.ok) {
          const cData = await crossRes.json()
          if (cData.comparison) setStateIfChanged(setProviderComparison, cData.comparison)
          if (typeof cData.hasWeatherApiKey === 'boolean') setHasWeatherApiKey(cData.hasWeatherApiKey)
          if (cData.activeProvider) setActiveProvider(cData.activeProvider)
        }
      } catch {}

      // 3. Fetch Locations List from backend
      try {
        const locsRes = await apiFetch('/api/locations')
        if (locsRes.ok) {
          const locsData = await locsRes.json()
          if (Array.isArray(locsData.locations) && locsData.locations.length > 0) {
            setStateIfChanged(setAllLocations, locsData.locations)
          }
        }
      } catch {}

      // 4. Fetch Forecast Details from backend
      try {
        const forecastRes = await apiFetch(`/api/weather/forecast?locationId=${loc.id}`)
        if (forecastRes.ok) {
          const fData = await forecastRes.json()
          if (Array.isArray(fData.hourly) && fData.hourly.length > 0)
            setStateIfChanged(setHourlyForecast, fData.hourly)
          if (Array.isArray(fData.daily) && fData.daily.length > 0)
            setStateIfChanged(setDailyForecast, fData.daily)
        }
      } catch {}

      // 5. Fetch Alerts & Deliveries from backend
      try {
        const alertsRes = await apiFetch('/api/alerts')
        if (alertsRes.ok) {
          const aData = await alertsRes.json()
          if (Array.isArray(aData.alerts)) setStateIfChanged(setAllAlerts, aData.alerts)
          if (Array.isArray(aData.deliveries)) setStateIfChanged(setAlertDeliveries, aData.deliveries)
        }
      } catch {}

      // 6. Direct Client Fallback: If backend weather was not fetched, query directly from Open-Meteo
      if (!weatherLoaded) {
        try {
          const livePayload = await fetchRealWeatherData(
            loc.latitude,
            loc.longitude,
            loc.id,
            loc.name,
            loc.timezone,
          )
          const risk = calculateDeterministicRisk(
            livePayload.current,
            livePayload.hourly,
            undefined,
            loc.timezone,
          )
          setStateIfChanged(setCurrentWeather, livePayload.current)
          setStateIfChanged(setRiskAssessment, risk)
          setStateIfChanged(setHourlyForecast, livePayload.hourly)
          setStateIfChanged(setDailyForecast, livePayload.daily)
          if (livePayload.comparison) setStateIfChanged(setProviderComparison, livePayload.comparison)
          setDataStatus('LIVE')
          setMonitorStatus((prev) => ({
            ...prev,
            status: 'ACTIVE',
            isRunning: true,
            lastCheckTime: new Date().toISOString(),
          }))
        } catch (err) {
          console.warn('Direct weather query failed:', err)
        }
      }

      setIsDashboardLoading(false)
    },
    [applyLocation, markAlertsSeen],
  )

  useEffect(() => {
    if (!isAuthenticated) return
    void loadDashboardData({ showLoading: true })

    // Poll every 30s for fresh monitor status (silent background refresh). The
    // poll is suspended while the tab is hidden — a hidden timer keeps the
    // phone radio and CPU awake for no benefit — and resumes with an immediate
    // refresh when the operator returns. This is the single biggest mobile
    // battery/CPU win and eliminates background render churn.
    let interval: ReturnType<typeof setInterval> | null = null
    const startPolling = () => {
      if (interval) return
      interval = setInterval(() => {
        void loadDashboardData()
      }, 30000)
    }
    const stopPolling = () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadDashboardData()
        startPolling()
      } else {
        stopPolling()
      }
    }

    startPolling()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [isAuthenticated, loadDashboardData])

  // Re-apply the operator's persisted "keep screen awake" preference once the
  // app is interactive. No-op where the Screen Wake Lock API is unsupported.
  useEffect(() => {
    void initKeepAwake()
  }, [])

  // Explicit, user-triggered refresh that shows the skeleton.
  const refreshDashboard = useCallback(() => {
    void loadDashboardData({ showLoading: true })
  }, [loadDashboardData])

  // Execute manual weather check
  const handleRunCheckNow = useCallback(async () => {
    setMonitorStatus((prev) => ({ ...prev, isChecking: true }))
    toast.info('Executing immediate weather observation cycle...')

    let serverFailed = false
    try {
      const res = await apiFetch('/api/monitor/check-now', { method: 'POST' })
      if (res.ok) {
        await loadDashboardData()
        toast.success('Site microclimate conditions updated.')
        return
      }
      serverFailed = true
    } catch {
      serverFailed = true
    }

    // The server cycle could not run (offline enclave, busy monitor). Fall
    // back to a direct provider query and say so rather than claiming the
    // site check succeeded.
    try {
      const loc = currentLocationRef.current || FALLBACK_SITE
      const livePayload = await fetchRealWeatherData(
        loc.latitude,
        loc.longitude,
        loc.id,
        loc.name,
        loc.timezone,
      )
      const risk = calculateDeterministicRisk(
        livePayload.current,
        livePayload.hourly,
        undefined,
        loc.timezone,
      )
      setStateIfChanged(setCurrentWeather, livePayload.current)
      setStateIfChanged(setRiskAssessment, risk)
      setStateIfChanged(setHourlyForecast, livePayload.hourly)
      setStateIfChanged(setDailyForecast, livePayload.daily)
      setDataStatus(serverFailed ? 'CACHED' : 'LIVE')
      if (serverFailed) {
        toast.warning('Server check could not run. Showing a direct provider reading instead.')
      } else {
        toast.success('Direct observations refreshed.')
      }
    } catch {
      toast.error('Unable to fetch live weather observations.')
    } finally {
      setMonitorStatus((prev) => ({
        ...prev,
        isChecking: false,
        lastCheckTime: serverFailed ? null : new Date().toISOString(),
      }))
    }
  }, [toast, loadDashboardData])

  // Dismiss / Acknowledge active alert
  const handleDismissAlert = useCallback(
    async (id: string) => {
      let acknowledged = false
      try {
        const res = await apiFetch(`/api/alerts/${id}/dismiss`, { method: 'POST' })
        acknowledged = res.ok
        if (!acknowledged) {
          const err = await res.json().catch(() => null)
          throw new Error(err?.error || `Dismiss failed (${res.status}).`)
        }
      } catch (err: any) {
        // Keep the alert on screen: removing it would hide a live safety
        // condition the system still considers active.
        toast.error(err?.message || 'Failed to dismiss alert.')
        return
      }
      setActiveAlerts((prev) => prev.filter((a) => a.id !== id))
      toast.info('Alert acknowledged and dismissed.')
    },
    [toast],
  )

  // Switch location with fallback
  const handleSelectLocation = useCallback(
    async (loc: LocationItem) => {
      applyLocation(loc)
      setIsDashboardLoading(true)
      toast.info(`Switching location to ${loc.name}...`)

      let loaded = false
      let serverError: string | null = null

      try {
        const res = await apiFetch(`/api/weather/current?locationId=${loc.id}`)
        if (res.ok) {
          const data = await res.json()
          setStateIfChanged(setCurrentWeather, data.current)
          setStateIfChanged(setRiskAssessment, data.risk)
          const nextAlerts: AlertItem[] = data.activeAlerts || []
          // Mark the destination's existing alerts as seen so switching sites
          // doesn't replay their toasts.
          markAlertsSeen(nextAlerts)
          setStateIfChanged(setActiveAlerts, nextAlerts)
          if (data.comparison) setStateIfChanged(setProviderComparison, data.comparison)
          loaded = true

          const forecastRes = await apiFetch(`/api/weather/forecast?locationId=${loc.id}`)
          if (forecastRes.ok) {
            const fData = await forecastRes.json()
            setStateIfChanged(setHourlyForecast, fData.hourly || [])
            setStateIfChanged(setDailyForecast, fData.daily || [])
          }
          const crossRes = await apiFetch(`/api/weather/cross-reference?locationId=${loc.id}`)
          if (crossRes.ok) {
            const cData = await crossRes.json()
            if (cData.comparison) setStateIfChanged(setProviderComparison, cData.comparison)
          }
        } else {
          const err = await res.json().catch(() => null)
          serverError = err?.error || `Server returned ${res.status}.`
        }
      } catch {
        serverError = 'Connection to the safety enclave failed.'
      }

      // The server could not serve this site (offline, unknown id). Only then
      // do we query the provider directly, and we say so instead of claiming
      // the monitoring shift succeeded.
      if (!loaded) {
        try {
          const livePayload = await fetchRealWeatherData(
            loc.latitude,
            loc.longitude,
            loc.id,
            loc.name,
            loc.timezone,
          )
          const risk = calculateDeterministicRisk(
            livePayload.current,
            livePayload.hourly,
            undefined,
            loc.timezone,
          )
          setStateIfChanged(setCurrentWeather, livePayload.current)
          setStateIfChanged(setRiskAssessment, risk)
          setStateIfChanged(setHourlyForecast, livePayload.hourly)
          setStateIfChanged(setDailyForecast, livePayload.daily)
          if (livePayload.comparison) setStateIfChanged(setProviderComparison, livePayload.comparison)
          setDataStatus('CACHED')
          toast.warning(`Server unavailable — showing a direct provider reading for ${loc.name}.`)
        } catch {
          toast.error(
            serverError
              ? `Failed to load ${loc.name}: ${serverError}`
              : `Failed to load weather for ${loc.name}`,
          )
        }
      } else {
        toast.success(`Active monitoring shifted to ${loc.name}`)
      }

      setIsDashboardLoading(false)
    },
    [applyLocation, markAlertsSeen, toast],
  )

  const openLocationModal = useCallback(() => setIsLocationModalOpen(true), [])
  const closeLocationModal = useCallback(() => setIsLocationModalOpen(false), [])

  // Dashboard quick-tab → Map tab with the lightning layer pre-enabled.
  const openLightningMap = useCallback(() => {
    setMapInitialLayers(['radar', 'lightning'])
    setMapKey((k) => k + 1)
    setActiveTab('map')
  }, [])

  const elevatedActivities = useMemo(
    () =>
      riskAssessment?.affectedActivities.filter(
        (a) => a.riskLevel === 'HIGH' || a.riskLevel === 'CRITICAL',
      ) || [],
    [riskAssessment],
  )

  // Loading state while checking authentication
  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 text-amber-500 animate-pulse">
            <HardHat className="h-6 w-6" />
          </div>
          <span className="text-xs text-slate-500">Opening the safety enclave…</span>
        </div>
      </div>
    )
  }

  // Not authenticated: present master password / first run setup screen
  if (!isAuthenticated) {
    return (
      <LoginScreen isFirstRun={isFirstRun} ownerEmail={ownerEmail} onAuthenticated={handleAuthenticated} />
    )
  }

  const tempUnit = ownerSettings?.temperatureUnit || 'C'
  const windUnit = ownerSettings?.windUnit || 'km/h'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Top Fixed Industrial Navigation Header */}
      <Navbar
        currentLocation={currentLocation}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenLocations={openLocationModal}
        onRunCheck={handleRunCheckNow}
        onLogout={handleLogout}
        isChecking={monitorStatus.isChecking}
        monitorStatus={monitorStatus.status}
        dataStatus={dataStatus}
        lastCheckTime={monitorStatus.lastCheckTime}
        userRole={userRole}
        userEmail={ownerEmail}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-7 space-y-5">
        {!isOnline && (
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-200">
            <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              Offline — showing the last cached snapshot. Live checks resume automatically when the connection
              returns.
            </span>
          </div>
        )}
        <Suspense fallback={<ViewLoadingFallback label="Loading module" />}>
          {activeTab === 'dashboard' && (
            <div className="space-y-5 animate-fadeIn">
              {/* 1. Hero Risk Card (Dominant Dashboard Element) */}
              <HeroRiskCard
                risk={riskAssessment}
                locationName={currentLocation ? currentLocation.name : 'Monitored Site'}
                isLoading={isDashboardLoading}
              />

              {/* 2. Active Alerts (only this panel may sit above conditions) */}
              <ActiveAlertsPanel
                alerts={activeAlerts}
                onDismissAlert={handleDismissAlert}
                onViewAllAlerts={() => setActiveTab('alerts')}
              />

              {/* 3. Current Onsite Weather Conditions */}
              <CurrentConditions
                weather={currentWeather}
                tempUnit={tempUnit}
                windUnit={windUnit}
                isLoading={isDashboardLoading}
              />

              {/* 4. Hourly Outlook */}
              <HourlyForecastBar hourly={hourlyForecast} windUnit={windUnit} isLoading={isDashboardLoading} />

              {/* 5. Quick cards: activities + lightning, side by side on desktop */}
              <div className="grid gap-4 md:grid-cols-2">
                {riskAssessment && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('activity')}
                    className="group flex h-full flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-5 text-left transition-colors hover:border-slate-700/70 focus-visible:ring-2 focus-visible:ring-amber-500 outline-none"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-200">
                          <HardHat
                            className={`h-4 w-4 shrink-0 ${
                              elevatedActivities.length > 0 ? 'text-amber-400' : 'text-slate-500'
                            }`}
                          />
                          Activity risk
                        </h3>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {elevatedActivities.length > 0
                            ? `${elevatedActivities.length} at elevated risk: ${elevatedActivities
                                .slice(0, 3)
                                .map((a) => a.activity)
                                .join(', ')}${elevatedActivities.length > 3 ? '…' : ''}`
                            : 'All activities within safe thresholds.'}
                        </p>
                      </div>
                      {elevatedActivities.length > 0 && (
                        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-300">
                          {elevatedActivities.length}
                        </span>
                      )}
                    </div>
                    <span className="mt-auto pt-4 text-xs font-medium text-slate-500 transition-colors group-hover:text-slate-300">
                      View full matrix →
                    </span>
                  </button>
                )}

                {/* Lightning & storm quick-tab (jumps to the lightning map layer) */}
                <LightningQuickCard
                  current={currentWeather}
                  risk={riskAssessment}
                  onOpenMap={openLightningMap}
                />
              </div>

              {/* 6. Provider cross-reference — compact diagnostics, collapsed by default */}
              <CrossReferenceCard
                comparison={providerComparison}
                hasApiKey={hasWeatherApiKey}
                activeProvider={activeProvider}
                onRefresh={handleRunCheckNow}
                isChecking={monitorStatus.isChecking}
              />
            </div>
          )}

          {/* Activity Risk Matrix (dedicated tab) */}
          {activeTab === 'activity' && (
            <ActivityRiskView
              risk={riskAssessment}
              locationName={currentLocation ? currentLocation.name : 'Monitored Site'}
              isLoading={isDashboardLoading}
            />
          )}

          {/* Forecast View */}
          {activeTab === 'forecast' && (
            <ForecastView
              hourly={hourlyForecast}
              daily={dailyForecast}
              locationName={currentLocation ? currentLocation.name : 'Monitored Site'}
            />
          )}

          {/* Live weather map: radar, rain, wind & lightning */}
          {activeTab === 'map' && (
            <WeatherMapView
              key={mapKey}
              location={currentLocation}
              current={currentWeather}
              initialLayers={mapInitialLayers}
            />
          )}

          {/* Alerts & Delivery History */}
          {activeTab === 'alerts' && <AlertHistoryView alerts={allAlerts} deliveries={alertDeliveries} />}

          {/* Historical Observations (SQLite) */}
          {activeTab === 'history' && <HistoricalView location={currentLocation} />}

          {/* Printable Site Risk Report */}
          {activeTab === 'reports' && (
            <ReportsView
              location={currentLocation}
              current={currentWeather}
              risk={riskAssessment}
              alerts={activeAlerts}
            />
          )}

          {/* Weekly Performance Summary */}
          {activeTab === 'performance' && <PerformanceView location={currentLocation} />}

          {/* Settings & Threshold Calibration */}
          {activeTab === 'settings' && (
            <SettingsView onSettingsSaved={refreshDashboard} userRole={STATIC_MODE ? 'OWNER' : userRole} />
          )}

          {/* User & Access Management (Owner only) */}
          {activeTab === 'users' && <UsersView />}
        </Suspense>
      </main>

      {/* Location Selector Modal */}
      <LocationModal
        isOpen={isLocationModalOpen}
        onClose={closeLocationModal}
        locations={allLocations}
        currentLocation={currentLocation}
        onSelectLocation={handleSelectLocation}
        onLocationAdded={refreshDashboard}
        userRole={userRole}
      />

      {/* Mandatory Section 93 Privacy Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950 py-6 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5 text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-500/80" />
            <span>Private local system — no advertising, analytics or tracking.</span>
          </div>
          <p className="text-slate-600 text-center sm:text-right">
            {STATIC_MODE ? (
              <>
                Weather data by{' '}
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-400 underline decoration-slate-700"
                >
                  Open-Meteo
                </a>{' '}
                (CC BY 4.0) · data stored in your browser (IndexedDB)
              </>
            ) : (
              <>
                WeatherAPI +{' '}
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-400 underline decoration-slate-700"
                >
                  Open-Meteo
                </a>{' '}
                (CC BY 4.0) · data stored locally in SQLite with backup rotation
              </>
            )}
          </p>
        </div>
      </footer>
    </div>
  )
}
