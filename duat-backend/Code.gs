/**
 * Duat shared-edits service (Google Apps Script web app), v4.
 *
 * Keeps every edit made on the site in a Google Sheet it creates on first use, and
 * stores uploaded images in a "Duat uploads" Drive folder. Setup: see DUAT.md, "Shared editing".
 *
 * Rows are (world, slug, author, text, updated, by). author is a person's id for their notes,
 * "@meta" for a page's details (JSON), "@pins" for a map's pin list or a chart's drawing, or
 * "@world" for the campaign's settings (title, people, categories…; GM only). Campaigns started
 * from the site exist only here.
 *
 * Safety (v4):
 * - Writing as the GM (the page's own text) needs the GM passkey.
 * - Saves carry the version they were based on ("base"); if someone saved in between, the save is
 *   refused with the newer text so the site can ask what to do ("force" overrides).
 * - Every replaced or cleared row is kept in a "History" sheet, so any version can be restored.
 * - The first save each day makes a dated copy of the whole spreadsheet in "Duat backups" (last 14 kept).
 *
 * Passkeys: only salted SHA-256 hashes are stored (Script Properties), per campaign when a campaign
 * sets its own. The two constants below are the starting passkeys' plain hashes; change the
 * passkeys from the site (Campaign settings) after deploying and these stop mattering.
 */
const VERSION = 4;
const KEY_HASH = '183059fb170ae10f1e90f6f1893223ba7874398c4f3f88315825e99ff8ade9d9';
const GM_HASH = 'aba3e589d1981ebb6c651bff9f612981c38e43c501ec8fc51627dcc2317154e1';
const AUTHORS = ['leo', 'thomas', 'neha', 'zack', 'noah', 'nuh'];
const GM_AUTHORS = ['leo'];                 // used when a campaign's settings don't name its GM
const SPECIAL = ['@meta', '@pins', '@world'];
const GM_FIELDS = ['hidden', 'deleted', 'mergeInto'];
const PRIVATE_SETTINGS = ['keyHash', 'gmHash'];   // never stored or served
const MAX_TEXT = 40000;
const MAX_UPLOAD = 8 * 1024 * 1024;
const KEEP_BACKUPS = 14;

function book_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create('Duat edits');
  const sh = ss.getSheets()[0];
  sh.getRange('A:F').setNumberFormat('@'); // keep text as text (no formulas)
  sh.appendRow(['world', 'slug', 'author', 'text', 'updated', 'by']);
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}
function sheet_() { return book_().getSheets()[0]; }
function history_() {
  const ss = book_();
  let h = ss.getSheetByName('History');
  if (!h) {
    h = ss.insertSheet('History');
    h.getRange('A:G').setNumberFormat('@');
    h.appendRow(['world', 'slug', 'author', 'text', 'updated', 'replaced', 'by']);
  }
  return h;
}

function folder_(name, key) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(key);
  if (id) return DriveApp.getFolderById(id);
  const f = DriveApp.createFolder(name);
  props.setProperty(key, f.getId());
  return f;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}
const iso_ = v => v instanceof Date ? v.toISOString() : String(v || '');

// the site never needs passkey hashes: strip them from campaign settings
function clean_(author, text) {
  if (author !== '@world') return text;
  try { const st = JSON.parse(text); PRIVATE_SETTINGS.forEach(k => delete st[k]); return JSON.stringify(st); } catch (err) { return text; }
}

const SLUG = /^[a-z0-9][a-z0-9\/-]*$/;

/* ---------- reading (cached per campaign; any write clears it) ---------- */
function cacheKey_(world) { return 'edits:' + world; }
function cachedRows_(world) {
  const cache = CacheService.getScriptCache();
  const meta = cache.get(cacheKey_(world));
  if (meta) {
    const n = +meta, parts = cache.getAll(Array.from({ length: n }, (_, i) => cacheKey_(world) + ':' + i));
    const chunks = Array.from({ length: n }, (_, i) => parts[cacheKey_(world) + ':' + i]);
    if (chunks.every(c => c != null)) { try { return JSON.parse(chunks.join('')); } catch (err) {} }
  }
  const rows = sheet_().getDataRange().getValues().slice(1).filter(r => r[0] === world)
    .map(r => ({ slug: r[1], author: r[2], text: clean_(r[2], r[3]), updated: iso_(r[4]), by: String(r[5] || '') }));
  try {
    const s = JSON.stringify(rows), size = 90000, put = {};
    const n = Math.ceil(s.length / size) || 1;
    for (let i = 0; i < n; i++) put[cacheKey_(world) + ':' + i] = s.slice(i * size, (i + 1) * size);
    put[cacheKey_(world)] = String(n);
    cache.putAll(put, 600);
  } catch (err) {}
  return rows;
}
function uncache_(world) { CacheService.getScriptCache().remove(cacheKey_(world)); }

function doGet(e) {
  const p = (e && e.parameter) || {};
  const world = String(p.world || '');
  if (p.history) {
    // every earlier version of one page (all its rows), newest first
    const slug = String(p.history);
    const rows = history_().getDataRange().getValues().slice(1).filter(r => r[0] === world && r[1] === slug)
      .map(r => ({ slug: r[1], author: r[2], text: clean_(r[2], r[3]), updated: iso_(r[4]), replaced: iso_(r[5]), by: r[6] }))
      .reverse().slice(0, 200);
    return json_({ ok: true, version: VERSION, history: rows });
  }
  return json_({ ok: true, version: VERSION, edits: cachedRows_(world) });
}

/* ---------- passkeys ---------- */
function keys_(world) {
  const props = PropertiesService.getScriptProperties();
  const own = props.getProperty('KEYS:' + world);
  if (own) { try { return JSON.parse(own); } catch (err) {} }
  const glob = props.getProperty('KEYS');
  if (glob) { try { return JSON.parse(glob); } catch (err) {} }
  // older setups: plain hashes (v3) or the starting constants
  return { salt: '', player: props.getProperty('KEY_HASH') || KEY_HASH, gm: props.getProperty('GM_HASH') || GM_HASH };
}
function check_(key, k) {
  const h = hash_(String(key || ''));
  const salted = k.salt ? hash_(k.salt + h) : h;
  return { gm: salted === k.gm, player: salted === k.player || salted === k.gm };
}

// the campaign's settings row (people and their roles), if it has one
function settings_(world) {
  const row = cachedRows_(world).find(r => r.author === '@world');
  if (!row) return null;
  try { return JSON.parse(row.text); } catch (err) { return null; }
}
function authors_(world) {
  const st = settings_(world);
  return AUTHORS.concat(Object.keys((st && st.authors) || {}));
}
function gmAuthors_(world) {
  const st = settings_(world), a = (st && st.authors) || {};
  const ids = Object.keys(a).filter(id => /\bGM\b/i.test(String((a[id] || {}).role || '')));
  if (st && st.gm) ids.push(String(st.gm));
  return ids.length ? ids : GM_AUTHORS;
}

/* ---------- writing ---------- */
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  if (!SLUG.test(String(req.world || ''))) return json_({ ok: false, error: 'Bad world' });
  const who = check_(req.key, keys_(req.world));
  const gm = who.gm;
  if (!who.player) return json_({ ok: false, error: 'Wrong passkey' });
  const action = req.action || 'save';
  if (action === 'version') return json_({ ok: true, version: VERSION, gm: gm, gmAuthors: gmAuthors_(req.world) });
  if (action === 'upload') return upload_(req);
  if (action === 'clear') return clear_(req, gm);
  if (action === 'setkeys') return setkeys_(req, gm);
  if (action !== 'save') return json_({ ok: false, error: 'Unknown action' });

  if (SPECIAL.indexOf(req.author) === -1 && authors_(req.world).indexOf(req.author) === -1) return json_({ ok: false, error: 'Unknown author' });
  if (req.author === '@world' && !gm) return json_({ ok: false, error: 'Campaign settings need the GM passkey' });
  if (!gm && gmAuthors_(req.world).indexOf(req.author) !== -1) return json_({ ok: false, error: 'Writing as the GM needs the GM passkey' });
  if (!SLUG.test(String(req.slug || ''))) return json_({ ok: false, error: 'Bad entry' });
  let text = clean_(req.author, String(req.text || '').slice(0, MAX_TEXT));

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    backup_();
    const sh = sheet_();
    const vals = sh.getDataRange().getValues();
    const i = vals.findIndex((r, k) => k > 0 && r[0] === req.world && r[1] === req.slug && r[2] === req.author);
    // someone saved this since the site loaded it: hand back theirs and let the person choose
    if ('base' in req && !req.force) {
      const now = i > 0 ? iso_(vals[i][4]) : '';
      if (now !== String(req.base || '')) {
        return json_({ ok: false, conflict: true, error: 'Someone else saved this in the meantime',
          current: i > 0 ? { text: clean_(req.author, vals[i][3]), updated: now } : { text: '', updated: '' } });
      }
    }
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
    const stamp = new Date().toISOString(), by = String(req.by || req.author || '').slice(0, 40);
    if (i > 0) {
      history_().appendRow([vals[i][0], vals[i][1], vals[i][2], vals[i][3], iso_(vals[i][4]), stamp, by]);
      sh.getRange(i + 1, 1, 1, 6).setValues([[req.world, req.slug, req.author, text, stamp, by]]);
    } else {
      sh.appendRow([req.world, req.slug, req.author, text, stamp, by]);
    }
    uncache_(req.world);
    return json_({ ok: true, updated: stamp });
  } finally {
    lock.releaseLock();
  }
}

// once a day, before the first write: a dated copy of the whole spreadsheet
function backup_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const today = new Date().toISOString().slice(0, 10);
    if (props.getProperty('LAST_BACKUP') === today) return;
    props.setProperty('LAST_BACKUP', today);
    const dir = folder_('Duat backups', 'BACKUP_FOLDER_ID');
    DriveApp.getFileById(book_().getId()).makeCopy('Duat edits backup ' + today, dir);
    const files = [];
    const it = dir.getFiles();
    while (it.hasNext()) files.push(it.next());
    files.sort((a, b) => b.getDateCreated() - a.getDateCreated()).slice(KEEP_BACKUPS).forEach(f => f.setTrashed(true));
  } catch (err) {}
}

function upload_(req) {
  const mime = String(req.mime || '');
  if (!/^image\/(png|jpeg|webp|gif)$/.test(mime)) return json_({ ok: false, error: 'Images only' });
  const bytes = Utilities.base64Decode(String(req.data || ''));
  if (!bytes.length || bytes.length > MAX_UPLOAD) return json_({ ok: false, error: 'Image too large' });
  const name = (String(req.world) + '-' + String(req.name || 'image')).replace(/[^\w.\-]+/g, '-').slice(0, 120);
  const file = folder_('Duat uploads', 'FOLDER_ID').createFile(Utilities.newBlob(bytes, mime, name));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return json_({ ok: true, url: 'https://lh3.googleusercontent.com/d/' + file.getId() });
}

function clear_(req, gm) {
  if (!gm) return json_({ ok: false, error: 'That needs the GM passkey' });
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    backup_();
    const sh = sheet_(), hist = history_(), stamp = new Date().toISOString();
    const vals = sh.getDataRange().getValues();
    // clears page edits (kept in History); the campaign's settings row stays
    const gone = vals.slice(1).filter(r => r[0] === req.world && r[2] !== '@world');
    const keep = vals.slice(1).filter(r => !(r[0] === req.world && r[2] !== '@world'));
    if (gone.length) {
      hist.getRange(hist.getLastRow() + 1, 1, gone.length, 7).setValues(gone.map(r => [r[0], r[1], r[2], r[3], iso_(r[4]), stamp, 'cleared']));
      sh.getRange(2, 1, vals.length - 1, 6).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, 6).setValues(keep.map(r => [r[0], r[1], r[2], r[3], iso_(r[4]), r[5] || '']));
    }
    uncache_(req.world);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

// new passkeys, stored salted. scope "world" = just this campaign; otherwise the default for all campaigns
function setkeys_(req, gm) {
  if (!gm) return json_({ ok: false, error: 'That needs the GM passkey' });
  const hex = /^[0-9a-f]{64}$/;
  if (!hex.test(String(req.keyHash || '')) || !hex.test(String(req.gmHash || ''))) return json_({ ok: false, error: 'Bad passkey hash' });
  const salt = Utilities.getUuid();
  const k = { salt: salt, player: hash_(salt + req.keyHash), gm: hash_(salt + req.gmHash) };
  PropertiesService.getScriptProperties().setProperty(req.scope === 'world' ? 'KEYS:' + req.world : 'KEYS', JSON.stringify(k));
  return json_({ ok: true });
}
