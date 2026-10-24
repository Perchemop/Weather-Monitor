# Release Checklist

Complete before tagging or merging a release-worthy branch.

## Build & test (all in CI)

- [ ] GitHub Actions `build-test` job is green on the exact commit.
- [ ] `docker` job is green.
- [ ] Type-check passes (`npm run lint` in CI).
- [ ] Both suites pass: 57 system + 29 integration tests.
- [ ] Production build artefacts exist (`dist/server.cjs`, `dist/index.html`,
      `dist/sw.js`).
- [ ] Static build artefacts exist (`dist-static/index.html`,
      `dist-static/assets`).

## Quality gates

- [ ] `docs/parity.md` and `REQUIREMENTS_TRACEABILITY.md` reflect the release.
- [ ] `CHANGELOG.md` has an entry for every user-visible change.
- [ ] `README.md` test counts and capability claims are accurate.
- [ ] `ROADMAP.md` readiness updated from evidence only.
- [ ] No known data-loss or critical security bug remains open.
- [ ] No secrets, `.env`, or `guide.md` committed.
- [ ] Dependencies and licences listed in `ATTRIBUTION.md`.
- [ ] Known limitations recorded in `docs/scope.md` and
      `docs/assumptions-and-questions.md`.

## Manual pass

- [ ] `docs/qc/manual-checklist.md` completed against a deployed build.

## Legal checklist (operating guide §2.5 — every release)

- [ ] No proprietary source, assets, or substantial copied text in tree.
- [ ] No reverse-engineering tools or output used as implementation input.
- [ ] Product name/logo original; no vendor marks in UI or artefacts.
- [ ] UI is original expression, not a slavish copy of a commercial product.
- [ ] App licence clear (MIT); `ATTRIBUTION.md` complete.
- [ ] No API keys, tokens, or credentials in git or release artefacts
      (secret scanning push protection active on GitHub).
- [ ] Crash/bug reports are user-initiated only; privacy documented in README.
- [ ] No privileged bot token embedded in the client; issue reports use the
      pre-filled public URL.
- [ ] README/roadmap make no false certification, affiliation, or
      "drop-in replacement" claims.
- [ ] Research files (if any) are summaries + URLs only.

## Container image

- [ ] Multi-platform image pushed: `ghcr.io/perchemop/weather-monitor:<version>`.
- [ ] `docker manifest inspect` lists both `linux/amd64` and `linux/arm64`.
- [ ] Image digest recorded in the release notes.

## Release notes standard (operating guide §6.3)

The GitHub Release body (extracted from `CHANGELOG.md` by `release.yml`)
must contain: an honest 1–3 sentence summary, Added / Changed / Fixed
sections, known limitations, and the artefact list with SHA-256 checksums.

## Sign-off

- [ ] Reviewer has read the diff for the release.
- [ ] Owner has confirmed any open questions in
      `docs/assumptions-and-questions.md`.
