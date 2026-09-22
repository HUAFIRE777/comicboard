// Offline Service Worker for EazyOPC Canvas Tools
// - Navigations: network-first (fallback to cached '/')
// - Same-origin static GET assets: stale-while-revalidate
// - Cross-origin requests: ignored (browser handles them)
const CACHE_NAME = 'eazyopc-canvas-v2';
const PRECACHE_ASSETS = [
  '/favicon.ico',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/manifest.json'
];

function isCacheable(res) {
  return res && res.ok && !res.redirected && res.type === 'basic';
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : undefined))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return; // let the browser handle cross-origin

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (isCacheable(res)) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put('/', clone)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match('/').then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // Stale-while-revalidate for same-origin static assets
  e.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (isCacheable(res)) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => cached || Response.error());
        if (cached) {
          e.waitUntil(network.catch(() => {}));
          return cached;
        }
        return network;
      })
    )
  );
});
