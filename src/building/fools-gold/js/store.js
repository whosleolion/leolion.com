import { normalizeCart } from './cart.js?v=5b4e6fc0';
// Local-first storage. Every access is guarded: storage can be blocked or empty.
import { WORLD_PRESETS } from './data.js?v=5b4e6fc0';
import { compileWorld } from './world.js?v=5b4e6fc0';

const KEY = 'foolsgold.v1';
let mem = null;

function defaults() {
  const worlds = [WORLD_PRESETS.srd()];
  worlds.forEach(normalizeWorld);
  return { v: 3, worlds, activeId: 'srd', history: [], theme: null, carts: {} };
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
        // v2: rounding below the smallest coin is the default, coin letters get glyphs, worlds renamed, Standard Fantasy opens first
        if (!(s.v >= 2)) {
          s.v = 2;
          const glyphOf = { gp: 'G', sp: 'S', cp: 'C' };
          for (const w of s.worlds) {
            if (w.currency) {
              w.currency.belowSmallest = 'round';
              for (const d of w.currency.denominations || []) if (d && d.glyph === undefined && glyphOf[d.id]) d.glyph = glyphOf[d.id];
            }
            if (w.id === 'vcm' && w.name === 'Vista City Mondays') { w.name = 'Industrial Fantasy'; w.blurb = 'Rail, factories and arcane streetlights.'; }
            if (w.id === 'srd' && w.name === 'Standard fantasy (SRD)') w.name = 'Standard Fantasy';
          }
          if (s.worlds.some(w => w.id === 'srd')) s.activeId = 'srd';
        }
        // v3: one preloaded world. Industrial Fantasy, Modern day and the rest are presets to create, not worlds to carry
        if (!(s.v >= 3)) {
          s.v = 3;
          if (s.worlds.some(w => w.id === 'srd')) { s.worlds = s.worlds.filter(w => w.id === 'srd'); s.activeId = 'srd'; }
        }
        // the old Titanium Frontier sample world was replaced by the modern world
        s.worlds = s.worlds.map(w => (w.id === 'titanium' && w.name === 'Titanium Frontier' ? WORLD_PRESETS.modern() : w));
        s.worlds = s.worlds.filter(w => { try { normalizeWorld(w); compileWorld(w); return true; } catch (e) { return false; } });
        if (!s.worlds.length) return mem || (mem = defaults());
        if (!s.worlds.some(w => w.id === s.activeId)) s.activeId = s.worlds[0].id;
        s.history = s.history.filter(h => h && typeof h.text === 'string' && s.worlds.some(w => w.id === h.world));
        const carts = {};
        for (const w of s.worlds) if (s.carts && s.carts[w.id]) carts[w.id] = normalizeCart(s.carts[w.id]);
        s.carts = carts;
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
const GSC = [{ id: 'gp', name: 'gold piece', plural: 'gold pieces', bu: 100, glyph: 'G' }, { id: 'sp', name: 'silver piece', plural: 'silver pieces', bu: 10, glyph: 'S' }, { id: 'cp', name: 'copper piece', plural: 'copper pieces', bu: 1, glyph: 'C' }];
const KINDS = ['good', 'service', 'labor', 'lodging', 'travel', 'spell', 'property'];
let seq = 0;
export const newItemId = () => 'user.i' + Date.now().toString(36) + (seq++).toString(36);

// Clean any world object, from storage or an import, into one the engine can always compile.
export function normalizeWorld(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) throw new Error('not a world');
  const legacy = w.baseline === 'generic' ? ['fantasy'] : w.baseline === 'modern' ? ['modern'] : ['srd', 'fantasy'];
  let lists = (Array.isArray(w.lists) ? w.lists : legacy).filter((x, i, a) => ['srd', 'fantasy', 'modern', 'scifi'].includes(x) && a.indexOf(x) === i);
  if (!lists.length) lists = ['fantasy'];
  w.lists = lists;
  w.baseline = lists.includes('modern') && !lists.includes('fantasy') && !lists.includes('srd') ? 'modern' : lists.includes('srd') ? 'srd' : 'generic';
  const cur = w.currency && typeof w.currency === 'object' ? w.currency : {};
  let dens = (Array.isArray(cur.denominations) ? cur.denominations : []).filter(d => d && typeof d === 'object')
    .map(d => ({ id: str(d.id).trim() || 'coin', name: str(d.name).trim() || str(d.id).trim() || 'coin', plural: str(d.plural).trim(), bu: num(d.bu, NaN), glyph: /^[A-Z]$/.test(str(d.glyph)) ? str(d.glyph) : '' }))
    .filter(d => d.bu > 0).slice(0, 12);
  if (!dens.length) dens = GSC.map(d => ({ ...d }));
  for (const d of dens) if (!d.plural) d.plural = /s$/.test(d.name) ? d.name : d.name + 's';
  w.currency = { denominations: dens, belowSmallest: cur.belowSmallest === 'decimals' ? 'decimals' : 'round', note: str(cur.note) };
  if (typeof cur.symbol === 'string' && cur.symbol && num(cur.decimal, 0) > 0) { w.currency.symbol = cur.symbol.slice(0, 3); w.currency.decimal = num(cur.decimal, 100, 0.01, 1e9); }
  w.anchors = { wage: num(w.anchors && w.anchors.wage, 20, 0.01, 1e9) };
  w.economyTags = (Array.isArray(w.economyTags) ? w.economyTags : []).filter(t => typeof t === 'string');
  const d = w.dials && typeof w.dials === 'object' ? w.dials : {};
  w.dials = { priceLevel: num(d.priceLevel, 1, 0.1, 10), volatility: num(d.volatility, 0.5, 0, 1), stacking: d.stacking === 'strict' ? 'strict' : 'dampened', sellFraction: num(d.sellFraction, 0.5, 0.1, 1), round: !!d.round };
  w.defaults = { travel: str(w.defaults && w.defaults.travel, 'travel.coach'), rent: str(w.defaults && w.defaults.rent, 'lodging.m-apartment-rent-medium') };
  const ovs = {};
  if (w.overrides && typeof w.overrides === 'object' && !Array.isArray(w.overrides)) for (const [k, v] of Object.entries(w.overrides)) { if (typeof k === 'string' && k.length < 60 && Array.isArray(v) && v.length === 2) { const a = num(v[0], NaN), b = num(v[1], NaN); if (a > 0 && b >= a && b <= 1000) ovs[k] = [a, b]; } }
  w.overrides = ovs;
  const bo = {};
  if (w.baseOverrides && typeof w.baseOverrides === 'object' && !Array.isArray(w.baseOverrides)) for (const [k, v] of Object.entries(w.baseOverrides)) { const n = num(v, NaN); if (typeof k === 'string' && k.length < 80 && n > 0 && isFinite(n)) bo[k] = n; }
  w.baseOverrides = bo;
  w.samples = (Array.isArray(w.samples) ? w.samples : []).filter(x => typeof x === 'string').slice(0, 8);
  w.vocabulary = (Array.isArray(w.vocabulary) ? w.vocabulary : []).filter(v => v && typeof v === 'object').map(v => ({ term: str(v.term), means: str(v.means) })).slice(0, 200);
  w.items = (Array.isArray(w.items) ? w.items : []).filter(it => it && typeof it === 'object').map(it => ({
    id: str(it.id) || newItemId(), name: str(it.name).trim() || 'New item', kind: KINDS.includes(it.kind) ? it.kind : 'good', unit: ['each', 'day', 'lb', 'week', 'month', 'year'].includes(it.unit) ? it.unit : 'each',
    bu: num(it.bu, NaN), tags: (Array.isArray(it.tags) ? it.tags : []).filter(t => typeof t === 'string'),
    aliases: (Array.isArray(it.aliases) ? it.aliases : []).filter(t => typeof t === 'string').slice(0, 10), spread: num(it.spread, 0.15, 0, 3),
    fixed: !!it.fixed, noTier: !!it.noTier, placeScale: num(it.placeScale, 0, 0, 5), group: typeof it.group === 'string' ? it.group.slice(0, 30) : undefined,
  })).filter(it => it.bu > 0).slice(0, 500);
  w.name = str(w.name).trim().slice(0, 80) || 'My world';
  w.blurb = typeof w.blurb === 'string' ? w.blurb.slice(0, 200) : undefined;
  w.id = str(w.id).replace(/[^\w-]/g, '').slice(0, 40) || 'w' + Date.now().toString(36);
  return w;
}
