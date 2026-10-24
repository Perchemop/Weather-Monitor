# Research: In-App Crash/Bug Report Submission

Status: **draft — awaiting human approval** (operating guide §2.3/§8.4).
Target milestone: 0.2.x. The shipped fallback (pre-filled GitHub issue form)
remains the default until this capability is approved and implemented.

## Capability behaviour (original summary)

Today, reporting a problem leaves the app: Settings → About opens a pre-filled
GitHub issue form in a new tab, and the operator copies across anything they
want to include. The researched capability is an **opt-in, in-app submission
path**: the operator reviews a report preview inside the app, optionally
connects their own GitHub account once (device flow), and the app creates the
issue through the GitHub REST API — with a hard guarantee that nothing is sent
without explicit confirmation and nothing is stored beyond the session.

Three possible designs were considered; the recommendation is (B):

- **(A) Pre-filled URL only (shipped).** Zero token handling, zero risk, but
  the operator leaves the app and formats the report themselves.
- **(B) Device-flow token, memory-only (recommended).** The operator opts in,
  GitHub's device flow yields a short-lived user token held **in memory for
  the tab session only**, and reports are submitted from the client. Keeps the
  "user token only" rule from the operating guide; no privileged bot token
  exists anywhere.
- **(C) Server-side relay.** The Express server holds a token and submits on
  behalf of users. Rejected for 0.2.x: it centralises a credential, turns the
  server into a write path for GitHub, and makes every visitor's report
  appear to come from one identity.

## How device flow works (public behaviour)

1. The app requests a device code from `https://github.com/login/device/code`
   with its public `client_id` (and the minimal scope, see below).
2. GitHub replies with `device_code`, `user_code`, `verification_uri`
   (`https://github.com/login/device`), `expires_in` and `interval`.
3. The app shows the `user_code` and a link; the operator visits the URL on
   any device and enters the code.
4. The app polls the token endpoint with
   `grant_type=urn:ietf:params:oauth:grant-type:device_code`. While the
   operator has not finished, GitHub answers `authorization_pending`; when it
   answers `slow_down`, the poll interval grows by 5 seconds; `expired_token`
   means start over; success returns an access token.
5. The token is used for `POST /repos/{owner}/{repo}/issues` with
   `{ title, body, labels }`.

For a public repository a classic token needs only the `public_repo` scope (a
fine-grained token equivalent: *Issues: read & write* on this repository only).
The OAuth app must have device flow enabled in its developer settings.

## Security & privacy constraints (non-negotiable)

- **No privileged or bot token in the client, ever** (guide §7.1). Only the
  operator's own user token, obtained interactively.
- **Memory only.** The token is never written to `localStorage`,
  `sessionStorage`, cookies, or the server. Losing the tab loses the token —
  that is the intended trade-off against XSS token exfiltration in a web app.
- **Preview before send, cancel any time** (guide §7.1). The modal shows the
  exact title/body/labels that will be created; nothing is transmitted before
  the operator presses "Submit".
- **Payload scrubbing.** The report contains: app version, build mode
  (server/static), browser user-agent, the error message and stack (with
  absolute paths and any token-like strings redacted), and the operator's free
  notes. It never contains session cookies, CSRF tokens, passwords, or
  monitored site locations unless the operator types them in deliberately (the
  preview makes this visible).
- **README privacy note updated** when this ships.

## Acceptance criteria

1. Settings → About offers "Connect GitHub to submit reports" (opt-in). The
   flow shows `user_code` + link, polls with back-off, and surfaces every
   terminal state honestly (`expired`, `denied`, network error).
2. On success the UI shows the connected account login and a "Disconnect"
   action that drops the token immediately.
3. Report modal shows the exact payload; Edit (notes only) and Cancel work;
   Submit is disabled until the preview has been shown at least once.
4. Created issues carry the labels `bug` or `crash` (best-effort: a label
   permission failure must not fail the submission, the issue still lands).
5. Any failure (offline, 4xx/5xx, rate limit) keeps the drafted report on
   screen and offers the existing pre-filled URL fallback unchanged.
6. Token exists only in memory; reloading the page clears it; no storage API
   call ever receives it (verified in tests by spying on storage setters).
7. A pure utility module implements the poll state machine
   (`pending | slow_down | done | expired | denied | error`) and the payload
   scrubber, both unit-tested without network.
8. Docs: README privacy section + `docs/qc/manual-checklist.md` entries.

## Edge cases

- Operator denies the request in the browser → `access_denied` → clear
  message, no retry loop.
- `user_code` expires mid-typing → restart the flow cleanly, never auto-retry.
- Polling must respect `interval` and `slow_down` or GitHub throttles the app.
- Ad-blockers/privacy extensions may block `github.com` API calls → same
  fallback path as offline.
- Repository renamed/moved → 404 → surface the pre-filled URL fallback.
- The `slow_down` + retry loop needs a cap (e.g. 10 attempts) to avoid an
  infinite spinner.

## Sources (public, URLs only)

- Device flow (OAuth apps): <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps>
- Device flow for GitHub Apps: <https://docs.github.com/enterprise-cloud@latest/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app>
- Create an issue (REST): <https://docs.github.com/en/rest/issues/issues>
- REST getting started (endpoint anatomy): <https://docs.github.com/rest/guides/getting-started-with-the-rest-api>
- Token scopes for public repos: <https://docs.github.com/en/rest/repos/repos>

No copyrighted text is reproduced above; all statements are original summaries
of the public behaviour described at the URLs.
