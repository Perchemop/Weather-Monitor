# Research: Opinionated Formatter (Prettier) Adoption

Status: **ready for work** (its own release slice; no behavioural change).
Target milestone: 0.2.x.

## Behaviour (original summary)

The repository currently enforces *hygiene* only — `scripts/check-format.mjs`
checks line endings, conflict markers, final newlines, tabs, and trailing
whitespace (decision D-17 deliberately deferred an opinionated formatter to
avoid a whole-repo reformat inside a feature slice). The researched capability
is adopting Prettier as the style authority in **its own dedicated release**,
so style normalisation is never mixed with logic changes.

Prettier's documented flow: install, add a `.prettierrc` (or a `prettier` key
in `package.json`), run `prettier --write` once, then enforce with
`prettier --check` in CI.

## Proposed configuration (original proposal, to be confirmed at review)

Match the codebase's existing dominant style so the reformat diff stays
minimal:

- `semi: false` (the codebase does not use semicolons)
- `singleQuote: true`
- `printWidth: 110` (matches the current line-length practice)
- `tabWidth: 2`, `trailingComma: "all"` (matches current multi-line commas)
- `.prettierignore`: `dist*/`, `coverage/`, `node_modules/`, `package-lock.json`,
  `public/sw.js` (generated), `docs/` (prose stays hand-formatted)

## Acceptance criteria

1. One dedicated PR: add devDependency + config + `format`/`format:fix`
   scripts; the whole-repo reformat is that PR's only change.
2. The reformat commit produces **no behavioural change**: type-check, both
   test suites (88 checks) and builds pass without test edits.
3. CI gains a Prettier check (either replacing `format-check`'s style duties
   or running alongside it — hygiene checks stay either way).
4. `docs/development.md` formatting rules updated to describe the two layers
   (hygiene script + Prettier).
5. Decision D-17 updated with a pointer to this note (the deferral is closed).
6. `.prettierignore` keeps generated artefacts out; the diff contains no
   `dist*` or lockfile churn.

## Edge cases

- Markdown reformatting can churn prose line-wrapping — the proposal excludes
  `docs/`; revisit if the team prefers wrapped Markdown.
- The existing checker's "no trailing whitespace on lines you added" rule is
  gentler than Prettier; after adoption, Prettier owns whitespace entirely.
- `sw.js` is hand-maintained but generated-adjacent; ignored to keep the
  service worker diff-stable for PWA caching.
- Editor integration conflicts: the `.prettierrc` doubles as the editor
  config, so no duplicate settings file is created.

## Sources (public, URLs only)

- Install: <https://prettier.io/docs/install>
- Configuration files: <https://prettier.io/docs/configuration>
- CLI (`--check` / `--write`): <https://prettier.io/docs/cli>
- Options reference: <https://prettier.io/docs/options>
