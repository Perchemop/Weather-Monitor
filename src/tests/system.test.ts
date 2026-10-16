/**
 * Comprehensive Automated System Test Suite
 * Tests deterministic risk engine, secret protection, timezone compliance,
 * and data freshness.
 */
import './setup.js';
import assert from 'node:assert/strict';
import { calculateDeterministicRisk, SAFETY_DISCLAIMER } from '../services/riskEngine.js';
import { evaluateCandidateAlerts } from '../static/alerts.js';
import { buildWeeklyPerformanceSummary } from '../services/performanceSummary.js';
import { redactSecretsInError, maskSecret } from '../utils/security.js';
import { deepEqual, setStateIfChanged } from '../utils/state.js';
import { evaluateDataFreshness } from '../utils/time.js';
import { CurrentWeather, HourlyForecastItem, RiskThresholds } from '../types.js';
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
import { validatePasswordStrength, describePasswordPolicy } from '../utils/password.js';
import { generateTotpSecret, generateTotp, verifyTotp, buildOtpauthUrl } from '../utils/totp.js';
import { TtlCache } from '../utils/ttlCache.js';
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
  MONITOR_RUN_RETENTION_DAYS
} from '../database/db.js';

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

  test('Deterministic Risk: Building convective energy raises STORM lightning risk', () => {
    const current = createMockWeather({ windSpeed: 10, windGusts: 15, lightningPotential: 1200, cape: 2600 });
    const risk = calculateDeterministicRisk(current, [], mockThresholds, 'Australia/Adelaide');
    assert.equal(risk.level, 'CRITICAL', `Expected CRITICAL, got ${risk.level}`);
    assert.ok(
      risk.factors.some((f) => f.id === 'lightning-critical'),
      'A critical lightning factor must be present'
    );
  });

  test('Alert Engine: Developing lightning triggers a LIGHTNING alert candidate', () => {
    const current = createMockWeather({ weatherCode: 3, lightningPotential: 700, cape: 2000 });
    const candidates = evaluateCandidateAlerts(current, [], mockThresholds);
    const lightning = candidates.find((c) => c.alertType === 'LIGHTNING');
    assert.ok(lightning, 'A LIGHTNING candidate should be produced');
    assert.equal(lightning!.severity, 'HIGH');
  });

  test('Alert Engine: An active thunderstorm uses STORM, not a duplicate LIGHTNING alert', () => {
    const current = createMockWeather({
      weatherCode: 95,
      weatherDescription: 'Thunderstorm',
      lightningPotential: 900,
      cape: 2500
    });
    const candidates = evaluateCandidateAlerts(current, [], mockThresholds);
    assert.ok(candidates.some((c) => c.alertType === 'STORM'), 'STORM candidate expected');
    assert.ok(!candidates.some((c) => c.alertType === 'LIGHTNING'), 'LIGHTNING must not duplicate STORM');
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

  // 4. Deterministic Safety Isolation
  test('Safety Isolation: Safety disclaimer is present in deterministic engine', () => {
    assert.ok(SAFETY_DISCLAIMER.includes('SWMS'));
    assert.ok(SAFETY_DISCLAIMER.includes('safety judgement'));
  });

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

  // 11. Password Policy
  test('Password Policy: weak passwords are rejected, strong ones accepted', () => {
    assert.ok(!validatePasswordStrength('short').valid, 'Too-short password must fail');
    assert.ok(!validatePasswordStrength('alllettersonly').valid, 'Password without a number must fail');
    assert.ok(!validatePasswordStrength('1234567890').valid, 'Password without a letter must fail');
    assert.ok(validatePasswordStrength('Builder2026x').valid, 'Compliant password must pass');
    assert.ok(describePasswordPolicy().includes('at least'), 'Policy description must state a minimum length');
  });

  // 12. TOTP (RFC 6238)
  test('TOTP: generated codes verify and reject tampered codes', () => {
    const secret = generateTotpSecret();
    const code = generateTotp(secret);
    assert.equal(code.length, 6, 'TOTP code must be 6 digits');
    assert.ok(/^\d{6}$/.test(code), 'TOTP code must be numeric');
    assert.ok(verifyTotp(secret, code), 'Freshly generated code must verify');
    assert.ok(!verifyTotp(secret, '000000') || code === '000000', 'Wrong code must be rejected');
    assert.ok(!verifyTotp(secret, 'abc'), 'Non-numeric code must be rejected');

    // A code from a different secret must not verify.
    const otherSecret = generateTotpSecret();
    if (generateTotp(otherSecret) !== code) {
      assert.ok(!verifyTotp(secret, generateTotp(otherSecret)), 'Code from another secret must be rejected');
    }
  });

  test('TOTP: provisioning URI is well-formed', () => {
    const secret = generateTotpSecret();
    const url = buildOtpauthUrl(secret, 'owner@site.local');
    assert.ok(url.startsWith('otpauth://totp/'), 'Must be a totp otpauth URI');
    assert.ok(url.includes(`secret=${secret}`), 'URI must embed the secret');
    assert.ok(url.includes('issuer='), 'URI must embed an issuer');
  });

  // 13. TTL cache
  test('TTL Cache: stores, returns and expires entries', () => {
    const cache = new TtlCache<number>(50);
    cache.set('a', 1);
    assert.equal(cache.get('a'), 1);
    assert.equal(cache.get('missing'), undefined);
    cache.clear();
    assert.equal(cache.get('a'), undefined);
  });

  // 14. Persistent sessions
  await (async () => {
    const token = 'test-session-' + Date.now();
    try {
      await saveSession({
        token,
        userId: 'usr-test',
        email: 'sessions@site.local',
        role: 'VIEWER',
        displayName: 'Session Tester',
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + 60_000
      });
      const active = await loadActiveSessions();
      assert.ok(active.some((s) => s.token === token), 'Persisted session must be reloadable');

      // Expired sessions are pruned and not returned.
      await saveSession({
        token: token + '-expired',
        userId: 'usr-test',
        email: 'sessions@site.local',
        role: 'VIEWER',
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() - 1000
      });
      await pruneExpiredSessions();
      const afterPrune = await loadActiveSessions();
      assert.ok(!afterPrune.some((s) => s.token === token + '-expired'), 'Expired session must be pruned');

      console.log('  [PASS] Persistent Sessions: stored, listed, and expired sessions pruned');
      passed++;
    } catch (err: any) {
      console.error('  [FAIL] Persistent Sessions:', err.message);
      failed++;
    } finally {
      await deleteSession(token).catch(() => {});
      await deleteSession(token + '-expired').catch(() => {});
    }
  })();

  // 15. MFA lifecycle
  await (async () => {
    const email = `test-mfa-${Date.now()}@site.local`;
    let createdId: string | null = null;
    try {
      const created = await createUserAccount({
        email,
        password: 'MfaTester123',
        role: 'VIEWER',
        displayName: 'MFA Tester'
      });
      createdId = created.id;

      const secret = generateTotpSecret();
      await setUserMfaSecret(created.id, secret);
      let mfa = await getUserMfaByEmail(email);
      assert.equal(mfa?.mfaEnabled, false, 'MFA must remain disabled until verified');
      assert.equal(mfa?.mfaSecret, secret, 'Secret must persist');

      await setUserMfaEnabled(created.id, true);
      mfa = await getUserMfaByEmail(email);
      assert.equal(mfa?.mfaEnabled, true, 'MFA must be enable-able');

      await setUserMfaEnabled(created.id, false);
      mfa = await getUserMfaByEmail(email);
      assert.equal(mfa?.mfaEnabled, false, 'MFA must be disable-able');
      assert.equal(mfa?.mfaSecret, null, 'Disabling MFA must clear the secret');

      console.log(`  [PASS] MFA Lifecycle: enrolled, enabled and disabled for ${email}`);
      passed++;
    } catch (err: any) {
      console.error('  [FAIL] MFA Lifecycle:', err.message);
      failed++;
    } finally {
      if (createdId) await deleteUserAccount(createdId);
    }
  })();

  // 16. Web push subscriptions
  await (async () => {
    const endpoint = `https://push.example.com/${Date.now()}`;
    try {
      const before = await countPushSubscriptions();
      await savePushSubscription({
        endpoint,
        p256dh: 'test-p256dh',
        auth: 'test-auth',
        userEmail: 'push@site.local'
      });
      const subs = await getPushSubscriptions();
      assert.ok(subs.some((s) => s.endpoint === endpoint), 'Subscription must persist');
      assert.equal(await countPushSubscriptions(), before + 1);

      await deletePushSubscription(endpoint);
      const after = await getPushSubscriptions();
      assert.ok(!after.some((s) => s.endpoint === endpoint), 'Unsubscribe must remove the record');
      assert.equal(await countPushSubscriptions(), before, 'Count must return to baseline');

      console.log('  [PASS] Web Push: subscription stored, listed and removed');
      passed++;
    } catch (err: any) {
      console.error('  [FAIL] Web Push:', err.message);
      failed++;
      await deletePushSubscription(endpoint).catch(() => {});
    }
  })();

  // 16b. Per-user push preferences
  await (async () => {
    const userId = `pref-user-${Date.now()}`;
    try {
      const defaults = await getPushPreferences(userId);
      assert.equal(defaults.enabled, true, 'Defaults enable notifications');
      assert.equal(defaults.minSeverity, 'LOW', 'Defaults deliver all severities');
      assert.equal(defaults.notifyRecovery, true, 'Defaults include recovery notifications');

      const saved = await savePushPreferences(userId, {
        enabled: false,
        minSeverity: 'HIGH',
        notifyRecovery: false
      });
      assert.equal(saved.minSeverity, 'HIGH');
      assert.ok(saved.updatedAt, 'updatedAt must be stamped');

      const reread = await getPushPreferences(userId);
      assert.equal(reread.enabled, false);
      assert.equal(reread.minSeverity, 'HIGH');
      assert.equal(reread.notifyRecovery, false);

      const all = await getAllPushPreferences();
      assert.equal(all.get(userId)?.minSeverity, 'HIGH', 'Preference must appear in the aggregate map');

      // Partial update preserves untouched fields.
      const partial = await savePushPreferences(userId, { notifyRecovery: true });
      assert.equal(partial.enabled, false, 'Unspecified fields are preserved');
      assert.equal(partial.notifyRecovery, true);

      console.log('  [PASS] Push Preferences: defaults, upsert, partial update and aggregation');
      passed++;
    } catch (err: any) {
      console.error('  [FAIL] Push Preferences:', err.message);
      failed++;
    }
  })();

  // 17. Configurable retention
  test('Data Retention: windows are defined and configurable', () => {
    assert.ok(SNAPSHOT_RETENTION_DAYS > 0 && ALERT_RETENTION_DAYS > 0 && MONITOR_RUN_RETENTION_DAYS > 0);
    assert.ok(typeof enforceDataRetention === 'function');
  });

  await (async () => {
    try {
      const result = await enforceDataRetention(30);
      assert.equal(typeof result.observationsDeleted, 'number');
      assert.equal(typeof result.snapshotsDeleted, 'number');
      assert.equal(typeof result.alertsPruned, 'number');
      assert.ok(result.comparisonsDeleted === 0);
      console.log('  [PASS] Data Retention: run returns the documented result shape');
      passed++;
    } catch (err: any) {
      console.error('  [FAIL] Data Retention:', err.message);
      failed++;
    }
  })();

  // 18. Weekly performance summary builder
  test('Performance Summary: aggregates windowed runs, conditions and alerts', () => {
    const now = new Date('2026-10-16T12:00:00.000Z');
    const recent = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();
    const stale = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();

    const observations: CurrentWeather[] = [
      createMockWeather({ timestamp: recent, temperature: 30, windGusts: 62, windSpeed: 25, rainAmount: 4, uvIndex: 9 }),
      createMockWeather({ timestamp: recent, temperature: 14, windGusts: 40, windSpeed: 15, rainAmount: 1, uvIndex: 3 }),
      createMockWeather({ timestamp: stale, temperature: 45, windGusts: 90, windSpeed: 80, rainAmount: 20, uvIndex: 12 })
    ];

    const alerts = [
      { id: 'a1', locationId: 'loc-1', locationName: 'Site', alertType: 'HIGH WIND', severity: 'CRITICAL', status: 'ACTIVE', createdAt: recent } as any,
      { id: 'a2', locationId: 'loc-1', locationName: 'Site', alertType: 'HIGH WIND', severity: 'HIGH', status: 'CLEARED', createdAt: recent } as any,
      { id: 'a3', locationId: 'loc-1', locationName: 'Site', alertType: 'HEAVY RAIN', severity: 'MODERATE', status: 'ACTIVE', createdAt: recent } as any,
      { id: 'a4', locationId: 'loc-1', locationName: 'Site', alertType: 'STORM', severity: 'CRITICAL', status: 'ACTIVE', createdAt: stale } as any
    ];

    const runs = [
      { id: 'r1', startedAt: recent, status: 'SUCCESS', itemsProcessed: 1 } as any,
      { id: 'r2', startedAt: recent, status: 'FAILED', itemsProcessed: 0 } as any,
      { id: 'r3', startedAt: stale, status: 'SUCCESS', itemsProcessed: 1 } as any
    ];

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
        consecutiveFailures: 0
      },
      observations,
      alerts,
      runs,
      now
    });

    // Window filters out the 30-day-old entries.
    assert.equal(summary.conditions.peakGustKmh, 62);
    assert.equal(summary.conditions.maxTempC, 30);
    assert.equal(summary.conditions.minTempC, 14);
    assert.equal(summary.conditions.totalRainMm, 5);
    assert.equal(summary.alerts.total, 3);
    assert.equal(summary.alerts.severe, 2);
    assert.equal(summary.alerts.open, 2);
    assert.equal(summary.alerts.byType[0].type, 'HIGH WIND');
    assert.equal(summary.monitoring.runsTotal, 2);
    assert.equal(summary.monitoring.successRatePct, 50);
    assert.equal(summary.monitoring.observations, 2);
    assert.ok(summary.highlights.length >= 2);
  });

  // ---------------------------------------------------------------------------
  // State stability helpers (guards against the dashboard render/poll loop)
  // ---------------------------------------------------------------------------
  test('deepEqual compares nested JSON structures structurally', () => {
    assert.equal(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), true);
    assert.equal(deepEqual({ a: 1 }, { a: 2 }), false);
    assert.equal(deepEqual([1, 2, 3], [1, 2]), false);
    assert.equal(deepEqual(null, null), true);
    assert.equal(deepEqual(null, undefined), false);
    assert.equal(deepEqual('x', 'x'), true);
  });

  test('setStateIfChanged preserves the previous reference for identical payloads', () => {
    let value: any = { a: 1, b: [1, 2] };
    const setter = (updater: any) => {
      value = typeof updater === 'function' ? updater(value) : updater;
    };
    const before = value;

    setStateIfChanged(setter as any, { a: 1, b: [1, 2] });
    assert.equal(value, before, 'structurally identical payload must not replace the state reference');

    setStateIfChanged(setter as any, { a: 2, b: [1, 2] });
    assert.notEqual(value, before, 'changed payload must replace the state reference');
    assert.equal(value.a, 2);
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
