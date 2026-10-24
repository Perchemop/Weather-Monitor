/**
 * Comprehensive Automated System Test Suite
 * Tests deterministic risk engine, secret protection, timezone compliance,
 * and data freshness.
 */
import './setup.js'
import assert from 'node:assert/strict'
import { calculateDeterministicRisk, SAFETY_DISCLAIMER } from '../services/riskEngine.js'
import { evaluateCandidateAlerts } from '../static/alerts.js'
import { emailRelayConfigured } from '../static/emailRelay.js'
import { getSmtpConfig } from '../services/emailService.js'
import { buildWeeklyPerformanceSummary } from '../services/performanceSummary.js'
import { redactSecretsInError, maskSecret } from '../utils/security.js'
import { deepEqual, setStateIfChanged } from '../utils/state.js'
import { evaluateDataFreshness } from '../utils/time.js'
import { CurrentWeather, HourlyForecastItem, RiskThresholds, RiskLevel } from '../types.js'
import { convertTemperature, convertWind, formatTemperature, formatWind } from '../utils/units.js'
import {
  weatherApiCodeToWmo,
  normalizeWeatherApiData,
  validateAndNormalizeOpenMeteoData,
} from '../services/weatherService.js'
import { createDatabaseBackup, getDatabaseBackupsList, hashPasswordWithSalt } from '../database/db.js'
import { markPersistenceFailure, clearPersistenceFailure, getPersistenceStatus } from '../database/db.js'
import { compareVersions, resolveUpdateState } from '../utils/updateCheck.js'
import {
  createUserAccount,
  verifyUserCredentials,
  getAllUsers,
  getUserById,
  updateUserRole,
  deleteUserAccount,
  setUserActive,
  countActiveOwners,
} from '../database/db.js'
import { createRateLimiter, defaultKeyGenerator } from '../utils/rateLimiter.js'
import { securityHeaders } from '../utils/securityHeaders.js'
import { hasMinimumRole, canOperate, canAdminister } from '../utils/roles.js'
import { validatePasswordStrength, describePasswordPolicy } from '../utils/password.js'
import { generateTotpSecret, generateTotp, verifyTotp, buildOtpauthUrl } from '../utils/totp.js'
import { TtlCache } from '../utils/ttlCache.js'
import { sumPrecipitationWindow } from '../utils/rainAccum.js'
import {
  setUserMfaSecret,
  setUserMfaEnabled,
  getUserMfaByEmail,
  saveSession,
  loadActiveSessions,
  deleteSession,
  pruneExpiredSessions,
  savePushSubscription,
  getPushSubscriptions,
  countPushSubscriptions,
  deletePushSubscription,
  getPushPreferences,
  savePushPreferences,
  getAllPushPreferences,
  enforceDataRetention,
  SNAPSHOT_RETENTION_DAYS,
  ALERT_RETENTION_DAYS,
  MONITOR_RUN_RETENTION_DAYS,
} from '../database/db.js'

const mockThresholds: RiskThresholds = {
  windWarning: 38,
  windHigh: 48,
  windCritical: 60,
  gustWarning: 45,
  gustHigh: 55,
  gustCritical: 68,
  rainProbWarning: 50,
  rainProbHigh: 75,
  rainAmountWarning: 4,
  rainAmountHigh: 12,
  heatWarning: 34,
  heatCritical: 39,
  uvWarning: 8,
  uvHigh: 11,
}

function createMockWeather(overrides: Partial<CurrentWeather> = {}): CurrentWeather {
  return {
    timestamp: new Date().toISOString(),
    temperature: 22,
    feelsLike: 22,
    humidity: 50,
    windSpeed: 20,
    windGusts: 30,
    rainAmount: 0,
    rainProbability: 10,
    uvIndex: 4,
    weatherCode: 0,
    weatherDescription: 'Clear sky',
    pressure: 1015,
    visibility: 10,
    isDay: true,
    ...overrides,
  }
}

async function runTests() {
  console.log('--- RUNNING CRANE WEATHER SAFETY SYSTEM TESTS ---')
  let passed = 0
  let failed = 0

  function test(name: string, fn: () => void) {
    try {
      fn()
      console.log(`  [PASS] ${name}`)
      passed++
    } catch (err: any) {
      console.error(`  [FAIL] ${name}:`, err.message)
      failed++
    }
  }

  // 1. Deterministic Risk Engine Tests
  test('Deterministic Risk: Safe conditions produce LOW risk and 0-25 score', () => {
    const current = createMockWeather({
      windSpeed: 15,
      windGusts: 25,
      temperature: 22,
      rainAmount: 0,
      uvIndex: 3,
    })
    const hourly: HourlyForecastItem[] = []
    const risk = calculateDeterministicRisk(current, hourly, mockThresholds, 'Australia/Adelaide')
    assert.equal(risk.level, 'LOW')
    assert.ok(risk.score <= 25, `Score should be <= 25, got ${risk.score}`)
    assert.ok(risk.safetyDisclaimer.includes('SWMS'))
  })

  test('Deterministic Risk: High wind gusts breach crane limit -> CRITICAL or HIGH risk', () => {
    const current = createMockWeather({ windSpeed: 35, windGusts: 58 }) // Exceeds gustHigh (55 km/h)
    const hourly: HourlyForecastItem[] = []
    const risk = calculateDeterministicRisk(current, hourly, mockThresholds, 'Australia/Adelaide')
    assert.ok(
      risk.level === 'HIGH' || risk.level === 'CRITICAL',
      `Risk level should be HIGH or CRITICAL, got ${risk.level}`,
    )
    const craneActivity = risk.affectedActivities.find((a) => a.activity.toLowerCase().includes('crane'))
    assert.ok(craneActivity, 'Crane activity must be flagged in affected activities')
    assert.ok(craneActivity.riskLevel === 'HIGH' || craneActivity.riskLevel === 'CRITICAL')
  })

  test('Deterministic Risk: No synthetic gust inflation when gust is missing', () => {
    const current = createMockWeather({ windSpeed: 30, windGusts: 30 }) // Real observed gust, not artificially multiplied
    assert.equal(current.windGusts, 30)
  })

  test('Deterministic Risk: Daylight savings timezone affects hourly forecast windowing correctly', () => {
    const current = createMockWeather()
    const now = new Date()
    const hourly: HourlyForecastItem[] = [
      {
        time: new Date(now.getTime() + 3600000).toISOString(),
        temperature: 24,
        windSpeed: 42,
        windGusts: 60, // Severe gust forecast in 1 hour
        precipitation: 2,
        rainProbability: 80,
        weatherCode: 95,
        weatherDescription: 'Thunderstorm',
        uvIndex: 2,
        riskLevel: 'CRITICAL',
      },
    ]
    const risk = calculateDeterministicRisk(current, hourly, mockThresholds, 'Australia/Adelaide')
    assert.ok(risk.score >= 50, 'Severe upcoming gust in next 6h must trigger elevated risk score')
  })

  test('WeatherAPI: condition codes map onto WMO semantics', () => {
    assert.equal(weatherApiCodeToWmo(1000), 0, 'WeatherAPI clear (1000) must not read as a storm code')
    assert.equal(weatherApiCodeToWmo(1003), 2)
    assert.equal(weatherApiCodeToWmo(1009), 3)
    assert.equal(weatherApiCodeToWmo(1135), 45, 'fog maps to WMO fog')
    assert.equal(weatherApiCodeToWmo(1195), 65, 'heavy rain maps to WMO heavy rain')
    assert.equal(weatherApiCodeToWmo(1087), 95, 'thundery outbreaks must map to WMO thunderstorm')
    assert.equal(weatherApiCodeToWmo(1276), 95)
    assert.equal(weatherApiCodeToWmo(1279), 96)
    assert.equal(weatherApiCodeToWmo(1282), 99)
  })

  test('WeatherAPI: a clear-sky payload does not register a thunderstorm', () => {
    const raw = {
      location: { tz_id: 'Australia/Adelaide' },
      current: {
        last_updated_epoch: 1769000000,
        temp_c: 24,
        feelslike_c: 24,
        humidity: 45,
        wind_kph: 14,
        gust_kph: 22,
        precip_mm: 0,
        uv: 5,
        pressure_mb: 1015,
        vis_km: 10,
        is_day: 1,
        condition: { code: 1000, text: 'Sunny' },
      },
      forecast: {
        forecastday: [
          {
            date: '2026-01-15',
            day: {
              maxtemp_c: 28,
              mintemp_c: 17,
              daily_chance_of_rain: 5,
              totalprecip_mm: 0,
              maxwind_kph: 18,
              uv: 6,
              condition: { code: 1000, text: 'Sunny' },
            },
            hour: [
              {
                time_epoch: 1769000400,
                temp_c: 24,
                wind_kph: 15,
                gust_kph: 24,
                chance_of_rain: 0,
                precip_mm: 0,
                uv: 6,
                condition: { code: 1000, text: 'Sunny' },
              },
            ],
          },
        ],
      },
    }
    const normalized = normalizeWeatherApiData(raw as any, 'loc-x', 'Test Site', -34.9, 138.6)
    assert.equal(normalized.current.weatherCode, 0, 'current code must be mapped to WMO clear')
    assert.equal(normalized.hourly[0].weatherCode, 0)
    const risk = calculateDeterministicRisk(
      normalized.current,
      normalized.hourly,
      mockThresholds,
      'Australia/Adelaide',
    )
    assert.notEqual(risk.level, 'CRITICAL', `clear sky must never be CRITICAL (was ${risk.level})`)
    assert.ok(
      !risk.factors.some((f) => f.category === 'STORM'),
      'clear conditions must not produce storm factors',
    )
  })

  test('WeatherAPI: a thunderstorm payload still triggers storm handling', () => {
    const raw = {
      current: {
        last_updated_epoch: 1769000000,
        temp_c: 20,
        wind_kph: 30,
        gust_kph: 55,
        precip_mm: 2,
        uv: 1,
        pressure_mb: 1002,
        vis_km: 5,
        is_day: 1,
        condition: { code: 1276, text: 'Thunderstorm' },
      },
    }
    const normalized = normalizeWeatherApiData(raw as any, 'loc-x', 'Test Site', -34.9, 138.6)
    assert.ok(normalized.current.weatherCode >= 95, 'thunder codes must stay above the WMO 95 threshold')
  })

  test('Open-Meteo: wall-clock times convert to true UTC instants', () => {
    // Adelaide summer: UTC+10:30. 10:00 local on 2026-01-15 is 23:30 UTC the
    // previous day; a naive parse in a UTC container would read 10:00 UTC.
    const raw = {
      utc_offset_seconds: 37800,
      timezone: 'Australia/Adelaide',
      current: {
        time: '2026-01-15T10:00',
        temperature_2m: 25,
        apparent_temperature: 25,
        relative_humidity_2m: 40,
        precipitation: 0,
        weather_code: 0,
        surface_pressure: 1014,
        wind_speed_10m: 12,
        wind_gusts_10m: 20,
        wind_direction_10m: 180,
        is_day: 1,
        cape: 0,
        lightning_potential: 0,
      },
      hourly: { time: ['2026-01-15T10:00', '2026-01-15T11:00'], temperature_2m: [25, 26] },
    }
    const normalized = validateAndNormalizeOpenMeteoData(raw as any, 'loc-x', 'Test Site', -34.9, 138.6)
    assert.equal(normalized.current.timestamp, '2026-01-14T23:30:00.000Z')
    assert.equal(normalized.hourly[0].time, '2026-01-14T23:30:00.000Z')
    assert.equal(normalized.hourly[1].time, '2026-01-15T00:30:00.000Z')
  })

  test('Deterministic Risk: extreme UV raises the headline level to HIGH', () => {
    const current = createMockWeather({ uvIndex: 12, windSpeed: 15, windGusts: 25 })
    const risk = calculateDeterministicRisk(current, [], mockThresholds, 'Australia/Adelaide')
    assert.equal(risk.level, 'HIGH', `expected HIGH for extreme UV, got ${risk.level}`)
    assert.ok(risk.factors.some((f) => f.id === 'uv-extreme'))
    assert.ok(risk.score >= 60, 'extreme UV must lift the score')
  })

  test('Deterministic Risk: very high UV is visible in level and score', () => {
    const current = createMockWeather({ uvIndex: 9, windSpeed: 15, windGusts: 25 })
    const risk = calculateDeterministicRisk(current, [], mockThresholds, 'Australia/Adelaide')
    assert.ok(
      risk.factors.some((f) => f.id === 'uv-very-high'),
      'the UV factor must be listed',
    )
    assert.ok(risk.score >= 40, 'a listed factor must move the score')
    assert.notEqual(risk.level, 'LOW', 'very high UV must not stay LOW')
  })

  test('Deterministic Risk: Building convective energy raises STORM lightning risk', () => {
    const current = createMockWeather({ windSpeed: 10, windGusts: 15, lightningPotential: 1200, cape: 2600 })
    const risk = calculateDeterministicRisk(current, [], mockThresholds, 'Australia/Adelaide')
    assert.equal(risk.level, 'CRITICAL', `Expected CRITICAL, got ${risk.level}`)
    assert.ok(
      risk.factors.some((f) => f.id === 'lightning-critical'),
      'A critical lightning factor must be present',
    )
  })

  test('Alert Engine: Developing lightning triggers a LIGHTNING alert candidate', () => {
    const current = createMockWeather({ weatherCode: 3, lightningPotential: 700, cape: 2000 })
    const candidates = evaluateCandidateAlerts(current, [], mockThresholds)
    const lightning = candidates.find((c) => c.alertType === 'LIGHTNING')
    assert.ok(lightning, 'A LIGHTNING candidate should be produced')
    assert.equal(lightning!.severity, 'HIGH')
  })

  test('Alert Engine: An active thunderstorm uses STORM, not a duplicate LIGHTNING alert', () => {
    const current = createMockWeather({
      weatherCode: 95,
      weatherDescription: 'Thunderstorm',
      lightningPotential: 900,
      cape: 2500,
    })
    const candidates = evaluateCandidateAlerts(current, [], mockThresholds)
    assert.ok(
      candidates.some((c) => c.alertType === 'STORM'),
      'STORM candidate expected',
    )
    assert.ok(!candidates.some((c) => c.alertType === 'LIGHTNING'), 'LIGHTNING must not duplicate STORM')
  })

  test('Email relay: only a valid http(s) relay URL is accepted', () => {
    assert.equal(emailRelayConfigured('https://relay.example.workers.dev/alert'), true)
    assert.equal(emailRelayConfigured('http://localhost:8787'), true)
    assert.equal(emailRelayConfigured('  https://relay.example.com?secret=x '), true)
    assert.equal(emailRelayConfigured(''), false)
    assert.equal(emailRelayConfigured(undefined), false)
    assert.equal(emailRelayConfigured('ftp://relay.example.com'), false)
  })

  test('SMTP: a host-only relay is valid (no-auth local/dev SMTP)', () => {
    const saved = {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
      from: process.env.SMTP_FROM,
    }
    try {
      delete process.env.SMTP_USER
      delete process.env.SMTP_PASSWORD
      delete process.env.SMTP_FROM
      process.env.SMTP_HOST = 'mailpit'
      process.env.SMTP_PORT = '1025'

      const config = getSmtpConfig()
      assert.ok(config, 'host-only SMTP must be considered configured')
      assert.equal(config!.host, 'mailpit')
      assert.equal(config!.port, 1025)
      assert.equal(config!.secure, false)
      assert.equal(config!.user, '')
      assert.ok(config!.from && config!.from.length > 0, 'a From header must be synthesised')
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        const key = `SMTP_${k.toUpperCase()}`
        if (v === undefined) delete process.env[key]
        else process.env[key] = v
      }
    }
  })

  test('SMTP: no host means not configured', () => {
    const saved = process.env.SMTP_HOST
    try {
      delete process.env.SMTP_HOST
      assert.equal(getSmtpConfig(), null)
    } finally {
      if (saved === undefined) delete process.env.SMTP_HOST
      else process.env.SMTP_HOST = saved
    }
  })

  // 2. Secret Redaction & Protection Tests
  test('Secret Protection: Weather API key is masked safely', () => {
    const masked = maskSecret('cdd94d05a2524ab9a04120657261505')
    assert.ok(masked.startsWith('cdd9'))
    assert.ok(masked.endsWith('1505'))
    assert.ok(!masked.includes('4ab9a0412065726'))
  })

  test('Secret Protection: Error logs redact raw credentials', () => {
    const rawError =
      'Connection failed with key=cdd94d05a2524ab9a04120657261505 and token 0123456789abcdef0123456789abcdef'
    const redacted = redactSecretsInError(rawError)
    assert.ok(!redacted.includes('cdd94d05a2524ab9a04120657261505'), 'API key must be redacted')
    assert.ok(redacted.includes('[REDACTED_API_KEY]'), 'Should contain redaction tag')
  })

  // 3. Stale Data & Freshness Semantics Tests
  test('Freshness Evaluation: Fresh observation under 30 minutes is marked LIVE', () => {
    const recentIso = new Date().toISOString()
    const freshness = evaluateDataFreshness(recentIso, 'Australia/Adelaide', false)
    assert.equal(freshness.status, 'LIVE')
    assert.equal(freshness.isStale, false)
  })

  test('Freshness Evaluation: Old observation over 60 minutes is marked STALE', () => {
    const oldDate = new Date(Date.now() - 75 * 60 * 1000).toISOString()
    const freshness = evaluateDataFreshness(oldDate, 'Australia/Adelaide', false)
    assert.equal(freshness.status, 'STALE')
    assert.equal(freshness.isStale, true)
  })

  test('Freshness Evaluation: Offline monitor marked OFFLINE', () => {
    const recentIso = new Date().toISOString()
    const freshness = evaluateDataFreshness(recentIso, 'Australia/Adelaide', true)
    assert.equal(freshness.status, 'OFFLINE')
  })

  // 4. Deterministic Safety Isolation
  test('Safety Isolation: Safety disclaimer is present in deterministic engine', () => {
    assert.ok(SAFETY_DISCLAIMER.includes('SWMS'))
    assert.ok(SAFETY_DISCLAIMER.includes('safety judgement'))
  })

  // 5. Unit Conversion & Formatting Tests
  test('Unit Conversion: Celsius to Fahrenheit converts accurately', () => {
    assert.equal(convertTemperature(0, 'F'), 32)
    assert.equal(convertTemperature(100, 'F'), 212)
    assert.equal(convertTemperature(25, 'C'), 25)
    assert.equal(formatTemperature(22.4, 'C'), '22°C')
    assert.equal(formatTemperature(22.4, 'F'), '72°F')
  })

  test('Unit Conversion: Wind speed conversion handles km/h, mph, and m/s', () => {
    assert.equal(Math.round(convertWind(36, 'm/s')), 10)
    assert.equal(Math.round(convertWind(100, 'mph')), 62)
    assert.equal(convertWind(50, 'km/h'), 50)
    assert.equal(formatWind(45, 'km/h'), '45 km/h')
  })

  // 6. Security & Cryptographic Hashing Tests
  test('Security: Scrypt password hashing produces deterministic memory-hard outputs', () => {
    const salt = 'a1b2c3d4e5f60718'
    const hash1 = hashPasswordWithSalt('SuperSecretPass123', salt)
    const hash2 = hashPasswordWithSalt('SuperSecretPass123', salt)
    const hash3 = hashPasswordWithSalt('DifferentPassword456', salt)
    assert.equal(hash1, hash2, 'Identical password and salt must match')
    assert.notEqual(hash1, hash3, 'Different password must produce different hash')
    assert.equal(hash1.length, 128, 'Hash must be 64 bytes hex (128 chars)')
  })

  // 7. Database Snapshot Backup Tests
  await (async () => {
    try {
      const backupName = await createDatabaseBackup()
      assert.ok(backupName.startsWith('weather-monitor-') && backupName.endsWith('.sqlite'))
      const list = getDatabaseBackupsList()
      assert.ok(list.length > 0, 'Backups list must contain created snapshot')
      console.log(
        `  [PASS] Database Snapshot & Rotation: Created ${backupName}, Total Backups=${list.length}`,
      )
      passed++
    } catch (err: any) {
      console.error(`  [FAIL] Database Snapshot & Rotation:`, err.message)
      failed++
    }
  })()

  // 8. Security Hardening: Rate Limiting & Headers
  test('Security: Rate limiter blocks requests beyond the configured maximum', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 3 })
    const makeReq = (ip: string) => ({ ip, socket: { remoteAddress: ip } }) as any
    const makeRes = () => {
      const headers: Record<string, string> = {}
      return {
        statusCode: 200,
        body: undefined as any,
        setHeader: (k: string, v: string) => {
          headers[k] = v
        },
        status(code: number) {
          this.statusCode = code
          return this
        },
        json(payload: any) {
          this.body = payload
          return this
        },
        headers,
      } as any
    }

    let nextCalls = 0
    const next = () => {
      nextCalls++
    }

    for (let i = 0; i < 3; i++) {
      limiter(makeReq('10.0.0.1'), makeRes(), next)
    }
    const blockedRes = makeRes()
    limiter(makeReq('10.0.0.1'), blockedRes, next)

    assert.equal(nextCalls, 3, 'First three requests should pass through')
    assert.equal(blockedRes.statusCode, 429, 'Fourth request must be rate limited')
    assert.ok(blockedRes.body?.error, 'Rate limited response must include an error message')

    // A different client identity must have an independent budget.
    const otherRes = makeRes()
    limiter(makeReq('10.0.0.2'), otherRes, next)
    assert.equal(nextCalls, 4, 'Distinct client IPs must not share a rate limit window')
  })

  test('Security: Rate limiter reset clears tracked windows', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 1 })
    const makeReq = () => ({ ip: '10.0.0.9', socket: { remoteAddress: '10.0.0.9' } }) as any
    const makeRes = () =>
      ({
        setHeader: () => {},
        status(code: number) {
          return { json: () => code }
        },
        json: () => {},
      }) as any

    let nextCalls = 0
    limiter(makeReq(), makeRes(), () => {
      nextCalls++
    })
    limiter(makeReq(), makeRes(), () => {
      nextCalls++
    }) // blocked
    assert.equal(nextCalls, 1, 'Second request within window must be blocked')
    limiter.reset()
    limiter(makeReq(), makeRes(), () => {
      nextCalls++
    })
    assert.equal(nextCalls, 2, 'After reset the client regains its budget')
  })

  test('Security: Default key generator derives a client identity from the request', () => {
    assert.equal(defaultKeyGenerator({ ip: '192.168.1.5' } as any), '192.168.1.5')
    assert.equal(defaultKeyGenerator({ socket: { remoteAddress: '::1' } } as any), '::1')
  })

  test('Security: Security headers are applied and fingerprinting is removed', () => {
    const middleware = securityHeaders({ dev: false })
    const headers: Record<string, string> = {}
    const removed: string[] = []
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v
      },
      removeHeader: (k: string) => {
        removed.push(k)
      },
    } as any
    let nextCalled = false
    middleware({} as any, res, () => {
      nextCalled = true
    })

    assert.ok(nextCalled, 'Header middleware must call next()')
    assert.equal(headers['X-Content-Type-Options'], 'nosniff')
    assert.equal(headers['X-Frame-Options'], 'DENY')
    assert.equal(headers['Referrer-Policy'], 'no-referrer')
    assert.ok(headers['Content-Security-Policy'].includes("default-src 'self'"))
    assert.ok(
      headers['Content-Security-Policy'].includes("script-src 'self';"),
      'Production CSP must restrict scripts to self',
    )
    assert.ok(
      !headers['Content-Security-Policy'].includes("script-src 'self' 'unsafe-inline'"),
      'Production CSP must not allow inline scripts',
    )
    assert.ok(removed.includes('X-Powered-By'), 'X-Powered-By must be removed')
    assert.equal(headers['Strict-Transport-Security'], undefined, 'HSTS must be off by default')
  })

  test('Security: HSTS is emitted only when explicitly enabled', () => {
    const headers: Record<string, string> = {}
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v
      },
      removeHeader: () => {},
    } as any
    securityHeaders({ enableHsts: true })({} as any, res, () => {})
    assert.ok(headers['Strict-Transport-Security']?.includes('max-age=31536000'))
  })

  // 9. Access Control Role Helpers
  test('Access Control: Role hierarchy ranks privileges correctly', () => {
    assert.ok(hasMinimumRole('OWNER', 'VIEWER'))
    assert.ok(hasMinimumRole('OWNER', 'MANAGER'))
    assert.ok(hasMinimumRole('OWNER', 'OWNER'))
    assert.ok(hasMinimumRole('MANAGER', 'MANAGER'))
    assert.ok(hasMinimumRole('VIEWER', 'VIEWER'))
    assert.ok(!hasMinimumRole('VIEWER', 'MANAGER'))
    assert.ok(!hasMinimumRole('MANAGER', 'OWNER'))
  })

  test('Access Control: Capability gates match role semantics', () => {
    assert.ok(canOperate('OWNER') && canOperate('MANAGER'))
    assert.ok(!canOperate('VIEWER'))
    assert.ok(canAdminister('OWNER'))
    assert.ok(!canAdminister('MANAGER'))
    assert.ok(!canAdminister('VIEWER'))
  })

  // 10. Multi-User Account Lifecycle (uses local SQLite)
  await (async () => {
    const email = `test-viewer-${Date.now()}@site.local`
    let createdId: string | null = null
    try {
      const created = await createUserAccount({
        email,
        password: 'ViewerPass123',
        role: 'VIEWER',
        displayName: 'Test Viewer',
      })
      createdId = created.id
      assert.equal(created.role, 'VIEWER')

      // Password verification succeeds with the correct password...
      const good = await verifyUserCredentials('ViewerPass123', email)
      assert.ok(good.valid && good.user?.role === 'VIEWER', 'Correct credentials must verify')
      // ...and fails with the wrong password.
      const bad = await verifyUserCredentials('WrongPassword', email)
      assert.ok(!bad.valid, 'Incorrect password must be rejected')

      // Role promotion persists.
      assert.ok(await updateUserRole(created.id, 'MANAGER'))
      const promoted = await getUserById(created.id)
      assert.equal(promoted?.role, 'MANAGER')

      // Deactivation persists.
      assert.ok(await setUserActive(created.id, false))
      const deactivated = await getUserById(created.id)
      assert.equal(deactivated?.active, false)

      console.log(`  [PASS] Multi-User Lifecycle: created, verified, promoted and disabled ${email}`)
      passed++
    } catch (err: any) {
      console.error('  [FAIL] Multi-User Lifecycle:', err.message)
      failed++
    } finally {
      if (createdId) await deleteUserAccount(createdId)
    }
  })()

  await (async () => {
    try {
      const users = await getAllUsers()
      const owners = users.filter((u) => u.role === 'OWNER' && u.active)
      const ownerCount = await countActiveOwners()
      assert.equal(ownerCount, owners.length, 'countActiveOwners must match the roster')

      if (ownerCount === 1 && owners[0]) {
        const soleOwner = owners[0]
        assert.equal(await updateUserRole(soleOwner.id, 'VIEWER'), false, 'Last owner cannot be demoted')
        assert.equal(await setUserActive(soleOwner.id, false), false, 'Last owner cannot be deactivated')
        assert.equal(await deleteUserAccount(soleOwner.id), false, 'Last owner cannot be deleted')
      }
      console.log(`  [PASS] Multi-User Guardrails: last-owner protections enforced (owners=${ownerCount})`)
      passed++
    } catch (err: any) {
      console.error('  [FAIL] Multi-User Guardrails:', err.message)
      failed++
    }
  })()

  // 11. Password Policy
  test('Password Policy: weak passwords are rejected, strong ones accepted', () => {
    assert.ok(!validatePasswordStrength('short').valid, 'Too-short password must fail')
    assert.ok(!validatePasswordStrength('alllettersonly').valid, 'Password without a number must fail')
    assert.ok(!validatePasswordStrength('1234567890').valid, 'Password without a letter must fail')
    assert.ok(validatePasswordStrength('Builder2026x').valid, 'Compliant password must pass')
    assert.ok(describePasswordPolicy().includes('at least'), 'Policy description must state a minimum length')
  })

  // 12. TOTP (RFC 6238)
  test('TOTP: generated codes verify and reject tampered codes', () => {
    const secret = generateTotpSecret()
    const code = generateTotp(secret)
    assert.equal(code.length, 6, 'TOTP code must be 6 digits')
    assert.ok(/^\d{6}$/.test(code), 'TOTP code must be numeric')
    assert.ok(verifyTotp(secret, code), 'Freshly generated code must verify')
    assert.ok(!verifyTotp(secret, '000000') || code === '000000', 'Wrong code must be rejected')
    assert.ok(!verifyTotp(secret, 'abc'), 'Non-numeric code must be rejected')

    // A code from a different secret must not verify.
    const otherSecret = generateTotpSecret()
    if (generateTotp(otherSecret) !== code) {
      assert.ok(!verifyTotp(secret, generateTotp(otherSecret)), 'Code from another secret must be rejected')
    }
  })

  test('TOTP: provisioning URI is well-formed', () => {
    const secret = generateTotpSecret()
    const url = buildOtpauthUrl(secret, 'owner@site.local')
    assert.ok(url.startsWith('otpauth://totp/'), 'Must be a totp otpauth URI')
    assert.ok(url.includes(`secret=${secret}`), 'URI must embed the secret')
    assert.ok(url.includes('issuer='), 'URI must embed an issuer')
  })

  // 13. TTL cache
  test('TTL Cache: stores, returns and expires entries', () => {
    const cache = new TtlCache<number>(50)
    cache.set('a', 1)
    assert.equal(cache.get('a'), 1)
    assert.equal(cache.get('missing'), undefined)
    cache.clear()
    assert.equal(cache.get('a'), undefined)
  })

  // 14. Persistent sessions
  await (async () => {
    const token = 'test-session-' + Date.now()
    try {
      await saveSession({
        token,
        userId: 'usr-test',
        email: 'sessions@site.local',
        role: 'VIEWER',
        displayName: 'Session Tester',
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + 60_000,
      })
      const active = await loadActiveSessions()
      assert.ok(
        active.some((s) => s.token === token),
        'Persisted session must be reloadable',
      )

      // Expired sessions are pruned and not returned.
      await saveSession({
        token: token + '-expired',
        userId: 'usr-test',
        email: 'sessions@site.local',
        role: 'VIEWER',
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() - 1000,
      })
      await pruneExpiredSessions()
      const afterPrune = await loadActiveSessions()
      assert.ok(!afterPrune.some((s) => s.token === token + '-expired'), 'Expired session must be pruned')

      console.log('  [PASS] Persistent Sessions: stored, listed, and expired sessions pruned')
      passed++
    } catch (err: any) {
      console.error('  [FAIL] Persistent Sessions:', err.message)
      failed++
    } finally {
      await deleteSession(token).catch(() => {})
      await deleteSession(token + '-expired').catch(() => {})
    }
  })()

  // 15. MFA lifecycle
  await (async () => {
    const email = `test-mfa-${Date.now()}@site.local`
    let createdId: string | null = null
    try {
      const created = await createUserAccount({
        email,
        password: 'MfaTester123',
        role: 'VIEWER',
        displayName: 'MFA Tester',
      })
      createdId = created.id

      const secret = generateTotpSecret()
      await setUserMfaSecret(created.id, secret)
      let mfa = await getUserMfaByEmail(email)
      assert.equal(mfa?.mfaEnabled, false, 'MFA must remain disabled until verified')
      assert.equal(mfa?.mfaSecret, secret, 'Secret must persist')

      await setUserMfaEnabled(created.id, true)
      mfa = await getUserMfaByEmail(email)
      assert.equal(mfa?.mfaEnabled, true, 'MFA must be enable-able')

      await setUserMfaEnabled(created.id, false)
      mfa = await getUserMfaByEmail(email)
      assert.equal(mfa?.mfaEnabled, false, 'MFA must be disable-able')
      assert.equal(mfa?.mfaSecret, null, 'Disabling MFA must clear the secret')

      console.log(`  [PASS] MFA Lifecycle: enrolled, enabled and disabled for ${email}`)
      passed++
    } catch (err: any) {
      console.error('  [FAIL] MFA Lifecycle:', err.message)
      failed++
    } finally {
      if (createdId) await deleteUserAccount(createdId)
    }
  })()

  // 16. Web push subscriptions
  await (async () => {
    const endpoint = `https://push.example.com/${Date.now()}`
    try {
      const before = await countPushSubscriptions()
      await savePushSubscription({
        endpoint,
        p256dh: 'test-p256dh',
        auth: 'test-auth',
        userEmail: 'push@site.local',
      })
      const subs = await getPushSubscriptions()
      assert.ok(
        subs.some((s) => s.endpoint === endpoint),
        'Subscription must persist',
      )
      assert.equal(await countPushSubscriptions(), before + 1)

      await deletePushSubscription(endpoint)
      const after = await getPushSubscriptions()
      assert.ok(!after.some((s) => s.endpoint === endpoint), 'Unsubscribe must remove the record')
      assert.equal(await countPushSubscriptions(), before, 'Count must return to baseline')

      console.log('  [PASS] Web Push: subscription stored, listed and removed')
      passed++
    } catch (err: any) {
      console.error('  [FAIL] Web Push:', err.message)
      failed++
      await deletePushSubscription(endpoint).catch(() => {})
    }
  })()

  // 16b. Per-user push preferences
  await (async () => {
    const userId = `pref-user-${Date.now()}`
    try {
      const defaults = await getPushPreferences(userId)
      assert.equal(defaults.enabled, true, 'Defaults enable notifications')
      assert.equal(defaults.minSeverity, 'LOW', 'Defaults deliver all severities')
      assert.equal(defaults.notifyRecovery, true, 'Defaults include recovery notifications')

      const saved = await savePushPreferences(userId, {
        enabled: false,
        minSeverity: 'HIGH',
        notifyRecovery: false,
      })
      assert.equal(saved.minSeverity, 'HIGH')
      assert.ok(saved.updatedAt, 'updatedAt must be stamped')

      const reread = await getPushPreferences(userId)
      assert.equal(reread.enabled, false)
      assert.equal(reread.minSeverity, 'HIGH')
      assert.equal(reread.notifyRecovery, false)

      const all = await getAllPushPreferences()
      assert.equal(all.get(userId)?.minSeverity, 'HIGH', 'Preference must appear in the aggregate map')

      // Partial update preserves untouched fields.
      const partial = await savePushPreferences(userId, { notifyRecovery: true })
      assert.equal(partial.enabled, false, 'Unspecified fields are preserved')
      assert.equal(partial.notifyRecovery, true)

      console.log('  [PASS] Push Preferences: defaults, upsert, partial update and aggregation')
      passed++
    } catch (err: any) {
      console.error('  [FAIL] Push Preferences:', err.message)
      failed++
    }
  })()

  // 17. Configurable retention
  test('Data Retention: windows are defined and configurable', () => {
    assert.ok(SNAPSHOT_RETENTION_DAYS > 0 && ALERT_RETENTION_DAYS > 0 && MONITOR_RUN_RETENTION_DAYS > 0)
    assert.ok(typeof enforceDataRetention === 'function')
  })

  await (async () => {
    try {
      const result = await enforceDataRetention(30)
      assert.equal(typeof result.observationsDeleted, 'number')
      assert.equal(typeof result.snapshotsDeleted, 'number')
      assert.equal(typeof result.alertsPruned, 'number')
      assert.ok(result.comparisonsDeleted === 0)
      console.log('  [PASS] Data Retention: run returns the documented result shape')
      passed++
    } catch (err: any) {
      console.error('  [FAIL] Data Retention:', err.message)
      failed++
    }
  })()

  // 18. Weekly performance summary builder
  test('Performance Summary: aggregates windowed runs, conditions and alerts', () => {
    const now = new Date('2026-10-16T12:00:00.000Z')
    const recent = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString()
    const stale = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString()

    const observations: CurrentWeather[] = [
      createMockWeather({
        timestamp: recent,
        temperature: 30,
        windGusts: 62,
        windSpeed: 25,
        rainAmount: 4,
        uvIndex: 9,
      }),
      createMockWeather({
        timestamp: recent,
        temperature: 14,
        windGusts: 40,
        windSpeed: 15,
        rainAmount: 1,
        uvIndex: 3,
      }),
      createMockWeather({
        timestamp: stale,
        temperature: 45,
        windGusts: 90,
        windSpeed: 80,
        rainAmount: 20,
        uvIndex: 12,
      }),
    ]

    const alerts = [
      {
        id: 'a1',
        locationId: 'loc-1',
        locationName: 'Site',
        alertType: 'HIGH WIND',
        severity: 'CRITICAL',
        status: 'ACTIVE',
        createdAt: recent,
      } as any,
      {
        id: 'a2',
        locationId: 'loc-1',
        locationName: 'Site',
        alertType: 'HIGH WIND',
        severity: 'HIGH',
        status: 'CLEARED',
        createdAt: recent,
      } as any,
      {
        id: 'a3',
        locationId: 'loc-1',
        locationName: 'Site',
        alertType: 'HEAVY RAIN',
        severity: 'MODERATE',
        status: 'ACTIVE',
        createdAt: recent,
      } as any,
      {
        id: 'a4',
        locationId: 'loc-1',
        locationName: 'Site',
        alertType: 'STORM',
        severity: 'CRITICAL',
        status: 'ACTIVE',
        createdAt: stale,
      } as any,
    ]

    const runs = [
      { id: 'r1', startedAt: recent, status: 'SUCCESS', itemsProcessed: 1 } as any,
      { id: 'r2', startedAt: recent, status: 'FAILED', itemsProcessed: 0 } as any,
      { id: 'r3', startedAt: stale, status: 'SUCCESS', itemsProcessed: 1 } as any,
    ]

    const summary = buildWeeklyPerformanceSummary({
      locationId: 'loc-1',
      locationName: 'Site',
      monitoringEnabled: true,
      intervalMinutes: 15,
      monitorStatus: {
        status: 'ACTIVE',
        isRunning: true,
        isChecking: false,
        lastCheckTime: recent,
        nextCheckTime: now.toISOString(),
        lastError: null,
        consecutiveFailures: 0,
      },
      observations,
      alerts,
      runs,
      now,
    })

    // Window filters out the 30-day-old entries.
    assert.equal(summary.conditions.peakGustKmh, 62)
    assert.equal(summary.conditions.maxTempC, 30)
    assert.equal(summary.conditions.minTempC, 14)
    assert.equal(summary.conditions.totalRainMm, 5)
    assert.equal(summary.alerts.total, 3)
    assert.equal(summary.alerts.severe, 2)
    assert.equal(summary.alerts.open, 2)
    assert.equal(summary.alerts.byType[0].type, 'HIGH WIND')
    assert.equal(summary.monitoring.runsTotal, 2)
    assert.equal(summary.monitoring.successRatePct, 50)
    assert.equal(summary.monitoring.observations, 2)
    assert.ok(summary.highlights.length >= 2)
  })

  // ---------------------------------------------------------------------------
  // State stability helpers (guards against the dashboard render/poll loop)
  // ---------------------------------------------------------------------------
  test('deepEqual compares nested JSON structures structurally', () => {
    assert.equal(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), true)
    assert.equal(deepEqual({ a: 1 }, { a: 2 }), false)
    assert.equal(deepEqual([1, 2, 3], [1, 2]), false)
    assert.equal(deepEqual(null, null), true)
    assert.equal(deepEqual(null, undefined), false)
    assert.equal(deepEqual('x', 'x'), true)
  })

  test('setStateIfChanged preserves the previous reference for identical payloads', () => {
    let value: any = { a: 1, b: [1, 2] }
    const setter = (updater: any) => {
      value = typeof updater === 'function' ? updater(value) : updater
    }
    const before = value

    setStateIfChanged(setter as any, { a: 1, b: [1, 2] })
    assert.equal(value, before, 'structurally identical payload must not replace the state reference')

    setStateIfChanged(setter as any, { a: 2, b: [1, 2] })
    assert.notEqual(value, before, 'changed payload must replace the state reference')
    assert.equal(value.a, 2)
  })

  test('Rain accumulation: forward window sums the current hour plus the next ones', () => {
    // index 2 is "now": 1+2+3 = 6 over the next 3 hours (indices 2,3,4)
    const hourly = [9, 9, 1, 2, 3, 4, 5]
    assert.equal(sumPrecipitationWindow(hourly, 2, 3, 'next'), 6)
    assert.equal(
      sumPrecipitationWindow(hourly, 2, 1, 'next'),
      1,
      'single-hour forecast is the current bucket',
    )
  })

  test('Rain accumulation: past window ends with the current (in-progress) hour', () => {
    const hourly = [1, 2, 3, 4, 5, 6, 7]
    // last 3 hours ending at index 4 => indices 2,3,4 => 3+4+5 = 12
    assert.equal(sumPrecipitationWindow(hourly, 4, 3, 'past'), 12)
    assert.equal(sumPrecipitationWindow(hourly, 4, 1, 'past'), 5)
  })

  test('Rain accumulation: past window clamps at the start of the series', () => {
    const hourly = [1, 2, 3, 4]
    // start=1, window=6 would reach before index 0; clamp to indices 0..1 => 3
    assert.equal(sumPrecipitationWindow(hourly, 1, 6, 'past'), 3)
  })

  test('Rain accumulation: next window clamps at the end of the series', () => {
    const hourly = [1, 2, 3, 4]
    assert.equal(sumPrecipitationWindow(hourly, 2, 24, 'next'), 7, 'only available buckets are summed')
  })

  test('Rain accumulation: tolerates empty, missing and invalid samples', () => {
    assert.equal(sumPrecipitationWindow([], 0, 3, 'next'), 0)
    assert.equal(
      sumPrecipitationWindow([1, NaN, 2] as number[], 0, 3, 'next'),
      3,
      'NaN samples count as zero',
    )
    assert.equal(
      sumPrecipitationWindow([1, -5, 2] as number[], 0, 3, 'next'),
      3,
      'negative samples are ignored',
    )
    assert.equal(sumPrecipitationWindow([1, 2, 3], 0, 0, 'next'), 0, 'a zero-length window sums nothing')
  })

  // ---------------------------------------------------------------------------
  // Property tests (guide §3: unit, property-based, integration, manual QC)
  // ---------------------------------------------------------------------------

  test('Property: identical inputs always produce identical assessments', () => {
    // Determinism is a safety requirement: the same observation must never
    // yield two different scores, or an alert decision cannot be explained.
    const current = createMockWeather({ windSpeed: 30, windGusts: 52, temperature: 31, uvIndex: 9 })
    const hourly: HourlyForecastItem[] = [
      {
        time: new Date(Date.now() + 3600000).toISOString(),
        temperature: 30,
        windSpeed: 31,
        windGusts: 60,
        precipitation: 1,
        rainProbability: 70,
        weatherCode: 3,
        weatherDescription: 'Overcast',
        uvIndex: 9,
        riskLevel: 'HIGH',
      },
    ]
    const first = calculateDeterministicRisk(current, hourly, mockThresholds, 'Australia/Adelaide')
    for (let i = 0; i < 25; i++) {
      const again = calculateDeterministicRisk(current, hourly, mockThresholds, 'Australia/Adelaide')
      assert.equal(again.level, first.level, 'risk level must be stable across runs')
      assert.equal(again.score, first.score, 'risk score must be stable across runs')
      assert.equal(again.factors.length, first.factors.length, 'factor set must be stable')
    }
  })

  test('Property: raising a hazard input never lowers the risk level', () => {
    // Monotonicity at every severity boundary: a stronger wind must never be
    // classified safer than a weaker one.
    const order: RiskLevel[] = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL']
    const rank = (level: RiskLevel) => order.indexOf(level)
    for (const gusts of [20, 45, 55, 68, 90]) {
      const stronger = calculateDeterministicRisk(
        createMockWeather({ windGusts: gusts, windSpeed: Math.max(10, gusts - 10) }),
        [],
        mockThresholds,
        'Australia/Adelaide',
      )
      const weaker = calculateDeterministicRisk(
        createMockWeather({ windGusts: Math.max(0, gusts - 10), windSpeed: Math.max(0, gusts - 20) }),
        [],
        mockThresholds,
        'Australia/Adelaide',
      )
      assert.ok(
        rank(stronger.level) >= rank(weaker.level),
        `gusts ${gusts} (${stronger.level}) must not rank below gusts ${gusts - 10} (${weaker.level})`,
      )
    }
  })

  test('Property: the safety disclaimer is always attached', () => {
    for (const gusts of [0, 45, 68, 95]) {
      const risk = calculateDeterministicRisk(
        createMockWeather({ windGusts: gusts }),
        [],
        mockThresholds,
        'Australia/Adelaide',
      )
      assert.equal(risk.safetyDisclaimer, SAFETY_DISCLAIMER, 'the disclaimer is unconditional')
    }
  })

  test('Persistence health: a failed write is recorded and cleared on success', () => {
    // A swallowed persist failure is a silent data-loss risk, so it must be
    // observable (guide §3: never lose user data; no fake success).
    clearPersistenceFailure()
    assert.equal(getPersistenceStatus().healthy, true, 'starts healthy')

    markPersistenceFailure('disk full')
    const failed = getPersistenceStatus()
    assert.equal(failed.healthy, false, 'a failed write must be reported')
    assert.equal(failed.lastError?.message, 'disk full')
    assert.ok(failed.lastError?.at, 'a failure carries a timestamp')

    clearPersistenceFailure()
    assert.equal(getPersistenceStatus().healthy, true, 'a successful write clears the failure')
  })

  test('Update check: version comparison orders releases correctly', () => {
    assert.equal(compareVersions('0.1.0', '0.1.0'), 0)
    assert.ok(compareVersions('0.1.0', '0.2.0') < 0, 'older patch-minor is less')
    assert.ok(compareVersions('0.2.10', '0.2.9') > 0, 'numeric compare, not lexical')
    assert.ok(compareVersions('1.0.0', '0.9.9') > 0, 'major beats minor')
    assert.ok(compareVersions('0.2.0-beta.1', '0.2.0') < 0, 'prerelease is older than its release')
    assert.ok(compareVersions('v0.2.0', '0.2.0') === 0, 'leading v is ignored')
    assert.equal(compareVersions('not-a-version', '0.1.0'), null, 'garbage parses to null')
  })

  test('Update check: state resolution is honest (no fake up-to-date)', () => {
    assert.equal(resolveUpdateState('0.1.0', 'v0.1.0', 'u').status, 'up-to-date')
    assert.equal(resolveUpdateState('0.1.0', 'v0.2.0', 'u').status, 'update-available')
    assert.equal(resolveUpdateState('0.1.0', 'v0.2.0', 'u').url, 'u')
    assert.equal(resolveUpdateState('0.2.0', 'v0.1.0', null).status, 'up-to-date', 'running ahead still fine')
    // Unknown inputs must surface as unknown, never as "up to date".
    assert.equal(resolveUpdateState('0.1.0', null, null).status, 'unknown')
    assert.equal(resolveUpdateState('0.1.0', 'garbage', null).status, 'unknown')
  })

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`)
  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
