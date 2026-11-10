// Economy tab: the real site in Chromium with the real save service behind it.
// node tests/economy.test.js
const http = require('http'), fs = require('fs'), path = require('path');
const { createSaveService } = require('./fake-save-service');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const SRC = path.join(__dirname, '../src'), EP = 'https://save.test/exec', PLAYER = 'player-key', GM = 'gm-key';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SRC, p);
  if (!f.startsWith(SRC) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
let failed = 0;
const t = (name, ok, detail = '') => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail); };
async function open(browser, svc) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
  await ctx.route('**/duat/vcm/world.json', async r => { const res = await r.fetch(); const j = await res.json(); j.edit = { endpoint: EP }; await r.fulfill({ response: res, json: j }); });
  await ctx.route(EP + '**', async r => {
    const url = new URL(r.request().url());
    const out = r.request().method() === 'POST' ? svc.post(JSON.parse(r.request().postData())) : svc.get(Object.fromEntries(url.searchParams));
    r.fulfill({ status: 200, contentType: 'application/json', json: out });
  });
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message)); page.on('dialog', d => d.accept());
  return { ctx, page };
}
const base = () => `http://localhost:${server.address().port}/duat/vcm/`;
async function signIn(page, who, key) {
  await page.click('.who-btn'); await page.selectOption('dialog select[name=author]', who);
  await page.fill('dialog input[name=key]', key); await page.click('dialog .primary'); await page.waitForTimeout(250);
}
const adj = (page, id, amt, op) => page.evaluate(([id, amt, op]) => { const f = document.querySelector(`.ec-adj[data-acct="${id}"]`); f.amt.value = amt; f.querySelector(`[data-do=${op}]`).click(); }, [id, amt, op]);
const bal = (page, name) => page.evaluate(n => { const a = [...document.querySelectorAll('.ec-tile, .ec-row')].find(e => e.textContent.includes(n)); return a.querySelector('.ec-bal, .ec-rbal').textContent.replace(/\s+/g, ' ').trim(); }, name);

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const svc = createSaveService({ player: PLAYER, gm: GM });
  { const { ctx, page } = await open(browser, svc);
    await page.goto(base()); await page.waitForSelector('.card');
    t('Economy chip is there for everyone', !!(await page.$('.typenav a[data-nav=economy]')));
    await page.goto(base() + '#/economy'); await page.waitForSelector('.ec-tile');
    t('signed-out visitors can look', (await page.$$('.ec-tile')).length === 5);
    // editing asks for the normal sign-in, then carries on with what was asked
    await adj(page, 'rosie-cash', '5g 3s', 'add');
    await page.waitForSelector('dialog select[name=author]');
    t('editing asks a visitor to sign in', true);
    await page.selectOption('dialog select[name=author]', 'thomas'); await page.fill('dialog input[name=key]', PLAYER); await page.click('dialog .primary');
    await page.waitForTimeout(500);
    t('a player (not the GM) can edit, and the pending change goes through', (await bal(page, 'Rosie')) === '80 0', await bal(page, 'Rosie'));
    t('five cash tiles come first, named without the word cash', (await page.$$eval('.ec-tile .ec-name', e => e.map(x => x.textContent))).join() === 'Cassandra,Finnean,Rosie,Sprynger,Felt');
    t('Sprynger and Felt are TBE', (await page.$$eval('.ec-tile.is-tbe .ec-bal', e => e.map(x => x.textContent))).join() === 'TBE,TBE');
    t('Cassandra is 0 G 4 S', (await bal(page, 'Cassandra')) === '0 4');
    t('non-cash balances read gold silver / (copper)', (await page.$eval('.ec-row[data-id=rbh-killers-index] .ec-rbal', e => e.textContent.replace(/\s+/g, ' ').trim())) === '4,000 0 / (400,000)');
    t('copper value is greyed', await page.$eval('.ec-row[data-id=rbh-killers-index] .ec-cu', e => getComputedStyle(e).color !== getComputedStyle(e.parentElement).color));
    t('coin glyphs are drawn', (await page.$$('.cg use')).length > 10);
    t('Finnean debt is 210,000 G', (await page.$eval('.ec-row[data-id=finnean-debt] .ec-rbal', e => e.textContent)).includes('210,000'));
    await adj(page, 'rosie-cash', '2g', 'sub');
    t('subtracting works', (await bal(page, 'Rosie')) === '78 0');
    await adj(page, 'felt-cash', '3g 5s', 'set'); await page.waitForTimeout(150);
    t('a TBE balance can be set', (await bal(page, 'Felt')) === '3 5');
    await adj(page, 'rosie-cash', 'banana', 'add');
    t('junk amounts are refused', (await bal(page, 'Rosie')) === '78 0');
    // transfer
    await adj(page, 'rosie-cash', '10g', 'xfer');
    await page.selectOption('.ec-xfer select', 'cassandra-cash'); await page.click('[data-do=xsend]'); await page.waitForTimeout(200);
    t('transfer moves money between balances', (await bal(page, 'Rosie')) === '68 0' && (await bal(page, 'Cassandra')) === '10 4', `${await bal(page, 'Rosie')} / ${await bal(page, 'Cassandra')}`);
    await page.click('[data-do=undo]'); await page.waitForTimeout(150);
    t('undo reverses both halves of a transfer', (await bal(page, 'Rosie')) === '78 0' && (await bal(page, 'Cassandra')) === '0 4');
    await adj(page, 'rosie-cash', '1g', 'xfer'); await page.selectOption('.ec-xfer select', 'finnean-debt'); await page.click('[data-do=xsend]'); await page.waitForTimeout(200);
    t('sending to a debt pays it down', (await page.$eval('.ec-row[data-id=finnean-debt] .ec-rbal', e => e.textContent)).includes('209,999'));
    await page.click('.ec-row[data-id=rbh-killers-index] summary');
    await page.click('.ec-row[data-id=rbh-killers-index] [data-do=roll]');
    await page.waitForSelector('.ec-roll b');
    await page.click('[data-do=apply]'); await page.waitForTimeout(250);
    t('a rolled formula applies to its account', /index growth/i.test(await page.evaluate(() => document.querySelector('.ec-log').textContent)));
    await page.click('[data-do=settings]'); await page.waitForSelector('.ec-set-form');
    await page.click('[data-s=add-f]');
    await page.fill('.ec-fedit >> nth=-1 >> [name=expr]', 'balance * (');
    await page.click('.ec-set-form .primary');
    t('a bad formula is caught on save', await page.$eval('.ed-err', e => !e.hidden));
    await page.fill('.ec-fedit >> nth=-1 >> [name=expr]', '2d6 * periods');
    await page.click('.ec-fedit >> nth=-1 >> [data-s=test]');
    t('test roll shows dice', /2d6=/.test(await page.locator('.ec-fedit >> nth=-1 >> .ec-test').textContent()));
    await page.click('.ec-set-form .primary'); await page.waitForTimeout(300);
    t('settings save and close', await page.evaluate(() => !document.querySelector('dialog[open]')));
    t('no page errors', page.errors.length === 0, page.errors.join('|'));
    await page.goto(base() + '#/economy'); await page.reload(); await page.waitForSelector('.ec-tile', { timeout: 8000 });
    t('balances persist across a reload', (await bal(page, 'Rosie')) === '77 0' && (await bal(page, 'Felt')) === '3 5', `${await bal(page, 'Rosie')} ${await bal(page, 'Felt')}`);
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
})();
