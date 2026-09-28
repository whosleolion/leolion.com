// Compile skunkpets-redux.twee back into the published HTML.
// Only the <tw-storydata> block is replaced; the Harlowe engine already in the
// HTML is left untouched, so no Tweego install is needed.
//   node tools/skunkpets-redux/build.js              -> src/building/skunkpets-redux/index.html
//   node tools/skunkpets-redux/build.js other.html   -> patches a different copy (e.g. the tinypetgames one)
// The deploy workflow runs this before uploading, so pushing an edited .twee is enough.
const fs = require('fs');
const path = require('path');
const tweePath = path.join(__dirname, 'skunkpets-redux.twee');
const target = process.argv[2] || path.join(__dirname, '..', '..', 'src', 'building', 'skunkpets-redux', 'index.html');

const twee = fs.readFileSync(tweePath, 'utf8').replace(/\r\n/g, '\n');
const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const unTwee = s => s.replace(/\\(.)/g, '$1');

// Split on passage headers: ":: Name [tags] {meta}"
const chunks = twee.split(/^::(?!:)/m).slice(1);
const passages = chunks.map(chunk => {
  const nl = chunk.indexOf('\n');
  const header = chunk.slice(0, nl).trim();
  const body = chunk.slice(nl + 1).replace(/\n+$/, '').replace(/^\\::/gm, '::');
  const m = header.match(/^((?:\\.|[^\[{\\])+?)\s*(?:\[((?:\\.|[^\]\\])*)\])?\s*(\{.*\})?$/);
  if (!m) throw new Error('Bad passage header: ' + header);
  return {
    name: unTwee(m[1].trim()),
    tags: m[2] ? unTwee(m[2]).trim().split(/\s+/).filter(Boolean) : [],
    meta: m[3] ? JSON.parse(m[3]) : {},
    body,
  };
});

const byName = n => passages.find(p => p.name === n);
const data = JSON.parse(byName('StoryData').body);
const title = byName('StoryTitle').body.trim();
// url("inline:file.png") in the stylesheet embeds that file (from this
// folder) as a data: URI, so small custom art ships inside the page with
// nothing extra to upload.
const mimeTypes = { '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
const css = passages.filter(p => p.tags.includes('stylesheet')).map(p => p.body).join('\n')
  .replace(/url\("inline:([^"]+)"\)/g, (_, file) => {
    const data = fs.readFileSync(path.join(__dirname, file)).toString('base64');
    return `url("data:${mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream'};base64,${data}")`;
  });
const js = passages.filter(p => p.tags.includes('script')).map(p => p.body).join('\n');
const story = passages.filter(p => !['StoryTitle', 'StoryData'].includes(p.name) && !p.tags.includes('stylesheet') && !p.tags.includes('script'));

// Generated passage: Winkipedia's search index. One hidden link per
// encyclopedia article (passages tagged "article"), so each can be found by
// its exact name. Regenerated on every build so it never goes stale.
const existingIndex = story.findIndex(p => p.name === 'WinkiIndex');
if (existingIndex >= 0) story.splice(existingIndex, 1); // e.g. after re-running extract.js
const searchable = story.filter(p => p.tags.includes('article'));
for (const p of searchable) {
  if (p.name.includes('"')) throw new Error('Searchable page names cannot contain double quotes: ' + p.name);
}
story.push({
  name: 'WinkiIndex',
  tags: [],
  meta: {},
  body: searchable.map(p => `(link-repeat: "${p.name}")[(set: $navPending to "${p.name}")(display: "func-navigate")]`).join(''),
});

const seen = new Set();
for (const p of story) {
  if (seen.has(p.name)) throw new Error('Duplicate passage: ' + p.name);
  seen.add(p.name);
}
const startPid = story.findIndex(p => p.name === data.start) + 1;
if (!startPid) throw new Error('Start passage not found: ' + data.start);

let block = `<tw-storydata name="${escHtml(title)}" startnode="${startPid}" creator="skunkpets-redux build.js" creator-version="1" ifid="${data.ifid}" zoom="${data.zoom || 1}" format="${data.format}" format-version="${data['format-version']}" options="" hidden>`;
block += `<style role="stylesheet" id="twine-user-stylesheet" type="text/twine-css">${css}</style>`;
block += `<script role="script" id="twine-user-script" type="text/twine-javascript">${js}</script>`;
story.forEach((p, i) => {
  block += `<tw-passagedata pid="${i + 1}" name="${escHtml(p.name)}" tags="${escHtml(p.tags.join(' '))}" position="${p.meta.position || '100,100'}" size="${p.meta.size || '100,100'}">${escHtml(p.body)}</tw-passagedata>`;
});
block += `</tw-storydata>`;

const html = fs.readFileSync(target, 'utf8');
const re = /<tw-storydata[\s\S]*?<\/tw-storydata>/;
if (!re.test(html)) throw new Error('No <tw-storydata> in ' + target);
fs.writeFileSync(target, html.replace(re, () => block));
console.log(`built ${story.length} passages (start: ${data.start}) -> ${target}`);
