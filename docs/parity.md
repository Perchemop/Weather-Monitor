# Parity Tracker

Feature parity and completeness against the intended product. Status values:
**Done**, **Partial**, **Deferred**.

| Capability | Status | Where | Notes |
| --- | --- | --- | --- |
| Current conditions + risk headline | Done | `App.tsx`, `riskEngine.ts` | deterministic |
| Hourly / daily forecast | Done | `weatherService.ts`, `ForecastView.tsx` | 7-day |
| Activity risk matrix | Done | `riskEngine.ts`, `ActivityRiskView.tsx` | 8 activities |
| Dual-provider cross-reference | Done | `weatherService.ts`, `CrossReferenceCard.tsx` | concordance + confidence |
| Automatic provider fallback | Done | `weatherService.ts` | Open-Meteo fallback |
| Alert lifecycle (trigger/escalate/clear/dismiss) | Done | `alertEngine.ts` | per-location cooldown |
| Recovery notifications | Done | `alertEngine.ts`, `monitoringService.ts` | opt-in |
| Web Push delivery + per-user prefs | Done | `pushService.ts`, `SettingsView.tsx` | VAPID |
| SMTP email delivery + retry queue | Done | `emailService.ts` | optional |
| Autonomous monitoring loop | Done | `monitoringService.ts` | run statuses incl. PARTIAL |
| Historical observations | Done | `HistoricalView.tsx`, `db.ts` | range queries |
| Weekly performance summary + export | Done | `performanceSummary.ts`, `PerformanceView.tsx` | text export |
| Live weather map | Done | `WeatherMapView.tsx` | radar/rain/wind/lightning |
| Lightning early warning | Done | `riskEngine.ts`, `alertEngine.ts` | LPI + CAPE |
| Keep screen awake | Done | `wakeLock.ts`, `KeepAwakeToggle.tsx` | |
| Multi-user RBAC | Done | `server.ts`, `utils/roles.ts` | OWNER/MANAGER/VIEWER |
| scrypt passwords, lockout, CSRF | Done | `db.ts`, `server.ts` | |
| TOTP MFA | Done | `server.ts`, `utils/totp.ts` | optional per account |
| Active session management | Done | `server.ts`, `SettingsView.tsx` | revoke per device |
| Backups + restore | Done | `db.ts`, `SettingsView.tsx` | rotation |
| Data retention + privacy controls | Done | `db.ts`, `SettingsView.tsx` | |
| Prometheus metrics + healthz | Done | `server.ts` | token or session |
| PWA / offline shell | Done | `vite.config.ts`, `public/sw.js` | |
| Static browser build | Done | `src/static/*` | GitHub Pages |
| Role-mirrored UI | Done | `Navbar.tsx`, `SettingsView.tsx`, `LocationModal.tsx` | |
| Exportable weekly report | Done | `ReportsView.tsx`, `PerformanceView.tsx` | text/print |
| Browser-level automated UI tests | Deferred | — | manual QC checklist covers it |

See `../REQUIREMENTS_TRACEABILITY.md` for requirement-level mapping.
