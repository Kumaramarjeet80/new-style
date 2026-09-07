const CACHE_NAME = 'mohna-express-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './checkout.html',
  './orders.html',
  './profile.html',
  './auth.html',
  './style.css',
  './script.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Always fetch live Google Apps Script and external APIs directly from network
  if (event.request.url.includes('script.google.com') || event.request.url.includes('nominatim') || event.request.url.includes('razorpay')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first falling back to cache for local assets
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
