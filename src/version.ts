/**
 * Single source of truth for the running application version.
 *
 * Keep in sync with `package.json` and the git tag (`v0.1.0` etc.). The value
 * is surfaced through `/healthz`, `/api/health` and Settings → About, and is
 * the baseline for the in-app update check against GitHub Releases.
 */
export const APP_VERSION = '0.1.0'
