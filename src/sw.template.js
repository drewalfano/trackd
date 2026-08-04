/* eslint-env serviceworker */
/**
 * Service worker.
 *
 * Built by the `trackd:sw` plugin in vite.config.js, which stamps in the
 * hashed asset list below. Three jobs, and no more than three:
 *
 *   1. Precache the app shell so a cold launch works with the radio off.
 *   2. Stale-while-revalidate Open Food Facts, so a food seen once resolves
 *      offline forever after.
 *   3. Never swap versions underneath someone mid-entry — the page asks first.
 */

const VERSION = __VERSION__
const BASE = __BASE__
const PRECACHE = __PRECACHE__

const SHELL_CACHE = `mt-shell-${VERSION}`
const OFF_CACHE = 'mt-off-v1'
const OFF_HOST = 'world.openfoodfacts.org'
const OFF_MAX_ENTRIES = 300

/**
 * `ignoreVary` is load-bearing, not a nicety.
 *
 * Precaching from a list of URL strings stores each response against a request
 * that carries no `Origin` header. A `<script type="module">` tag, however, is
 * fetched in CORS mode and does send one. Hosts that reply `Vary: Origin` — Vite
 * preview and a good few static hosts do — therefore make the cached entry fail
 * to match the very request it exists to answer, and the app boots to a blank
 * screen the first time it is opened offline.
 */
const MATCH = { ignoreVary: true }

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // A single 404 in the manifest should not brick the whole install.
      .catch((err) => console.warn('Precache incomplete', err))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith('mt-shell-') && key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
      )
      await self.clients.claim()
    })()
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

/** Keep the OFF cache from growing without bound. Oldest entries go first. */
async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= max) return
  await Promise.all(keys.slice(0, keys.length - max).map((key) => cache.delete(key)))
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(OFF_CACHE)
  const cached = await cache.match(request, MATCH)

  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone()).then(() => trimCache(OFF_CACHE, OFF_MAX_ENTRIES))
      }
      return response
    })
    .catch(() => null)

  // Cached answer immediately when we have one; the refresh lands in the
  // background for next time.
  if (cached) return cached
  const fresh = await network
  if (fresh) return fresh
  return new Response(JSON.stringify({ status: 0, offline: true }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function cacheFirst(request) {
  const cached = await caches.match(request, MATCH)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(SHELL_CACHE)
    cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Hash routing means every navigation is the same document.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request)
        } catch {
          return (
            (await caches.match(BASE, MATCH)) ||
            (await caches.match(`${BASE}index.html`, MATCH)) ||
            Response.error()
          )
        }
      })()
    )
    return
  }

  if (url.hostname === OFF_HOST) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request))
  }
})
