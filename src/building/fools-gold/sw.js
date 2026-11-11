// Offline support for Fool's Gold. The numbers all come from files, so once these are cached the app runs with no network.
// BUILD and FILES are written by tools/fools-gold/stamp.mjs.
const BUILD = 'efcf198a';
const FILES = ['./', 'index.html', 'css/style.css?v=efcf198a', 'js/app.js?v=efcf198a', 'js/data.js?v=efcf198a', 'js/engine.js?v=efcf198a', 'js/fields.js?v=efcf198a', 'js/guess.js?v=efcf198a', 'js/money.js?v=efcf198a', 'js/parser.js?v=efcf198a', 'js/setting.js?v=efcf198a', 'js/store.js?v=efcf198a', 'js/unstated.js?v=efcf198a', 'js/world.js?v=efcf198a'];
const CACHE = 'fg-' + BUILD;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('fg-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), ms)); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // fonts and anything else: the network, or nothing
  if (url.pathname.endsWith('/version.json')) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || new Response('{}', { headers: { 'content-type': 'application/json' } }))));
    return;
  }
  if (req.mode === 'navigate') {
    // newest page when the network answers quickly, the saved copy otherwise
    e.respondWith(
      Promise.race([fetch(req), timeout(4000)])
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html', { ignoreSearch: true })))
    );
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })));
});
