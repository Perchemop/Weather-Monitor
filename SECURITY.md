# Security Policy

## Reporting a vulnerability privately

**Preferred:** use GitHub **private vulnerability reporting** for this
repository — open
<https://github.com/Perchemop/Weather-Monitor/security/advisories/new>. It
creates a private draft advisory visible only to you and the maintainer.

**Alternative:** contact the maintainer ([@Perchemop](https://github.com/Perchemop))
privately via GitHub, or use the email address listed on their GitHub profile.

Please **do not** open a public issue, discussion, or pull request for a
security problem. If you believe public disclosure is already happening or
about to happen, say so in your report.

Include, as far as you can:

- what you found, and which version/commit is affected;
- how to reproduce it (steps, inputs, screenshots of the effect);
- what you think the impact is (data exposure, alert suppression,
  authentication bypass);
- any suggested fix (optional).

## What to expect

- Acknowledgement within **7 days**.
- An honest assessment of severity and whether it is accepted, including an
  explanation if we conclude it is not a vulnerability for this project.
- Coordinated disclosure: we fix, publish an advisory, and credit the
  reporter when the fix ships.

## Threat model

Understanding what this application is (and is not) helps you decide whether
something counts as a vulnerability here.

| Question                         | Answer for this project                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What does it do?                 | A local-first weather-risk monitor: it polls weather providers, computes deterministic safety assessments against operator thresholds, raises alerts, and stores observations in a local SQLite file.                                                                                                                               |
| Who does it protect?             | Construction site personnel relying on accurate thresholds and timely alerts; and the operator's local machine and data.                                                                                                                                                                                                            |
| What does it trust?              | The weather providers it queries (Open-Meteo, optional WeatherAPI), the operator's authenticated session cookie, and the filesystem where `DATA_DIR` points. It does **not** trust forwarded proxy headers (proxy trust is opt-in), and it treats every HTTP request as hostile input.                                              |
| How could it be misused?         | Credential stuffing / account takeover; SSRF via a crafted location; traversal in backup restore; alert suppression to present a false "all clear"; denial of the monitoring loop; exfiltration of the stored site locations through an information leak.                                                                           |
| What is explicitly out of scope? | Anything requiring the attacker to already control the operator's machine or browser session (no protection is promised against a compromised host); provider-side failures (mitigated by the dual-provider fallback, not guaranteed); and denial-of-wallet on third-party APIs by someone with a copy of the server's credentials. |

## Security properties this project aims to hold

- Password hashing with salted scrypt; no plaintext credentials stored.
- Cookie-only sessions (no tokens in `localStorage`), CSRF double-submit
  protection, per-account login lockout with a configurable policy.
- Optional TOTP two-factor authentication for every account.
- Role-based route gates enforced on the server, never only in the UI.
- No secrets in the repository (secret scanning and push protection are
  enabled); no privileged bot token anywhere in the client — user-supplied
  tokens only.
- Honest failures: errors are reported with real status codes rather than
  fake success states, including for persistence (see
  `cwm_database_persist_healthy`).

## Incident response

1. **Triage** — the maintainer confirms severity within 7 days.
2. **Contain** — for an exposed secret: rotate it and revoke sessions (a
   database restore already forces a full re-login); for a code bug: fix or
   revert on a branch with CI verification.
3. **Fix** — the normal Chat → Task → PR workflow with tests added for the
   exact failure path.
4. **Disclose** — a GitHub Security Advisory (private vulnerability
   reporting is enabled), a CHANGELOG entry, and credit to the reporter.
5. **Notify** — release notes state what operators must do (rebuild,
   rotate, restore, re-login).

## Security roles

- **Triage:** the project owner (this file's "enforcement" contact).
- **Dependency updates:** Dependabot; reviewed under the normal PR flow.
- **Patching:** whoever opens the fix PR; every patch passes the CI gates.
