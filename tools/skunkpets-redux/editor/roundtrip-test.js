// Checks the editor's short markup against every Winkipedia page in the .twee:
// converting to the short form and back must give the page back unchanged,
// and saving a page unchanged must leave the .twee byte-for-byte the same.
//   node tools/skunkpets-redux/editor/roundtrip-test.js
const fs = require('fs');
const path = require('path');
const { toFriendly, fromFriendly, replacePassage } = require('./editor.js');
const twee = fs.readFileSync(path.join(__dirname, '..', 'skunkpets-redux.twee'), 'utf8');
const headers = [...twee.matchAll(/^::(?!:)(.*)$/gm)];
let checked = 0, links = 0, photos = 0, failed = 0;
headers.forEach((h, i) => {
  const header = h[1].trim();
  if (!/\[[^\]]*\bwiki\b[^\]]*\]/.test(header)) return;
  const name = header.replace(/\s*(\[.*)?$/, '').replace(/\\(.)/g, '$1');
  const end = i + 1 < headers.length ? headers[i + 1].index : twee.length;
  const body = twee.slice(h.index + h[0].length + 1, end).replace(/\n+$/, '').replace(/^\\::/gm, '::');
  const friendly = toFriendly(body);
  links += (friendly.match(/\[\[(?!photo:)/g) || []).length;
  photos += (friendly.match(/\[\[photo:/g) || []).length;
  const back = fromFriendly(friendly);
  const same = replacePassage(twee, name, body).twee === twee;
  checked++;
  if (back !== body || !same) { failed++; console.log('FAIL', name, back !== body ? '(markup round trip)' : '(twee rewrite)'); }
});
console.log(`${checked} pages, ${links} links, ${photos} photos: ${failed ? failed + ' failed' : 'all round-trip exactly'}`);
process.exit(failed ? 1 : 0);
