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
 * Configuration (wrangler secrets / vars):
 *   EMAIL_FROM       required  verified sender, e.g. "alerts@yourdomain.com"
 *   ALERT_TO         optional  default recipient if the request omits `to`
 *   RESEND_API_KEY   optional* Resend API key (https://resend.com — free tier)
 *   BREVO_API_KEY    optional* Brevo API key  (https://brevo.com  — free tier)
 *   RELAY_SECRET     optional  shared secret; when set, callers must send it as
 *                              the `X-Relay-Secret` header or a `?secret=` query
 *                              parameter
 *   ALLOWED_ORIGIN   optional  CORS origin (defaults to "*")
 *
 *   * set exactly one provider key.
 */

const MAX_SUBJECT = 200;
const MAX_BODY = 20000;

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '';
  }
}

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Relay-Secret',
      'Access-Control-Max-Age': '86400'
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

    // Optional shared-secret gate.
    if (env.RELAY_SECRET) {
      const provided =
        request.headers.get('X-Relay-Secret') || new URL(request.url).searchParams.get('secret');
      if (provided !== env.RELAY_SECRET) return json({ error: 'Unauthorized' }, 401, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, cors);
    }

    const to = body.to || env.ALERT_TO;
    const subject = String(body.subject || 'Weather alert').slice(0, MAX_SUBJECT);
    const text = String(body.text || '').slice(0, MAX_BODY);

    if (!to) return json({ error: 'No recipient (set ALERT_TO or include `to`)' }, 400, cors);
    if (!env.EMAIL_FROM) return json({ error: 'EMAIL_FROM is not configured' }, 500, cors);

    try {
      if (env.RESEND_API_KEY) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text })
        });
        if (!res.ok) return json({ error: 'Resend rejected the message', detail: await safeText(res) }, 502, cors);
      } else if (env.BREVO_API_KEY) {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { email: env.EMAIL_FROM },
            to: [{ email: to }],
            subject,
            textContent: text
          })
        });
        if (!res.ok) return json({ error: 'Brevo rejected the message', detail: await safeText(res) }, 502, cors);
      } else {
        return json({ error: 'No provider configured (set RESEND_API_KEY or BREVO_API_KEY)' }, 500, cors);
      }
    } catch (err) {
      return json({ error: 'Relay failed', detail: String(err) }, 502, cors);
    }

    return json({ ok: true }, 200, cors);
  }
};
