## Summary

<!-- What this PR does in 1–3 sentences -->

## Type

- [ ] Feature
- [ ] Fix
- [ ] Docs / research (summaries + URLs only)
- [ ] Infra (CI, release, shared tooling)
- [ ] Refactor

## Checklist

- [ ] Acceptance criteria for the Task are met with **real** behaviour (no fake UI, no dead controls)
- [ ] Tests added or updated (system and/or API suite)
- [ ] CI is green (format-check, build-test matrix, docker)
- [ ] No unbounded local full builds used to "verify" on a constrained machine — GitHub Actions only
- [ ] No proprietary source, assets, or reverse-engineered material introduced
- [ ] Public research notes are original summaries + URLs only (if applicable)
- [ ] ROADMAP / CHANGELOG / REQUIREMENTS_TRACEABILITY updated if this completes a tracked item
- [ ] Secrets and tokens not committed (`.env*` ignored; no keys in code or logs)
- [ ] User-facing strings and UI are original (no copied trade dress)
- [ ] Commits authored as `"<App Name> Dev" <dev@example.com>` (guide §5.5)

## Accessibility (if UI changes)

- [ ] Keyboard accessible; visible focus indicator
- [ ] Native semantics used or ARIA only where necessary
- [ ] Labels present; errors announced
- [ ] Colour not the only signal; contrast acceptable
- [ ] Respects `prefers-reduced-motion`
- [ ] Touch targets >= 44×44 on coarse pointers
- [ ] No meaning conveyed by position/style alone
- [ ] Alt text for meaningful images

## Local verification

<!-- How a human can try this: `npm run dev` → http://localhost:3000, or docker compose up --build -->

## Notes / risks
