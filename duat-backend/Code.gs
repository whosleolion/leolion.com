/**
 * Duat shared-edits service (Google Apps Script web app).
 *
 * Stores each author's notes per entry in a Google Sheet it creates on first use,
 * and serves them to the Duat page. Setup steps: see DUAT.md, "Shared editing".
 *
 * The passkey itself is never stored here, only its SHA-256 hash (same hash as
 * world.json "edit.keyHash"). To change the passkey, update both hashes.
 */
const KEY_HASH = '183059fb170ae10f1e90f6f1893223ba7874398c4f3f88315825e99ff8ade9d9';
const AUTHORS = ['leo', 'thomas', 'neha', 'zack', 'noah', 'nuh'];
const MAX_TEXT = 40000;

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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function doGet(e) {
  const world = String((e && e.parameter.world) || '');
  const rows = sheet_().getDataRange().getValues().slice(1).filter(r => r[0] === world);
  return json_({ ok: true, edits: rows.map(r => ({ slug: r[1], author: r[2], text: r[3], updated: r[4] })) });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  if (hash_(String(req.key || '')) !== KEY_HASH) return json_({ ok: false, error: 'Wrong passkey' });
  if (AUTHORS.indexOf(req.author) === -1) return json_({ ok: false, error: 'Unknown author' });
  if (!/^[a-z0-9][a-z0-9\/-]*$/.test(String(req.world || '')) || !/^[a-z0-9][a-z0-9\/-]*$/.test(String(req.slug || ''))) {
    return json_({ ok: false, error: 'Bad entry' });
  }
  const text = String(req.text || '').slice(0, MAX_TEXT);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const vals = sh.getDataRange().getValues();
    const i = vals.findIndex((r, k) => k > 0 && r[0] === req.world && r[1] === req.slug && r[2] === req.author);
    const row = [req.world, req.slug, req.author, text, new Date().toISOString()];
    if (i > 0) sh.getRange(i + 1, 1, 1, 5).setValues([row]);
    else sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}
