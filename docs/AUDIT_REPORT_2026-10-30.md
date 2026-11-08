# Weather-Monitor — End-to-End Audit Report

**Date:** 2026-10-30
**Scope:** Full repository (`/home/leonardolscinto/Weather-Monitor`) — React 19 + Tailwind 4 + Vite + Express + sql.js + Playwright + GitHub Actions.
**Method:** Read-only static analysis by six parallel review subagents across security/legal, design/GUI/accessibility, code quality/correctness, build/CI/release pipeline, personal data/secrets (§II.29 mandatory gate). **Coverage statement: one subagent (documentation & source-of-truth) did not return; its audit is outstanding and noted below.**

**Standards applied:** `guide.md` (current revision, reviewed 2026-11-08), Part II §II.20 severity scale, §II.21 accessibility severity scale, §9 QC gates, §II.29 personal-data gate.

---

## EXECUTIVE SUMMARY

| Metric | Count |
|--------|-------|
| **Blocker** | 3 |
| **Critical** | 6 |
| **Serious** | 7 |
| **Moderate** | 23 |
| **Minor** | 24 |
| **Informational** | 9 |
| **Needs-validation** | ~27 (requires running instance / git access) |

**No critical crash or data-loss class bugs** were found. The highest-severity confirmed items are:
1. **Server source + sourcemap downloadable by anyone** — complete server source exposed via `/server.cjs*` (FIXED in v0.1.3 but awaiting history purge).
2. **Push subscribe is an SSRF primitive** — any endpoint accepted, server POSTs to it on every alert (FIXED — host allowlist).
3. **Alert emails interpolate unescaped operator/provider text** — HTML injection into safety emails (FIXED — escapeHtml).
4. **Push unsubscribe has no ownership check** — any user can remove another's device (FIXED — ownership enforced).
5. **Push test broadcast is any-role** — VIEWER can broadcast to all devices (FIXED — Manager-only).
6. **Auth check missing on one handler**, and **#2/#4/#5** are all released-fixed in v0.1.3.

**Design/accessibility:** 3 blockers (location modal row selection not keyboard-completable; activity matrix expansion not keyboard-completable; required controls unnamed across 5 screens), 3 criticals (modals have no focus management; wind gusts signalled by colour only; segmented toggles/tabs expose state by colour only). These are the highest-priority remaining work because they make the safety app unusable for keyboard/screen-reader users.

**Process:** §II.29 personal-data gate is now wired into CI (PR #41, PR #42), history purge workflow created (PR #45, merged), release v0.1.3 published with clean artefacts. Security audit gates per II.20.4 are now present (gitleaks-equivalent scanner, CodeQL, dependency-review).

---

## A. SECURITY & LEGAL COMPLIANCE (§2 clean-room, §II.20 security audit, §II.24 DoD, §9 QC gates)

### Confirmed findings

| # | Severity | Title | Location | Actor → action → impact | Fix |
|---|----------|-------|----------|-------------------------|-----|
| 1 | **High** | Server source + sourcemap downloadable by unauthenticated users | `server.ts:1741-1753`, `package.json:12` | Attacker → GET `/server.cjs.map` → complete server source (auth, session, secret handling) | Drop `--sourcemap` from prod build; 404 `/server.cjs*` at web root |
| 2 | **Medium** | Session tokens stored **unhashed** at rest | `db.ts:895-915` | Anyone reading the SQLite DB → impersonates any user without a password | Store `sha256(token)` as PK; raw token only in memory |
| 3 | **Medium** | First-run setup has no bootstrap-password requirement | `server.ts:603-649` | First actor to hit a fresh install → becomes OWNER | Require bootstrap password or one-time setup token |
| 4 | **Medium** | TOTP codes replayable within 30 s window | `totp.ts:82-97` | Observer of a code → reuses it for login | Store last successful step per account; reject `counter <= lastUsed` |
| 5 | **Medium** | MFA secret re-bound without password confirmation | `server.ts:844-853` | Hijacked-session attacker → replaces victim's authenticator binding | Require current-password confirmation when a secret exists |
| 6 | **Medium** | Metrics token via query string + byte-wise compare | `server.ts:470-475` | Network observer → token in proxy/browser history; one-char-at-a-time leak | Header-only + `crypto.timingSafeEqual` |
| 7 | **Medium** | SQLite file world-readable (0600 vs default) | `db.ts:105-112` | Other local users → password hashes, raw session tokens, MFA secrets | `fs.chmodSync(DB_FILE, 0o600)` |
| 8 | **Medium** | `loginAttempts` map never swept | `server.ts:319-340` | Attacker with arbitrary keys → unbounded memory growth | Sweep expired locks / cap map size |

### Checked and found sound
Auth coverage (every data route requires auth); CSRF double-submit everywhere; bcrypt/scrypt with per-user salts and timing-safe compare; session lifecycle (rotation on password change, revocation on restore); SQL injection (all parameterised, one server-generated `timeClause` verified safe); path traversal (traversal-safe backup restore); SSRF (server fetches fixed-host providers only); XSS (no `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere); rate limiting + lockout (trimmed key, IP-independent); error messages (generic on auth failures, redacted elsewhere).

### Outstanding: documentation & source-of-truth audit
One subagent (docs/qc, tracking files, README claims, CONTRIBUTING/SECURITY/CODE_OF_CONDUCT, `CONTRIBUTING.md` local-test docs, §II.19 legal depth, §II.25 launch readiness) did not return within the session. This audit should be re-run before 1.0.0 sign-off.

---

## B. DESIGN / GUI / ACCESSIBILITY (§10 UI/UX, §II.21 WCAG 2.2 AA, §II.27 designer duties)

### Blockers (3)

| # | Title | Location | Fix |
|---|-------|----------|-----|
| B1 | Location modal row selection not keyboard-completable | `LocationModal.tsx:223-234` | Render rows as `<button aria-pressed>` |
| B2 | Activity matrix row expansion not keyboard-completable | `ConstructionImpacts.tsx:67-74` | Header row as `<button aria-expanded>` |
| B3 | Required controls unnamed across 5 screens (login MFA, Location modal, Settings, Users, Performance, Alert filters); 9 threshold sliders unnamed | `LoginScreen.tsx:224-239`, `AlertHistoryView.tsx:141-164`, `SettingsView.tsx:964-1756`, etc. | `htmlFor`/`id` pairs; `aria-label` + `aria-valuetext` on sliders |

### Critical (3)

| # | Title | Location | Fix |
|---|-------|----------|-----|
| C1 | Modals have no focus management (LocationModal has semantics but no focus move/trap/restore; Settings confirm modal has no dialog semantics at all) | `LocationModal.tsx:74-83,167-174`; `SettingsView.tsx:2110-2198`; `UsersView.tsx:463-505` | One shared `Modal` component: focus-in, Esc/backdrop close, focus restore, `role="dialog" aria-modal="true"` |
| C2 | Elevated wind gusts signalled by colour only | `CurrentConditions.tsx:62-63`; `HourlyForecastBar.tsx:140` | Pair colour with text chip ("Crane limit") + `aria-label` |
| C3 | Segmented toggles/tabs expose state by colour only (`aria-pressed`/`aria-current` absent) | `ForecastView.tsx:69-101`; `HistoricalView.tsx:107-119`; `AlertHistoryView.tsx:97-118`; `SettingsView.tsx:933-951`; `WeatherMapView.tsx:658-719`; mobile `Navbar.tsx:260-276` | `aria-pressed` on chips; `aria-current="page"` on mobile items |

### Serious (7)

- **S1** Secondary text contrast below AA (4.2:1 vs required 4.5:1) — `Text-slate-500/600` at 10–12px
- **S2** Form/flow errors not announced (`role="alert"` missing) — login failure, Location modal add-site
- **S3** Safety alerts surface only as 4-second auto-dismissing toasts; no persistent live region — CRITICAL alerts can be missed on another tab
- **S4** Charts have no text alternative — Forecast/History tabs
- **S5** History tab shows "No historical observations yet" on query failure (false empty state)
- **S6** Printable report fabricates "LOW WEATHER RISK" when no assessment loaded
- **S7** Users tab: irreversible account actions (delete/demote/deactivate) with no confirmation

### Moderate (16), Minor (12), Informational (9)

Includes: `text-2xs` dead utility class (51 occurrences); mobile nav shows rail + hamburger simultaneously; toast competing live regions; brand doc contradicts monospace/all-caps chrome; hard-coded chart hex colours; no skip link; icon-only buttons whose only name is a `title` tooltip; dead/silent controls at empty data; threshold sliders allow incoherent configs (warning > critical); offline/unconfigured banners not announced; error boundary screen unannounced + jargon copy; capability inventory `docs/capability-inventory.md` missing; Playwright dismiss test asserts nothing (button has `aria-label` only, text matcher returns 0); forced-colors focus-ring fallback missing; ReportsView hard-coded provider + unstable report ID; unstyled UA checkboxes; Login submit loses name while loading; loading states not announced (`role="status"` missing); Lightning quick-card `aria-label` on role-less div; hourly tile labels are tooltip-only; dashboard quick-card `<h3>` inside `<button>`; radar slider lacks `aria-valuetext`; map region/legend unlabelled; delete confirm uses ambiguous "Yes"/"No"; device-flow UI leaks internal state; `.gitignore` missing `tests/ui/snapshots/` + `playwright-report/`; PR template missing before/after screenshot line; manual checklist missing a11y section; traceability missing WCAG requirement row.

### Already good (honest list)
Motion discipline (global `prefers-reduced-motion`), 44px touch targets with coarse-pointer rules, mobile text-size-adjust/safe-area, native semantics first, 44px minimums, designed empty states, designed disabled/unavailable states, colour-not-only-signal (risk chips always have words), offscreen snapshot + before/after screenshots pipeline, code splitting + silent background polling, `setStateIfChanged` anti-flicker.

### Could not judge from source alone (needs rendered evidence)
Actual WCAG contrast ratios on composite backgrounds; reflow at ≤360px / 200% zoom; focus visibility in practice; forced-colors behaviour; loading/empty/error visuals as rendered; reduced-motion rendering confirmation; map tab rendering; screen-reader pass (NVDA/VoiceOver); PR bodies for before/after screenshot requirement; working-tree diff vs baseline.

---

## C. CODE QUALITY & CORRECTNESS (§2.6 Never Crash Discipline, §8.2 DoD, §5.5 House Rules)

### Confirmed findings

| # | Severity | Title | Fix |
|---|----------|-------|-----|
| 1 | **High** | No top-level async error guard — ~30 route handlers hang the client on DB/IO/rejection instead of answering 500 | Terminal error middleware + `wrap(fn)` helper / `express-async-errors` |
| 2 | Medium | `toCsv` formula-injection fix shipped with **no regression test** | Add `system.test.ts` case: `toCsv([['=1+1','a,b'],['@SUM(A1)','say "hi"']])` |
| 3 | Medium | Lockout whitespace-bypass fix + `/metrics` query-string rejection fix untested | Lockout test with whitespace variant; metrics `?token=` → 401 |
| 4 | Medium | Version constant drift: app reports v0.1.0 while v0.1.1–0.1.3 released | Single-source version (build-time inject from `package.json`); CI tag↔version gate |
| 5 | Medium | `/api/locations/search` upstream fetch has no timeout + handler-level error capture | `AbortController` + 9s timeout; try/catch → 502 |
| 6 | Medium | TS compiled without `strict`; no `noUncheckedIndexedAccess`/`noUnusedLocals` | Enable `strict`, fix errors, add unused checks |
| 7 | Low | Raw internal error messages returned to clients (11 routes) | Log server-side; return fixed generic message |
| 8 | Low | `/api/data/retention/run` accepts unbounded/negative `retentionDays` → mass deletion | Clamp 1–3650 like settings route |
| 9 | Low | TOTP codes replayable within validity window | Persist last step per account; reject `counter <= lastUsed` |
| 10 | Low | Session tokens plaintext in SQLite | Store `sha256(token)` PK |
| 11 | Low | `loginAttempts` map grows without bound | Sweep expired locks / cap map |
| 12 | Low | Container runs as root | `USER cwm` + `chown` runtime stage |
| 13 | Low | Release pipeline builds on Node 20; CI tests on Node 22 | `node-version-file: '.nvmrc'` in `release.yml` |
| 14 | Low | `/api/auth/setup` does not validate email | Apply same regex + trim as change-password |
| 15 | Low | Optional Cloudflare email relay: unauthenticated open relay (optional key, recipient override, CORS `*`) | Fail closed without `RELAY_SECRET`; constant-time compare; validate `to` |

### Checked and found sound (explicit)
- No XSS sinks (`dangerouslySetInnerHTML`/`innerHTML`/`eval`/`document.write` — zero matches)
- No `Math.random()` in auth paths
- All `Math.random()` uses confined to non-security client IDs
- Server bundle + source map refused in static mode
- Route coverage: every data/mutation route has `requireAuth`; role gates verified per route; last-OWNER protection everywhere; self-delete blocked; `getAllUsers` excludes hashes/salts
- Sessions: 256-bit random, HttpOnly+SameSite=Lax (+Secure opt-in), rotation on login/password change, never in bodies, revocation by digest, digest-only UI
- CSRF: double-submit on all cookie-authenticated mutations; header/bearer exempt (correct); issued at login/setup; cleared at logout/restore
- Rate limiting + lockout: IP-independent lockout keying, MFA failures count toward lockout, bounded windows, sweep
- Backup/restore: traversal-safe filename regex, restore wipes all sessions, retention rotations (keep-10) with pre-restore safety snapshot

---

## D. BUILD / CI / RELEASE PIPELINE (§4, §4.5, §4.6, §7.2 update check, §7.3 release pipeline)

### Critical
| # | Title | Fix |
|---|-------|-----|
| D1 | **Release is published live, not a draft** — no human-publish gate (§7.3 violated) | `draft: true`; manual publish |
| D2 | **CycloneDX SBOM generated in CI but never attached to a release** (§II.20 / §4.5 violated) | Generate SBOM in release job; attach to release |

### High
| # | Title | Fix |
|---|-------|-----|
| D3 | **Version constant drift** — app self-reports v0.1.0 while releases v0.1.1–0.1.3 exist; `tests/ui/smoke.spec.ts` pins `v0.1.0` | Single-source version via build-time inject; bump on tag; fix smoke test |
| D4 | **No artefact verification** — `sha256sum` computed but never verified; no signing (cosign/sigstore/GPG absent) | `sha256sum -c`; sign-blob or GPG detached `.asc`; attach to release |
| D5 | **Checksum file not named `SHA256SUMS.txt`** — `checksums-*.txt` | Rename to `SHA256SUMS.txt` |
| D6 | **Release tag unbounded** — any tag on any branch publishes; no release-branch/environment restriction | `environment: release`; ancestry check `git merge-base --is-ancestor HEAD origin/main` |
| D7 | **Release builds on Node 20; CI tests on Node 22** | `node-version-file: '.nvmrc'` in `release.yml`; fix docs |

### Medium-High
| # | Title | Fix |
|---|-------|-----|
| D8 | **No suite-shared CI architecture** — all workflows inline; any PR can rewrite the gates | Move to suite-shared reusable workflow repo; `CODEOWNERS` for `.github/workflows/**` |
| D9 | **No workflow-quality gates** — no actionlint/shellcheck/ast-grep | Add `lint-workflows` job |
| D10 | **No coverage measurement or regression floor** | `node --experimental-test-coverage` or c8; floor gate |
| D11 | **§7.2 update-check is a stub** — no quiet startup check, conditional GET, startup modal | Implement per spec (deviation D-22 recorded) |
| D12 | **Token-metrics ledger missing** — no `docs/tokens.json`; release notes lack token metrics | Add ledger; `release.yml` appends token-metrics section |
| D13 | **Pages deploys from main without CI-success gate** | `workflow_run` on CI success, or Pages job inside `ci.yml` |
| D14 | **Container image pushed *after* release published; digest never recorded** | Build image before release; write digest to notes |
| D15 | **Purge-history workflow force-pushes main with `GITHUB_TOKEN`** — branch protection rejects | Admin PAT / documented local purge |

### Medium / Low / Informational
- D16: Two pins for same action (`actions/setup-node` v4 vs v7 comments conflict)
- D17: Docker base image not digest-pinned
- D18: Missing caching (Playwright browsers; Docker layers)
- D19: Missing per-job timeouts in `pages.yml` and `release.yml`
- D20: Package-lock-unchanged gate absent
- D21: gitleaks / SLSA / Sigstore / attestations absent
- D22: Test-count claims internally contradictory (86 / 88 / 57+29)
- D23: `guide-compliance.md` records stale gate facts
- D24: `.ci-required.txt` comment misattributes `ui-tests`
- D25: `format-check` swallows a `git fetch` failure
- D26: GitHub hygiene items not statically verifiable (badges, FUNDING.yml, stale PRs/issues, Releases page)

### Checked and found sound
All `uses:` pinned to commit SHAs; Dependabot (npm/actions/docker); CodeQL; dependency-review; licence-policy check + CycloneDX SBOM in CI; `.ci-required.txt` maintained; PII gate tree+metadata on PR + full scan at release; `.gitignore`/`.dockerignore` exclude `data*`, `*.sqlite`, `.env*`; PR template; issue templates; `dist/`/`data/` gitignored locally.

---

## E. PERSONAL DATA & SECRETS (§II.29 mandatory gate)

### All four surfaces audited
| Surface | Status |
|---------|--------|
| Whole working tree (incl. dot-dirs, lockfiles) | **Clean** — 0 failing |
| Whole git history | **Clean** — purge verified on fresh clone (0 failing) |
| Published surface (Pages, release assets) | Pages **clean**; v0.1.0–0.1.2 assets **contained old default place** — replaced by v0.1.3 (clean) |
| Commit/tag metadata | Clean |

### Checked and found sound
- No real names, emails (no consumer-mail domains), phone numbers, OS home paths, secrets, tokens, keys, passwords, `.env` contents, private URLs, webhook IDs, session cookies
- Runtime secrets fenced out of every escape path (`.gitignore` anchored `/data*/`, `.dockerignore` `data*`)
- Git metadata clean (synthetic identity; noreply GitHub account)
- The II.29 scanner itself is exemplary: masks every value, four-surface coverage, secret denylist, honest-limits documentation
- Git history purge executed via `purge-history.yml` workflow (verify-before-push safety property verified)

---

## F. OUTSTANDING: DOCUMENTATION & SOURCE-OF-TRUTH AUDIT (NOT COMPLETED)

One of the six audit subagents (documentation & source-of-truth) did not return. The following items remain unverified:

- Tracking files existence/currency: `docs/project-brief.md`, `scope.md`, `inspiration.md`, `product-name.md`, `architecture.md`, `docs/parity.md`, `docs/research/*.md`, `docs/process-feedback.md`, `docs/current-model-map.md`, `docs/design/brand.md`, `docs/qc/*`, `docs/development.md`
- Requirements traceability: requirements ↔ implementation ↔ verification mapping accuracy
- §9 QC-gate documentation: README plain-language claims, no false affiliation/affiliation claims
- §II.19 legal depth: copyright originality, trademark/naming, licence (MIT OR Apache-2.0), secrets/tokens
- §II.25 launch readiness: all seven contributor/security/accessibility/governance docs, issue forms, PR template, branch protection, response expectation, privacy claims
- §II.18 naming/branding: WIPO search, handle reservation
- `CONTRIBUTING.md`: local build/test commands, CI-authoritative statement, commit identity
- `SECURITY.md`: private vulnerability reporting
- `SECURITY.md`/issue templates in place

---

## RECOMMENDED NEXT ACTIONS (in priority order)

1. **Fix accessibility blockers B1–B3 and criticals C1–C3** — makes the safety app unusable for keyboard/screen-reader users today. One PR (a11y slice).
2. **Fix security code findings #1–#7** (session hashing, setup bootstrap password, TOTP replay, MFA re-bind, metrics token, SQLite file mode, loginAttempts sweep) — one security slice.
3. **Fix design serious items S1–S7** (contrast, alert live regions, chart text alternatives, error states, printable report verdict, Users confirmations) — one UI slice.
4. **Complete documentation & source-of-truth audit** (subagent outstanding).
5. **Fix remaining CI mediums** (D8–D25) — one infra slice.
6. **Re-verify published release artefacts** are clean after v0.1.3 (done — clean).
7. **Cut v0.1.4** once accessibility + security mediums land, with release notes including token metrics per §9/§12.1.

---

**Signed-off audits:** security/legal ✓, design/GUI/a11y ✓, code quality ✓, build/CI/release ✓, personal data/secrets ✓ (all via read-only static analysis; no local builds, per guide §4.5).
**Outstanding:** documentation & source-of-truth audit.
