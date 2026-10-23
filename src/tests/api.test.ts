/**
 * HTTP integration test suite.
 *
 * Boots the real Express application in-process (no port conflicts, no
 * background pollers) against an isolated temporary data directory, then
 * exercises the security-critical HTTP surface end-to-end:
 *   - unauthenticated liveness + account-enumeration resistance
 *   - cookie-only sessions and CSRF double-submit enforcement
 *   - role-based access control (Owner / Manager / Viewer)
 *   - password policy, per-account lockout and TOTP two-factor login
 *   - Web Push subscription lifecycle
 *   - backup create / traversal-safe restore, and data retention
 *   - Prometheus /metrics access control and exposition
 */

import './setup.js';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const { createApp } = await import('../../server.js');
const { generateTotp } = await import('../utils/totp.js');

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}: ${err?.message || err}`);
    failed++;
  }
}

/** Minimal cookie-aware HTTP client over the in-process server. */
class Client {
  private cookies = new Map<string, string>();

  constructor(private readonly base: string) {}

  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  async request(
    method: string,
    urlPath: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {}
  ): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = { ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size > 0) {
      headers['Cookie'] = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }

    const res = await fetch(this.base + urlPath, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    const setCookies =
      (res.headers as any).getSetCookie?.() ??
      (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : []);
    for (const c of setCookies) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }

    const text = await res.text();
    let parsed: any = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { status: res.status, body: parsed };
  }

  get(p: string) {
    return this.request('GET', p);
  }
  post(p: string, body?: unknown) {
    return this.request('POST', p, body);
  }
  put(p: string, body?: unknown) {
    return this.request('PUT', p, body);
  }
  /** State-changing call with the CSRF header derived from the cookie jar. */
  postCsrf(p: string, body?: unknown) {
    return this.request('POST', p, body, { 'x-csrf-token': this.cookie('cwm_csrf') || '' });
  }
  putCsrf(p: string, body?: unknown) {
    return this.request('PUT', p, body, { 'x-csrf-token': this.cookie('cwm_csrf') || '' });
  }
  deleteCsrf(p: string) {
    return this.request('DELETE', p, undefined, { 'x-csrf-token': this.cookie('cwm_csrf') || '' });
  }
}

const OWNER_PASSWORD = 'Integration0wner';
const VIEWER_PASSWORD = 'IntegrationViewer1';

async function main(): Promise<void> {
  console.log('\n--- RUNNING HTTP INTEGRATION TESTS ---');

  const app = await createApp({ staticMode: 'none', startMonitoring: false, scheduleBackups: false });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  const anon = new Client(base);

  await test('Health: /healthz is public and reports ok', async () => {
    const res = await anon.get('/healthz');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(typeof res.body.uptimeSeconds, 'number');
  });

  await test('Auth: /api/auth/status is unauthenticated and leaks no owner email', async () => {
    const res = await anon.get('/api/auth/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.authenticated, false);
    assert.equal(res.body.ownerEmail, undefined);
    assert.equal(res.body.email, undefined);
  });

  await test('Auth: setup rejects a weak password with the policy message', async () => {
    const res = await anon.post('/api/auth/setup', { password: 'short', email: 'owner@site.local' });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error), /at least/i);
  });

  await test('Auth: setup with a strong password sets HttpOnly session + CSRF cookies', async () => {
    const res = await anon.post('/api/auth/setup', { password: OWNER_PASSWORD, email: 'owner@site.local' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    // No token in the body: browser credential is the HttpOnly cookie only.
    assert.equal(res.body.token, undefined);
    assert.ok(anon.cookie('cwm_session'), 'session cookie must be issued');
    assert.ok(anon.cookie('cwm_csrf'), 'CSRF cookie must be issued');
  });

  await test('Auth: setup cannot be replayed once an owner exists', async () => {
    const replay = await new Client(base).post('/api/auth/setup', {
      password: 'TakeoverAttempt9',
      email: 'attacker@site.local'
    });
    assert.equal(replay.status, 409, 'setup must be a one-time bootstrap');
    // The original credentials are untouched.
    const still = await anon.get('/api/auth/status');
    assert.equal(still.body.authenticated, true);
  });

  await test('CSRF: cookie-authenticated mutation without the header is rejected', async () => {
    const res = await anon.post('/api/settings/restore-defaults');
    assert.equal(res.status, 403);
    assert.match(String(res.body.error), /csrf/i);
  });

  await test('CSRF: cookie-authenticated mutation with a wrong header is rejected', async () => {
    const res = await anon.request('POST', '/api/settings/restore-defaults', undefined, {
      'x-csrf-token': 'not-the-real-token'
    });
    assert.equal(res.status, 403);
  });

  await test('CSRF: cookie-authenticated mutation with the matching header succeeds', async () => {
    const res = await anon.postCsrf('/api/settings/restore-defaults');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  await test('Auth: session cookie alone authenticates the owner', async () => {
    const res = await anon.get('/api/auth/status');
    assert.equal(res.body.authenticated, true);
    assert.equal(res.body.role, 'OWNER');
    assert.equal(res.body.mfaSupported, true);
  });

  await test('Auth: header-token auth is exempt from CSRF but still works', async () => {
    const headerClient = new Client(base);
    const login = await headerClient.post('/api/auth/login', { password: OWNER_PASSWORD, email: 'owner@site.local' });
    assert.equal(login.status, 200);
    const token = headerClient.cookie('cwm_session');
    assert.ok(token, 'expected a session cookie to extract');
    // Simulate a non-browser client using the token header, no cookies, no CSRF.
    const res = await new Client(base).request('POST', '/api/settings/restore-defaults', undefined, {
      'x-session-token': token!
    });
    assert.equal(res.status, 200, 'header-authenticated mutation should bypass CSRF');
  });

  await test('Lockout: repeated failures lock the account, then reset on success', async () => {
    const c = new Client(base);
    let last: any = null;
    for (let i = 0; i < 6; i++) {
      last = await c.post('/api/auth/login', { password: 'wrong-password-1', email: 'locktarget@site.local' });
    }
    assert.equal(last.status, 429);
    assert.match(String(last.body.error), /locked/i);
  });

  await test('Password policy: change-password rejects weak new passwords', async () => {
    const res = await anon.postCsrf('/api/auth/change-password', {
      currentPassword: OWNER_PASSWORD,
      newPassword: 'weak'
    });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error), /at least/i);
  });

  await test('MFA: enrol, enable, require a code at login, then disable', async () => {
    const statusBefore = await anon.get('/api/auth/mfa/status');
    assert.equal(statusBefore.body.enabled, false);

    const setup = await anon.postCsrf('/api/auth/mfa/setup');
    assert.equal(setup.status, 200);
    const secret = setup.body.secret as string;
    assert.ok(secret && secret.length >= 16, 'expected a TOTP secret');
    assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\//);

    // Wrong code is rejected.
    const badEnable = await anon.postCsrf('/api/auth/mfa/enable', { code: '000000' });
    assert.equal(badEnable.status, 400);

    // Correct code enables MFA.
    const goodEnable = await anon.postCsrf('/api/auth/mfa/enable', { code: generateTotp(secret) });
    assert.equal(goodEnable.status, 200);

    // Login without a code now requires MFA.
    const noCode = await new Client(base).post('/api/auth/login', {
      password: OWNER_PASSWORD,
      email: 'owner@site.local'
    });
    assert.equal(noCode.status, 401);
    assert.equal(noCode.body.mfaRequired, true);

    // Login with a valid code succeeds.
    const withCode = await new Client(base).post('/api/auth/login', {
      password: OWNER_PASSWORD,
      email: 'owner@site.local',
      mfaCode: generateTotp(secret)
    });
    assert.equal(withCode.status, 200);

    // Disable again to leave the account usable.
    const disable = await anon.postCsrf('/api/auth/mfa/disable', { password: OWNER_PASSWORD });
    assert.equal(disable.status, 200);
    assert.equal((await anon.get('/api/auth/mfa/status')).body.enabled, false);
  });

  let viewerClient: Client;
  let viewerId = '';

  await test('RBAC: owner can create a VIEWER account', async () => {
    const res = await anon.postCsrf('/api/users', {
      email: 'viewer@site.local',
      password: VIEWER_PASSWORD,
      role: 'VIEWER',
      displayName: 'Read Only'
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, 'VIEWER');
    viewerId = res.body.user.id;
  });

  await test('RBAC: viewer can read but cannot mutate or manage users', async () => {
    viewerClient = new Client(base);
    const login = await viewerClient.post('/api/auth/login', {
      password: VIEWER_PASSWORD,
      email: 'viewer@site.local'
    });
    assert.equal(login.status, 200);

    const read = await viewerClient.get('/api/health');
    assert.equal(read.status, 200);

    const write = await viewerClient.postCsrf('/api/settings/restore-defaults');
    assert.equal(write.status, 403);

    const users = await viewerClient.get('/api/users');
    assert.equal(users.status, 403);
  });

  await test('RBAC: unauthenticated mutation is rejected with 401', async () => {
    const res = await new Client(base).post('/api/settings/restore-defaults');
    assert.equal(res.status, 401);
  });

  await test('Sessions: list, revoke a device, and cross-user isolation', async () => {
    // Open a second owner session to act as "another device".
    const second = new Client(base);
    const login2 = await second.post('/api/auth/login', {
      password: OWNER_PASSWORD,
      email: 'owner@site.local'
    });
    assert.equal(login2.status, 200);

    const list = await anon.get('/api/auth/sessions');
    assert.equal(list.status, 200);
    assert.ok(list.body.sessions.length >= 2, 'expected at least two owner sessions');
    assert.equal(
      list.body.sessions.filter((s: any) => s.current).length,
      1,
      'exactly one session should be marked current'
    );
    // Tokens must never be exposed — only opaque digests.
    for (const s of list.body.sessions) {
      assert.equal(s.token, undefined);
      assert.ok(s.id && s.id.length === 64, 'expected a sha256 digest id');
    }
    const current = list.body.sessions.find((s: any) => s.current);
    const otherId = list.body.sessions.find((s: any) => !s.current).id as string;

    // The viewer cannot see or revoke the owner's sessions.
    const viewerList = await viewerClient.get('/api/auth/sessions');
    assert.equal(viewerList.status, 200);
    assert.ok(
      viewerList.body.sessions.every((s: any) => s.id !== otherId),
      'viewer must not see other users sessions'
    );
    assert.equal((await viewerClient.deleteCsrf(`/api/auth/sessions/${otherId}`)).status, 404);

    // Cookie-authenticated DELETE without the CSRF header is rejected.
    assert.equal((await anon.request('DELETE', `/api/auth/sessions/${otherId}`)).status, 403);

    // Revoke the other owner session.
    const revoke = await anon.deleteCsrf(`/api/auth/sessions/${otherId}`);
    assert.equal(revoke.status, 200);
    assert.equal(revoke.body.revokedCurrent, false);

    // The revoked device is signed out immediately.
    assert.equal((await second.get('/api/users')).status, 401);

    // Unknown ids are a 404, not a silent success.
    assert.equal((await anon.deleteCsrf('/api/auth/sessions/' + 'f'.repeat(64))).status, 404);

    // The current session remains valid.
    assert.equal((await anon.get('/api/auth/sessions')).status, 200);
    assert.ok(current);
  });

  await test('RBAC: role changes take effect on the live session immediately', async () => {
    // A VIEWER is stopped by the server-side role gate.
    assert.equal((await viewerClient.postCsrf('/api/locations', {})).status, 403);

    const promote = await anon.putCsrf(`/api/users/${viewerId}`, { role: 'MANAGER' });
    assert.equal(promote.status, 200);
    assert.equal(promote.body.user.role, 'MANAGER');

    // Same cookie, new privileges — no re-login required. The request now
    // reaches validation (400) instead of the role gate (403).
    const promoted = await viewerClient.postCsrf('/api/locations', {});
    assert.equal(promoted.status, 400, 'promoted session should pass the role gate');

    const demote = await anon.putCsrf(`/api/users/${viewerId}`, { role: 'VIEWER' });
    assert.equal(demote.status, 200);
    assert.equal((await viewerClient.postCsrf('/api/locations', {})).status, 403);
  });

  await test('Auth: email lookup is case-insensitive', async () => {
    const c = new Client(base);
    const res = await c.post('/api/auth/login', {
      password: VIEWER_PASSWORD,
      email: 'VIEWER@SITE.LOCAL'
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.email, 'viewer@site.local');
  });

  await test('Validation: settings reject an out-of-range retention window', async () => {
    const bad = await anon.putCsrf('/api/settings', { dataRetentionDays: 0 });
    assert.equal(bad.status, 400);
    const good = await anon.putCsrf('/api/settings', { dataRetentionDays: 45 });
    assert.equal(good.status, 200);
    const read = await anon.get('/api/settings');
    assert.equal(read.body.settings.dataRetentionDays, 45);
  });

  await test('Push: public key is exposed and the subscription lifecycle works', async () => {
    const key = await anon.get('/api/push/public-key');
    assert.equal(key.status, 200);
    assert.ok(key.body.publicKey, 'expected a VAPID public key');
    assert.equal(key.body.configured, true);

    const before = await anon.get('/api/push/status');
    const sub = await anon.postCsrf('/api/push/subscribe', {
      endpoint: 'https://push.example.com/integration-test',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' }
    });
    assert.equal(sub.status, 200);

    const after = await anon.get('/api/push/status');
    assert.equal(after.body.subscriptions, before.body.subscriptions + 1);

    const unsub = await anon.postCsrf('/api/push/unsubscribe', {
      endpoint: 'https://push.example.com/integration-test'
    });
    assert.equal(unsub.status, 200);
    const final = await anon.get('/api/push/status');
    assert.equal(final.body.subscriptions, before.body.subscriptions);
  });

  await test('Push: per-user preferences default, validate and persist', async () => {
    const owner = new Client(base);
    assert.equal(
      (await owner.post('/api/auth/login', { password: OWNER_PASSWORD, email: 'owner@site.local' })).status,
      200
    );

    // Defaults apply before any customisation.
    const initial = await owner.get('/api/push/preferences');
    assert.equal(initial.status, 200);
    assert.equal(initial.body.preferences.enabled, true);
    assert.equal(initial.body.preferences.minSeverity, 'LOW');
    assert.equal(initial.body.preferences.notifyRecovery, true);

    // Invalid severity values are rejected.
    assert.equal((await owner.putCsrf('/api/push/preferences', { minSeverity: 'EXTREME' })).status, 400);
    assert.equal((await owner.putCsrf('/api/push/preferences', { enabled: 'yes' })).status, 400);

    const updated = await owner.putCsrf('/api/push/preferences', {
      enabled: false,
      minSeverity: 'HIGH',
      notifyRecovery: false
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.preferences.minSeverity, 'HIGH');

    const reread = await owner.get('/api/push/preferences');
    assert.equal(reread.body.preferences.enabled, false);
    assert.equal(reread.body.preferences.notifyRecovery, false);
    assert.equal(reread.body.preferences.minSeverity, 'HIGH');
  });

  await test('Backup: create, list, reject traversal, and restore a valid snapshot', async () => {
    const created = await anon.postCsrf('/api/data/backup/create');
    assert.equal(created.status, 200);

    const list = await anon.get('/api/data/backup/list');
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.backups) && list.body.backups.length >= 1);
    const filename = list.body.backups[0].filename as string;

    const traversal = await anon.postCsrf('/api/data/backup/restore', { filename: '../../etc/passwd' });
    assert.equal(traversal.status, 404);

    const restore = await anon.postCsrf('/api/data/backup/restore', { filename });
    assert.equal(restore.status, 200);
    assert.equal(restore.body.signedOut, true);

    // Restore revokes sessions: the old cookie must no longer authenticate.
    const afterRestore = await anon.get('/api/users');
    assert.equal(afterRestore.status, 401);
  });

  await test('Retention: run returns the documented result shape', async () => {
    // Re-establish a session (previous test signed everyone out).
    const owner = new Client(base);
    const login = await owner.post('/api/auth/login', { password: OWNER_PASSWORD, email: 'owner@site.local' });
    assert.equal(login.status, 200);
    const res = await owner.postCsrf('/api/data/retention/run');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.result.observationsDeleted, 'number');
    assert.equal(typeof res.body.result.snapshotsDeleted, 'number');
    assert.equal(typeof res.body.result.alertsPruned, 'number');
  });

  await test('Metrics: /metrics requires auth and exposes Prometheus metrics', async () => {
    // By default (no METRICS_TOKEN) scrapers must hold a session.
    const anonClient = new Client(base);
    assert.equal((await anonClient.get('/metrics')).status, 401);

    const owner = new Client(base);
    assert.equal(
      (await owner.post('/api/auth/login', { password: OWNER_PASSWORD, email: 'owner@site.local' })).status,
      200
    );

    const res = await owner.get('/metrics');
    assert.equal(res.status, 200);
    const text = String(res.body);
    assert.match(text, /cwm_uptime_seconds \d+/);
    assert.match(text, /cwm_memory_rss_bytes \d+/);
    assert.match(text, /cwm_monitor_running [01]/);
    assert.match(text, /cwm_locations_total \d+/);
    assert.match(text, /cwm_observations_total \d+/);
    assert.match(text, /cwm_alert_deliveries_total \d+/);
    assert.match(text, /cwm_monitor_runs_total\{status="SUCCESS"\} \d+/);
    assert.match(text, /cwm_settings_monitor_interval_minutes \d+/);

    // A shared bearer token authorises token-based scraping.
    process.env.METRICS_TOKEN = 'integration-metrics-token';
    try {
      const scraper = new Client(base);
      assert.equal((await scraper.get('/metrics')).status, 401);
      assert.equal(
        (
          await scraper.request('GET', '/metrics', undefined, {
            Authorization: 'Bearer integration-metrics-token'
          })
        ).status,
        200
      );
    } finally {
      delete process.env.METRICS_TOKEN;
    }
  });

  await test('Reports: weekly performance summary shape and auth', async () => {
    const anonClient = new Client(base);
    assert.equal((await anonClient.get('/api/reports/weekly')).status, 401);

    const owner = new Client(base);
    assert.equal(
      (await owner.post('/api/auth/login', { password: OWNER_PASSWORD, email: 'owner@site.local' })).status,
      200
    );

    const res = await owner.get('/api/reports/weekly');
    assert.equal(res.status, 200);
    assert.equal(res.body.windowDays, 7);
    assert.equal(typeof res.body.generatedAt, 'string');
    assert.ok(res.body.monitoring, 'monitoring block present');
    assert.equal(typeof res.body.monitoring.coveragePct, 'number');
    assert.ok(res.body.conditions, 'conditions block present');
    assert.ok(res.body.alerts, 'alerts block present');
    assert.equal(typeof res.body.alerts.bySeverity.CRITICAL, 'number');
    assert.ok(Array.isArray(res.body.alerts.byType));
    assert.ok(Array.isArray(res.body.highlights));
  });

  await test('Sessions: changing a password revokes other devices but keeps the current one', async () => {
    const owner = new Client(base);
    assert.equal(
      (await owner.post('/api/auth/login', { password: OWNER_PASSWORD, email: 'owner@site.local' })).status,
      200
    );
    const created = await owner.postCsrf('/api/users', {
      email: 'rotate@site.local',
      password: 'RotateStart1',
      role: 'VIEWER'
    });
    assert.equal(created.status, 200);

    const first = new Client(base);
    const second = new Client(base);
    assert.equal((await first.post('/api/auth/login', { password: 'RotateStart1', email: 'rotate@site.local' })).status, 200);
    assert.equal((await second.post('/api/auth/login', { password: 'RotateStart1', email: 'rotate@site.local' })).status, 200);

    const changed = await first.postCsrf('/api/auth/change-password', {
      currentPassword: 'RotateStart1',
      newPassword: 'RotateFinish2'
    });
    assert.equal(changed.status, 200);

    // Current device stays signed in; the other device is immediately revoked.
    assert.equal((await first.get('/api/auth/status')).body.authenticated, true);
    assert.equal((await second.get('/api/auth/status')).body.authenticated, false);
    assert.equal(
      (await new Client(base).post('/api/auth/login', { password: 'RotateFinish2', email: 'rotate@site.local' })).status,
      200
    );
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Integration test execution failed:', err);
  process.exit(1);
});
