/**
 * Optional severe-weather email relay for the static build.
 *
 * GitHub Pages cannot send mail: there is no server, and any SMTP/email-API
 * secret embedded in the page would be public. So instead of shipping a secret
 * to the browser, the operator may point the app at *their own* relay endpoint —
 * the bundled `integrations/cloudflare-worker-email-relay` worker is a free,
 * open-source example — which holds the email-provider key server-side.
 *
 * When a relay URL is configured, severe (HIGH / CRITICAL) alerts are POSTed as
 * JSON to that endpoint. When it is left blank the app stays browser-only and
 * nothing leaves the page. Delivery is best-effort and de-duplicated per alert.
 */

import { AlertItem } from '../types.js'

export interface EmailRelayConfig {
  url?: string | null
  recipient?: string | null
  locationName?: string | null
}

const SENT_KEY = 'cwm.emailRelay.sent.v1'
const TIMEOUT_MS = 8000
const MAX_REMEMBERED = 200

function loadSent(): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(SENT_KEY)
    const arr = raw ? (JSON.parse(raw) as string[]) : []
    return new Set<string>(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set<string>()
  }
}

function saveSent(set: Set<string>): void {
  try {
    globalThis.localStorage?.setItem(SENT_KEY, JSON.stringify([...set].slice(-MAX_REMEMBERED)))
  } catch {
    /* storage unavailable — relay just fires without cross-reload memory */
  }
}

/** True when a syntactically valid HTTPS(S) relay URL is configured. */
export function emailRelayConfigured(url?: string | null): boolean {
  return Boolean(url && /^https?:\/\//i.test(url.trim()))
}

/**
 * Sends a severe alert to the configured relay. Returns true when the relay
 * accepted the alert (or it was already relayed). Never throws.
 */
export async function dispatchAlertEmail(alert: AlertItem, config: EmailRelayConfig): Promise<boolean> {
  const url = config.url?.trim()
  if (!emailRelayConfigured(url)) return false

  const sent = loadSent()
  if (sent.has(alert.id)) return true

  const payload = {
    to: config.recipient || undefined,
    subject: `[${alert.severity}] ${alert.title} — ${alert.locationName}`,
    text: [
      alert.title,
      '',
      `Severity:        ${alert.severity}`,
      `Site:            ${alert.locationName}`,
      `Type:            ${alert.alertType}`,
      `Observed value:  ${alert.observedValue}`,
      `Threshold:       ${alert.thresholdValue}`,
      `Trigger:         ${alert.triggerCondition}`,
      `Started:         ${alert.startTime}`,
      `Expected duration: ${alert.expectedDuration}`,
      '',
      alert.message,
    ].join('\n'),
    severity: alert.severity,
    alertId: alert.id,
    locationName: alert.locationName,
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) return false
    sent.add(alert.id)
    saveSent(sent)
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}
