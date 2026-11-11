// Builds brand-sheet.pdf (A4) from the SVGs in this folder. Usage: node make-sheet.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const dir = dirname(fileURLToPath(import.meta.url));
const svg = f => readFileSync(join(dir, f), 'utf8').replace(/<svg /, '<svg style="display:block;width:100%;height:auto" ');
const sw = (name, hex, fg = '#fff') => `<div class="sw" style="background:${hex};color:${fg}"><b>${name}</b><span>${hex}</span></div>`;
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,800&family=Inter:wght@400;600&display=swap">
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font: 400 10.5pt/1.45 Inter, system-ui, sans-serif; color: #16181a; background: #fff; }
.pg { width: 210mm; height: 297mm; padding: 18mm; display: grid; grid-template-rows: auto auto 1fr auto; gap: 8mm; page-break-after: always; }
h1 { font: 800 30pt/1 Fraunces, Georgia, serif; margin: 0; letter-spacing: -.02em; }
h2 { font: 800 15pt/1.1 Fraunces, Georgia, serif; margin: 0 0 3mm; }
.k { font: 600 8pt Inter; letter-spacing: .14em; text-transform: uppercase; color: #5d636a; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
.card { border-radius: 4mm; padding: 8mm; display: grid; place-items: center; }
.dark { background: #0c0d0f; } .light { background: #f1f2f0; border: .3mm solid #d9dcd8; }
.icon { width: 74mm; justify-self: center; } .icon svg { border-radius: 22.5%; }
.sizes { display: flex; align-items: flex-end; gap: 6mm; }
.sw { height: 22mm; border-radius: 2mm; padding: 3mm; display: flex; flex-direction: column; justify-content: flex-end; font-size: 8pt; }
.sw b { font-weight: 600; } .sw span { opacity: .85; font-variant-numeric: tabular-nums; }
.pal { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin-bottom: 4mm; }
.foot { font-size: 8pt; color: #5d636a; }
p { margin: 0 0 2mm; }
</style>
<div class="pg">
  <div><div class="k">Fool's Gold</div><h1>Identity sheet</h1></div>
  <p>A struck coin. The letter G carries one vertical stroke, the same stroke that crosses the coin letters in the app (<b>&#8354;</b> style) and marks the range on the main screen.</p>
  <div>
    <div class="row">
      <div class="card dark"><div class="icon">${svg('icon.svg')}</div></div>
      <div style="display:grid;gap:6mm;align-content:start">
        <div class="card dark" style="padding:10mm 6mm">${svg('wordmark-on-dark.svg')}</div>
        <div class="card light" style="padding:10mm 6mm">${svg('wordmark-on-light.svg')}</div>
        <div><h2>Icon at size</h2><div class="sizes"><div style="width:30mm">${svg('icon.svg')}</div><div style="width:18mm">${svg('icon.svg')}</div><div style="width:10mm">${svg('icon.svg')}</div></div></div>
      </div>
    </div>
  </div>
  <div class="foot">Letters are outlined from Fraunces (SIL Open Font License). Keep clear space of one coin-rim width around the icon. Do not stretch, recolour the coin or move the stroke.</div>
</div>
<div class="pg" style="grid-template-rows:auto auto auto 1fr auto">
  <div><div class="k">Fool's Gold</div><h1>Palette</h1></div>
  <div><h2>Night</h2><div class="pal">${sw('Ink', '#0c0d0f')}${sw('Slab', '#15171a')}${sw('Line', '#262a2e')}${sw('Bone', '#ecebe6', '#16181a')}${sw('Brass', '#d2b04a', '#0c0d0f')}${sw('Glint', '#f4e3a0', '#0c0d0f')}${sw('Brass deep', '#8a6e22')}${sw('Muted', '#8b9096')}</div></div>
  <div><h2>Day</h2><div class="pal">${sw('Mist', '#f1f2f0', '#16181a')}${sw('Paper', '#ffffff', '#16181a')}${sw('Line', '#d9dcd8', '#16181a')}${sw('Graphite', '#16181a')}${sw('Brass', '#8a6a0f')}${sw('Brass deep', '#6a510b')}${sw('Brass tint', '#f0e9d0', '#16181a')}${sw('Muted', '#5d636a')}</div></div>
  <div><h2>Type</h2><p style="font:800 30pt/1.1 Fraunces,Georgia,serif;letter-spacing:-.02em">Fraunces, for the name and the price.</p><p>Interface text uses the system face (SF Pro on iPhone). Figures use lining numerals.</p></div>
  <div class="foot">Fool's Gold is a game tool by Firebird Games. It is a language parsing calculator, uses no AI, and works offline.</div>
</div>`;
writeFileSync(join(dir, 'brand-sheet.html'), html);
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('file://' + join(dir, 'brand-sheet.html'), { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.pdf({ path: join(dir, 'brand-sheet.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
await b.close();
console.log('wrote brand-sheet.pdf');
