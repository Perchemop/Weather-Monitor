# Contributing

Thank you for considering a contribution. This project is free software under
the MIT licence (see `LICENSE`). See `CODE_OF_CONDUCT.md` for our expectations.

## How to propose a change

1. Open an issue first for anything larger than a small fix, so scope can be
   agreed before code is written. Use the appropriate issue template.
2. Fork / branch from `main`, and keep each pull request one bounded,
   reviewable slice.
3. Open the PR using the repository's pull request template and fill in the
   checklist — reviewers reject PRs that fail it.
4. All heavy verification runs in GitHub Actions (format-check, the
   Windows/macOS/Linux build-test matrix, the Docker job). **For this
   maintainer's constrained machine, CI is authoritative** — please do not run
   unbounded local build/test cycles. `npm run dev` for UX checks is fine;
   `npm run lint`, `npm run format:check`, `npm run prettier:check` and
   `npm test` can be run locally if your environment allows. Documentation,
   tests and small changes are welcome regardless of machine constraints.

## Setting up your environment

```bash
npm ci        # install dependencies
npm run dev   # start dev server (http://localhost:3000)
npm test      # run unit/system tests (tsx)
npm run lint  # typecheck
npm run prettier:check  # style check
```

## Commit identity

Every commit in this repository must be authored as **`"Construction Weather Monitor Dev" <dev@example.com>`**
(see guide §5.5). Set it locally before committing:

```bash
git config --local user.name  "Construction Weather Monitor Dev"
git config --local user.email "dev@example.com"
```

## Labels that help

Look for `good first issue`, `help wanted`, `documentation`, or `accessibility`
to get started. Reviewers aim to respond within **7 days** where possible;
this is a small project maintained a few hours a week.

## Licence terms for contributions

By submitting a pull request or patch to this repository, you agree that your
contribution is licensed under the project's MIT licence, and that you have
the right to license your contribution under those terms.

## Ground rules

- Original work only: no proprietary source, assets, icons, or text.
- No secrets, tokens, or credentials in commits, logs, or fixtures.
- Research/inspiration notes must be original summaries with URLs to public
  sources — never pasted copyrighted material.
- User-facing strings and UI are original expression; no copying of another
  product's trade dress.
