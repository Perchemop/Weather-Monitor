/**
 * Installs the in-browser API backend for the static build.
 *
 * A single `window.fetch` interceptor routes any `/api/*` request — whether it
 * comes from `apiFetch()` or a raw `fetch()` call inside a component — to
 * `handleStaticApi`, while every other request (Open-Meteo, geocoding, assets)
 * passes through to the real network untouched.
 */

import { handleStaticApi } from './backend.js'
import { staticMonitor } from './monitor.js'

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function parseBody(init?: RequestInit): Promise<any> {
  const raw = init?.body
  if (raw == null) return undefined
  if (typeof raw === 'string') {
    if (!raw) return undefined
    try {
      return JSON.parse(raw)
    } catch {
      return undefined
    }
  }
  if (typeof FormData !== 'undefined' && raw instanceof FormData) {
    const obj: Record<string, any> = {}
    raw.forEach((v, k) => (obj[k] = v))
    return obj
  }
  return undefined
}

export async function installStaticBackend(): Promise<void> {
  await staticMonitor.start()
  staticMonitor.watchLifecycle()

  const originalFetch = globalThis.fetch.bind(globalThis)

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url

    // Only intercept same-origin API calls; absolute external URLs pass through.
    let parsed: URL
    try {
      parsed = new URL(url, globalThis.location?.origin || 'http://localhost')
    } catch {
      return originalFetch(input as any, init)
    }

    if (parsed.pathname === '/api' || parsed.pathname.startsWith('/api/')) {
      const method = (
        init?.method ||
        (typeof input !== 'string' && !(input instanceof URL) ? (input as Request).method : 'GET') ||
        'GET'
      ).toUpperCase()
      try {
        const response = await handleStaticApi({
          method,
          pathname: parsed.pathname,
          search: parsed.searchParams,
          body: await parseBody(init),
        })
        return jsonResponse(response.body, response.status)
      } catch (err) {
        console.error('[StaticBackend] Handler error:', err)
        return jsonResponse({ error: 'Local data handler failed.' }, 500)
      }
    }

    return originalFetch(input as any, init)
  }
}
