# Vision

## One-paragraph message

The Construction Weather Monitor turns public weather data into construction
safety decisions: it polls WeatherAPI and Open-Meteo, evaluates the readings
against thresholds derived from crane and elevated-work safety standards, and
raises alerts before conditions become dangerous — all on the operator's own
machine or container, with no account, no telemetry, and no data leaving the
installation. Site safety leads who need a deterministic, auditable answer to
"is it safe to lift today?" get one that runs privately, survives network
outages, and reports its failures honestly instead of quietly degrading.

## Goals

1. **Deterministic safety, not models.** Every risk level traces to explicit
   thresholds and documented factors. The same reading always yields the same
   assessment — no hidden inference, no "trust the AI".
2. **Private by default.** Weather telemetry comes from the operators' own
   configured providers, and all operational data stays in the local SQLite
   store. No advertising, analytics, or tracking components.
3. **Honest failure.** Degraded paths (provider outage, disk write failure,
   offline) are labelled as degraded in the UI, the logs, and
   `/api/health`. There is no fake success anywhere in the product.
4. **Works for the people on site.** Mobile-first dashboard, offline-capable
   PWA, push alerts that reach a closed app, and accessibility treated as a
   safety feature.
5. **Free and open.** A permissively licensed tool a site can inspect,
   fork, and run forever without a licence decision.

## Non-goals

- Not a SaaS platform or hosted dashboard (see `docs/scope.md`).
- Not a replacement for operator judgement, statutory compliance, or a
  certified lifting study — the risk output is an _input_ to those.
- Not a general-purpose weather app; everything not serving a site-safety
  decision is out of scope.

## How this is used

This document is the project's constitution (see `GOVERNANCE.md`): when a
feature or contribution is debated, it is re-anchored here. If a change does
not serve one of the five goals, it is probably a nice idea for a different
project — say so kindly and point at this file.

The staged delivery plan lives in `ROADMAP.md`; the capability inventory and
its evidence live in `REQUIREMENTS_TRACEABILITY.md` and `docs/parity.md`.
