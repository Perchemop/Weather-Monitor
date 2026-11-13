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
  /**
   * Shared secret expected by the relay worker's `X-Relay-Secret` header. The
   * bundled example worker refuses to run without one, so leaving it unset only
   * works against a relay the operator has deliberately left open.
   */
  secret?: string | null
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

/**
 * True when a usable relay URL is configured.
 *
 * HTTPS is required: the alert payload carries site names, thresholds and
 * observed values, and `http://` would put all of it in clear text along with
 * any relay secret. Plain HTTP is tolerated only for a loopback address, which
 * is how the bundled worker is exercised in local development.
 */
export function emailRelayConfigured(url?: string | null): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return false
  }
  if (parsed.protocol === 'https:') return true
  if (parsed.protocol !== 'http:') return false
  return ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase())
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

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const secret = config.secret?.trim()
  if (secret) headers['X-Relay-Secret'] = secret

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url as string, {
      method: 'POST',
      headers,
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
