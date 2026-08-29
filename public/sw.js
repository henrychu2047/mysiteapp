const CACHE_NAME = 'site-photo-static-v13'
const STATIC_RESOURCE = /\/_next\/static\//

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const shell = await fetch('/', { cache: 'no-store' })
    await cache.put('/', shell.clone())
    const html = await shell.text()
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((asset) => STATIC_RESOURCE.test(asset) || asset === '/manifest.webmanifest')
    await Promise.all([...new Set(assets)].map((asset) => cache.add(asset).catch(() => undefined)))
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'CACHE_RESOURCES' && Array.isArray(event.data.urls)) {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.all(event.data.urls.map((url) => cache.add(url).catch(() => undefined)))))
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
  )))
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  const isDocument = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')
  const isStaticResource = STATIC_RESOURCE.test(new URL(request.url).pathname) || new URL(request.url).pathname === '/manifest.webmanifest'
  if (isDocument) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
        return response
      }).catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
    )
    return
  }
  if (isStaticResource) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
      return response
    }).catch(() => Response.error())))
  }
})
