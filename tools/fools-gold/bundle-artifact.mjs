// Build a single-file page (fragment) from src/building/fools-gold for publishing as an Artifact.
// Usage: node bundle-artifact.mjs <esbuild-bin> <out.html>
// Needs esbuild only for this step; the site itself has no build step.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../src/building/fools-gold');
const [esbuild, out] = process.argv.slice(2);
const tmp = mkdtempSync(join(tmpdir(), 'fg-'));
const js = join(tmp, 'app.js');
// the site versions its imports (?v=HASH) for cache busting; the single file does not need them
mkdirSync(join(tmp, 'src'));
for (const f of readdirSync(join(root, 'js')).filter(f => f.endsWith('.js'))) writeFileSync(join(tmp, 'src', f), readFileSync(join(root, 'js', f), 'utf8').replace(/\?v=[0-9a-f]{8}'/g, "'"));
execFileSync(esbuild, [join(tmp, 'src/app.js'), '--bundle', '--minify', '--format=iife', '--target=es2020', '--outfile=' + js], { stdio: 'inherit' });
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'css/style.css'), 'utf8');
const body = html.split('<!--FG-BODY-START-->')[1].split('<!--FG-BODY-END-->')[0];
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap">';
const page = `<title>Fool's Gold</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>
${css}
</style>
${body}
<script>
${readFileSync(js, 'utf8').replace(/<\/script/gi, '<\\/script')}
</script>
`;
writeFileSync(out, page);
console.log('wrote', out, (page.length / 1024).toFixed(0) + ' KB');
