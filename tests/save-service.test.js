// Runs duat-backend/Code.gs against small stand-ins for the Apps Script services.
// node tests/save-service.test.js  (no network, no Google account)
const { createSaveService, sha } = require('./fake-save-service');
const svc = createSaveService();
const { ctx, props, cache, main, history, copies } = svc;
// test passkeys (salted, as the site stores them)
props.KEYS = JSON.stringify({ salt: 's1', player: sha('s1' + sha('player-key')), gm: sha('s1' + sha('gm-key')) });
const P = 'player-key', GM = 'gm-key', W = 'test-world';
const post = b => ctx.doPost({ postData: { contents: JSON.stringify({ world: W, ...b }) } });
const get = (extra = {}) => ctx.doGet({ parameter: { world: W, ...extra } });
let failed = 0;
const t = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

t('version (player)', [post({ key: P, action: 'version' }).gm, post({ key: P, action: 'version' }).version], [false, 4]);
t('version (GM)', post({ key: GM, action: 'version' }).gm, true);
t('wrong passkey', post({ key: 'x', slug: 'a', author: 'thomas', text: 'hi' }).error, 'Wrong passkey');
t('player saves own notes', post({ key: P, slug: 'dogwall', author: 'zack', text: 'notes' }).ok, true);
t('player can’t write as the GM', post({ key: P, slug: 'olf', author: 'leo', text: 'oops' }).error, 'Writing as the GM needs the GM passkey');
t('GM writes page text', post({ key: GM, slug: 'olf', author: 'leo', text: 'Olf.' }).ok, true);
t('unknown person rejected', post({ key: P, slug: 'dogwall', author: 'priya', text: 'x' }).error, 'Unknown author');
t('player can’t change settings', post({ key: P, slug: 'duat-settings', author: '@world', text: '{}' }).error, 'Campaign settings need the GM passkey');
t('GM saves settings (hashes stripped)', post({ key: GM, slug: 'duat-settings', author: '@world',
  text: JSON.stringify({ authors: { priya: { name: 'Priya' }, sam: { name: 'Sam', role: 'GM' } }, keyHash: 'leak', gmHash: 'leak' }) }).ok, true);
t('settings never serve hashes', JSON.parse(get().edits.find(x => x.author === '@world').text).keyHash, undefined);
t('new person can now write', post({ key: P, slug: 'dogwall', author: 'priya', text: 'hello' }).ok, true);
t('settings name Sam as GM: player can’t write as Sam', post({ key: P, slug: 'x', author: 'sam', text: 'x' }).error, 'Writing as the GM needs the GM passkey');

// conflicts
const stamp = get().edits.find(x => x.slug === 'dogwall' && x.author === 'zack').updated;
t('save based on the latest version', post({ key: P, slug: 'dogwall', author: 'zack', text: 'v2', base: stamp }).ok, true);
const stale = post({ key: P, slug: 'dogwall', author: 'zack', text: 'v3 from an old tab', base: stamp });
t('stale save refused with the newer text', [stale.conflict, stale.current.text], [true, 'v2']);
t('force saves over it', post({ key: P, slug: 'dogwall', author: 'zack', text: 'v3', base: stamp, force: true }).ok, true);
t('new row conflict', post({ key: GM, slug: 'olf', author: 'leo', text: 'x', base: '' }).conflict, true);
t('no base = older site, still saves', post({ key: P, slug: 'dogwall', author: 'noah', text: 'n' }).ok, true);

// history
const hist = get({ history: 'dogwall' }).history;
t('rows say who saved them', get().edits.find(x => x.slug === 'dogwall' && x.author === 'noah').by, 'noah');
t('history keeps replaced versions, newest first', hist.filter(h => h.author === 'zack').map(h => h.text), ['v2', 'notes']);
t('reads are cached and refreshed on write', [(get(), !!cache['edits:' + W]), (post({ key: P, slug: 'b', author: 'zack', text: 'z' }), !!cache['edits:' + W])], [true, false]);

// GM-only fields
post({ key: GM, slug: 'pennyfoot', author: '@meta', text: JSON.stringify({ title: 'Pennyfoot', hidden: true }) });
post({ key: P, slug: 'pennyfoot', author: '@meta', text: JSON.stringify({ title: 'Pennyfoot the Onion Man', hidden: false, deleted: true }) });
const pm = JSON.parse(main.rows.find(r => r[1] === 'pennyfoot')[3]);
t('player detail edit keeps GM’s hide, can’t delete', [pm.title, pm.hidden, 'deleted' in pm], ['Pennyfoot the Onion Man', true, false]);

t('one backup a day', copies.length, 1);
t('player can’t clear', post({ key: P, action: 'clear' }).error, 'That needs the GM passkey');
t('upload', post({ key: P, action: 'upload', mime: 'image/png', name: 'x.png', data: Buffer.from('png').toString('base64') }).ok, true);
t('non-image upload refused', post({ key: P, action: 'upload', mime: 'text/html', data: 'eA==' }).error, 'Images only');

// passkeys
t('player can’t change passkeys', post({ key: P, action: 'setkeys', keyHash: sha('a'), gmHash: sha('b') }).error, 'That needs the GM passkey');
t('GM sets this campaign’s own passkeys', post({ key: GM, action: 'setkeys', scope: 'world', keyHash: sha('np'), gmHash: sha('ng') }).ok, true);
t('stored salted, not plain', JSON.parse(props['KEYS:' + W]).gm === sha('ng'), false);
t('old passkey refused here', post({ key: P, action: 'version' }).error, 'Wrong passkey');
t('new passkeys work', [post({ key: 'np', action: 'version' }).gm, post({ key: 'ng', action: 'version' }).gm], [false, true]);
t('other campaigns keep the default passkeys', ctx.doPost({ postData: { contents: JSON.stringify({ world: 'other', key: P, action: 'version' }) } }).ok, true);
const before = main.rows.length;
t('GM clear keeps settings, moves the rest to History', [post({ key: 'ng', action: 'clear' }).ok, get().edits.map(x => x.author)], [true, ['@world']]);
t('cleared rows are in History', history.rows.filter(r => r[6] === 'cleared').length, before - 2);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
