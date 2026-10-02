// Render pose contact-sheet rows (8 frames per move) via posesheet.html; stack them into
// JPEG sheets with stack-sheets.py.
//   (python3 -m http.server 8791 from the repo root) &
//   node posesheets.mjs http://localhost:8791/tools/intermachinas/posesheet.html <rowsDir> [row,row...]
import { chromium } from 'playwright';
const [, , URL, OUT] = process.argv;
export const ROWS = [
  'idle', 'run', 'sprint', 'stalk', 'jump', 'land', 'roll', 'climb', 'leap', 'hang', 'wallrun', 'vault', 'mantle', 'slide',
  'dodge', 'dodgeback', 'stance', 'L1', 'L2', 'L3', 'H', 'LAUNCH', 'COUNTER', 'ASSASSIN', 'AIR', 'EXECUTE',
  'guard:march', 'guard:CLUB', 'sentry:THROW', 'bodyguard:CLUB',
];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1600, height: 380 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
const only = process.argv[4] ? process.argv[4].split(',') : null;
for (const row of ROWS) {
  const [look, move] = row.includes(':') ? row.split(':') : ['player', row];
  if (only && !only.includes(row)) continue;
  const yaw = move === 'wallrun' ? 0.6 : ['climb', 'leap', 'hang'].includes(move) ? Math.PI + 0.5 : Math.PI / 2;
  await p.goto(`${URL}?move=${move}&look=${look}&n=8&yaw=${yaw}&label=${encodeURIComponent(row)}`);
  await p.waitForFunction(() => document.title === 'done', null, { timeout: 120000 });
  await p.screenshot({ path: `${OUT}/${row.replace(':', '-')}.png` });
  console.log('row', row);
}
await b.close();
