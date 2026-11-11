// Offline support for Fool's Gold. The numbers all come from files, so once these are cached the app runs with no network.
// BUILD and FILES are written by tools/fools-gold/stamp.mjs.
const BUILD = 'd6c6ccdd';
const FILES = ['./', 'index.html', 'manifest.json', 'favicon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'css/style.css?v=d6c6ccdd', 'js/app.js?v=d6c6ccdd', 'js/cart.js?v=d6c6ccdd', 'js/data.js?v=d6c6ccdd', 'js/engine.js?v=d6c6ccdd', 'js/facts.js?v=d6c6ccdd', 'js/fields.js?v=d6c6ccdd', 'js/guess.js?v=d6c6ccdd', 'js/lists.js?v=d6c6ccdd', 'js/money.js?v=d6c6ccdd', 'js/parser.js?v=d6c6ccdd', 'js/scifi.js?v=d6c6ccdd', 'js/setting.js?v=d6c6ccdd', 'js/store.js?v=d6c6ccdd', 'js/suggest.js?v=d6c6ccdd', 'js/unstated.js?v=d6c6ccdd', 'js/world.js?v=d6c6ccdd'];
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
