// Offline support for Fool's Gold. The numbers all come from files, so once these are cached the app runs with no network.
// BUILD and FILES are written by tools/fools-gold/stamp.mjs.
const BUILD = '631ab3e4';
const FILES = ['./', 'index.html', 'manifest.json', 'favicon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'css/style.css?v=631ab3e4', 'js/app.js?v=631ab3e4', 'js/appraise.js?v=631ab3e4', 'js/cart.js?v=631ab3e4', 'js/complete.js?v=631ab3e4', 'js/data.js?v=631ab3e4', 'js/engine.js?v=631ab3e4', 'js/facts.js?v=631ab3e4', 'js/fields.js?v=631ab3e4', 'js/guess.js?v=631ab3e4', 'js/library.js?v=631ab3e4', 'js/lists.js?v=631ab3e4', 'js/money.js?v=631ab3e4', 'js/parser.js?v=631ab3e4', 'js/scifi.js?v=631ab3e4', 'js/setting.js?v=631ab3e4', 'js/store.js?v=631ab3e4', 'js/suggest.js?v=631ab3e4', 'js/unstated.js?v=631ab3e4', 'js/world.js?v=631ab3e4'];
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
