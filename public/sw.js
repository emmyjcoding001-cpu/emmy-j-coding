const CACHE = 'emmy-j-v1'
const APP_SHELL = ['/', '/manifest.webmanifest', '/icon-192.svg', '/icon-512.svg']
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))))
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request))))
