# Gaps & Ranked Worklist

Derived from the exhaustive audit. Ranked highest first. Update as items are actioned.

## Rank

1. **Accessibility blockers/criticals** — WCAG 2.2 AA gaps (live regions for alerts, chart/text alternatives where missing). See `ACCESSIBILITY.md`.
2. **Backend security mediums** — session-token hashing (review), first-run setup hardening, TOTP replay protection, MFA re-bind flow, metrics token handling, DB file mode, loginAttempts sweep.
3. **Express terminal error middleware** — ensure terminal error handler is in place and logged without leaking details.
4. **Version single-sourcing** — align `src/version.ts` and `package.json` (and surfaced versions). Latest release is `0.1.3`.
5. **Design serious items** — contrast, alert live regions, chart text alternatives, error states, report verdict, Users confirmations.
6. **Documentation accuracy** — this reconciliation pass (in progress/completed per this doc set).
7. **Release-pipeline hardening** — draft releases, SBOM, SHA256SUMS, signing, Node version pinning, release environment.
8. **Residual personal-data exposure via GitHub PR refs** — needs owner action (history scrub per guide II.29).
9. **Cut v0.1.4** — next release after hardening items addressed.

## Notes

- Items are tracked against evidence (CI, tests, docs). No optimism.
- Update `PROGRESS.md`/`ROADMAP.md` as evidence changes.
