const CACHE = 'bt-v2.0.4';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./db.js','./manifest.webmanifest','./auth.js','./cloudkit-sync.js','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); });
self.addEventListener('fetch', e => { const url = new URL(e.request.url); if (url.origin === location.origin) e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))); });
