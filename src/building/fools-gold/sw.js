// Offline support for Fool's Gold. The numbers all come from files, so once these are cached the app runs with no network.
// BUILD and FILES are written by tools/fools-gold/stamp.mjs.
const BUILD = 'bf6dbdcb';
const FILES = ['./', 'index.html', 'manifest.json', 'favicon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'css/style.css?v=bf6dbdcb', 'js/app.js?v=bf6dbdcb', 'js/appraise.js?v=bf6dbdcb', 'js/cart.js?v=bf6dbdcb', 'js/data.js?v=bf6dbdcb', 'js/engine.js?v=bf6dbdcb', 'js/facts.js?v=bf6dbdcb', 'js/fields.js?v=bf6dbdcb', 'js/guess.js?v=bf6dbdcb', 'js/library.js?v=bf6dbdcb', 'js/lists.js?v=bf6dbdcb', 'js/money.js?v=bf6dbdcb', 'js/parser.js?v=bf6dbdcb', 'js/scifi.js?v=bf6dbdcb', 'js/setting.js?v=bf6dbdcb', 'js/store.js?v=bf6dbdcb', 'js/suggest.js?v=bf6dbdcb', 'js/unstated.js?v=bf6dbdcb', 'js/world.js?v=bf6dbdcb'];
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
