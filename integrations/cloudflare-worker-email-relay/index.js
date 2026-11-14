/**
 * Construction Weather Monitor — severe-weather email relay
 * (Cloudflare Workers, MIT / open source).
 *
 * The static GitHub Pages build has no server and cannot hold mail credentials,
 * so it POSTs severe (HIGH/CRITICAL) alerts here as JSON. This worker holds the
 * email-provider key server-side and forwards the message.
 *
 * Request body (from the app):
 *   { to?, subject, text, severity, alertId, locationName }
 *
 *   `to` is accepted for compatibility and deliberately ignored: every relayed
 *   alert goes to the configured ALERT_TO, so a caller can never use this worker
 *   as an open relay or a spam amplifier pointing at third parties.
 *
 * Configuration (wrangler secrets / vars):
 *   EMAIL_FROM       required  verified sender, e.g. "alerts@yourdomain.com"
 *   ALERT_TO         required  recipient of every relayed alert
 *   RELAY_SECRET     required  shared secret; callers must send it in the
 *                              `X-Relay-Secret` header. A query-string secret is
 *                              not accepted: URLs leak into proxy, browser and
 *                              referrer logs.
 *   RESEND_API_KEY   optional* Resend API key (https://resend.com — free tier)
 *   BREVO_API_KEY    optional* Brevo API key  (https://brevo.com  — free tier)
 *   ALLOWED_ORIGIN   optional  CORS origin (defaults to "*")
 *
 *   * set exactly one provider key.
 */

const MAX_SUBJECT = 200
const MAX_BODY = 20000

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 500)
  } catch {
    return ''
  }
}

/**
 * Constant-time shared-secret comparison.
 *
 * `===` on a secret leaks it one character at a time to anyone who can measure
 * response timing; hashing both sides first makes the comparison's work
 * independent of where the first difference lies.
 */
async function secretsMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false
  if (provided.length === 0 || expected.length === 0) return false

  const encoder = new TextEncoder()
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const bytesA = new Uint8Array(digestA)
  const bytesB = new Uint8Array(digestB)

  let difference = 0
  for (let i = 0; i < bytesA.length; i++) {
    difference |= bytesA[i] ^ bytesB[i]
  }
  return difference === 0
}

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Relay-Secret',
      'Access-Control-Max-Age': '86400',
    }

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

    // Fail closed. Without a configured secret this endpoint is an open relay:
    // anyone who learns the URL could send mail through the operator's provider
    // account, on the operator's quota and reputation.
    if (!env.RELAY_SECRET) {
      return json({ error: 'Relay is not configured: RELAY_SECRET is required' }, 503, cors)
    }
    const provided = request.headers.get('X-Relay-Secret') || ''
    const authorized = await secretsMatch(provided, env.RELAY_SECRET)
    if (!authorized) {
      return json({ error: 'Unauthorized' }, 401, cors)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, cors)
    }

    // The recipient is never taken from the request (see the header comment).
    const to = env.ALERT_TO
    const subject = String(body.subject || 'Weather alert').slice(0, MAX_SUBJECT)
    const text = String(body.text || '').slice(0, MAX_BODY)

    if (!to) {
      return json({ error: 'No recipient configured: ALERT_TO is required' }, 500, cors)
    }
    if (!env.EMAIL_FROM) {
      return json({ error: 'EMAIL_FROM is not configured' }, 500, cors)
    }

    try {
      if (env.RESEND_API_KEY) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
        })
        if (!res.ok)
          return json({ error: 'Resend rejected the message', detail: await safeText(res) }, 502, cors)
      } else if (env.BREVO_API_KEY) {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { email: env.EMAIL_FROM },
            to: [{ email: to }],
            subject,
            textContent: text,
          }),
        })
        if (!res.ok)
          return json({ error: 'Brevo rejected the message', detail: await safeText(res) }, 502, cors)
      } else {
        return json({ error: 'No provider configured (set RESEND_API_KEY or BREVO_API_KEY)' }, 500, cors)
      }
    } catch (err) {
      return json({ error: 'Relay failed', detail: String(err) }, 502, cors)
    }

    return json({ ok: true }, 200, cors)
  },
}
