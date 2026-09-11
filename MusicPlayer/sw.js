// Change this version name whenever you update your code on GitHub
const CACHE_NAME = 'amarjeet-music-cache-v2';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

// Install: Download fresh assets
self.addEventListener('install', (e) => {
  // Forces the waiting service worker to become the active service worker immediately
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate: Delete old caches from previous versions immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            return caches.delete(k);
          }
        })
      )
    )
  );
  // Claim all open tabs right away
  return self.clients.claim();
});

// Network-First for files with fallback to Cache when offline
self.addEventListener('fetch', (e) => {
  // Only intercept GET requests
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // If online, update cache in background with the new copy
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        }
        return networkResponse;
      })
      .catch(() => {
        // If completely offline, serve from local cache
        return caches.match(e.request);
      })
  );
});
