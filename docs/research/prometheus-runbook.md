# Research: Prometheus Alert Examples + Operations Runbook

Status: **ready for work** (docs + validated example rules). Target milestone:
0.2.x.

## Behaviour (original summary)

The app already exposes an auth-or-token-gated Prometheus `/metrics` endpoint
(`cwm_*` series, including `cwm_database_persist_healthy`). What is missing is
the consumption side: a documented set of example alerting rules an operator
can paste into Prometheus, and a runbook that says what each firing alert
means and what to do. Prometheus models this with `ALERT` rules evaluated
against recorded expressions and Alertmanager for routing; alerts carry
`labels` (severity) and `annotations` (human summary, `runbook_url`).

## Proposed deliverables

1. `docs/runbook.md` — one section per signal: what it measures, normal
   range, what a firing alert means, first actions, escalation. Honest about
   the app's single-node reality (no HA story promised).
2. `deploy/prometheus/alerts.example.yml` — copy-ready rules covering:
   - `CwmDatabasePersistUnhealthy`: `cwm_database_persist_healthy == 0`
     (critical — silent data-loss risk is the reason this gauge exists, D-20)
   - `CwmMonitorStalled`: monitor status/last-check staleness beyond ~3 cycles
   - `CwmWeatherProviderDown`: provider fallback active for > 15 minutes
   - `CwmHttpErrorRate`: elevated 5xx ratio on `/api/` over 5 minutes
   - `CwmAuthLockouts`: per-account lockout counter spike (possible credential
     stuffing; informational/warning)
3. Each rule: `for:` duration sized to the app's 15-minute default cycle,
   `severity` label (`critical|warning|info`), `summary` +
   `runbook_url` annotations pointing into `docs/runbook.md`.

## Acceptance criteria

1. Every `cwm_*` metric exposed by the app is documented in the runbook with
   its meaning and labels (single source of truth; the metrics handler lists
   them and the doc cross-references it).
2. Example rules validate with `promtool check rules` (checked in CI as a
   lightweight step or documented as a manual command).
3. Every alert's `runbook_url` resolves to an anchored section in
   `docs/runbook.md`.
4. The runbook includes the scrape configuration snippet (bearer-token gated
   `/metrics`) and notes the endpoint's auth behaviour honestly.
5. No alert is louder than useful: each rule states why its threshold/`for`
   was chosen and what a false positive looks like.

## Edge cases

- `/metrics` is auth-gated: scrapers need the token; the runbook shows the
  `authorization.credentials` scrape config and warns about secret handling.
- Single-instance semantics: `absent()` on app-down is handled at the
  orchestrator level (healthz probes), not by these rules — documented.
- Gauge vs counter confusion: persist-health is a gauge (0/1), deliveries are
  counters — rules use `rate()` only on counters.
- Label cardinality: per-location series exist; example rules aggregate where
  a location dimension would explode alert volume.

## Sources (public, URLs only)

- Alerting rules: <https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/>
- Alertmanager configuration/routing: <https://prometheus.io/docs/alerting/latest/configuration/>
- Runbook annotation practice (public example): <https://docs.nais.io/observability/alerting/reference/prometheusrule/>
