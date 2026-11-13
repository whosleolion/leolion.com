// Self-hosts the display fonts so the app needs no network at all (offline, and nothing leaves the device).
// Downloads the latin subset of each family from Google Fonts (SIL Open Font License) into src/building/fools-gold/fonts/
// and writes css/fonts.css. Run once; commit the result.
import { mkdirSync, writeFileSync } from 'node:fs';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const FAMILIES = [
  'family=Fraunces:opsz,wght@9..144,600;9..144,700',
  'family=IM+Fell+English:ital@0;1',
  'family=Cormorant+Garamond:wght@500;700',
  'family=Courier+Prime:wght@400;700',
  'family=Chakra+Petch:wght@400;600;700',
  'family=JetBrains+Mono:wght@400;600',
];
const dir = new URL('../../src/building/fools-gold/fonts/', import.meta.url);
mkdirSync(dir, { recursive: true });
let css = '/* self-hosted fonts, latin subset, SIL Open Font License 1.1 (see fonts/OFL.txt) */\n';
for (const fam of FAMILIES) {
  const res = await fetch('https://fonts.googleapis.com/css2?' + fam + '&display=swap', { headers: { 'User-Agent': UA } });
  const text = await res.text();
  const blocks = text.split('/* ').slice(1).map(b => '/* ' + b);
  const latin = blocks.filter(b => /^\/\* latin \*\//.test(b));
  for (const b of latin) {
    const url = /url\((https:[^)]+\.woff2)\)/.exec(b)[1];
    const name = url.split('/').slice(-3).join('-').replace(/[^a-z0-9.\-_]/gi, '');
    const bin = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(new URL(name, dir), bin);
    css += b.replace(/^\/\* latin \*\/\n/, '').replace(url, 'fonts/' + name).replace('src: url(fonts/', 'src: url(../fonts/').replace(/\n$/, '') + '\n';
    console.log(name, bin.length);
  }
}
writeFileSync(new URL('../../src/building/fools-gold/css/fonts.css', import.meta.url), css);
writeFileSync(new URL('OFL.txt', dir), 'These fonts are licensed under the SIL Open Font License, Version 1.1 (https://openfontlicense.org). Families: Fraunces, IM Fell English, Cormorant Garamond, Courier Prime, Chakra Petch, JetBrains Mono. Copyright belongs to each family\'s authors as published on Google Fonts.\n');
