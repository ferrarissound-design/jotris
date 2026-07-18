// JOTRIS service worker: アセットをキャッシュしてオフラインでも遊べるようにする
// アセットを更新したら CACHE_NAME のバージョンを上げること

const CACHE_NAME = 'jotris-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=13',
  './main.js?v=7',
  './manifest.json',
  './BGM.mp3',
  './Shikoku.mp3',
  './Zundamon_1780555126505.mp3',
  './jo2.jpg',
  './icon2.PNG',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
