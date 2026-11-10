// Cache buster for Fool's Gold. Run after any change to the app: node tools/fools-gold/stamp.mjs
//   --check   exit 1 if the stamp is out of date (the test suite runs this)
// A short hash of every app file is written into: each relative import (./x.js?v=HASH), the stylesheet and
// script URLs and a <meta name="fg-build"> in index.html, and version.json. A saved home-screen copy compares
// its own meta tag with a fresh version.json at launch and when it comes back to the foreground, and reloads
// itself when they differ.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../src/building/fools-gold');
const check = process.argv.includes('--check');
const jsFiles = readdirSync(join(root, 'js')).filter(f => f.endsWith('.js')).sort().map(f => 'js/' + f);
const files = ['index.html', 'css/style.css', ...jsFiles];

const strip = t => t.replace(/\?v=[0-9a-f]{8}/g, '').replace(/(<meta name="fg-build" content=")[0-9a-f]{0,8}"/, '$1"');
const withMeta = t => (/<meta name="fg-build"/.test(t) ? t : t.replace('<meta name="robots"', '<meta name="fg-build" content="">\n<meta name="robots"'));
const norm = (f, t) => (f === 'index.html' ? strip(withMeta(t)) : strip(t));
const hash = createHash('sha1');
for (const f of files) { hash.update(f + '\n'); hash.update(norm(f, readFileSync(join(root, f), 'utf8'))); }
const H = hash.digest('hex').slice(0, 8);

function stamped(f, text) {
  if (f === 'index.html') {
    let t = norm(f, text);
    t = t.replace(/(href="css\/style\.css)"/, `$1?v=${H}"`).replace(/(src="js\/app\.js)"/, `$1?v=${H}"`);
    return t.replace(/(<meta name="fg-build" content=")"/, `$1${H}"`);
  }
  if (f.endsWith('.js')) return strip(text).replace(/(from\s+'\.\/[\w-]+\.js)'/g, `$1?v=${H}'`);
  return text;
}

let stale = 0;
for (const f of files) {
  const p = join(root, f), cur = readFileSync(p, 'utf8'), next = stamped(f, cur);
  if (cur !== next) { stale++; if (!check) writeFileSync(p, next); }
}
const ver = JSON.stringify({ v: H }) + '\n';
let curVer = ''; try { curVer = readFileSync(join(root, 'version.json'), 'utf8'); } catch (e) { /* first run */ }
if (curVer !== ver) { stale++; if (!check) writeFileSync(join(root, 'version.json'), ver); }

if (check) { if (stale) { console.error('Stamp is out of date. Run: node tools/fools-gold/stamp.mjs'); process.exit(1); } console.log('stamp ok', H); }
else console.log(stale ? 'stamped ' + H + ' (' + stale + ' files changed)' : 'already stamped ' + H);
