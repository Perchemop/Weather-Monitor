# Operations Runbook — Construction Weather Monitor

This runbook documents the Prometheus metrics exposed by the
Construction Weather Monitor, how to scrape them, what each alert means,
and the first actions to take when it fires. It is deliberately single-node
and honest about limits (no HA story is promised).

## Scrape configuration

The app exposes Prometheus in OpenMetrics text format at `GET /metrics`.

The endpoint is **auth-gated**. Scrape with one of:

* A valid session cookie (browser login) – for ad-hoc checks only.
* The shared bearer token `METRICS_TOKEN` (set in `.env`). Scrape config:

```yaml
scrape_configs:
  - job_name: weather-monitor
    static_configs:
      - targets: ['weather-monitor:3000']
    metrics_path: /metrics
    scheme: http
    authorization:
      credentials: '<METRICS_TOKEN>'
```

Secrets: never commit `METRICS_TOKEN`. Rotate it by changing the env var and
restarting the service; Prometheus will retry and succeed on the next scrape.

The `/metrics` handler is a snapshot (no push). It is not a replacement for
health probes; use `/api/health` and container probes for liveness.

## Metrics catalogue

### Process health

| Metric | Type | Meaning | Normal |
|---|---|---|---|
| `cwm_uptime_seconds` | gauge | Process uptime. | Grows steadily. |
| `cwm_memory_rss_bytes` | gauge | Resident set size. | Stable, within host limits. |
| `cwm_memory_heap_used_bytes` | gauge | V8 heap used. | Stable, grows with data, GC drops it. |

### Monitoring loop

| Metric | Type | Meaning | Normal |
|---|---|---|---|
| `cwm_monitor_running` | gauge | 1 = loop running. | 1 |
| `cwm_monitor_consecutive_failures` | gauge | Consecutive failed cycles. | 0 |
| `cwm_monitor_last_check_timestamp_seconds` | gauge | Unix time of last completed cycle. | Advances every `monitor_interval_minutes` |

### Data model

| Metric | Type | Meaning | Normal |
|---|---|---|---|
| `cwm_locations_total` | gauge | Configured locations. | >0 after setup |
| `cwm_observations_total` | gauge | Stored weather observations. | Grows |
| `cwm_active_alerts` | gauge | Currently active alerts. | Usually 0; spikes during events |
| `cwm_users_total` | gauge | User accounts. | >=1 |
| `cwm_sessions_active` | gauge | Active login sessions. | Low single digits |
| `cwm_push_subscriptions_total` | gauge | Stored Web Push subscriptions. | >=0 |

### Integration configuration

| Metric | Type | Meaning | Normal |
|---|---|---|---|
| `cwm_weather_api_configured` | gauge | 1 if WeatherAPI key present. | 0 or 1 per deployment |
| `cwm_smtp_configured` | gauge | 1 if SMTP is configured. | 0 or 1 per deployment |
| `cwm_settings_monitor_interval_minutes` | gauge | Configured interval. | 15 (default) |
| `cwm_settings_data_retention_days` | gauge | Retention window. | Per policy |

### Persistence health

| Metric | Type | Meaning | Normal |
|---|---|---|---|
| `cwm_database_persist_healthy` | gauge | 1 while SQLite writes succeed. | 1 — **0 means data-loss risk** |

### Counters

| Metric | Type | Meaning |
|---|---|---|
| `cwm_alert_deliveries_total` | counter | Total alert delivery records. |
| `cwm_monitor_runs_total{status}` | counter | Completed cycles by outcome (`SUCCESS`, `PARTIAL`, `FAILED`, `RUNNING`). |

## Example alerts

Copy the rules in `deploy/prometheus/alerts.example.yml`. Each rule has a
`runbook_url` annotation that points to this file.

### CwmDatabasePersistUnhealthy

*Expression*: `cwm_database_persist_healthy == 0`
*For*: `5m`
*Severity*: `critical`

What it means: SQLite writes are failing or the database file is not healthy.
The app will continue to serve reads, but new observations and alerts may be
lost.

First actions:
1. Check the host disk space and inode usage (`df -h`, `df -i`).
2. Verify the database file is writable by the process user.
3. Look for SQLite errors in the app logs (`logger.error('db_*'`).
4. If the file is corrupted, restore from the latest backup in `./data/backup/`.
5. After fixing, verify the metric returns to 1 and monitoring cycles resume.

False positives: brief blips during a DB vacuum or backup; the `for: 5m`
window avoids noise.

### CwmMonitorStalled

*Expression*: `time() - cwm_monitor_last_check_timestamp_seconds > 3 * cwm_settings_monitor_interval_minutes * 60`
*For*: `5m`
*Severity*: `critical`

What it means: the monitoring loop has not completed a cycle within three
intervals.

First actions:
1. Check app logs for `monitor_*` errors.
2. Confirm the process is running (`cwm_monitor_running == 1`).
3. Verify outbound internet to Open-Meteo / WeatherAPI (network, DNS, proxy).
4. Check CPU/memory pressure (`cwm_memory_rss_bytes`).
5. Restart the service if it is stuck; the loop will resume.

### CwmWeatherProviderDown

*Expression*: `cwm_weather_api_configured == 1 and cwm_monitor_runs_total{status="FAILED"} increase[15m] > 0`
*For*: `15m`
*Severity*: `warning`

What it means: the app is failing cycles while a primary provider is configured.
The app degrades gracefully to Open-Meteo, but data quality may drop.

First actions:
1. Verify WeatherAPI key is valid and not rate-limited.
2. Check provider status pages.
3. If the provider is down for an extended period, consider disabling the key
   temporarily — Open-Meteo alone is sufficient.

### CwmHttpErrorRate

*Expression*: `rate(cwm_http_requests_total{status=~"5.."}[5m]) / rate(cwm_http_requests_total[5m]) > 0.05`
*Note*: the app does not expose a generic `cwm_http_requests_total` metric;
use application logs or an external exporter for HTTP error rate.
This rule is a placeholder illustrating where to add a real signal.

### CwmAuthLockouts

*Expression*: `increase(cwm_auth_lockouts_total[1h]) > 5`
*Note*: lockout counter not currently exposed as a Prometheus metric; monitor
via logs `auth_lockout` events.

## Single-node notes

* No high-availability guarantees. A node failure means the site is down.
* Backups are operator responsibility; the app writes to `./data` and creates
  periodic snapshots. Test restores.
* Metrics are scraped once; do not rely on them for real-time alerting with
  sub-minute latency.
* All thresholds assume the default 15-minute monitoring interval. Adjust `for:`
  durations if you change the interval.

## Related

* Prometheus alerting rules: `deploy/prometheus/alerts.example.yml`
* Metrics endpoint implementation: `server.ts` (line ~466)
* Data persistence design: `docs/design/db.md` (if present)
