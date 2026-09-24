#!/usr/bin/env node
/* Fold a campaign's site edits back into its files, with no terminal work for the GM.

     node duat-backend/fold-back.js vcm

   Opens the campaign in headless Chromium (so the site's own code layers the shared edits over
   the files, exactly as players see them), takes the export, and applies it with apply_export.py.
   The "Fold site edits into files" GitHub Action runs this and opens a pull request. */
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(execFileSync('npm', ['root', '-g']).toString().trim() + '/playwright')); }

const campaign = process.argv[2] || 'vcm';
const SRC = path.join(__dirname, '../src'), dir = path.join(SRC, 'duat', campaign);
if (!fs.existsSync(path.join(dir, 'world.json'))) { console.error(`No campaign at src/duat/${campaign}`); process.exit(1); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SRC, p);
  if (!f.startsWith(SRC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://localhost:${server.address().port}/duat/${campaign}/`);
  await page.waitForFunction(() => window.Duat && !['booting', 'loading'].includes(window.Duat.ready()), null, { timeout: 60000 });
  const state = await page.evaluate(() => window.Duat.ready());
  if (state !== 'ok') throw new Error(`the shared edits didn't load (${state}); nothing was changed`);
  const data = await page.evaluate(() => window.Duat.export());
  await browser.close(); server.close();
  const n = Object.keys(data.entries).length;
  console.log(`${n} changed page(s), ${data.deleted.length} deleted, settings: ${data.settings ? 'yes' : 'no'}`);
  const out = path.join(require('os').tmpdir(), `duat-export-${campaign}.json`);
  fs.writeFileSync(out, JSON.stringify(data, null, 2));
  execFileSync('python3', [path.join(__dirname, 'apply_export.py'), out, dir], { stdio: 'inherit' });
})().catch(e => { console.error(e.message || e); process.exit(1); });
