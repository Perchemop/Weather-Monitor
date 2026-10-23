# Scope

What the Construction Weather Monitor does, what it deliberately does not, and
what is deferred.

## In scope

- Multi-site weather monitoring with per-site timezone handling.
- Deterministic risk scoring across WIND, GUST, RAIN, TEMPERATURE, UV and STORM.
- Construction activity risk matrix (crane, scaffold, roof, height, concrete,
  excavation, lifting, general outdoor work).
- Dual-provider data with cross-reference concordance scoring and fallback.
- Alert lifecycle: trigger, dedupe, escalate, clear, dismiss, recover, and
  deliver by Web Push and optional SMTP email.
- Autonomous monitoring loop with configurable interval and run history.
- Authentication and role-based access control for OWNER / MANAGER / VIEWER.
- Self-service account security: password change, TOTP MFA, active-session
  review/revoke, push preferences.
- Local persistence, retention pruning, rotating backups, and restore.
- Operational endpoints: `/healthz` and Prometheus `/metrics`.
- PWA installability, offline shell, and a browser-only static build.
- Live weather map (radar, rain, wind direction, lightning energy).

## Out of scope

- Acting as a certified safety management system or replacing SWMS.
- Automatic control of cranes or other plant.
- Third-party analytics, advertising, or telemetry.
- Storing data outside the operator's own enclave (beyond configured alerts).

## Deferred / possible future work

- Multi-architecture container images and a release pipeline.
- DOM/browser-level automated UI tests (current UI checks are type-check, build
  and a manual checklist).
- Alert delivery channels beyond Web Push and SMTP (e.g. SMS).
- Historical data export beyond the on-screen weekly report and text export.

## Constraints

- The developer machine is memory-constrained; all heavy work (installs, tests,
  builds, container builds) runs in GitHub Actions.
- The default deployment is a plain-HTTP local enclave, so HTTPS-only features
  (Secure cookies, HSTS) are opt-in.
- No secrets are committed; provider credentials are supplied via environment
  variables.
