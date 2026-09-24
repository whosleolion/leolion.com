/**
 * Duat shared-edits service (Google Apps Script web app), v2.
 *
 * Keeps every edit made on the site in a Google Sheet it creates on first use, and
 * stores uploaded images in a "Duat uploads" Drive folder. Setup: see DUAT.md, "Shared editing".
 *
 * Rows are (world, slug, author, text, updated). author is a person's id for their notes,
 * "@meta" for a page's details (JSON), or "@pins" for a map's pin list.
 *
 * Only SHA-256 hashes of the passkeys live here (same as world.json edit.keyHash / edit.gmHash).
 * The GM passkey unlocks hiding, deleting and merging pages, and clearing the sheet.
 */
const KEY_HASH = '183059fb170ae10f1e90f6f1893223ba7874398c4f3f88315825e99ff8ade9d9';
const GM_HASH = 'aba3e589d1981ebb6c651bff9f612981c38e43c501ec8fc51627dcc2317154e1';
const AUTHORS = ['leo', 'thomas', 'neha', 'zack', 'noah', 'nuh'];
const SPECIAL = ['@meta', '@pins'];
const GM_FIELDS = ['hidden', 'deleted', 'mergeInto'];
const MAX_TEXT = 40000;
const MAX_UPLOAD = 8 * 1024 * 1024;

function sheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id).getSheets()[0];
  const ss = SpreadsheetApp.create('Duat edits');
  const sh = ss.getSheets()[0];
  sh.getRange('A:E').setNumberFormat('@'); // keep text as text (no formulas)
  sh.appendRow(['world', 'slug', 'author', 'text', 'updated']);
  props.setProperty('SHEET_ID', ss.getId());
  return sh;
}

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  const f = DriveApp.createFolder('Duat uploads');
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

const SLUG = /^[a-z0-9][a-z0-9\/-]*$/;

function doGet(e) {
  const world = String((e && e.parameter.world) || '');
  const rows = sheet_().getDataRange().getValues().slice(1).filter(r => r[0] === world);
  return json_({ ok: true, edits: rows.map(r => ({ slug: r[1], author: r[2], text: r[3], updated: r[4] })) });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  const h = hash_(String(req.key || ''));
  const gm = h === GM_HASH;
  if (!gm && h !== KEY_HASH) return json_({ ok: false, error: 'Wrong passkey' });
  if (!SLUG.test(String(req.world || ''))) return json_({ ok: false, error: 'Bad world' });
  const action = req.action || 'save';
  if (action === 'upload') return upload_(req);
  if (action === 'clear') return clear_(req, gm);
  if (action !== 'save') return json_({ ok: false, error: 'Unknown action' });

  if (AUTHORS.indexOf(req.author) === -1 && SPECIAL.indexOf(req.author) === -1) return json_({ ok: false, error: 'Unknown author' });
  if (!SLUG.test(String(req.slug || ''))) return json_({ ok: false, error: 'Bad entry' });
  let text = String(req.text || '').slice(0, MAX_TEXT);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const vals = sh.getDataRange().getValues();
    const i = vals.findIndex((r, k) => k > 0 && r[0] === req.world && r[1] === req.slug && r[2] === req.author);
    if (req.author === '@meta') {
      let meta;
      try { meta = JSON.parse(text); } catch (err) { return json_({ ok: false, error: 'Bad page details' }); }
      if (!gm) {
        // only the GM may hide, delete or merge; everyone else keeps whatever the GM set
        const prev = i > 0 ? (function () { try { return JSON.parse(vals[i][3]); } catch (x) { return {}; } })() : {};
        GM_FIELDS.forEach(k => { if (k in prev) meta[k] = prev[k]; else delete meta[k]; });
        text = JSON.stringify(meta);
      }
    }
    const row = [req.world, req.slug, req.author, text, new Date().toISOString()];
    if (i > 0) sh.getRange(i + 1, 1, 1, 5).setValues([row]);
    else sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

function upload_(req) {
  const mime = String(req.mime || '');
  if (!/^image\/(png|jpeg|webp|gif)$/.test(mime)) return json_({ ok: false, error: 'Images only' });
  const bytes = Utilities.base64Decode(String(req.data || ''));
  if (!bytes.length || bytes.length > MAX_UPLOAD) return json_({ ok: false, error: 'Image too large' });
  const name = (String(req.world) + '-' + String(req.name || 'image')).replace(/[^\w.\-]+/g, '-').slice(0, 120);
  const file = folder_().createFile(Utilities.newBlob(bytes, mime, name));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return json_({ ok: true, url: 'https://lh3.googleusercontent.com/d/' + file.getId() });
}

function clear_(req, gm) {
  if (!gm) return json_({ ok: false, error: 'That needs the GM passkey' });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const vals = sh.getDataRange().getValues();
    for (let r = vals.length - 1; r >= 1; r--) if (vals[r][0] === req.world) sh.deleteRow(r + 1);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}
