// Offline support for Fool's Gold. The numbers all come from files, so once these are cached the app runs with no network.
// BUILD and FILES are written by tools/fools-gold/stamp.mjs.
const BUILD = 'df97fefd';
const FILES = ['./', 'index.html', 'manifest.json', 'favicon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'css/style.css?v=df97fefd', 'js/app.js?v=df97fefd', 'js/appraise.js?v=df97fefd', 'js/cart.js?v=df97fefd', 'js/complete.js?v=df97fefd', 'js/data.js?v=df97fefd', 'js/engine.js?v=df97fefd', 'js/facts.js?v=df97fefd', 'js/fields.js?v=df97fefd', 'js/guess.js?v=df97fefd', 'js/library.js?v=df97fefd', 'js/lists.js?v=df97fefd', 'js/money.js?v=df97fefd', 'js/parser.js?v=df97fefd', 'js/scifi.js?v=df97fefd', 'js/setting.js?v=df97fefd', 'js/store.js?v=df97fefd', 'js/suggest.js?v=df97fefd', 'js/unstated.js?v=df97fefd', 'js/world.js?v=df97fefd'];
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
