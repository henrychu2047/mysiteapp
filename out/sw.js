const CACHE_NAME = 'site-photo-static-v6'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const shell = await fetch('/', { cache: 'no-store' })
    await cache.put('/', shell.clone())
    const html = await shell.text()
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((asset) => asset.startsWith('/_next/static/') || asset === '/manifest.webmanifest')
    await Promise.all([...new Set(assets)].map((asset) => cache.add(asset).catch(() => undefined)))
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
  )))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  const isDocument = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')
  event.respondWith(
    isDocument
      ? fetch(request, { cache: 'no-store' }).then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
          return response
        }).catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
      : caches.match(request).then((cached) => cached || fetch(request).then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
          return response
        })),
  )
})
