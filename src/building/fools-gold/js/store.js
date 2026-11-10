// Local-first storage. Every access is guarded: storage can be blocked or empty.
import { WORLD_PRESETS } from './data.js';

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
        for (const w of s.worlds) normalizeWorld(w);
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
export function normalizeWorld(w) {
  w.baseline = w.baseline === 'generic' ? 'generic' : 'srd';
  w.currency ||= { denominations: [{ id: 'gp', name: 'gold piece', plural: 'gold pieces', bu: 100 }, { id: 'sp', name: 'silver piece', plural: 'silver pieces', bu: 10 }, { id: 'cp', name: 'copper piece', plural: 'copper pieces', bu: 1 }], belowSmallest: 'decimals' };
  if (!w.currency.denominations?.length) w.currency.denominations = [{ id: 'cp', name: 'copper piece', plural: 'copper pieces', bu: 1 }];
  w.currency.belowSmallest ||= 'decimals';
  w.anchors ||= { wage: 20 };
  w.economyTags ||= [];
  w.dials = { priceLevel: 1, volatility: 0.5, stacking: 'dampened', sellFraction: 0.5, ...(w.dials || {}) };
  w.defaults ||= { travel: 'travel.coach' };
  w.vocabulary ||= [];
  w.items ||= [];
  w.name ||= 'My world';
  w.id ||= 'w' + Date.now().toString(36);
  return w;
}
