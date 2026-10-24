# Contributing

Thank you for considering a contribution. This project is free software under
the MIT licence (see `LICENSE`).

## How to propose a change

1. Open an issue first for anything larger than a small fix, so scope can be
   agreed before code is written.
2. Fork / branch from `main`, and keep each pull request one bounded,
   reviewable slice.
3. Open the PR using the repository's pull request template and fill in the
   checklist — reviewers reject PRs that fail it.
4. All heavy verification runs in GitHub Actions (format-check, the
   Windows/macOS/Linux build-test matrix, the Docker job). Please do not run
   full local build/test cycles on constrained machines; `npm run dev` for UX
   checks is enough.

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
