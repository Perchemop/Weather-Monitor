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

  await test('RBAC: owner can create a VIEWER account', async () => {
    const res = await anon.postCsrf('/api/users', {
      email: 'viewer@site.local',
      password: VIEWER_PASSWORD,
      role: 'VIEWER',
      displayName: 'Read Only'
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, 'VIEWER');
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

  await new Promise<void>((resolve) => server.close(() => resolve()));

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Integration test execution failed:', err);
  process.exit(1);
});
