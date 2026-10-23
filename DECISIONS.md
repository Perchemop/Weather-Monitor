# Decisions

Implementation decisions for the Construction Weather Monitor, newest first.
Each entry records *what* was decided and *why*. Facts, assumptions and open
questions live in `docs/project-brief.md` and
`docs/assumptions-and-questions.md`.

---

## D-14 — One-time bootstrap setup (2026-10-23)

`POST /api/auth/setup` may run only while setup has not completed. A fresh
install seeds a bootstrap OWNER and a `bootstrap_owner_generated` marker;
completing setup writes `owner_configured`. Existing databases that predate the
marker and already contain an OWNER are backfilled to configured on load.

**Why:** the endpoint previously accepted requests at any time and reset the
primary OWNER's credentials, which is a full account takeover by an
unauthenticated caller.

## D-13 — Live session reconciliation on account changes (2026-10-23)

Role changes, deactivation, renames, password resets and deletions reconcile
in-memory sessions immediately; deactivated or deleted accounts have every
session revoked. Changing your own password keeps your current device and
revokes the rest.

**Why:** sessions carried a snapshot of role/email, so a demotion or
deactivation did not take effect until the session expired.

## D-12 — Opt-in proxy trust (2026-10-23)

`TRUST_PROXY` is unset by default. When set it configures Express `trust proxy`.

**Why:** unconditionally trusting one hop let any direct client spoof
`X-Forwarded-For` and evade IP-based rate limiting and lockout.

## D-11 — WeatherAPI condition codes are mapped to WMO (2026-10-23)

`weatherApiCodeToWmo` translates WeatherAPI condition codes to WMO codes before
they enter the risk and alert engines.

**Why:** the engines test numeric thresholds such as `weatherCode >= 95`, and
WeatherAPI's clear-sky code is `1000`. Passing the raw code through made every
clear day a critical thunderstorm whenever a WeatherAPI key was configured.

## D-10 — Open-Meteo times are converted to UTC (2026-10-23)

Wall-clock strings from Open-Meteo are parsed as UTC and offset by the
response's `utc_offset_seconds`.

**Why:** `new Date("2026-10-23T12:00")` parses in the *server's* timezone, so
current and hourly values shifted whenever the server did not share the site's
clock.

## D-09 — Per-location alert cooldown (2026-10-23)

Alert history used for dedupe and cooldown is fetched per location.

**Why:** a shared global history let a recently fired alert at one site suppress
the same alert type at another site.

## D-08 — No fake success (2026-10-23)

Mutating endpoints report the real outcome: unknown targets are `404`/`400`, the
default location cannot be deleted, unknown `locationId` values are `404`, and
the UI keeps an alert on screen when the dismiss call fails.

**Why:** a success response for a no-op hides real state and misleads operators
about safety conditions.

## D-07 — `PARTIAL` monitor run status (2026-10-23)

A monitoring cycle that completes some locations but fails others records
`PARTIAL`; metrics expose it and the weekly summary counts it as success.

**Why:** the previous code smuggled a non-union value through `as any`, and
dashboards could not distinguish a clean run from a degraded one.

## D-06 — Settings is available to every role; site config stays OWNER-only (2026-10-23)

The Settings tab is shown to all authenticated roles because each account owns
its password, MFA, active sessions and push preferences. The site-configuration
tabs are OWNER-only and hidden for MANAGER/VIEWER.

**Why:** the server already allowed self-service security for every role, but
the UI hid Settings from non-owners and let them see location controls the
server rejected.

## D-05 — Licence: MIT (assumed)

The project is released under the MIT licence.

**Why:** it is the most permissive common default for a public repository.
This is an assumption pending owner confirmation — see
`docs/assumptions-and-questions.md`.

## D-04 — SQLite via `sql.js` with periodic snapshots

Data persists to a single SQLite file through `sql.js`, with write-through
persistence and rotating 30-minute backup snapshots.

**Why:** no native dependency, works in constrained environments, and keeps the
enclave local-first with no external database.

## D-03 — Deterministic risk engine, no probabilistic model

Risk is rule-based and reproducible for identical inputs.

**Why:** construction safety decisions must be explainable and auditable, and
the output is used to trigger alerts.

## D-02 — Dual weather providers with automatic fallback

WeatherAPI is the primary reference when a key is present; Open-Meteo is always
cross-referenced and becomes the sole source when WeatherAPI fails or when
`LOCAL_ONLY` is set.

**Why:** independent models give a concordance signal, and the open provider
removes the hard dependency on a paid key.

## D-01 — Vertical slices with CI-first verification

Work proceeds in small end-to-end slices; every slice is verified by the
repository's GitHub Actions workflow.

**Why:** the development host is memory-constrained, and CI gives an
authoritative, reproducible signal before a slice is considered done.
