#!/usr/bin/env node
/**
 * Dependency-free repository format check (guide.md section 4, "Format check").
 *
 * This project intentionally has no opinionated formatter (no Prettier config),
 * so "format check" is implemented as a set of objective hygiene rules that are
 * cheap, deterministic, and safe to enforce:
 *
 *   Whole repository (all tracked text files):
 *     - no CRLF line endings
 *     - no merge-conflict markers
 *     - every file ends with exactly one trailing newline
 *     - code files use spaces, never tabs, for indentation
 *
 *   Changed files only (when --changed-from <git-ref> is supplied):
 *     - no trailing whitespace on code lines
 *     (Markdown is exempt from trailing-whitespace checks because two trailing
 *      spaces are a meaningful hard line break.)
 *
 * Usage:
 *   node scripts/check-format.mjs
 *   node scripts/check-format.mjs --changed-from origin/main
 *
 * Exit code 0 = clean, 1 = violations found.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.yml', '.yaml'])
const TEXT_EXTENSIONS = new Set([...CODE_EXTENSIONS, '.md', '.css', '.html', '.txt', '.sh'])

// Paths excluded from the scan: vendored, generated, or local tooling config.
const EXCLUDED_PREFIXES = ['.opencode/', 'dist/', 'dist-static/', 'node_modules/', 'data/']
const EXCLUDED_FILES = new Set(['package-lock.json'])

function extensionOf(file) {
  const idx = file.lastIndexOf('.')
  return idx === -1 ? '' : file.slice(idx).toLowerCase()
}

function isIncluded(file) {
  if (EXCLUDED_FILES.has(file)) return false
  return !EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix))
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function parseArgs(argv) {
  const out = { changedFrom: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--changed-from') out.changedFrom = argv[i + 1] || null
  }
  return out
}

/**
 * Collects the added lines (with their new line numbers) for a set of diffs.
 * Only added lines are checked for trailing whitespace, so touching a legacy
 * file that already contains some does not fail the build.
 */
function addedLinesFor(rangeArgs) {
  const added = new Map()
  let diff
  try {
    diff = git(['diff', '-U0', '--diff-filter=ACMR', ...rangeArgs])
  } catch {
    return null
  }
  let currentFile = null
  let nextLine = 0
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      currentFile = raw.slice(4).replace(/^b\//, '')
      continue
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      nextLine = Number(hunk[1])
      continue
    }
    if (raw.startsWith('+') && !raw.startsWith('+++') && currentFile) {
      const existing = added.get(currentFile) || []
      existing.push({ line: nextLine, text: raw.slice(1) })
      added.set(currentFile, existing)
      nextLine += 1
    }
  }
  return added
}

function collectAddedLines(ref) {
  const combined = new Map()
  const ranges = [[`${ref}...HEAD`], []]
  for (const rangeArgs of ranges) {
    const added = addedLinesFor(rangeArgs)
    if (added === null) {
      if (rangeArgs.length > 0) return null // base ref unavailable
      continue
    }
    for (const [file, entries] of added) {
      combined.set(file, [...(combined.get(file) || []), ...entries])
    }
  }
  return combined
}

const { changedFrom } = parseArgs(process.argv.slice(2))
const changed = changedFrom ? collectAddedLines(changedFrom) : null
if (changedFrom && changed === null) {
  console.warn(
    `check-format: could not resolve "${changedFrom}"; skipping changed-file trailing-whitespace check.`,
  )
}

const tracked = git(['ls-files'])
  .split('\n')
  .filter(Boolean)
  .filter(isIncluded)
  .filter((file) => TEXT_EXTENSIONS.has(extensionOf(file)))

const problems = []
const report = (file, line, message) => problems.push(`${file}${line ? `:${line}` : ''}: ${message}`)

for (const file of tracked) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }

  const ext = extensionOf(file)
  const lines = content.split('\n')

  if (content.includes('\r')) {
    report(file, null, 'contains CR (CRLF) line endings')
  }
  if (/^(<<<<<<<|>>>>>>>) /m.test(content) || /^=======$/m.test(content)) {
    report(file, null, 'contains merge-conflict markers')
  }
  if (content.length > 0 && !content.endsWith('\n')) {
    report(file, null, 'missing a final newline')
  }

  const isCode = CODE_EXTENSIONS.has(ext)
  lines.forEach((line, index) => {
    if (isCode && /^\t/.test(line)) {
      report(file, index + 1, 'tab indentation (use spaces)')
    }
  })

  // Trailing whitespace is only enforced on lines this change introduced.
  const addedForFile = changed?.get(file)
  if (isCode && addedForFile) {
    for (const { line, text } of addedForFile) {
      if (/[ \t]+$/.test(text)) {
        report(file, line, 'trailing whitespace on an added line')
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`\nFormat check failed with ${problems.length} issue(s):\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('\nFix the files above and re-run `npm run format:check`.\n')
  process.exit(1)
}

const changedSummary = changed ? `, trailing whitespace on ${changed.size} changed file(s)` : ''
console.log(`Format check passed (${tracked.length} tracked text files${changedSummary}).`)
