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
let css = passages.filter(p => p.tags.includes('stylesheet')).map(p => p.body).join('\n')
  .replace(/url\("inline:([^"]+)"\)/g, (_, file) => {
    const data = fs.readFileSync(path.join(__dirname, file)).toString('base64');
    return `url("data:${mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream'};base64,${data}")`;
  });
// Photo blocks: <div class="article-art" data-art="file.jpg" ...></div> in any
// passage shows art/file.jpg. Each file used gets a generated CSS rule with the
// image embedded and its aspect ratio, so adding a photo needs no CSS (the
// preview's article editor relies on this).
const artDir = path.join(__dirname, 'art');
const artFiles = new Set();
for (const p of passages) {
  if (p.tags.includes('stylesheet') || p.tags.includes('script')) continue;
  for (const m of p.body.matchAll(/data-art="([^"]+)"/g)) artFiles.add(m[1]);
}
for (const file of [...artFiles].sort()) {
  const full = path.join(artDir, file);
  if (!fs.existsSync(full)) throw new Error('Photo block uses art/' + file + ', which does not exist');
  const bytes = fs.readFileSync(full);
  const [w, h] = imageSize(bytes, file);
  css += `\n.article-art[data-art="${file}"] { aspect-ratio: ${w} / ${h}; background-image: url("data:${mimeTypes[path.extname(file).toLowerCase()]};base64,${bytes.toString('base64')}"); }`;
}

// Width and height of a PNG or JPEG, read from its header.
function imageSize(b, name) {
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  throw new Error('Photo block art/' + name + ' must be a PNG or JPEG');
}
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

// Cache-buster. Neocities sends no Cache-Control header, so browsers keep
// serving an old copy of the page for a while after a deploy. Each build gets
// an id from its content; on load the page re-fetches itself uncached and, if
// the live id differs, jumps to ?v=<live id> (a URL the browser can't have
// cached). It only does this before PLAY, so it never interrupts a game (there
// is no save). It lives in <head>, between the cache-buster comments, and is
// rewritten on every build.
const buildId = require('crypto').createHash('sha256').update(block).digest('hex').slice(0, 12);
const cacheBuster = `<!-- cache-buster -->
<meta name="skunkpets-build" content="${buildId}">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<script>
(function () {
  var mine = "${buildId}";
  function check() {
    fetch(location.pathname + "?nocache=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (html) {
        var m = html.match(/name="skunkpets-build" content="([0-9a-f]+)"/);
        if (!m || m[1] === mine) return;
        if (document.querySelector(".monitor")) return; /* game already started */
        if (new URLSearchParams(location.search).get("v") === m[1]) return; /* no loops */
        location.replace(location.pathname + "?v=" + m[1] + location.hash);
      })
      .catch(function () {});
  }
  check();
  /* Coming back with the Back button can restore a frozen old copy. */
  window.addEventListener("pageshow", function (e) { if (e.persisted) check(); });
})();
</script>
<!-- /cache-buster -->`;

let html = fs.readFileSync(target, 'utf8');
const re = /<tw-storydata[\s\S]*?<\/tw-storydata>/;
if (!re.test(html)) throw new Error('No <tw-storydata> in ' + target);
html = html.replace(re, () => block);
const busterRe = /<!-- cache-buster -->[\s\S]*?<!-- \/cache-buster -->/;
if (busterRe.test(html)) html = html.replace(busterRe, () => cacheBuster);
else if (html.includes('</title>')) html = html.replace('</title>', () => '</title>\n' + cacheBuster);
else throw new Error('No </title> to put the cache-buster after in ' + target);
fs.writeFileSync(target, html);
console.log(`built ${story.length} passages (start: ${data.start}, build ${buildId}) -> ${target}`);
