// One-time: decompile the published Harlowe HTML into an editable Twee 3 file.
//   node extract.js <published.html> <out.twee>
const fs = require('fs');
const [, , htmlPath, tweePath] = process.argv;
const html = fs.readFileSync(htmlPath, 'utf8');
const un = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const attrs = s => { const a = {}; s.replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => a[k] = un(v)); return a; };
const esc = s => s.replace(/([\\\[\]{}])/g, '\\$1');

const sd = attrs(html.match(/<tw-storydata ([^>]*)>/)[1]);
const passages = [];
html.replace(/<tw-passagedata ([^>]*)>([\s\S]*?)<\/tw-passagedata>/g, (_, a, body) => passages.push({ ...attrs(a), body: un(body) }));
const start = passages.find(p => p.pid === sd.startnode).name;
const css = un(html.match(/<style role="stylesheet"[^>]*>([\s\S]*?)<\/style>/)[1]);
const js = un(html.match(/<script role="script"[^>]*>([\s\S]*?)<\/script>/)[1]);

let out = `:: StoryTitle\n${sd.name}\n\n`;
out += `:: StoryData\n${JSON.stringify({ ifid: sd.ifid, format: sd.format, 'format-version': sd['format-version'], start, zoom: +sd.zoom || 1 }, null, 2)}\n\n`;
out += `:: StoryStylesheet [stylesheet]\n${css.trim()}\n\n`;
out += `:: StoryScript [script]\n${js.trim()}\n\n`;
for (const p of passages) {
  const tags = p.tags ? ` [${p.tags}]` : '';
  const body = p.body.replace(/^::/gm, '\\::');
  out += `:: ${esc(p.name)}${tags} {"position":"${p.position}","size":"${p.size}"}\n${body}\n\n`;
}
fs.writeFileSync(tweePath, out);
console.log(`wrote ${passages.length} passages, start = ${start}`);
