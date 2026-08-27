const CACHE_NAME = 'site-photo-shell-v5'
const APP_SHELL = ['/', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const response = await fetch('/')
    if (!response.ok) return
    await cache.put('/', response.clone())
    const html = await response.text()
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((asset) => asset.startsWith('/_next/static/') || asset === '/manifest.webmanifest')
    await Promise.all([...new Set(assets)].map(async (asset) => {
      try { await cache.add(asset) } catch { /* 單一資源失敗不阻止 Worker 安裝 */ }
    }))
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  const url = new URL(request.url)
  const isNavigation = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')
  event.respondWith(
    (isNavigation ? fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
      return response
    }).catch(() => caches.match(request).then((cached) => cached || caches.match('/'))) : caches.match(request).then((cached) => cached || fetch(request))).then((response) => {
      if (response && response.ok) {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      }
      return response
    }).catch(() => caches.match(request).then((cached) => cached || (request.mode === 'navigate' ? caches.match('/') : Response.error())))
  )
})
