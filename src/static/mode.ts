/**
 * Static (serverless) build flag.
 *
 * When `true` the frontend is compiled to run entirely in the browser — it
 * fetches weather straight from Open-Meteo, evaluates risk/alerts with the
 * shared engines, and persists everything in IndexedDB. This is the build used
 * for the GitHub Pages deployment and requires no backend.
 *
 * The regular Node/Express build leaves this `false`, so it keeps talking to
 * the HTTP API exactly as before.
 */
export const STATIC_MODE: boolean =
  import.meta.env.VITE_APP_MODE === 'static' || import.meta.env.MODE === 'static';

/**
 * Application base path. On GitHub Pages the app is served from
 * `/<repo>/`, so any runtime-built absolute URL (service worker, icons) must
 * be prefixed with this value. Vite sets `BASE_URL` to `/` for normal builds.
 */
export const BASE_PATH: string = import.meta.env.BASE_URL || '/';
