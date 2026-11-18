// Two interchangeable stores with one interface:
//   store.state            the whole game tree
//   store.update(updates)  multi-path, all-or-nothing -> {ok, error}
//   store.replace(tree)    overwrite everything (new game, import, reset)
//   store.onChange(fn), store.kind ('local' | 'firebase'), store.status
import { FIREBASE_DB_URL } from '../config.js';
import { applyUpdates, setPath } from './core.js';

class Base {
  constructor() { this.state = {}; this.subs = []; this.status = 'connecting'; }
  onChange(fn) { this.subs.push(fn); }
  emit() { for (const f of this.subs) f(); }
}

// This browser only. Tabs stay in sync through BroadcastChannel.
class LocalStore extends Base {
  constructor(game) {
    super(); this.kind = 'local'; this.status = 'live'; this.loaded = true; this.key = `convoy.db.${game}`;
    this.read();
    this.bc = new BroadcastChannel(this.key);
    this.bc.onmessage = () => { this.read(); this.emit(); };
  }
  read() { try { this.state = JSON.parse(localStorage.getItem(this.key) || '{}'); } catch { this.state = {}; } }
  save() { localStorage.setItem(this.key, JSON.stringify(this.state)); this.bc.postMessage(1); this.emit(); }
  async update(updates) {
    this.read();
    const r = applyUpdates(this.state, updates);
    if (r.ok) { this.state = r.state; this.save(); }
    return r;
  }
  async replace(tree) { this.state = tree || {}; this.save(); return { ok: true }; }
}

// Firebase Realtime Database over plain REST: one streaming connection for reads,
// PATCH for writes. No SDK. Writes show at once and are confirmed by the stream.
class FirebaseStore extends Base {
  constructor(db, game) {
    super(); this.kind = 'firebase'; this.loaded = false;
    this.url = `${db.replace(/\/+$/, '')}/convoy/${game}.json`;
    this.inflight = 0; this.buf = []; this.timer = null;
    this.es = new EventSource(this.url);
    this.es.onopen = () => { this.status = 'live'; this.emit(); };
    this.es.onerror = () => { this.status = 'offline'; this.emit(); };
    const on = (type) => this.es.addEventListener(type, e => {
      const ev = { type, ...JSON.parse(e.data) };
      this.loaded = true;
      // While our own writes are in the air, hold server events so numbers don't flicker.
      if (this.inflight || this.timer) this.buf.push(ev); else { this.apply(ev); this.emit(); }
    });
    on('put'); on('patch');
  }
  apply({ type, path, data }) {
    if (type === 'put') this.state = setPath(this.state, path, data);
    else for (const [k, v] of Object.entries(data || {})) this.state = setPath(this.state, `${path}/${k}`, v);
  }
  settle() {
    if (--this.inflight > 0) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; for (const ev of this.buf.splice(0)) this.apply(ev); this.emit(); }, 150);
  }
  async send(method, body) {
    this.inflight++;
    try {
      const res = await fetch(this.url, { method, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(res.status);
      return { ok: true };
    } catch (e) {
      // Refused (someone got there first) or unreachable: fall back to the server's truth.
      try { this.buf = []; this.state = (await (await fetch(this.url)).json()) || {}; } catch {}
      this.emit();
      return { ok: false, error: navigator.onLine === false ? 'offline' : 'refused' };
    } finally { this.settle(); }
  }
  async update(updates) {
    const r = applyUpdates(this.state, updates);
    if (!r.ok) return r;
    this.state = r.state; this.emit();
    return this.send('PATCH', updates);
  }
  async replace(tree) { this.state = tree || {}; this.emit(); return this.send('PUT', tree || null); }
}

export function openStore(game) {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const db = (local && new URLSearchParams(location.search).get('db')) || FIREBASE_DB_URL;
  return db ? new FirebaseStore(db, game) : new LocalStore(game);
}
