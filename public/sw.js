// Content-hashed Next.js assets are safe to reuse. Keeping one stable cache
// name removes the old manual version sync with the registration URL.
const CACHE_NAME = 'site-photo-static'
const STATIC_RESOURCE = /\/_next\/static\//
const RUNTIME_RESOURCE = /\/_next\/(static|image)\//
const OFFLINE_ROUTES = [
  '/', '/camera', '/site-memo', '/handover', '/notebook', '/database', '/full',
  '/manifest/camera', '/manifest/site-memo', '/manifest/handover',
  '/manifest/notebook', '/manifest/database', '/manifest/full',
]

function cacheResponse(request, response) {
  return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const shell = await fetch('/', { cache: 'no-store' })
    await cache.put('/', shell.clone())
    const html = await shell.text()
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((asset) => STATIC_RESOURCE.test(asset) || asset === '/manifest.webmanifest')
    await Promise.all([...new Set([...assets, ...OFFLINE_ROUTES])].map((asset) => cache.add(asset).catch(() => undefined)))
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
  // Fixed worker URLs must be refreshed online so updated PDF.js bundles do not
  // run against an older worker. Keep the last successful copy for offline use.
  if (new URL(request.url).pathname.startsWith('/drawing/')) {
    event.respondWith(fetch(request, { cache: 'no-cache' }).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, response.clone())
      }
      return response
    }).catch(async () => (await caches.match(request)) || Response.error()))
    return
  }
  const pathname = new URL(request.url).pathname
  const isStaticResource = STATIC_RESOURCE.test(pathname) || pathname === '/manifest.webmanifest' || pathname.startsWith('/manifest/')
  if (isDocument) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).then((response) => {
        if (response.ok) event.waitUntil(cacheResponse(request, response).catch(() => undefined))
        return response
      }).catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
    )
    return
  }
  if (isStaticResource || RUNTIME_RESOURCE.test(pathname) || request.destination === 'image' || request.destination === 'font' || request.destination === 'style') {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      try {
        const response = await fetch(request)
        if (response.ok) event.waitUntil(cacheResponse(request, response).catch(() => undefined))
        return response
      } catch {
        return Response.error()
      }
    })())
  }
})
