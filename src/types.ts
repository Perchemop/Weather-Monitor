export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type DataFreshnessStatus = 'LIVE' | 'CACHED' | 'STALE' | 'OFFLINE' | 'UNAVAILABLE';

export interface LocationItem {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isDefault: boolean;
  active?: boolean;
  createdAt: string;
  lastCheckedAt?: string;
  status?: DataFreshnessStatus;
  currentRiskLevel?: RiskLevel;
}

export interface CurrentWeather {
  timestamp: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windGusts: number;
  rainAmount: number;
  rainProbability: number;
  uvIndex: number;
  weatherCode: number;
  weatherDescription: string;
  pressure: number;
  visibility: number;
  isDay: boolean;
}

export interface HourlyForecastItem {
  time: string;
  temperature: number;
  windSpeed: number;
  windGusts: number;
  rainProbability: number;
  precipitation: number;
  weatherCode: number;
  weatherDescription: string;
  uvIndex: number;
  riskLevel: RiskLevel;
}

export interface DailyForecastItem {
  date: string;
  maxTemp: number;
  minTemp: number;
  rainProbability: number;
  precipitationSum: number;
  maxWindSpeed: number;
  maxWindGust: number;
  weatherCode: number;
  weatherDescription: string;
  riskLevel: RiskLevel;
}

export interface ProviderComparison {
  primaryProvider: string;
  crossRefProvider: string;
  activeDataSource: string;
  isFallbackActive: boolean;
  fallbackReason?: string;
  variance: {
    tempDelta: number;
    windDelta: number;
    gustDelta: number;
    humidityDelta: number;
    rainProbDelta: number;
    pressureDelta: number;
  };
  concordance: 'HIGH' | 'MODERATE' | 'DIVERGENT';
  confidenceScore: number;
  primaryReading: {
    temperature: number;
    feelsLike: number;
    windSpeed: number;
    windGusts: number;
    rainProbability: number;
    rainAmount: number;
    humidity: number;
    pressure: number;
    uvIndex: number;
    condition: string;
  };
  crossRefReading?: {
    temperature: number;
    feelsLike: number;
    windSpeed: number;
    windGusts: number;
    rainProbability: number;
    rainAmount: number;
    humidity: number;
    pressure: number;
    uvIndex: number;
    condition: string;
  };
  notes: string;
  timestamp: string;
}

export interface RiskFactor {
  id: string;
  category: 'WIND' | 'GUST' | 'RAIN' | 'TEMPERATURE' | 'UV' | 'STORM';
  label: string;
  value: string;
  threshold: string;
  severity: RiskLevel;
}

export interface ActivityImpact {
  activity: string;
  riskLevel: RiskLevel;
  reason: string;
  thresholdDetails: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  summary: string;
  factors: RiskFactor[];
  affectedActivities: ActivityImpact[];
  peakPeriod?: {
    start: string;
    end: string;
    metric: string;
  };
  safetyDisclaimer: string;
  calculatedAt: string;
  // Supplementary AI commentary (strictly non-authoritative; CANNOT override deterministic level/score)
  aiBriefing?: string;
  aiExplanation?: string;
  aiGeneratedAt?: string;
}

export type AlertType =
  | 'HIGH WIND'
  | 'EXTREME WIND'
  | 'HEAVY RAIN'
  | 'HIGH RAIN PROBABILITY'
  | 'EXTREME HEAT'
  | 'STORM'
  | 'LIGHTNING'
  | 'HIGH UV'
  | 'GENERAL WEATHER RISK';

export type AlertSeverity = 'INFORMATION' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface AlertItem {
  id: string;
  locationId: string;
  locationName: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  triggerCondition: string;
  observedValue: string;
  thresholdValue: string;
  startTime: string;
  expectedDuration: string;
  status: 'ACTIVE' | 'CLEARED' | 'DISMISSED';
  createdAt: string;
  clearedAt?: string | null;
  // Supplementary AI alert guidance (strictly advisory)
  aiExplanation?: string;
}

export interface AlertDelivery {
  id: string;
  alertId: string;
  alertType: string;
  recipientEmail: string;
  sentAt: string;
  status: 'SUCCESS' | 'PENDING_RETRY' | 'FAILED';
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string;
  lastAttemptAt?: string;
}

export interface MonitorRun {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: 'SUCCESS' | 'FAILED' | 'RUNNING';
  itemsProcessed: number;
  errorMessage?: string;
}

export interface MonitorStatus {
  status: 'ACTIVE' | 'STOPPED' | 'ERROR';
  isRunning: boolean;
  isChecking: boolean;
  lastCheckTime: string | null;
  nextCheckTime: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

export interface SystemHealth {
  weatherApiStatus: 'HEALTHY' | 'DEGRADED' | 'ERROR';
  databaseStatus: 'HEALTHY' | 'ERROR';
  monitorStatus: 'ACTIVE' | 'STOPPED' | 'ERROR';
  emailStatus: 'CONFIGURED' | 'NOT_CONFIGURED' | 'ERROR';
  lastCheckTime: string | null;
  nextCheckTime: string | null;
  totalAlertsSent: number;
  activeAlertsCount: number;
  totalObservationsCount: number;
  memoryUsageMb: number;
  uptimeSeconds: number;
  databaseSizeBytes: number;
}

export interface RiskThresholds {
  windWarning: number; // km/h (e.g. 40)
  windHigh: number; // km/h (e.g. 50)
  windCritical: number; // km/h (e.g. 65)
  gustWarning: number; // km/h (e.g. 45)
  gustHigh: number; // km/h (e.g. 55)
  gustCritical: number; // km/h (e.g. 70)
  rainProbWarning: number; // % (e.g. 60)
  rainProbHigh: number; // % (e.g. 80)
  rainAmountWarning: number; // mm/h (e.g. 5)
  rainAmountHigh: number; // mm/h (e.g. 15)
  heatWarning: number; // °C (e.g. 35)
  heatCritical: number; // °C (e.g. 40)
  uvWarning: number; // index (e.g. 8)
  uvHigh: number; // index (e.g. 11)
}

export interface OwnerSettings {
  ownerEmail: string;
  ownerName: string;
  defaultLocationId: string;
  temperatureUnit: 'C' | 'F';
  windUnit: 'km/h' | 'mph' | 'm/s';
  emailAlertsEnabled: boolean;
  monitoringEnabled: boolean;
  monitorIntervalMinutes: number;
  alertCooldownMinutes: number;
  recoveryNotificationsEnabled: boolean;
  thresholds: RiskThresholds;
}

export interface AuthStatus {
  authenticated: boolean;
  ownerEmail?: string;
  ownerName?: string;
  isFirstRun?: boolean;
}

export interface SchemaMigration {
  version: number;
  name: string;
  appliedAt: string;
}

export interface AiBriefingResponse {
  briefing: string;
  generatedAt: string;
  source: 'GEMINI_AI' | 'DETERMINISTIC_RULES';
  authoritativeRiskLevel?: RiskLevel;
  disclaimer?: string;
  modelUsed?: string;
}

export interface AiAlertExplanationResponse {
  alertId: string;
  title?: string;
  explanation: string;
  safetyRecommendations?: string[];
  recommendedActions?: string[];
  authoritativeSeverity?: AlertSeverity;
  swmsReference?: string;
  source: 'GEMINI_AI' | 'DETERMINISTIC_RULES';
  generatedAt?: string;
}

export interface AiHistoricalSummaryResponse {
  locationName: string;
  timeframe: string;
  summary: string;
  peakGustObserved: string;
  highestRiskLevel: RiskLevel;
  source: 'GEMINI_AI' | 'DETERMINISTIC_RULES';
  generatedAt: string;
}

export interface SecretsStatus {
  weatherApiKeyConfigured: boolean;
  weatherApiKeyMasked: string;
  smtpConfigured: boolean;
  smtpHost: string;
  geminiKeyConfigured: boolean;
}

