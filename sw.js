const CACHE = 'wavarchive-202603191547';
const STATIC = ['/wavarchive-site/', '/wavarchive-site/index.html', '/wavarchive-site/style.css', '/wavarchive-site/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  if(e.request.url.includes('firebasejs') || e.request.url.includes('googleapis')) return;
  if(e.request.url.includes('tracks.json') || e.request.url.includes('raw.githubusercontent')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if(r.ok) {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return r;
    }).catch(() => caches.match(e.request))
  );
});
