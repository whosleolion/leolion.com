// End-to-end tests: the real site (src/) in Chromium, with the real save service code
// (duat-backend/Code.gs, run by fake-save-service.js) answering at a pretend URL.
// node tests/site.test.js
const http = require('http'), fs = require('fs'), path = require('path');
const { createSaveService } = require('./fake-save-service');
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); }
catch { ({ chromium, devices } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }

const SRC = path.join(__dirname, '../src'), EP = 'https://save.test/exec', PLAYER = 'player-key', GM = 'gm-key';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SRC, p);
  if (!f.startsWith(SRC) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

let failed = 0;
const t = (name, ok, detail = '') => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail); };

async function open(browser, { svc, delay = 0, hang = false, device = { viewport: { width: 1280, height: 900 } } } = {}) {
  const ctx = await browser.newContext({ ...device, serviceWorkers: 'block' });
  await ctx.route('**/duat/vcm/world.json', async r => { try { const res = await r.fetch(); const j = await res.json(); j.edit = { endpoint: EP }; j.homeRecent = true; await r.fulfill({ response: res, json: j }); } catch {} });
  await ctx.route(EP + '**', async r => {
    if (hang) return;                                     // never answers
    if (delay) await new Promise(res => setTimeout(res, delay));
    const url = new URL(r.request().url());
    const out = r.request().method() === 'POST' ? svc.post(JSON.parse(r.request().postData())) : svc.get(Object.fromEntries(url.searchParams));
    r.fulfill({ status: 200, contentType: 'application/json', json: out });
  });
  const page = await ctx.newPage(); page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('dialog', d => d.accept());
  return { ctx, page };
}
const base = () => `http://localhost:${server.address().port}/duat/vcm/`;
async function signIn(page, who, key) {
  await page.click('.who-btn'); await page.selectOption('dialog select[name=author]', who);
  await page.fill('dialog input[name=key]', key); await page.click('dialog .primary'); await page.waitForTimeout(200);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const svc = createSaveService({ player: PLAYER, gm: GM });
  const W = 'vista-city-mondays';
  const world = JSON.parse(fs.readFileSync(path.join(SRC, 'duat/vcm/world.json')));
  const wid = (world.id || world.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  svc.post({ world: wid, key: PLAYER, slug: 'olf', author: 'thomas', text: 'Olf owes Finnean a sandwich.' });

  // ---- loading ----
  { const { ctx, page } = await open(browser, { svc });
    const t0 = Date.now(); await page.goto(base()); await page.waitForSelector('.card');
    t('loads with shared edits', Date.now() - t0 < 5000);
    await page.goto(base() + '#/e/olf'); await page.waitForSelector('.entry');
    t('shared notes are shown', (await page.textContent('.entry')).includes('sandwich'));
    t('no sync warning when all is well', await page.$eval('.sync-chip', e => e.hidden));
    // every page renders
    const bad = [];
    for (const slug of world.entries) {
      await page.goto(base() + '#/e/' + slug);
      if (!(await page.waitForSelector('.entry, .map-stage.is-ready, .chart-stage.is-ready', { timeout: 8000 }).catch(() => null))) bad.push(slug);
    }
    t(`all ${world.entries.length} pages render`, !bad.length && !page.errors.length, bad.join(', ') + page.errors.join('; '));
    await ctx.close(); }

  { const { ctx, page } = await open(browser, { svc, delay: 4500 });
    const t0 = Date.now(); await page.goto(base() + '#/e/olf'); await page.waitForSelector('.entry');
    t('slow save service: page shows within 3.5 s', Date.now() - t0 < 3500, `${Date.now() - t0} ms`);
    t('…with a "loading shared edits" chip', (await page.textContent('.sync-chip')).includes('Loading shared edits'));
    await page.waitForFunction(() => document.querySelector('.entry').textContent.includes('sandwich'), null, { timeout: 8000 }).catch(() => {});
    t('…and the shared edits appear when they land', (await page.textContent('.entry')).includes('sandwich'));
    t('…chip goes away', await page.$eval('.sync-chip', e => e.hidden));
    await ctx.close(); }

  { const { ctx, page } = await open(browser, { svc, hang: true });
    const t0 = Date.now(); await page.goto(base()); await page.waitForSelector('.card');
    t('save service down: catalog still opens fast', Date.now() - t0 < 3500);
    await page.waitForFunction(() => /couldn’t load/.test(document.querySelector('.sync-chip').textContent), null, { timeout: 20000 }).catch(() => {});
    t('…says shared edits couldn’t load', (await page.textContent('.sync-chip')).includes('couldn’t load'));
    await page.goto(base() + '#/e/olf'); await page.waitForSelector('.entry'); await page.click('.edit-btn');
    t('…and editing is paused', (await page.textContent('dialog')).includes('Editing is paused'));
    await ctx.close(); }

  // ---- sign-in ----
  { const { ctx, page } = await open(browser, { svc });
    await page.goto(base() + '#/e/olf'); await page.waitForSelector('.entry');
    await signIn(page, 'leo', PLAYER);
    t('player passkey can’t sign in as the GM', (await page.textContent('dialog .ed-err')).includes('needs the GM passkey'));
    await page.fill('dialog input[name=key]', GM); await page.click('dialog .primary'); await page.waitForTimeout(300);
    t('GM passkey signs in as the GM', (await page.textContent('.who-btn')).includes('Leo'));
    await ctx.close(); }

  // ---- conflicts, history, restore ----
  { const { ctx, page } = await open(browser, { svc });
    svc.post({ world: wid, key: PLAYER, slug: 'dogwall', author: 'zack', text: 'Zack v1' });
    await page.goto(base() + '#/e/dogwall'); await page.waitForSelector('.entry');
    await signIn(page, 'zack', PLAYER);
    await page.click('.edit-btn'); await page.waitForSelector('dialog textarea[name=text]');
    if (await page.$('.editor.is-focus')) await page.click('.ed-full-btn');
    // meanwhile, Zack saves from his phone
    const stamp = svc.get({ world: wid }).edits.find(x => x.slug === 'dogwall' && x.author === 'zack').updated;
    svc.post({ world: wid, key: PLAYER, slug: 'dogwall', author: 'zack', text: 'Zack v2 from the phone', base: stamp });
    await page.fill('dialog textarea[name=text]', 'Zack v3 from the laptop');
    await page.click('dialog.editor .primary'); await page.waitForSelector('dialog.conflict[open]');
    t('stale save opens the conflict dialog', (await page.inputValue('dialog.conflict textarea >> nth=0')) === 'Zack v2 from the phone');
    await Promise.all([page.waitForNavigation(), page.click('dialog.conflict [data-cf=mine]')]); await page.waitForSelector('.entry');
    t('"Save mine" saves over it', (await page.textContent('.entry')).includes('v3 from the laptop'));
    await page.click('.edit-btn'); await page.click('[data-tab=history]'); await page.waitForSelector('.hist-list li');
    const versions = await page.$$eval('.hist-list li', li => li.map(x => x.textContent));
    t('history lists the replaced versions', versions.length >= 2 && versions.some(v => v.includes('Zack')));
    await page.$$eval('.hist-list details', d => d.forEach(x => { x.open = true; }));
    const i = await page.$$eval('.hist-list li', li => li.findIndex(x => x.textContent.includes('Zack v2 from the phone')));
    await Promise.all([page.waitForNavigation(), page.click(`.hist-list li >> nth=${i} >> [data-restore]`)]); await page.waitForSelector('.entry');
    t('restoring a version brings it back', (await page.textContent('.entry')).includes('Zack v2 from the phone'));
    await ctx.close(); }

  { const { ctx, page } = await open(browser, { svc });
    await page.goto(base() + '#/e/pennyfoot'); await page.waitForSelector('.entry');
    await signIn(page, 'leo', GM);
    await page.click('.edit-btn'); await page.click('[data-tab=details]'); await page.waitForSelector('[data-del-page]');
    await Promise.all([page.waitForNavigation(), page.click('[data-del-page]')]); await page.waitForSelector('.card');
    await page.goto(base() + '#/e/pennyfoot'); await page.waitForSelector('#main h1');
    t('deleted page is gone', !(await page.$('.entry:not(.entry-ghost)')));
    await page.click('.who-btn'); await page.click('.who-menu [data-gm]'); await page.waitForSelector('[data-undel="pennyfoot"]');
    await Promise.all([page.waitForNavigation(), page.click('[data-undel="pennyfoot"]')]); await page.waitForSelector('.entry');
    t('GM tools restores it', (await page.textContent('h1')).includes('Pennyfoot'));
    t('no script errors', !page.errors.length, page.errors.join('; '));
    await ctx.close(); }

  // ---- at the table: recent changes, new since last visit, sessions, spoilers, needs attention ----
  { const { ctx, page } = await open(browser, { svc });
    await page.goto(base()); await page.waitForSelector('.card');
    const recent = await page.$$eval('.recent-list li', li => li.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    t('home shows recently updated pages', recent.some(r => r.includes('Olf') && r.includes('Thomas')), recent.join(' | '));
    t('first visit marks nothing as new', !(await page.$('.recent-list li.is-new')));
    svc.post({ world: wid, key: PLAYER, slug: 'felt', author: 'noah', text: 'Felt learned to juggle.' });
    await page.evaluate(() => sessionStorage.clear()); await page.reload(); await page.waitForSelector('.card');
    t('a change since the last visit is marked new', (await page.$$eval('.recent-list li.is-new', li => li.map(x => x.textContent))).some(x => x.includes('Felt')));
    await page.goto(base() + '#/e/felt'); await page.waitForSelector('.entry');
    t('page says when and by whom it was updated', /Updated .* by Noah/.test(await page.textContent('.updated')));
    await page.goto(base() + '#/e/session-05'); await page.waitForSelector('.entry');
    const pg = await page.$$eval('.pager a', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    t('sessions link to the previous and next one', pg.some(x => /Previous.*Session 4/.test(x)) && pg.some(x => /Next.*Session 6/.test(x)), pg.join(' | '));
    t('a session lists what it mentions', (await page.$$eval('.related h2', h => h.map(x => x.textContent))).some(x => /In this session/.test(x)));
    await page.goto(base() + '#/recent'); await page.waitForSelector('.recent-all');
    t('all changes page', (await page.$$eval('.recent-all li', li => li.length)) >= 2);
    await page.goto(base() + '#/attention'); await page.waitForSelector('.attention');
    t('needs attention lists empty pages', (await page.textContent('.attention')).includes('Session 7'));
    svc.post({ world: wid, key: PLAYER, slug: 'olf', author: 'thomas', text: 'The ||twist|| is here.' });
    await page.goto(base() + '#/e/olf'); await page.reload(); await page.waitForSelector('.spoiler');
    const hidden = await page.$eval('.spoiler', e => getComputedStyle(e).color);
    await page.click('.spoiler'); await page.waitForTimeout(400); const shown = await page.$eval('.spoiler', e => getComputedStyle(e).color);
    t('spoilers hide until tapped', hidden !== shown && hidden === 'rgba(0, 0, 0, 0)', hidden + ' → ' + shown);
    t('no script errors (at the table)', !page.errors.length, page.errors.join('; '));
    await ctx.close(); }

  // ---- dragging map pins ----
  { const { ctx, page } = await open(browser, { svc });
    await page.goto(base() + '#/e/vista-city'); await page.waitForSelector('.map-stage.is-ready');
    await signIn(page, 'leo', GM); await page.click('[data-act=pins]'); await page.waitForSelector('.pin-editing');
    const label = page.locator('.pin', { hasText: 'Dogwall' }).locator('.pin-label');
    const bb = await label.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2 + 40, bb.y + bb.height / 2 + 30, { steps: 6 }); await page.mouse.move(bb.x + bb.width / 2 + 80, bb.y + bb.height / 2 + 60, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(150);
    t('dragging a pin doesn’t open its form', !(await page.isVisible('.pin-form')));
    const bb2 = await label.boundingBox();
    t('the pin follows the drag', Math.abs(bb2.x - bb.x - 80) < 6 && Math.abs(bb2.y - bb.y - 60) < 6, JSON.stringify([bb2.x - bb.x, bb2.y - bb.y]));
    await label.click(); t('tapping a pin still opens its form', await page.isVisible('.pin-form'));
    await page.click('.map-card .mc-close');
    await Promise.all([page.waitForNavigation(), page.click('[data-pinbar=save]')]); await page.waitForSelector('.map-stage.is-ready');
    const row = svc.get({ world: wid }).edits.find(x => x.slug === 'vista-city' && x.author === '@pins');
    t('saved with the new spot', row && !/^66\.3, 70\.3 \| \[\[Dogwall\]\]/m.test(row.text) && /\[\[Dogwall\]\]/.test(row.text), row && row.text.split('\n').find(l => /Dogwall/.test(l)));
    await ctx.close(); }

  // ---- polish: typo help, chart keyboard ----
  { const { ctx, page } = await open(browser, { svc });
    await page.goto(base()); await page.waitForSelector('.card');
    await page.fill('.search input', 'Koldovitch'); await page.waitForTimeout(150);
    t('search typo suggests the right page', (await page.textContent('.search-results')).includes('Alamir Koldovich'));
    await page.goto(base() + '#/e/connections-map'); await page.waitForSelector('.chart-stage.is-ready');
    t('chart boxes can be reached by keyboard', (await page.$$eval('.ch-node[tabindex="0"]', n => n.length)) >= 20);
    await page.focus('.ch-node[tabindex="0"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    t('Enter opens a chart box', await page.isVisible('.map-card .mc-body'));
    await ctx.close(); }

  // ---- folding site edits into files ----
  { const { ctx, page } = await open(browser, { svc });
    await page.goto(base()); await page.waitForSelector('.card');
    const data = await page.evaluate(() => window.Duat.export());
    const os = require('os'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'duat-fold-'));
    fs.cpSync(path.join(SRC, 'duat/vcm'), tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, 'export.json'), JSON.stringify(data));
    require('child_process').execFileSync('python3', [path.join(__dirname, '../duat-backend/apply_export.py'), path.join(tmp, 'export.json'), tmp]);
    const olf = fs.readFileSync(path.join(tmp, 'entries/olf.md'), 'utf8');
    t('fold-back writes site notes into the files', olf.includes('::: thomas') && olf.includes('twist'), olf.slice(-200));
    fs.rmSync(tmp, { recursive: true });
    await ctx.close(); }

  { const c2 = await browser.newContext({ serviceWorkers: 'block' }); const p2 = await c2.newPage();
    await c2.route(EP + '**', r => r.fulfill({ json: svc.get({ world: wid }) }));
    await p2.goto(base()); await p2.waitForSelector('.card');
    t('world.json "homeRecent": false hides the home strip', !(await p2.$('.recent')));
    await c2.close(); }
  t('settings rows never carry passkey hashes', !svc.get({ world: wid }).edits.some(x => /keyHash|gmHash/.test(x.text)));
  await browser.close(); server.close();
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
