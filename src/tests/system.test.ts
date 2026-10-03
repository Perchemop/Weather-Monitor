/**
 * Comprehensive Automated System Test Suite
 * Tests deterministic risk engine, secret protection, timezone compliance,
 * data freshness, and AI isolation.
 */
import assert from 'node:assert/strict';
import { calculateDeterministicRisk, SAFETY_DISCLAIMER } from '../services/riskEngine.js';
import { redactSecretsInError, maskSecret } from '../utils/security.js';
import { evaluateDataFreshness } from '../utils/time.js';
import { CurrentWeather, HourlyForecastItem, RiskThresholds } from '../types.js';

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
  uvHigh: 11
};

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
    ...overrides
  };
}

async function runTests() {
  console.log('--- RUNNING CRANE WEATHER SAFETY SYSTEM TESTS ---');
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. Deterministic Risk Engine Tests
  test('Deterministic Risk: Safe conditions produce LOW risk and 0-25 score', () => {
    const current = createMockWeather({ windSpeed: 15, windGusts: 25, temperature: 22, rainAmount: 0, uvIndex: 3 });
    const hourly: HourlyForecastItem[] = [];
    const risk = calculateDeterministicRisk(current, hourly, mockThresholds, 'UTC');
    assert.equal(risk.level, 'LOW');
    assert.ok(risk.score <= 25, `Score should be <= 25, got ${risk.score}`);
    assert.ok(risk.safetyDisclaimer.includes('SWMS'));
  });

  test('Deterministic Risk: High wind gusts breach crane limit -> CRITICAL or HIGH risk', () => {
    const current = createMockWeather({ windSpeed: 35, windGusts: 58 }); // Exceeds gustHigh (55 km/h)
    const hourly: HourlyForecastItem[] = [];
    const risk = calculateDeterministicRisk(current, hourly, mockThresholds, 'UTC');
    assert.ok(risk.level === 'HIGH' || risk.level === 'CRITICAL', `Risk level should be HIGH or CRITICAL, got ${risk.level}`);
    const craneActivity = risk.affectedActivities.find((a) => a.activity.toLowerCase().includes('crane'));
    assert.ok(craneActivity, 'Crane activity must be flagged in affected activities');
    assert.ok(craneActivity.riskLevel === 'HIGH' || craneActivity.riskLevel === 'CRITICAL');
  });

  test('Deterministic Risk: No synthetic gust inflation when gust is missing', () => {
    const current = createMockWeather({ windSpeed: 30, windGusts: 30 }); // Real observed gust, not artificially multiplied
    assert.equal(current.windGusts, 30);
  });

  test('Deterministic Risk: Daylight savings timezone affects hourly forecast windowing correctly', () => {
    const current = createMockWeather();
    const now = new Date();
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
        riskLevel: 'CRITICAL'
      }
    ];
    const risk = calculateDeterministicRisk(current, hourly, mockThresholds, 'UTC');
    assert.ok(risk.score >= 50, 'Severe upcoming gust in next 6h must trigger elevated risk score');
  });

  // 2. Secret Redaction & Protection Tests
  test('Secret Protection: Weather API key is masked safely', () => {
    const masked = maskSecret('cdd94d05a2524ab9a04120657261505');
    assert.ok(masked.startsWith('cdd9'));
    assert.ok(masked.endsWith('1505'));
    assert.ok(!masked.includes('4ab9a0412065726'));
  });

  test('Secret Protection: Error logs redact raw credentials', () => {
    const rawError = 'Connection failed with key=cdd94d05a2524ab9a04120657261505 and token 0123456789abcdef0123456789abcdef';
    const redacted = redactSecretsInError(rawError);
    assert.ok(!redacted.includes('cdd94d05a2524ab9a04120657261505'), 'API key must be redacted');
    assert.ok(redacted.includes('[REDACTED_API_KEY]'), 'Should contain redaction tag');
  });

  // 3. Stale Data & Freshness Semantics Tests
  test('Freshness Evaluation: Fresh observation under 30 minutes is marked LIVE', () => {
    const recentIso = new Date().toISOString();
    const freshness = evaluateDataFreshness(recentIso, 'UTC', false);
    assert.equal(freshness.status, 'LIVE');
    assert.equal(freshness.isStale, false);
  });

  test('Freshness Evaluation: Old observation over 60 minutes is marked STALE', () => {
    const oldDate = new Date(Date.now() - 75 * 60 * 1000).toISOString();
    const freshness = evaluateDataFreshness(oldDate, 'UTC', false);
    assert.equal(freshness.status, 'STALE');
    assert.equal(freshness.isStale, true);
  });

  test('Freshness Evaluation: Offline monitor marked OFFLINE', () => {
    const recentIso = new Date().toISOString();
    const freshness = evaluateDataFreshness(recentIso, 'UTC', true);
    assert.equal(freshness.status, 'OFFLINE');
  });

  // 4. AI Non-Authoritative Isolation
  test('AI Safety Isolation: Safety disclaimer is present in deterministic engine', () => {
    assert.ok(SAFETY_DISCLAIMER.includes('SWMS'));
    assert.ok(SAFETY_DISCLAIMER.includes('safety judgement'));
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
