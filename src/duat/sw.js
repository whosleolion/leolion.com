/* Duat offline copy: every Duat file (and the campaign's shared edits) is fetched fresh when
   the network answers quickly, and the last good copy is used when it doesn't, so the quickref
   still opens at the table with bad signal or none. */
const CACHE = 'duat-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === self.location.origin && url.pathname.startsWith('/duat/');
  const edits = /(^|\.)script\.google\.com$/.test(url.hostname) && !url.searchParams.has('history');
  const upload = url.hostname === 'lh3.googleusercontent.com';
  if (!own && !edits && !upload) return;
  e.respondWith(freshOrSaved(req, own ? 4000 : 15000));
});
async function freshOrSaved(req, ms) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('slow network')), ms))]);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const saved = await cache.match(req);
    if (saved) return saved;
    throw err;
  }
}
