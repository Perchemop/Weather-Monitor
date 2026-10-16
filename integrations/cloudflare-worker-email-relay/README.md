# Severe-weather email relay (free & open source)

The static GitHub Pages build has **no server**, so it cannot send email — and it
must never ship SMTP/API credentials to the browser. This tiny **Cloudflare
Worker** (MIT, ~130 lines) fixes that: it holds the email-provider key
server-side and forwards severe alerts POSTed by the app.

It runs comfortably inside Cloudflare's **free tier** (100,000 requests/day) and
pairs with a free email provider such as **Resend** (3,000 emails/month) or
**Brevo** (300/day). Total cost: **$0**.

```
Pages app  --HTTPS POST {subject,text,to}-->  Worker  --API key-->  Resend / Brevo  -->  your inbox
```

## 1. Get a free email provider key

- **Resend** — <https://resend.com> → API Keys. Verify a sending domain (or use
  their onboarding `onboarding@resend.dev` sender for testing).
- **Brevo** — <https://brevo.com> → SMTP & API → API Keys.
- (Any provider with an HTTP send API works; extend `index.js` in one spot.)

## 2. Deploy the Worker

```bash
cd integrations/cloudflare-worker-email-relay
npx wrangler login
npx wrangler deploy

# required
npx wrangler secret put EMAIL_FROM          # e.g. alerts@yourdomain.com
npx wrangler secret put ALERT_TO            # e.g. safety@yourdomain.com
npx wrangler secret put RESEND_API_KEY      # or BREVO_API_KEY

# optional but recommended
npx wrangler secret put RELAY_SECRET        # any long random string
npx wrangler secret put ALLOWED_ORIGIN      # https://perchemop.github.io
```

`wrangler deploy` prints the URL, e.g.
`https://cwm-email-relay.<you>.workers.dev`.

## 3. Point the app at it

In the app: **Settings → Cycle & Alerts → Severe Weather Email (Optional Relay)**,
enter the URL (including `?secret=…` if you set `RELAY_SECRET`):

```
https://cwm-email-relay.<you>.workers.dev/?secret=<RELAY_SECRET>
```

Save changes. From then on, every **HIGH** and **CRITICAL** alert raised while the
app is open is POSTed to the Worker and delivered by email. Alerts are
de-duplicated per alert id, and delivery is best-effort (a relay outage never
affects monitoring).

## Notes & limits

- The relay URL is stored **locally in your browser** (IndexedDB/localStorage),
  consistent with the app's local-first design. Treat the `?secret=` as
  low-sensitivity; rotate it if the URL leaks.
- Because the request originates from the browser, email is sent **while the app
  is open** in a tab (mobile browsers throttle background tabs). For 24/7 email
  independent of any browser, run the full server build — it has native SMTP
  support via `nodemailer` (see the main README's alerting section).
- Never commit provider keys. Use `wrangler secret put` (this Worker reads only
  environment secrets).
