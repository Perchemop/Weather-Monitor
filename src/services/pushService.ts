import webpush from 'web-push';
import {
  savePushSubscription,
  deletePushSubscription,
  getPushSubscriptions,
  getAllPushPreferences,
  DEFAULT_PUSH_PREFERENCES,
  PushSeverityFloor
} from '../database/db.js';
import { readJsonSecret, writeJsonSecret } from '../utils/secretStore.js';
import { logger } from '../utils/logger.js';

/**
 * Web Push delivery.
 *
 * VAPID keys are resolved in priority order:
 *   1. VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY environment variables
 *   2. a persisted key pair in data/vapid.json
 *   3. a freshly generated pair (persisted so subscriptions stay valid)
 */

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId?: string;
  userEmail?: string;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  severity?: string;
  /** Distinguishes recovery (all-clear) notifications for preference filtering. */
  kind?: 'alert' | 'recovery';
}

const SEVERITY_RANK: Record<string, number> = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };

function severityRank(severity?: string): number {
  return SEVERITY_RANK[(severity || '').toUpperCase()] ?? 0;
}

let initialized = false;
let vapidPublicKey = '';

function loadVapidKeys(): VapidKeys | null {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const stored = readJsonSecret<VapidKeys>('vapid.json');
  if (stored?.publicKey && stored?.privateKey) return stored;

  const generated = webpush.generateVAPIDKeys();
  const keys: VapidKeys = { publicKey: generated.publicKey, privateKey: generated.privateKey };
  writeJsonSecret('vapid.json', keys);
  return keys;
}

/** Initialises VAPID details. Idempotent and safe to call at boot. */
export function initPush(): string {
  if (initialized) return vapidPublicKey;

  const keys = loadVapidKeys();
  if (!keys) {
    logger.warn('push_disabled', { reason: 'no_vapid_keys' });
    return '';
  }

  const subject = process.env.VAPID_SUBJECT || 'mailto:owner@localhost';
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);

  vapidPublicKey = keys.publicKey;
  initialized = true;
  logger.info('push_initialised', { subject });
  return vapidPublicKey;
}

export function getVapidPublicKey(): string {
  if (!initialized) initPush();
  return vapidPublicKey;
}

export function isPushConfigured(): boolean {
  return getVapidPublicKey().length > 0;
}

export async function subscribeToPush(input: PushSubscriptionInput): Promise<void> {
  if (!input?.endpoint || !input?.keys?.p256dh || !input?.keys?.auth) {
    throw new Error('Invalid push subscription payload.');
  }
  await savePushSubscription({
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userId: input.userId,
    userEmail: input.userEmail
  });
}

export async function unsubscribeFromPush(endpoint: string): Promise<void> {
  if (!endpoint) return;
  await deletePushSubscription(endpoint);
}

/**
 * Delivers a notification to every stored subscription whose owner has opted
 * in to it. Each user's push preferences are honoured:
 *   - a master `enabled` switch,
 *   - a minimum severity floor for alert notifications,
 *   - an opt-in for recovery (all-clear) notifications.
 * Subscriptions the push service reports as gone (404/410) are pruned.
 */
export async function sendPushToAll(
  payload: PushPayload
): Promise<{ sent: number; failed: number; skipped: number }> {
  if (!isPushConfigured()) return { sent: 0, failed: 0, skipped: 0 };

  const subscriptions = await getPushSubscriptions();
  const preferences = await getAllPushPreferences();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const isRecovery = payload.kind === 'recovery';
  const alertRank = severityRank(payload.severity);

  await Promise.all(
    subscriptions.map(async (sub) => {
      // Resolve the recipient's preferences (permissive defaults when unset).
      const prefs = (sub.userId && preferences.get(sub.userId)) || DEFAULT_PUSH_PREFERENCES;

      if (!prefs.enabled) {
        skipped++;
        return;
      }
      if (isRecovery && !prefs.notifyRecovery) {
        skipped++;
        return;
      }
      if (!isRecovery && alertRank < severityRank(prefs.minSeverity as PushSeverityFloor)) {
        skipped++;
        return;
      }

      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err: any) {
        failed++;
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          // Subscription is no longer valid; remove it.
          await deletePushSubscription(sub.endpoint).catch(() => {});
        } else {
          logger.warn('push_delivery_failed', { status: status || 'unknown' });
        }
      }
    })
  );

  return { sent, failed, skipped };
}

export async function sendAlertPush(input: {
  title: string;
  description?: string;
  severity: string;
  locationName: string;
}): Promise<void> {
  await sendPushToAll({
    title: `${input.severity} weather alert`,
    body: `${input.locationName}: ${input.description || input.title}`,
    tag: `alert-${input.locationName}`,
    url: '/',
    severity: input.severity,
    kind: 'alert'
  });
}

export async function sendRecoveryPush(input: { title: string; locationName: string }): Promise<void> {
  await sendPushToAll({
    title: 'Conditions cleared',
    body: `${input.locationName}: ${input.title}`,
    tag: `recovery-${input.locationName}`,
    url: '/',
    kind: 'recovery'
  });
}
