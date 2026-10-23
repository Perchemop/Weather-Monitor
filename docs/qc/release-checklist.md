# Release Checklist

Complete before tagging or merging a release-worthy branch.

## Build & test (all in CI)

- [ ] GitHub Actions `build-test` job is green on the exact commit.
- [ ] `docker` job is green.
- [ ] Type-check passes (`npm run lint` in CI).
- [ ] Both suites pass: 53 system + 28 integration tests.
- [ ] Production build artefacts exist (`dist/server.cjs`, `dist/index.html`,
      `dist/sw.js`).
- [ ] Static build artefacts exist (`dist-static/index.html`,
      `dist-static/assets`).

## Quality gates

- [ ] `docs/parity.md` and `REQUIREMENTS_TRACEABILITY.md` reflect the release.
- [ ] `CHANGELOG.md` has an entry for every user-visible change.
- [ ] `README.md` test counts and capability claims are accurate.
- [ ] No known data-loss or critical security bug remains open.
- [ ] No secrets, `.env`, or `guide.md` committed.
- [ ] Dependencies and licences listed in `ATTRIBUTION.md`.
- [ ] Known limitations recorded in `docs/scope.md` and
      `docs/assumptions-and-questions.md`.

## Manual pass

- [ ] `docs/qc/manual-checklist.md` completed against a deployed build.

## Sign-off

- [ ] Reviewer has read the diff for the release.
- [ ] Owner has confirmed any open questions in
      `docs/assumptions-and-questions.md`.
