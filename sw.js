// ILMO Service Worker
const CACHE_NAME = "ilmo-cache-v1";
const PRECACHE_ASSETS = [
  "./",
  "index.html",
  "css/styles.css",
  "js/app.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon.svg"
];

// Install: pre-cache essential app shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("Pre-cache partial failure:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches and claim clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-while-revalidate for local assets; pass through for external embeds
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Do not intercept non-GET requests or YouTube / Google API requests
  if (event.request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }
  if (url.origin !== self.location.origin) {
    // External resources (YouTube thumbnails, embeds, etc.) - let browser handle directly
    return;
  }

  // Network-first for videos.js / videos.json so user gets latest feeds, falling back to cache
  if (url.pathname.endsWith("videos.js") || url.pathname.endsWith("videos.json")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Stale-while-revalidate for shell assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

