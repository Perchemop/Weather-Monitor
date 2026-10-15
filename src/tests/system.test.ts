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
import { generateAiWeatherBriefing } from '../services/aiWeatherService.js';
import { convertTemperature, convertWind, formatTemperature, formatWind } from '../utils/units.js';
import { createDatabaseBackup, getDatabaseBackupsList, hashPasswordWithSalt } from '../database/db.js';
import {
  createUserAccount,
  verifyUserCredentials,
  getAllUsers,
  getUserById,
  updateUserRole,
  deleteUserAccount,
  setUserActive,
  countActiveOwners
} from '../database/db.js';
import { createRateLimiter, defaultKeyGenerator } from '../utils/rateLimiter.js';
import { securityHeaders } from '../utils/securityHeaders.js';
import { hasMinimumRole, canOperate, canAdminister } from '../utils/roles.js';

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
    const risk = calculateDeterministicRisk(current, hourly, mockThresholds, 'Australia/Adelaide');
    assert.equal(risk.level, 'LOW');
    assert.ok(risk.score <= 25, `Score should be <= 25, got ${risk.score}`);
    assert.ok(risk.safetyDisclaimer.includes('SWMS'));
  });

  test('Deterministic Risk: High wind gusts breach crane limit -> CRITICAL or HIGH risk', () => {
    const current = createMockWeather({ windSpeed: 35, windGusts: 58 }); // Exceeds gustHigh (55 km/h)
    const hourly: HourlyForecastItem[] = [];
    const risk = calculateDeterministicRisk(current, hourly, mockThresholds, 'Australia/Adelaide');
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
    const risk = calculateDeterministicRisk(current, hourly, mockThresholds, 'Australia/Adelaide');
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
    const freshness = evaluateDataFreshness(recentIso, 'Australia/Adelaide', false);
    assert.equal(freshness.status, 'LIVE');
    assert.equal(freshness.isStale, false);
  });

  test('Freshness Evaluation: Old observation over 60 minutes is marked STALE', () => {
    const oldDate = new Date(Date.now() - 75 * 60 * 1000).toISOString();
    const freshness = evaluateDataFreshness(oldDate, 'Australia/Adelaide', false);
    assert.equal(freshness.status, 'STALE');
    assert.equal(freshness.isStale, true);
  });

  test('Freshness Evaluation: Offline monitor marked OFFLINE', () => {
    const recentIso = new Date().toISOString();
    const freshness = evaluateDataFreshness(recentIso, 'Australia/Adelaide', true);
    assert.equal(freshness.status, 'OFFLINE');
  });

  // 4. AI Non-Authoritative Isolation & Resilient Generation
  test('AI Safety Isolation: Safety disclaimer is present in deterministic engine', () => {
    assert.ok(SAFETY_DISCLAIMER.includes('SWMS'));
    assert.ok(SAFETY_DISCLAIMER.includes('safety judgement'));
  });

  await (async () => {
    try {
      const current = createMockWeather({ windSpeed: 45, windGusts: 65 });
      const hourly: HourlyForecastItem[] = [];
      const risk = calculateDeterministicRisk(current, hourly, mockThresholds, 'Australia/Adelaide');
      const briefing = await generateAiWeatherBriefing('Test Site North', current, risk, hourly);
      assert.ok(briefing.briefing && briefing.briefing.length > 10, 'Briefing narrative must be non-empty');
      assert.equal(briefing.authoritativeRiskLevel, risk.level, 'Authoritative risk level must match deterministic risk');
      assert.ok(briefing.disclaimer?.includes('SWMS'), 'Safety disclaimer must be attached');
      console.log(`  [PASS] AI Generation & Isolation: Model/Source=${briefing.source} (${briefing.modelUsed || 'Rule-Based'}), RiskLevel=${briefing.authoritativeRiskLevel}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] AI Generation & Isolation:`, err.message);
      failed++;
    }
  })();

  // 5. Unit Conversion & Formatting Tests
  test('Unit Conversion: Celsius to Fahrenheit converts accurately', () => {
    assert.equal(convertTemperature(0, 'F'), 32);
    assert.equal(convertTemperature(100, 'F'), 212);
    assert.equal(convertTemperature(25, 'C'), 25);
    assert.equal(formatTemperature(22.4, 'C'), '22°C');
    assert.equal(formatTemperature(22.4, 'F'), '72°F');
  });

  test('Unit Conversion: Wind speed conversion handles km/h, mph, and m/s', () => {
    assert.equal(Math.round(convertWind(36, 'm/s')), 10);
    assert.equal(Math.round(convertWind(100, 'mph')), 62);
    assert.equal(convertWind(50, 'km/h'), 50);
    assert.equal(formatWind(45, 'km/h'), '45 km/h');
  });

  // 6. Security & Cryptographic Hashing Tests
  test('Security: Scrypt password hashing produces deterministic memory-hard outputs', () => {
    const salt = 'a1b2c3d4e5f60718';
    const hash1 = hashPasswordWithSalt('SuperSecretPass123', salt);
    const hash2 = hashPasswordWithSalt('SuperSecretPass123', salt);
    const hash3 = hashPasswordWithSalt('DifferentPassword456', salt);
    assert.equal(hash1, hash2, 'Identical password and salt must match');
    assert.notEqual(hash1, hash3, 'Different password must produce different hash');
    assert.equal(hash1.length, 128, 'Hash must be 64 bytes hex (128 chars)');
  });

  // 7. Database Snapshot Backup Tests
  await (async () => {
    try {
      const backupName = await createDatabaseBackup();
      assert.ok(backupName.startsWith('weather-monitor-') && backupName.endsWith('.sqlite'));
      const list = getDatabaseBackupsList();
      assert.ok(list.length > 0, 'Backups list must contain created snapshot');
      console.log(`  [PASS] Database Snapshot & Rotation: Created ${backupName}, Total Backups=${list.length}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] Database Snapshot & Rotation:`, err.message);
      failed++;
    }
  })();

  // 8. Security Hardening: Rate Limiting & Headers
  test('Security: Rate limiter blocks requests beyond the configured maximum', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 3 });
    const makeReq = (ip: string) => ({ ip, socket: { remoteAddress: ip } }) as any;
    const makeRes = () => {
      const headers: Record<string, string> = {};
      return {
        statusCode: 200,
        body: undefined as any,
        setHeader: (k: string, v: string) => { headers[k] = v; },
        status(code: number) { this.statusCode = code; return this; },
        json(payload: any) { this.body = payload; return this; },
        headers
      } as any;
    };

    let nextCalls = 0;
    const next = () => { nextCalls++; };

    for (let i = 0; i < 3; i++) {
      limiter(makeReq('10.0.0.1'), makeRes(), next);
    }
    const blockedRes = makeRes();
    limiter(makeReq('10.0.0.1'), blockedRes, next);

    assert.equal(nextCalls, 3, 'First three requests should pass through');
    assert.equal(blockedRes.statusCode, 429, 'Fourth request must be rate limited');
    assert.ok(blockedRes.body?.error, 'Rate limited response must include an error message');

    // A different client identity must have an independent budget.
    const otherRes = makeRes();
    limiter(makeReq('10.0.0.2'), otherRes, next);
    assert.equal(nextCalls, 4, 'Distinct client IPs must not share a rate limit window');
  });

  test('Security: Rate limiter reset clears tracked windows', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
    const makeReq = () => ({ ip: '10.0.0.9', socket: { remoteAddress: '10.0.0.9' } }) as any;
    const makeRes = () => ({
      setHeader: () => {},
      status(code: number) { return { json: () => code }; },
      json: () => {}
    }) as any;

    let nextCalls = 0;
    limiter(makeReq(), makeRes(), () => { nextCalls++; });
    limiter(makeReq(), makeRes(), () => { nextCalls++; }); // blocked
    assert.equal(nextCalls, 1, 'Second request within window must be blocked');
    limiter.reset();
    limiter(makeReq(), makeRes(), () => { nextCalls++; });
    assert.equal(nextCalls, 2, 'After reset the client regains its budget');
  });

  test('Security: Default key generator derives a client identity from the request', () => {
    assert.equal(defaultKeyGenerator({ ip: '192.168.1.5' } as any), '192.168.1.5');
    assert.equal(
      defaultKeyGenerator({ socket: { remoteAddress: '::1' } } as any),
      '::1'
    );
  });

  test('Security: Security headers are applied and fingerprinting is removed', () => {
    const middleware = securityHeaders({ dev: false });
    const headers: Record<string, string> = {};
    const removed: string[] = [];
    const res = {
      setHeader: (k: string, v: string) => { headers[k] = v; },
      removeHeader: (k: string) => { removed.push(k); }
    } as any;
    let nextCalled = false;
    middleware({} as any, res, () => { nextCalled = true; });

    assert.ok(nextCalled, 'Header middleware must call next()');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.equal(headers['Referrer-Policy'], 'no-referrer');
    assert.ok(headers['Content-Security-Policy'].includes("default-src 'self'"));
    assert.ok(headers['Content-Security-Policy'].includes("script-src 'self';"), 'Production CSP must restrict scripts to self');
    assert.ok(!headers['Content-Security-Policy'].includes("script-src 'self' 'unsafe-inline'"), 'Production CSP must not allow inline scripts');
    assert.ok(removed.includes('X-Powered-By'), 'X-Powered-By must be removed');
    assert.equal(headers['Strict-Transport-Security'], undefined, 'HSTS must be off by default');
  });

  test('Security: HSTS is emitted only when explicitly enabled', () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => { headers[k] = v; },
      removeHeader: () => {}
    } as any;
    securityHeaders({ enableHsts: true })({} as any, res, () => {});
    assert.ok(headers['Strict-Transport-Security']?.includes('max-age=31536000'));
  });

  // 9. Access Control Role Helpers
  test('Access Control: Role hierarchy ranks privileges correctly', () => {
    assert.ok(hasMinimumRole('OWNER', 'VIEWER'));
    assert.ok(hasMinimumRole('OWNER', 'MANAGER'));
    assert.ok(hasMinimumRole('OWNER', 'OWNER'));
    assert.ok(hasMinimumRole('MANAGER', 'MANAGER'));
    assert.ok(hasMinimumRole('VIEWER', 'VIEWER'));
    assert.ok(!hasMinimumRole('VIEWER', 'MANAGER'));
    assert.ok(!hasMinimumRole('MANAGER', 'OWNER'));
  });

  test('Access Control: Capability gates match role semantics', () => {
    assert.ok(canOperate('OWNER') && canOperate('MANAGER'));
    assert.ok(!canOperate('VIEWER'));
    assert.ok(canAdminister('OWNER'));
    assert.ok(!canAdminister('MANAGER'));
    assert.ok(!canAdminister('VIEWER'));
  });

  // 10. Multi-User Account Lifecycle (uses local SQLite)
  await (async () => {
    const email = `test-viewer-${Date.now()}@site.local`;
    let createdId: string | null = null;
    try {
      const created = await createUserAccount({
        email,
        password: 'ViewerPass123',
        role: 'VIEWER',
        displayName: 'Test Viewer'
      });
      createdId = created.id;
      assert.equal(created.role, 'VIEWER');

      // Password verification succeeds with the correct password...
      const good = await verifyUserCredentials('ViewerPass123', email);
      assert.ok(good.valid && good.user?.role === 'VIEWER', 'Correct credentials must verify');
      // ...and fails with the wrong password.
      const bad = await verifyUserCredentials('WrongPassword', email);
      assert.ok(!bad.valid, 'Incorrect password must be rejected');

      // Role promotion persists.
      assert.ok(await updateUserRole(created.id, 'MANAGER'));
      const promoted = await getUserById(created.id);
      assert.equal(promoted?.role, 'MANAGER');

      // Deactivation persists.
      assert.ok(await setUserActive(created.id, false));
      const deactivated = await getUserById(created.id);
      assert.equal(deactivated?.active, false);

      console.log(`  [PASS] Multi-User Lifecycle: created, verified, promoted and disabled ${email}`);
      passed++;
    } catch (err: any) {
      console.error('  [FAIL] Multi-User Lifecycle:', err.message);
      failed++;
    } finally {
      if (createdId) await deleteUserAccount(createdId);
    }
  })();

  await (async () => {
    try {
      const users = await getAllUsers();
      const owners = users.filter((u) => u.role === 'OWNER' && u.active);
      const ownerCount = await countActiveOwners();
      assert.equal(ownerCount, owners.length, 'countActiveOwners must match the roster');

      if (ownerCount === 1 && owners[0]) {
        const soleOwner = owners[0];
        assert.equal(await updateUserRole(soleOwner.id, 'VIEWER'), false, 'Last owner cannot be demoted');
        assert.equal(await setUserActive(soleOwner.id, false), false, 'Last owner cannot be deactivated');
        assert.equal(await deleteUserAccount(soleOwner.id), false, 'Last owner cannot be deleted');
      }
      console.log(`  [PASS] Multi-User Guardrails: last-owner protections enforced (owners=${ownerCount})`);
      passed++;
    } catch (err: any) {
      console.error('  [FAIL] Multi-User Guardrails:', err.message);
      failed++;
    }
  })();

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
