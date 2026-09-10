// Minimal offline shell for StyleShift. Deliberately does NOT cache API
// responses or authenticated pages — only the static app shell, so a rep who
// loses signal mid-visit still gets a usable screen instead of a browser
// error, and Log a Visit / offline-queue.ts (app-layer) handles the actual
// write resilience.
const CACHE = 'styleshift-shell-v1'
const SHELL_URLS = ['/offline', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return // never intercept writes — those go through offline-queue.ts

  const url = new URL(request.url)

  // Next's hashed static assets are immutable — safe to cache-first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy))
        return res
      }))
    )
    return
  }

  // Page navigations: try the network, fall back to the offline shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline').then((res) => res || Response.error()))
    )
  }
})
