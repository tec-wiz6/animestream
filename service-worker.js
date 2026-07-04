// Minimal app-shell cache. Deliberately does NOT cache API responses or any
// media — this app streams no video, it only links out to licensed platforms.
const CACHE_NAME = 'rewind-shell-v1';
const SHELL = ['./index.html', './style.css', './app.js', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Only serve the app shell from cache; everything else (API calls, images) goes to network.
  if (SHELL.some((path) => url.pathname.endsWith(path.replace('./', '')))) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
