/*
 * Construction Weather Monitor — Service Worker
 *
 * Local-first offline strategy:
 *  - App shell (HTML, manifest, icons) is precached on install.
 *  - Hashed build assets are cache-first, refreshed in the background.
 *  - Read-only API GETs are network-first with a cached fallback, so the last
 *    known weather/risk snapshot remains viewable when the network is down.
 *  - Mutations, auth, and backup endpoints are never cached or served stale.
 */

const SW_VERSION = 'cwm-v2';
const SHELL_CACHE = `${SW_VERSION}-shell`;
const ASSET_CACHE = `${SW_VERSION}-assets`;
const API_CACHE = `${SW_VERSION}-api`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Precache best-effort: a single missing asset must not abort install.
      await Promise.all(
        SHELL_ASSETS.map((url) => cache.add(url).catch(() => undefined))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(SW_VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

/** Endpoints that must always hit the live server (no caching, no stale data). */
function isNetworkOnly(pathname) {
  return (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/data/backup') ||
    pathname.startsWith('/api/data/clear') ||
    pathname.startsWith('/api/users')
  );
}

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      // Signal to the client that this is cached/stale data.
      const headers = new Headers(cached.headers);
      headers.set('X-Offline-Cache', 'true');
      return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
    }
    return new Response(
      JSON.stringify({ error: 'Offline and no cached data available.', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    // Refresh in the background without blocking.
    fetch(request)
      .then((response) => {
        if (response && response.ok) cache.put(request, response.clone());
      })
      .catch(() => undefined);
    return cached;
  }
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (err) {
    const shell = await caches.open(SHELL_CACHE);
    const cached = (await shell.match('/index.html')) || (await shell.match('/'));
    if (cached) return cached;
    return new Response('<h1>Offline</h1><p>The monitoring enclave is unreachable.</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const { pathname } = url;

  if (pathname.startsWith('/api/')) {
    if (isNetworkOnly(pathname)) return; // fall through to browser default
    event.respondWith(networkFirstApi(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Same-origin static assets: JS/CSS bundles, icons, fonts, images.
  if (
    pathname.startsWith('/assets/') ||
    pathname === '/' ||
    /\.(?:js|mjs|css|svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|json|webmanifest)$/.test(pathname)
  ) {
    event.respondWith(cacheFirstAsset(request));
  }
});

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------

/** Renders an incoming push message as a visible OS notification. */
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Weather Monitor alert',
    body: 'A new safety condition requires attention.',
    tag: 'cwm-alert',
    url: '/'
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: payload.url || '/' },
      requireInteraction: payload.severity === 'CRITICAL' || payload.severity === 'HIGH'
    })
  );
});

/** Focuses an existing tab (or opens one) when a notification is clicked. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(targetUrl);
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
    })()
  );
});
