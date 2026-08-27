const CACHE_NAME = 'site-photo-shell-v2'
const APP_SHELL = ['/', '/manifest.webmanifest', '/apple-icon.png', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  const url = new URL(request.url)
  const isStaticAsset = url.pathname.startsWith('/_next/static/') || /\.(js|css|woff2?|png|svg|ico)$/.test(url.pathname)
  event.respondWith(
    (isStaticAsset ? caches.match(request).then((cached) => cached || fetch(request)) : fetch(request)).then((response) => {
      if (response && response.ok) {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      }
      return response
    }).catch(() => caches.match(request).then((cached) => cached || (request.mode === 'navigate' ? caches.match('/') : Response.error())))
  )
})
