#!/usr/bin/env node
/**
 * Dependency licence policy checker (no extra dependencies).
 * Reads package-lock.json and checks each package's licence against an allowlist.
 * Fails if any package has an unknown/disallowed licence class.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ALLOW = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'Unlicense',
  '0BSD',
  'CC0-1.0',
  'Python-2.0',
  // Weak copyleft / file-level copyleft — acceptable with compliance tracked in ATTRIBUTION
  'MPL-2.0',
  // Dataset/usage licences for compatibility data — usage tracked, not linked/redistributed as code
  'CC-BY-4.0',
])

const lockPath = resolve(process.cwd(), 'package-lock.json')
const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
const pkgs = lock.packages || {}

const violations = []

for (const [key, entry] of Object.entries(pkgs)) {
  if (!key.startsWith('node_modules/')) continue
  if (!entry) continue
  const name = key.replace('node_modules/', '')
  // Skip the root package (name is empty string key handled separately)
  if (name === '') continue
  const lic = entry.license || entry.licenses
  if (!lic) {
    // Some packages omit license in lock; we can't verify — flag for review
    violations.push({ name, key, issue: 'missing licence metadata in lockfile' })
    continue
  }
  // Normalize to string
  let licStr
  if (Array.isArray(lic)) {
    licStr = lic.map((l) => (typeof l === 'string' ? l : l.type || l.name || '')).join(' OR ')
  } else if (typeof lic === 'object') {
    licStr = lic.type || lic.name || JSON.stringify(lic)
  } else {
    licStr = String(lic)
  }
  // Check each component
  const parts = licStr.split(/ OR | AND |\//).map((s) => s.trim())
  const allAllowed =
    parts.length > 0 && parts.every((p) => p === '' || ALLOW.has(p) || ALLOW.has(p.replace(/\(|\)/g, '')))
  if (!allAllowed) {
    violations.push({ name, key, licence: licStr, issue: 'disallowed or unknown licence' })
  }
}

if (violations.length > 0) {
  console.error('Licence policy violations:')
  for (const v of violations) {
    console.error(`  - ${v.name}: ${v.issue} (${v.licence || v.key})`)
  }
  process.exit(1)
}

console.log(
  `Licence check passed for ${Object.keys(pkgs).filter((k) => k.startsWith('node_modules/')).length} packages.`,
)
