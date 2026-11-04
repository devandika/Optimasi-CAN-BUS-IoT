// Service Worker for CAT 950L Telemetry PWA
const CACHE_NAME = 'cat950l-cache-v1';
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/cat-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  // Auto-update: Langsung aktifkan service worker baru
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Stale-While-Revalidate untuk aset statis, Network-First untuk data real-time
self.addEventListener('fetch', (event) => {
  // Jangan cache request WebSocket atau API telemetri
  if (event.request.url.includes('/api/') || event.request.url.startsWith('ws') || event.request.url.startsWith('wss')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
