// Renders the 1024 x 1024 App Store icon (opaque, no rounded corners: Apple rounds it) from favicon.svg.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const svg = readFileSync(new URL('../../../src/building/fools-gold/favicon.svg', import.meta.url), 'utf8');
const out = process.argv[2] || 'tools/fools-gold/store/icon-1024.png';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
await p.setContent(`<body style="margin:0;background:#0c0d0f;display:grid;place-items:center;height:1024px"><div style="width:1024px;height:1024px">${svg.replace('<svg', '<svg width="1024" height="1024"').replace(/(<rect[^>]*?) rx="[^"]*"/, '$1')}</div></body>`);
await p.screenshot({ path: out, omitBackground: false }); await b.close(); console.log('wrote', out);
