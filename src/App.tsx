import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Navbar } from './components/Navbar';
import { HeroRiskCard } from './components/HeroRiskCard';
import { CurrentConditions } from './components/CurrentConditions';
import { HourlyForecastBar } from './components/HourlyForecastBar';
import { ConstructionImpacts } from './components/ConstructionImpacts';
import { ActiveAlertsPanel } from './components/ActiveAlertsPanel';
import { LocationModal } from './components/LocationModal';
import { LoginScreen } from './components/LoginScreen';
import { useToast } from './components/ToastProvider';
import { lazyNamed, ViewLoadingFallback } from './components/LazyBoundary';

// Code-split non-dashboard views. Recharts (used by ForecastView and
// HistoricalView) and the large settings/report surfaces are only fetched
// when the operator navigates to them.
const ForecastView = lazyNamed(() => import('./components/ForecastView'), 'ForecastView');
const AlertHistoryView = lazyNamed(() => import('./components/AlertHistoryView'), 'AlertHistoryView');
const HistoricalView = lazyNamed(() => import('./components/HistoricalView'), 'HistoricalView');
const ReportsView = lazyNamed(() => import('./components/ReportsView'), 'ReportsView');
const SystemHealthView = lazyNamed(() => import('./components/SystemHealthView'), 'SystemHealthView');
const SettingsView = lazyNamed(() => import('./components/SettingsView'), 'SettingsView');
const UsersView = lazyNamed(() => import('./components/UsersView'), 'UsersView');
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
  UserRole
} from './types';
import { fetchRealWeatherData } from './services/weatherService';
import { calculateDeterministicRisk } from './services/riskEngine';
import { CrossReferenceCard } from './components/CrossReferenceCard';
import { AiBriefingCard } from './components/AiBriefingCard';
import { ShieldCheck, Database, HardHat, CheckCircle2, ArrowRightLeft, WifiOff } from 'lucide-react';

const FALLBACK_SITE: LocationItem = {
  id: 'loc-default',
  name: 'Unconfigured Site',
  latitude: 0,
  longitude: 0,
  timezone: 'UTC',
  isDefault: true,
  createdAt: new Date().toISOString()
};

export default function App() {
  const toast = useToast();

  // Authentication State
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('owner@local');
  const [userRole, setUserRole] = useState<UserRole>('VIEWER');

  // App Navigation & Modals
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  // Weather & Risk State
  const [currentLocation, setCurrentLocation] = useState<LocationItem | null>(FALLBACK_SITE);
  const [allLocations, setAllLocations] = useState<LocationItem[]>([FALLBACK_SITE]);
  const [currentWeather, setCurrentWeather] = useState<CurrentWeather | null>(null);
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessment | null>(null);
  const [activeAlerts, setActiveAlerts] = useState<AlertItem[]>([]);
  const [allAlerts, setAllAlerts] = useState<AlertItem[]>([]);
  const [alertDeliveries, setAlertDeliveries] = useState<AlertDelivery[]>([]);
  const [hourlyForecast, setHourlyForecast] = useState<HourlyForecastItem[]>([]);
  const [dailyForecast, setDailyForecast] = useState<DailyForecastItem[]>([]);
  const [isDashboardLoading, setIsDashboardLoading] = useState<boolean>(true);
  const [ownerSettings, setOwnerSettings] = useState<OwnerSettings | null>(null);

  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus>({
    status: 'ACTIVE',
    isRunning: true,
    isChecking: false,
    lastCheckTime: null,
    nextCheckTime: null,
    lastError: null,
    consecutiveFailures: 0
  });
  const [dataStatus, setDataStatus] = useState<'LIVE' | 'CACHED' | 'OFFLINE' | 'UNAVAILABLE'>('LIVE');
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [providerComparison, setProviderComparison] = useState<ProviderComparison | null>(null);
  const [hasWeatherApiKey, setHasWeatherApiKey] = useState<boolean>(true);
  const [activeProvider, setActiveProvider] = useState<string>('WeatherAPI (Main Reference)');
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  // Track connectivity so operators know when they are viewing cached data.
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Authorized API caller with session token & cookie backup
  const apiFetch = useCallback(async (url: string, init?: RequestInit): Promise<Response> => {
    const token = localStorage.getItem('cwm_session_token');
    const headers = new Headers(init?.headers || {});
    if (token) {
      headers.set('x-session-token', token);
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(url, { ...init, headers });
  }, []);

  // Check authentication status on startup
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        const res = await apiFetch('/api/auth/status');
        if (res.ok) {
          const data = await res.json();
          setIsAuthenticated(Boolean(data.authenticated));
          setIsFirstRun(Boolean(data.isFirstRun));
          if (data.email) setOwnerEmail(data.email);
          if (data.role) setUserRole(data.role);
        } else {
          setIsAuthenticated(false);
        }
      } catch {
        setIsAuthenticated(false);
      } finally {
        setAuthChecking(false);
      }
    };
    verifyAuth();
  }, [apiFetch]);

  // Handle successful login or first-run setup
  const handleAuthenticated = (token: string, email: string, role: UserRole = 'OWNER') => {
    localStorage.setItem('cwm_session_token', token);
    setIsAuthenticated(true);
    setIsFirstRun(false);
    setOwnerEmail(email);
    setUserRole(role);
    toast.success('Site Safety Enclave unlocked.');
    loadDashboardData();
  };

  // Handle logout / session lock
  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('cwm_session_token');
    setIsAuthenticated(false);
    setUserRole('VIEWER');
    toast.info('Safety Enclave session locked.');
  };

  // Resiliently load weather data from backend or fallback to direct Open-Meteo client fetching
  const loadDashboardData = useCallback(async () => {
    let weatherLoaded = false;
    let targetLoc = currentLocation || FALLBACK_SITE;
    setIsDashboardLoading(true);

    // 0. Fetch Owner Settings for units and intervals
    try {
      const setRes = await apiFetch('/api/settings');
      if (setRes.ok) {
        const setData = await setRes.json();
        if (setData.settings) {
          setOwnerSettings(setData.settings);
        }
      }
    } catch {}

    // 1. Try to fetch Current Weather & Risk from backend API
    try {
      const currentRes = await apiFetch(`/api/weather/current${currentLocation ? `?locationId=${currentLocation.id}` : ''}`);
      if (currentRes.ok) {
        const data = await currentRes.json();
        if (data.location) {
          targetLoc = data.location;
          setCurrentLocation(data.location);
        }
        if (data.current) {
          setCurrentWeather(data.current);
          weatherLoaded = true;
        }
        if (data.risk) setRiskAssessment(data.risk);
        if (data.activeAlerts) setActiveAlerts(data.activeAlerts);
        if (data.monitorStatus) setMonitorStatus(data.monitorStatus);
        if (data.dataStatus) setDataStatus(data.dataStatus);
        if (data.comparison) setProviderComparison(data.comparison);
        if (typeof data.hasWeatherApiKey === 'boolean') setHasWeatherApiKey(data.hasWeatherApiKey);
        if (data.activeProvider) setActiveProvider(data.activeProvider);
      }
    } catch {
      // Backend temporarily unavailable / restarting
    }

    // 2. Fetch Cross-Reference Comparison if not already in current
    try {
      const crossRes = await apiFetch(`/api/weather/cross-reference${currentLocation ? `?locationId=${currentLocation.id}` : ''}`);
      if (crossRes.ok) {
        const cData = await crossRes.json();
        if (cData.comparison) setProviderComparison(cData.comparison);
        if (typeof cData.hasWeatherApiKey === 'boolean') setHasWeatherApiKey(cData.hasWeatherApiKey);
        if (cData.activeProvider) setActiveProvider(cData.activeProvider);
      }
    } catch {}

    // 3. Fetch Locations List from backend
    try {
      const locsRes = await apiFetch('/api/locations');
      if (locsRes.ok) {
        const locsData = await locsRes.json();
        if (Array.isArray(locsData.locations) && locsData.locations.length > 0) {
          setAllLocations(locsData.locations);
        }
      }
    } catch {}

    // 4. Fetch Forecast Details from backend
    try {
      const forecastRes = await apiFetch(`/api/weather/forecast${currentLocation ? `?locationId=${currentLocation.id}` : ''}`);
      if (forecastRes.ok) {
        const fData = await forecastRes.json();
        if (Array.isArray(fData.hourly) && fData.hourly.length > 0) setHourlyForecast(fData.hourly);
        if (Array.isArray(fData.daily) && fData.daily.length > 0) setDailyForecast(fData.daily);
      }
    } catch {}

    // 5. Fetch Alerts & Deliveries from backend
    try {
      const alertsRes = await apiFetch('/api/alerts');
      if (alertsRes.ok) {
        const aData = await alertsRes.json();
        if (Array.isArray(aData.alerts)) setAllAlerts(aData.alerts);
        if (Array.isArray(aData.deliveries)) setAlertDeliveries(aData.deliveries);
      }
    } catch {}

    // 6. Fetch Health Diagnostics from backend
    try {
      const healthRes = await apiFetch('/api/health');
      if (healthRes.ok) {
        const hData = await healthRes.json();
        setSystemHealth(hData);
      }
    } catch {}

    // 7. Direct Client Fallback: If backend weather was not fetched, query directly from Open-Meteo
    if (!weatherLoaded) {
      try {
        const livePayload = await fetchRealWeatherData(
          targetLoc.latitude,
          targetLoc.longitude,
          targetLoc.id,
          targetLoc.name,
          targetLoc.timezone
        );
        const risk = calculateDeterministicRisk(livePayload.current, livePayload.hourly, undefined, targetLoc.timezone);
        setCurrentWeather(livePayload.current);
        setRiskAssessment(risk);
        setHourlyForecast(livePayload.hourly);
        setDailyForecast(livePayload.daily);
        if (livePayload.comparison) setProviderComparison(livePayload.comparison);
        setDataStatus('LIVE');
        setMonitorStatus((prev) => ({
          ...prev,
          status: 'ACTIVE',
          isRunning: true,
          lastCheckTime: new Date().toISOString()
        }));
      } catch (err) {
        console.warn('Direct weather query failed:', err);
      }
    }

    setIsDashboardLoading(false);
  }, [currentLocation, apiFetch]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadDashboardData();
    // Poll every 30s for fresh monitor status
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, loadDashboardData]);

  // Execute manual weather check
  const handleRunCheckNow = async () => {
    setMonitorStatus((prev) => ({ ...prev, isChecking: true }));
    toast.info('Executing immediate weather observation cycle...');

    try {
      const res = await apiFetch('/api/monitor/check-now', { method: 'POST' });
      if (res.ok) {
        await loadDashboardData();
        toast.success('Site microclimate conditions updated.');
        return;
      }
    } catch {}

    // Fallback: direct refresh from Open-Meteo
    try {
      const loc = currentLocation || FALLBACK_SITE;
      const livePayload = await fetchRealWeatherData(
        loc.latitude,
        loc.longitude,
        loc.id,
        loc.name,
        loc.timezone
      );
      const risk = calculateDeterministicRisk(livePayload.current, livePayload.hourly, undefined, loc.timezone);
      setCurrentWeather(livePayload.current);
      setRiskAssessment(risk);
      setHourlyForecast(livePayload.hourly);
      setDailyForecast(livePayload.daily);
      setDataStatus('LIVE');
      toast.success('Direct observations refreshed.');
    } catch {
      toast.error('Unable to fetch live weather observations.');
    } finally {
      setMonitorStatus((prev) => ({
        ...prev,
        isChecking: false,
        lastCheckTime: new Date().toISOString()
      }));
    }
  };

  // Dismiss / Acknowledge active alert
  const handleDismissAlert = async (id: string) => {
    try {
      const res = await apiFetch(`/api/alerts/${id}/dismiss`, { method: 'POST' });
      if (res.ok) {
        setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
        toast.info('Alert acknowledged and dismissed.');
      } else {
        setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
    }
  };

  // Switch location with fallback
  const handleSelectLocation = async (loc: LocationItem) => {
    setCurrentLocation(loc);
    setIsDashboardLoading(true);
    toast.info(`Switching location to ${loc.name}...`);

    try {
      const res = await apiFetch(`/api/weather/current?locationId=${loc.id}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentWeather(data.current);
        setRiskAssessment(data.risk);
        setActiveAlerts(data.activeAlerts || []);
        if (data.comparison) setProviderComparison(data.comparison);
      }
      const forecastRes = await apiFetch(`/api/weather/forecast?locationId=${loc.id}`);
      if (forecastRes.ok) {
        const fData = await forecastRes.json();
        setHourlyForecast(fData.hourly || []);
        setDailyForecast(fData.daily || []);
      }
      const crossRes = await apiFetch(`/api/weather/cross-reference?locationId=${loc.id}`);
      if (crossRes.ok) {
        const cData = await crossRes.json();
        if (cData.comparison) setProviderComparison(cData.comparison);
      }
      toast.success(`Active monitoring shifted to ${loc.name}`);
    } catch {
      // Direct client fallback for selected location
      try {
        const livePayload = await fetchRealWeatherData(
          loc.latitude,
          loc.longitude,
          loc.id,
          loc.name,
          loc.timezone
        );
        const risk = calculateDeterministicRisk(livePayload.current, livePayload.hourly, undefined, loc.timezone);
        setCurrentWeather(livePayload.current);
        setRiskAssessment(risk);
        setHourlyForecast(livePayload.hourly);
        setDailyForecast(livePayload.daily);
        if (livePayload.comparison) setProviderComparison(livePayload.comparison);
        setDataStatus('LIVE');
        toast.success(`Active monitoring shifted to ${loc.name}`);
      } catch {
        toast.error(`Failed to load weather for ${loc.name}`);
      }
    } finally {
      setIsDashboardLoading(false);
    }
  };

  // Loading state while checking authentication
  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 animate-pulse">
            <HardHat className="w-6 h-6" />
          </div>
          <span className="text-xs font-mono text-slate-400">Initializing Safety Enclave...</span>
        </div>
      </div>
    );
  }

  // Not authenticated: present master password / first run setup screen
  if (!isAuthenticated) {
    return (
      <LoginScreen
        isFirstRun={isFirstRun}
        ownerEmail={ownerEmail}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const tempUnit = ownerSettings?.temperatureUnit || 'C';
  const windUnit = ownerSettings?.windUnit || 'km/h';
  const monitorInterval = ownerSettings?.monitorIntervalMinutes || 15;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Top Fixed Industrial Navigation Header */}
      <Navbar
        currentLocation={currentLocation}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenLocations={() => setIsLocationModalOpen(true)}
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {!isOnline && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-950/50 border border-amber-800/60 text-amber-200 text-xs font-mono">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Offline mode — showing the last cached microclimate snapshot. Live checks will resume automatically when
              the connection returns.
            </span>
          </div>
        )}
        <Suspense fallback={<ViewLoadingFallback label="Loading module" />}>
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fadeIn">
            {/* 1. Hero Risk Card (Dominant Dashboard Element) */}
            <HeroRiskCard
              risk={riskAssessment}
              locationName={currentLocation ? currentLocation.name : 'Monitored Site'}
              isLoading={isDashboardLoading}
            />

            {/* AI Superintendent Weather Briefing */}
            <AiBriefingCard
              locationId={currentLocation?.id}
              locationName={currentLocation ? currentLocation.name : 'Monitored Site'}
              deterministicRiskLevel={riskAssessment?.level || 'LOW'}
            />

            {/* 2. Active Alerts Warning Box */}
            <ActiveAlertsPanel
              alerts={activeAlerts}
              onDismissAlert={handleDismissAlert}
              onViewAllAlerts={() => setActiveTab('alerts')}
            />

            {/* Dual-Provider Atmospheric Cross-Reference */}
            <CrossReferenceCard
              comparison={providerComparison}
              hasApiKey={hasWeatherApiKey}
              onRefresh={handleRunCheckNow}
              isChecking={monitorStatus.isChecking}
            />

            {/* 3. Next 6 Hours Outlook Bar */}
            <HourlyForecastBar
              hourly={hourlyForecast}
              windUnit={windUnit}
              isLoading={isDashboardLoading}
            />

            {/* 4. Current Onsite Weather Conditions Grid */}
            <CurrentConditions
              weather={currentWeather}
              tempUnit={tempUnit}
              windUnit={windUnit}
              isLoading={isDashboardLoading}
            />

            {/* 5. Construction Impact Activity Matrix */}
            {riskAssessment && (
              <ConstructionImpacts impacts={riskAssessment.affectedActivities} />
            )}

            {/* 6. Dynamic System Health Strip */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Primary Ref: <strong className="text-emerald-300">{activeProvider}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
                  Cross-Ref & Fallback: <strong className="text-cyan-300">Open-Meteo Ready</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Database className="w-4 h-4 text-emerald-400" />
                  DB: <strong className="text-emerald-300">SQLite Local</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <HardHat className="w-4 h-4 text-amber-400" />
                  Cycle: <strong className="text-slate-200">{monitorInterval}m Auto</strong>
                </span>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('system')}
                className="text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
              >
                View System Health Details →
              </button>
            </div>
          </div>
        )}

        {/* Forecast View */}
        {activeTab === 'forecast' && (
          <ForecastView
            hourly={hourlyForecast}
            daily={dailyForecast}
            locationName={currentLocation ? currentLocation.name : 'Monitored Site'}
          />
        )}

        {/* Alerts & Delivery History */}
        {activeTab === 'alerts' && (
          <AlertHistoryView alerts={allAlerts} deliveries={alertDeliveries} />
        )}

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

        {/* System Health Diagnostics */}
        {activeTab === 'system' && (
          <SystemHealthView health={systemHealth} onRefreshHealth={loadDashboardData} />
        )}

        {/* Settings & Threshold Calibration */}
        {activeTab === 'settings' && <SettingsView onSettingsSaved={loadDashboardData} />}

        {/* User & Access Management (Owner only) */}
        {activeTab === 'users' && <UsersView />}
        </Suspense>
      </main>

      {/* Location Selector Modal */}
      <LocationModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        locations={allLocations}
        currentLocation={currentLocation}
        onSelectLocation={handleSelectLocation}
        onLocationAdded={loadDashboardData}
      />

      {/* Mandatory Section 93 Privacy Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-8 px-4 sm:px-6 text-center text-xs font-mono text-slate-500 select-none">
        <div className="max-w-4xl mx-auto space-y-2">
          <div className="flex items-center justify-center gap-2 text-slate-400 font-bold uppercase tracking-widest">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <span>PRIVATE LOCAL SYSTEM</span>
          </div>
          <p className="text-slate-500">
            Weather telemetry retrieved from WeatherAPI (primary reference) with Open-Meteo cross-reference and fallback.
          </p>
          <p className="text-slate-500">
            Application data is stored locally in SQLite with automated backup rotation. No advertising, no analytics, no tracking.
          </p>
          <div className="pt-2 text-[11px] text-slate-600">
            Construction Weather Monitor · Role-Based Secure Installation
          </div>
        </div>
      </footer>
    </div>
  );
}
