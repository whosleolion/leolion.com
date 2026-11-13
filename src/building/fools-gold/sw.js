// Offline support for Fool's Gold. The numbers all come from files, so once these are cached the app runs with no network.
// BUILD and FILES are written by tools/fools-gold/stamp.mjs.
const BUILD = '4f5e4f82';
const FILES = ['./', 'index.html', 'manifest.json', 'favicon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'css/fonts.css', 'privacy.html', 'support.html', 'fonts/chakrapetch-v13-cIf6MapbsEk7TDLdtEz1BwkWn6pgar3I1A.woff2', 'fonts/chakrapetch-v13-cIflMapbsEk7TDLdtEz1BwkeJI91R5_F_gUk0w.woff2', 'fonts/chakrapetch-v13-cIflMapbsEk7TDLdtEz1BwkeQI51R5_F_gUk0w.woff2', 'fonts/cormorantgaramond-v21-co3bmX5slCNuHLi8bLeY9MK7whWMhyjYqXtKky2F7g.woff2', 'fonts/courierprime-v11-u-450q2lgwslOqpF_6gQ8kELawFpWs39pvk.woff2', 'fonts/courierprime-v11-u-4k0q2lgwslOqpF_6gQ8kELY7pMT-Dfq9PrNX0.woff2', 'fonts/fraunces-v38-6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeP2Xz5c.woff2', 'fonts/imfellenglish-v14-Ktk1ALSLW8zDe0rthJysWrnLsAzHEKOYd4xI5g.woff2', 'fonts/imfellenglish-v14-Ktk3ALSLW8zDe0rthJysWrnLsAzHFZOafYtq5Mzh.woff2', 'fonts/jetbrainsmono-v24-tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxDcwgknk-4.woff2', 'css/style.css?v=4f5e4f82', 'js/app.js?v=4f5e4f82', 'js/appraise.js?v=4f5e4f82', 'js/cart.js?v=4f5e4f82', 'js/complete.js?v=4f5e4f82', 'js/content.js?v=4f5e4f82', 'js/data.js?v=4f5e4f82', 'js/engine.js?v=4f5e4f82', 'js/facts.js?v=4f5e4f82', 'js/fields.js?v=4f5e4f82', 'js/guess.js?v=4f5e4f82', 'js/library.js?v=4f5e4f82', 'js/lists.js?v=4f5e4f82', 'js/money.js?v=4f5e4f82', 'js/native.js?v=4f5e4f82', 'js/parser.js?v=4f5e4f82', 'js/scifi.js?v=4f5e4f82', 'js/setting.js?v=4f5e4f82', 'js/store.js?v=4f5e4f82', 'js/suggest.js?v=4f5e4f82', 'js/unstated.js?v=4f5e4f82', 'js/voice.js?v=4f5e4f82', 'js/world.js?v=4f5e4f82'];
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
