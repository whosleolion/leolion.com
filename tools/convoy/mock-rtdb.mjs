// Stand-in for Firebase Realtime Database's REST + streaming API, for tests and for
// trying multi-device play on one machine. Also serves src/ so the page and the
// database share an origin:
//   node tools/convoy/mock-rtdb.mjs            -> http://localhost:9000/building/convoy/?db=http://localhost:9000
// Enforces the same two rules as firebase-rules.json (via core.js applyUpdates).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyUpdates } from '../../src/building/convoy/js/core.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const games = {}, streams = {};
const cast = (g, type, data) => { for (const res of streams[g] || []) res.write(`event: ${type}\ndata: ${JSON.stringify({ path: '/', data })}\n\n`); };

export function start(port = 9000) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const m = url.pathname.match(/^\/convoy\/([a-z0-9-]+)\.json$/);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,PATCH,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.end();
    if (!m) {
      let f = path.join(SRC, decodeURIComponent(url.pathname));
      if (!f.startsWith(SRC)) { res.statusCode = 403; return res.end(); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
      return res.end(fs.readFileSync(f));
    }
    const g = m[1];
    if (req.method === 'GET' && (req.headers.accept || '').includes('text/event-stream')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write(`event: put\ndata: ${JSON.stringify({ path: '/', data: games[g] ?? null })}\n\n`);
      (streams[g] ||= new Set()).add(res);
      req.on('close', () => streams[g].delete(res));
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') return res.end(JSON.stringify(games[g] ?? null));
    let body = ''; for await (const c of req) body += c;
    const data = JSON.parse(body || 'null');
    if (req.method === 'PUT') { games[g] = data; cast(g, 'put', data); return res.end(body); }
    if (req.method === 'PATCH') {
      const r = applyUpdates(games[g] || {}, data);
      if (!r.ok) { res.statusCode = 401; return res.end('{"error":"Permission denied"}'); }
      games[g] = r.state; cast(g, 'patch', r.resolved);
      return res.end(JSON.stringify(r.resolved));
    }
    res.statusCode = 405; res.end();
  });
  return new Promise(ok => server.listen(port, () => ok(server)));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const port = Number(process.argv[2]) || 9000; await start(port); console.log(`http://localhost:${port}/building/convoy/?db=http://localhost:${port}`); }
