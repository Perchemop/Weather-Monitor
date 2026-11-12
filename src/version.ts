/**
 * Single source of truth for the running application version.
 *
 * The authoritative value is `package.json`'s `version` — the release workflow
 * refuses to publish a tag whose version disagrees with it. Both bundles get it
 * injected at build time as `process.env.APP_VERSION`:
 *
 *   - the browser bundles from `vite.config.ts`, and
 *   - the server bundle from the esbuild step of the `build` script,
 *
 * so `/healthz`, `/api/health`, Settings → About and the in-app update check all
 * report exactly the packaged version. Node-only runs that bypass the bundlers
 * (the `tsx` dev server and the test suite) fall back to reading `package.json`
 * from the working directory; the `0.0.0` sentinel only appears if neither the
 * injected value nor `package.json` is available.
 */
function versionFromPackageJson(): string | undefined {
  if (typeof process === 'undefined' || typeof process.getBuiltinModule !== 'function') {
    return undefined
  }
  try {
    const fs = process.getBuiltinModule('node:fs')
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version?: string }
    return typeof pkg.version === 'string' ? pkg.version : undefined
  } catch {
    return undefined
  }
}

export const APP_VERSION: string =
  process.env.APP_VERSION ?? versionFromPackageJson() ?? '0.0.0'
