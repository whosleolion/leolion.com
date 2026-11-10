// Local-first storage. Every access is guarded: storage can be blocked or empty.
import { WORLD_PRESETS } from './data.js';
import { compileWorld } from './world.js';

const KEY = 'foolsgold.v1';
let mem = null;

function defaults() {
  const worlds = [WORLD_PRESETS.vcm(), WORLD_PRESETS.srd(), WORLD_PRESETS.titanium()];
  return { v: 1, worlds, activeId: 'vcm', history: [], theme: null };
}
export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* blocked */ }
  if (raw) {
    try {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.worlds) && s.worlds.length) {
        s.history = Array.isArray(s.history) ? s.history : [];
        if (!s.worlds.some(w => w.id === s.activeId)) s.activeId = s.worlds[0].id;
        s.worlds = s.worlds.filter(w => { try { normalizeWorld(w); compileWorld(w); return true; } catch (e) { return false; } });
        if (!s.worlds.length) return mem || (mem = defaults());
        if (!s.worlds.some(w => w.id === s.activeId)) s.activeId = s.worlds[0].id;
        s.history = s.history.filter(h => h && typeof h.text === 'string' && s.worlds.some(w => w.id === h.world));
        return s;
      }
    } catch (e) { /* corrupt, fall through */ }
  }
  return mem || (mem = defaults());
}
export function save(state) {
  mem = state;
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
}
const num = (v, d, lo = -Infinity, hi = Infinity) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const str = (v, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v));
const GSC = [{ id: 'gp', name: 'gold piece', plural: 'gold pieces', bu: 100 }, { id: 'sp', name: 'silver piece', plural: 'silver pieces', bu: 10 }, { id: 'cp', name: 'copper piece', plural: 'copper pieces', bu: 1 }];
const KINDS = ['good', 'service', 'labor', 'lodging', 'travel', 'spell', 'property'];
let seq = 0;
export const newItemId = () => 'user.i' + Date.now().toString(36) + (seq++).toString(36);

// Clean any world object, from storage or an import, into one the engine can always compile.
export function normalizeWorld(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) throw new Error('not a world');
  w.baseline = w.baseline === 'generic' ? 'generic' : 'srd';
  const cur = w.currency && typeof w.currency === 'object' ? w.currency : {};
  let dens = (Array.isArray(cur.denominations) ? cur.denominations : []).filter(d => d && typeof d === 'object')
    .map(d => ({ id: str(d.id).trim() || 'coin', name: str(d.name).trim() || str(d.id).trim() || 'coin', plural: str(d.plural).trim(), bu: num(d.bu, NaN) }))
    .filter(d => d.bu > 0).slice(0, 12);
  if (!dens.length) dens = GSC.map(d => ({ ...d }));
  for (const d of dens) if (!d.plural) d.plural = /s$/.test(d.name) ? d.name : d.name + 's';
  w.currency = { denominations: dens, belowSmallest: cur.belowSmallest === 'round' ? 'round' : 'decimals', note: str(cur.note) };
  w.anchors = { wage: num(w.anchors && w.anchors.wage, 20, 0.01, 1e9) };
  w.economyTags = (Array.isArray(w.economyTags) ? w.economyTags : []).filter(t => typeof t === 'string');
  const d = w.dials && typeof w.dials === 'object' ? w.dials : {};
  w.dials = { priceLevel: num(d.priceLevel, 1, 0.1, 10), volatility: num(d.volatility, 0.5, 0, 1), stacking: d.stacking === 'strict' ? 'strict' : 'dampened', sellFraction: num(d.sellFraction, 0.5, 0.1, 1) };
  w.defaults = { travel: str(w.defaults && w.defaults.travel, 'travel.coach') };
  w.vocabulary = (Array.isArray(w.vocabulary) ? w.vocabulary : []).filter(v => v && typeof v === 'object').map(v => ({ term: str(v.term), means: str(v.means) })).slice(0, 200);
  w.items = (Array.isArray(w.items) ? w.items : []).filter(it => it && typeof it === 'object').map(it => ({
    id: str(it.id) || newItemId(), name: str(it.name).trim() || 'New item', kind: KINDS.includes(it.kind) ? it.kind : 'good', unit: ['each', 'day', 'lb'].includes(it.unit) ? it.unit : 'each',
    bu: num(it.bu, NaN), tags: (Array.isArray(it.tags) ? it.tags : []).filter(t => typeof t === 'string'),
  })).filter(it => it.bu > 0).slice(0, 500);
  w.name = str(w.name).trim().slice(0, 80) || 'My world';
  w.blurb = typeof w.blurb === 'string' ? w.blurb.slice(0, 200) : undefined;
  w.id = str(w.id).replace(/[^\w-]/g, '').slice(0, 40) || 'w' + Date.now().toString(36);
  return w;
}
