/**
 * Native browser notifications for the static build.
 *
 * With no mail or Web Push backend available, newly triggered and recovered
 * alerts surface through the Notification API while the app is running. This is
 * entirely opt-in and gracefully no-ops where unsupported or denied.
 */

import { AlertItem } from '../types.js';

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined';
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

function show(title: string, options: NotificationOptions): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, options);
  } catch {
    /* Some contexts (e.g. iOS Safari) require a service worker; ignore. */
  }
}

export async function notifyAlert(alert: AlertItem): Promise<void> {
  const critical = alert.severity === 'CRITICAL';
  show(alert.title, {
    body: `${alert.locationName}: ${alert.message}`,
    tag: `cwm-alert-${alert.id}`,
    requireInteraction: critical,
    silent: !critical
  });
}

export async function notifyRecovery(alert: AlertItem, locationName: string): Promise<void> {
  show(`Cleared: ${alert.title}`, {
    body: `${locationName}: conditions have returned to normal.`,
    tag: `cwm-alert-${alert.id}`,
    silent: true
  });
}
