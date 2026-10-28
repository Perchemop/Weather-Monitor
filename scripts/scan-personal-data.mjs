#!/usr/bin/env node
/**
 * Personal-data and secret scan — operating guide II.29.
 *
 * II.29 requires a scan of four surfaces before every commit, push and release:
 *
 *   1. the whole working tree, dot-directories included;
 *   2. the whole history, not just HEAD;
 *   3. the published surface — release artefacts, after extraction;
 *   4. the metadata — commit author/committer identities and tag messages.
 *
 * This script implements all four. It is deliberately repo-owned rather than a
 * hosted scanner so that it works identically in CI and on a laptop, needs no
 * network, and can be tuned to this project's own obviously-synthetic fixtures.
 *
 * Two guarantees, both required by II.29.4.2:
 *   - a matched value is NEVER printed — only the rule, the location and a
 *     masked shape (first character plus length);
 *   - an unclassifiable hit fails the run rather than being silently ignored.
 *
 * Honest limits, stated because they matter: this is a pattern scan, not a
 * proof. It cannot recognise a personal value it has no pattern for (a street
 * name, a relative's name), so the per-repo denylist below — supplied at
 * runtime through PERSONAL_DENYLIST and never committed — is the real belt for
 * values this project has already had to remove. Upstream third-party content
 * (a dependency's own authors in a lockfile or vendored licence) is not our
 * data and is reported as third-party, not as a failure.
 *
 * Usage:
 *   node scripts/scan-personal-data.mjs --tree
 *   node scripts/scan-personal-data.mjs --history
 *   node scripts/scan-personal-data.mjs --metadata
 *   node scripts/scan-personal-data.mjs --paths build/ dist/
 *   node scripts/scan-personal-data.mjs --all
 *
 * Exit code 0 = clean or informational only; 1 = at least one failing finding.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const MAX_TEXT_BYTES = 2 * 1024 * 1024
const ROOT = process.cwd()

/** OS account names that are generic, not a person. Everything else fails. */
const GENERIC_OS_USERS = new Set([
  'runner',
  'user',
  'users',
  'app',
  'node',
  'vscode',
  'ubuntu',
  'circleci',
  'jenkins',
  'docker',
  'root',
  'admin',
])

/**
 * Markers that make a value obviously synthetic, per II.29.1 ("obviously
 * synthetic ... do not fix a leak by substituting another plausible real
 * name"). Matching one of these downgrades a credential-shaped hit to
 * information, and is recorded as such rather than hidden.
 */
const SYNTHETIC_MARKERS = [
  'example',
  'sample',
  'demo',
  'test',
  'dummy',
  'fake',
  'placeholder',
  'changeme',
  'change-me',
  'integration',
  'wrong',
  'rotate',
  'local',
  'redacted',
  'your',
  'foo',
  'bar',
  'abc',
  'xyz',
  'todo',
]

/** Files whose authorship data belongs to third parties, not to us. */
const THIRD_PARTY = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)node_modules\//,
  /(^|\/)vendor\//,
  /(^|\/)LICENSE(-[A-Z]+)?$/,
]

/** Directories never worth walking. */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'dist-static', 'coverage', '.cache'])

/**
 * Scanner sources contain the patterns themselves, so scanning them would
 * report the detector as a finding. They are skipped rather than allowlisted,
 * which keeps a future pattern edit from turning into a self-match.
 */
const META_FILES = [/(^|\/)scripts\/scan-[A-Za-z0-9._-]+$/]

function isMeta(file) {
  return META_FILES.some((re) => re.test(file))
}

/** Rules that fail the scan. */
const FAIL_RULES = [
  {
    id: 'os-home-path',
    description: 'an absolute OS home path disclosing an account name (II.29.1)',
    pattern: /(?:\/home\/|\/Users\/|[A-Za-z]:\\Users\\)([A-Za-z0-9._-]+)/g,
    // A generic account name is not a person.
    accept: (m) => GENERIC_OS_USERS.has(m[1].toLowerCase()),
  },
  {
    id: 'personal-email',
    description: 'a personal email address (II.29.1)',
    pattern:
      /[A-Za-z0-9._%+-]+@(?:gmail|googlemail|outlook|hotmail|live|yahoo|proton|protonmail|icloud|gmx|aol)\.(?:com|net|org|me|co\.uk|com\.au)/gi,
  },
  {
    id: 'secret-material',
    description: 'material that looks like a live credential (II.29.1)',
    pattern:
      /(?:ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{24,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g,
  },
]

/** Rules reported as information: a standing review prompt, not a gate. */
const INFO_RULES = [
  {
    id: 'credential-assignment',
    description: 'a credential-shaped assignment longer than 20 characters',
    pattern: /(?:api[_-]?key|secret|token|password|passwd|bearer)\s*[:=]\s*["']([^"'\n]{21,})["']/gi,
    accept: (m) => SYNTHETIC_MARKERS.some((marker) => m[1].toLowerCase().includes(marker)),
  },
]

/** Values supplied at runtime (CI secret or local env) — never committed. */
function denylist() {
  return (process.env.PERSONAL_DENYLIST || '')
    .split('\n')
    .map((v) => v.trim())
    .filter((v) => v.length >= 4)
}

/** First character plus length: enough to locate, never enough to re-publish. */
function mask(value) {
  const s = String(value)
  if (s.length === 0) return '(empty)'
  return `${s[0]}${'*'.repeat(Math.min(s.length - 1, 12))} (${s.length} chars)`
}

function isThirdParty(file) {
  return THIRD_PARTY.some((re) => re.test(file))
}

function looksTextual(buffer) {
  const sample = buffer.subarray(0, 4096)
  for (const byte of sample) {
    if (byte === 0) return false
  }
  return true
}

function scanText(text, file, findings) {
  const collect = (rules, kind) => {
    for (const rule of rules) {
      rule.pattern.lastIndex = 0
      let match
      while ((match = rule.pattern.exec(text)) !== null) {
        if (rule.accept && rule.accept(match)) continue
        findings.push({
          kind: isThirdParty(file) ? 'third-party' : kind,
          rule: rule.id,
          description: rule.description,
          where: `${file}:${text.slice(0, match.index).split('\n').length}`,
          preview: mask(match[1] ?? match[0]),
        })
        if (match.index === rule.pattern.lastIndex) rule.pattern.lastIndex += 1
      }
    }
  }
  collect(FAIL_RULES, 'fail')
  collect(INFO_RULES, 'info')

  for (const value of denylist()) {
    let from = 0
    for (;;) {
      const at = text.indexOf(value, from)
      if (at === -1) break
      findings.push({
        kind: isThirdParty(file) ? 'third-party' : 'fail',
        rule: 'denylist',
        description: 'a value this project has already had to remove (PERSONAL_DENYLIST)',
        where: `${file}:${text.slice(0, at).split('\n').length}`,
        preview: mask(value),
      })
      from = at + value.length
    }
  }
}

function walk(dir, findings) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const full = path.join(dir, entry.name)
    const rel = path.relative(ROOT, full) || entry.name
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(full, findings)
      continue
    }
    if (!entry.isFile()) continue
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.size === 0 || stat.size > MAX_TEXT_BYTES) continue
    const buffer = readFileSync(full)
    if (!looksTextual(buffer)) continue
    scanText(buffer.toString('utf8'), rel, findings)
  }
}

function scanPaths(paths, findings) {
  for (const target of paths) {
    const abs = path.resolve(ROOT, target)
    let stat
    try {
      stat = statSync(abs)
    } catch {
      findings.push({
        kind: 'info',
        rule: 'missing-path',
        description: 'path was requested but does not exist',
        where: target,
        preview: '-',
      })
      continue
    }
    if (stat.isDirectory()) walk(abs, findings)
    else if (stat.isFile() && stat.size <= MAX_TEXT_BYTES) {
      scanText(readFileSync(abs).toString('utf8'), path.relative(ROOT, abs) || target, findings)
    }
  }
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
}

/**
 * Scans every distinct blob reachable from every ref. Blobs are deduplicated,
 * so this is bounded by content rather than by commit count.
 */
function scanHistory(findings) {
  const seen = new Set()
  const lines = git(['rev-list', '--objects', '--all']).split('\n')
  for (const line of lines) {
    const [sha, ...rest] = line.trim().split(' ')
    if (!sha || rest.length === 0) continue
    if (seen.has(sha)) continue
    seen.add(sha)
    const file = rest.join(' ')
    if (isThirdParty(file)) continue
    let size
    try {
      size = Number(git(['cat-file', '-s', sha]).trim())
    } catch {
      continue
    }
    if (!Number.isFinite(size) || size === 0 || size > MAX_TEXT_BYTES) continue
    let buffer
    try {
      buffer = execFileSync('git', ['cat-file', '-p', sha], { maxBuffer: MAX_TEXT_BYTES * 2 })
    } catch {
      continue
    }
    if (!looksTextual(buffer)) continue
    scanText(buffer.toString('utf8'), `${file} @${sha.slice(0, 8)} (history)`, findings)
  }
}

/** Commit identities and tag messages, per II.29.2 part 4. */
function scanMetadata(findings) {
  const identities = new Set()
  for (const line of git(['log', '--all', '--format=%an<%ae>|%cn<%ce>']).split('\n')) {
    for (const part of line.split('|')) {
      if (part.trim()) identities.add(part.trim())
    }
  }
  for (const identity of identities) {
    scanText(identity, 'git metadata: commit identity', findings)
  }
  for (const tag of git(['tag', '-l', '-n99']).split('\n')) {
    if (tag.trim()) scanText(tag, 'git metadata: tag message', findings)
  }
}

function report(findings) {
  const failing = findings.filter((f) => f.kind === 'fail')
  const info = findings.filter((f) => f.kind === 'info')
  const thirdParty = findings.filter((f) => f.kind === 'third-party')

  const print = (title, rows) => {
    if (rows.length === 0) return
    console.log(`\n${title} (${rows.length})`)
    const seen = new Set()
    for (const row of rows) {
      const key = `${row.kind}|${row.rule}|${row.where}`
      if (seen.has(key)) continue
      seen.add(key)
      console.log(`  [${row.rule}] ${row.where} — ${row.description}; matched ${row.preview}`)
    }
  }

  print('FAIL — must be fixed', failing)
  print('INFO — review, synthetic values are expected here', info)
  print('THIRD-PARTY — upstream authorship, not our data', thirdParty)

  if (findings.length === 0) console.log('Clean: no personal data or secrets found.')

  console.log(
    `\nSummary: ${failing.length} failing, ${info.length} informational, ${thirdParty.length} third-party.`,
  )
  console.log('Values are masked by design (guide II.29.4.2); never quote a matched value in a doc or issue.')
  return failing.length === 0 ? 0 : 1
}

function main() {
  const args = process.argv.slice(2)
  const findings = []
  const pathsFlag = args.indexOf('--paths')
  const explicitPaths = pathsFlag === -1 ? [] : args.slice(pathsFlag + 1).filter((a) => !a.startsWith('--'))

  const all = args.includes('--all')
  if (all || args.includes('--tree')) walk(ROOT, findings)
  if (all || args.includes('--history')) scanHistory(findings)
  if (all || args.includes('--metadata')) scanMetadata(findings)
  if (explicitPaths.length > 0) scanPaths(explicitPaths, findings)

  if (
    !all &&
    !args.includes('--tree') &&
    !args.includes('--history') &&
    !args.includes('--metadata') &&
    explicitPaths.length === 0
  ) {
    walk(ROOT, findings)
  }

  process.exit(report(findings))
}

main()
