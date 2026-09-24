// Loads duat-backend/Code.gs with small stand-ins for the Apps Script services (sheets, cache,
// properties, Drive), so tests can run the real save service without Google.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function createSaveService({ player = 'player-key', gm = 'gm-key' } = {}) {
  function makeSheet() {
    const rows = [];
    return {
      rows,
      getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
      appendRow: r => rows.push(r.slice()),
      getLastRow: () => rows.length,
      getRange: (i, c, n, m) => ({
        setValues: v => { v.forEach((r, k) => { rows[i - 1 + k] = r.slice(); }); },
        clearContent: () => { rows.splice(i - 1, n || 1); },
        setNumberFormat() {},
      }),
    };
  }
  const main = makeSheet(), history = makeSheet();
  const props = {}, cache = {}, files = [], copies = [];
  const book = { getSheets: () => [main], getSheetByName: n => (n === 'History' && history.rows.length ? history : null),
    insertSheet: () => history, getId: () => 'S1' };
  const folder = { getId: () => 'F1', createFile: bl => { files.push(bl); return { setSharing() {}, getId: () => 'FILE' + files.length }; },
    getFiles: () => { let i = 0; return { hasNext: () => i < copies.length, next: () => copies[i++] }; } };
  const ctx = {
    SpreadsheetApp: { create: () => book, openById: () => book },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, getAll: ks => Object.fromEntries(ks.map(k => [k, cache[k]])),
      putAll: o => Object.assign(cache, o), remove: k => { delete cache[k]; } }) },
    Utilities: { computeDigest: (a, s) => [...crypto.createHash('sha256').update(s, 'utf8').digest()].map(b => b > 127 ? b - 256 : b), DigestAlgorithm: {}, Charset: {},
      base64Decode: s => [...Buffer.from(s, 'base64')], newBlob: (b, m, n) => ({ b, m, n }), getUuid: () => crypto.randomUUID() },
    ContentService: { createTextOutput: t => ({ setMimeType: () => JSON.parse(t) }), MimeType: {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: { createFolder: () => folder, getFolderById: () => folder, Access: {}, Permission: {},
      getFileById: () => ({ makeCopy: (name) => { const f = { name, getDateCreated: () => new Date(Date.now() + copies.length), setTrashed() { f.trashed = true; } }; copies.push(f); return f; } }) },
  };


  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../duat-backend/Code.gs'), 'utf8'), ctx);
  props.KEYS = JSON.stringify({ salt: 's1', player: sha('s1' + sha(player)), gm: sha('s1' + sha(gm)) });
  return {
    ctx, props, cache, main, history, copies, files,
    get: params => ctx.doGet({ parameter: params }),
    post: body => ctx.doPost({ postData: { contents: JSON.stringify(body) } }),
  };
}
module.exports = { createSaveService, sha };
