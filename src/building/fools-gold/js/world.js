// Compile a world definition into a working context: catalog, lexicon, helpers.
import { listOf } from './lists.js?v=37879f67';
import {
  CATALOG, MODIFIERS, FAMILIES, ECONOMY_TAGS, ACTION_TERMS, RARITY_TERMS, AURA_TERMS, TIER_TERMS, UNIT_TERMS, COUNT_TERMS, slug,
} from './data.js?v=37879f67';

export function stem(w) {
  w = w.toLowerCase();
  if (w.length <= 3 || /^\d/.test(w)) return w;
  if (/(ss|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y';
  if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

const TOKEN_RE = /[#@][a-z0-9_-]+|\+\d+\b|(?<![\w.])-\d[\d,]*(?:\.\d+)?|\d+(?:,\d{3})*(?:\.\d+)?(?:st|nd|rd|th)\b|\d+(?:,\d{3})*(?:\.\d+)?x\b|x\d+\b|\d+(?:,\d{3})*(?:\.\d+)?|[a-z]+(?:['’-][a-z]+)*|[–—-]|[,;.!?]/gi;

// Tokenize into word / number / dash tokens with source offsets.
export function tokenize(text) {
  const out = [];
  // length-preserving clean-up so token offsets still point into the original text
  const s = String(text).replace(/[“”]/g, '"').replace(/×/g, 'x').replace(/[\u00C0-\u024F]/g, ch => (ch.normalize('NFD')[0] || ch));
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(s))) {
    const raw = m[0], start = m.index, end = start + raw.length, low = raw.toLowerCase();
    if (/^[,;.!?]$/.test(raw)) continue;
    if (/^\+\d+$/.test(raw)) { out.push({ raw, stem: raw, type: 'word', ench: true, start, end }); continue; }
    if (/^-\d/.test(raw)) { const v = -parseFloat(raw.slice(1).replace(/,/g, '')); out.push({ raw, stem: String(v), type: 'num', value: v, start, end }); continue; }
    if (/^[–—-]$/.test(raw)) { out.push({ raw, stem: '-', type: 'dash', start, end }); continue; }
    if (/^[#@]/.test(low)) {
      const inner = low.slice(1).split(/[-_]/).filter(Boolean);
      inner.forEach(w => out.push({ raw: w, stem: stem(w), type: 'word', start, end, tag: true }));
      continue;
    }
    if (/^x\d+$/.test(low)) { out.push({ raw, stem: low.slice(1), type: 'num', value: +low.slice(1), mult: true, start, end }); continue; }
    if (/^\d[\d,.]*x$/.test(low)) { const v = parseFloat(low.slice(0, -1).replace(/,/g, '')); out.push({ raw, stem: String(v), type: 'num', value: v, mult: true, start, end }); continue; }
    if (/^\d[\d,.]*(st|nd|rd|th)$/.test(low)) { out.push({ raw, stem: low.replace(/,/g, ''), type: 'word', start, end }); continue; }
    if (/^\d/.test(low)) { const v = parseFloat(low.replace(/,/g, '')); out.push({ raw, stem: String(v), type: 'num', value: v, start, end }); continue; }
    const parts = low.replace(/[’']/g, "'").split(/-/).filter(Boolean);
    parts.forEach(w => out.push({ raw: w, stem: stem(w.replace(/'s$/, '').replace(/'/g, '')), type: 'word', start, end }));
  }
  // a hyphen glued between a word and something else is part of the phrase (3-day, 3rd-level), not a range
  return out.filter((t, i) => !(t.type === 'dash' && out[i - 1] && out[i + 1] && out[i - 1].end === t.start && out[i + 1].start === t.end && !(out[i - 1].type === 'num' && out[i + 1].type === 'num')));
}

const norm = s => tokenize(s).filter(t => t.type !== 'dash').map(t => t.stem);

export function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Item lists can be combined: SRD named items, the fantasy basics (travel, hired help, spells, property, magic, generic categories) and the modern day pack.
export function worldLists(world) {
  const ok = (world.lists || []).filter(x => ['srd', 'fantasy', 'modern', 'scifi'].includes(x));
  if (ok.length) return ok;
  return world.baseline === 'modern' ? ['modern'] : world.baseline === 'generic' ? ['fantasy'] : ['srd', 'fantasy'];
}

export function compileWorld(world) {
  const lists = worldLists(world);
  const base = lists.includes('modern') && !lists.includes('fantasy') && !lists.includes('srd') && !lists.includes('scifi') ? 'modern' : 'other';
  const entries = CATALOG.filter(e => e.src === 'modern' ? lists.includes('modern') : e.src === 'scifi' ? lists.includes('scifi') : (e.src === 'srd' && !e.generic) ? lists.includes('srd') : lists.includes('fantasy')).filter(e => world.underworld || !(e.tags || []).includes('underworld')).map(e => ({ ...e }));
  // a dollar world counts cents, while the fantasy and sci-fi lists count roughly one coin to the dollar:
  // lift those entries by 100 so a 5 sp blanket reads as about $5, not 50 cents
  const cur = world.currency || {};
  if (cur.symbol === '$' && cur.decimal === 100) for (const e of entries) {
    if (e.src === 'modern' || e.src === 'user') continue;
    if (e.bu) e.bu *= 100; if (e.perMile) e.perMile *= 100;
    if (e.curve) e.scale = (e.scale || 1) * 100;
  }
  // the modern list is written in cents; every world that does not count cents counts roughly one unit to the dollar
  else for (const e of entries) {
    if (e.src !== 'modern') continue;
    if (e.bu) e.bu = Math.max(1, Math.round(e.bu / 100)); if (e.perMile) e.perMile = Math.max(0.01, e.perMile / 100);
    if (e.curve) e.scale = (e.scale || 1) / 100;
  }
  const byId = new Map(entries.map(e => [e.id, e]));
  // user items
  for (const it of world.items || []) {
    const e = {
      id: it.id || 'user.' + slug(it.name), name: it.name, kind: it.kind || 'good', src: 'user', unit: it.unit || 'each', bu: it.bu,
      tags: it.tags || [], aliases: it.aliases || [], spread: it.spread ?? 0.15, basis: 'Added by you.', fixed: !!it.fixed, noTier: !!it.noTier, placeScale: it.placeScale || 0, group: it.group,
    };
    // replace same-name catalog entries so user numbers win, keeping their words and tags
    for (const old of entries.filter(x => slug(x.name) === slug(e.name))) {
      byId.delete(old.id);
      if (!(it.tags || []).length) e.tags = [...(old.tags || [])];
      e.aliases = [...new Set([...(old.aliases || []), ...e.aliases])];
      if (old.group) e.group = old.group;
      if (old.noTier && it.noTier === undefined) e.noTier = true;
      if (old.placeScale && !it.placeScale) e.placeScale = old.placeScale;
    }
    byId.set(e.id, e);
  }
  const list = [...byId.values()];
  for (const e of list) { e.tags ||= []; e.aliases ||= []; }
  // the modern world talks about cities and towns, not trading outposts
  const MODERN_LABELS = { capital: 'major city', town: 'mid-size town', village: 'small town or rural', outpost: 'remote small town', remote: 'very remote area' };
  const modList = MODIFIERS.map(m => (base === 'modern' && MODERN_LABELS[m.id] ? { ...m, label: MODERN_LABELS[m.id] } : m));
  const mods = new Map(modList.map(m => [m.id, m]));
  const econ = new Map(ECONOMY_TAGS.map(t => [t.id, t]));

  // lexicon
  const phrases = [];
  const add = (term, type, id, prio, extra = {}) => {
    const words = norm(term);
    if (!words.length) return;
    phrases.push({ words, key: words.join(' '), type, id, prio, display: term, ...extra });
  };
  for (const e of list) {
    const p = e.isCategory ? 2 : 1;
    add(e.name, 'entry', e.id, p);
    const m = /^(.+?) of (.+)$/i.exec(e.name);
    if (m) add(m[2] + ' ' + m[1], 'entry', e.id, p);
    for (const a of e.aliases || []) add(a, 'entry', e.id, p);
  }
  for (const f of FAMILIES) for (const t of f.terms) add(t, 'family', f.id, 3);
  for (const m of MODIFIERS) { for (const a of m.aliases) add(a, 'mod', m.id, 4); }
  for (const [id, ts] of Object.entries(RARITY_TERMS)) ts.forEach(t => add(t, 'rarity', id, 5));
  for (const [id, ts] of Object.entries(TIER_TERMS)) ts.forEach(t => add(t, 'tier', id, 5));
  for (const [id, ts] of Object.entries(AURA_TERMS)) ts.forEach(t => add(t, 'aura', id, 5));
  for (const [id, ts] of Object.entries(ACTION_TERMS)) ts.forEach(t => add(t, 'action', id, 6));
  for (const [id, ts] of Object.entries(UNIT_TERMS)) ts.forEach(t => add(t, 'unit', id, 7));
  COUNT_TERMS.forEach(t => add(t, 'count', t, 7));
  for (const d of world.currency?.denominations || []) for (const t of [d.id, d.name, d.plural]) if (t) add(String(t), 'money', d.id, 7);
  for (const v of world.vocabulary || []) {
    if (!v.term || !v.means) continue;
    const [kind, id] = v.means.includes(':') ? v.means.split(/:(.*)/s) : ['entry', v.means];
    if (kind === 'mod' ? !mods.has(id) : (kind === 'rarity' || kind === 'tier') ? false : !byId.has(id)) continue; // dangling word: ignore
    const type = kind === 'mod' ? 'mod' : kind === 'rarity' ? 'rarity' : kind === 'tier' ? 'tier' : 'entry';
    add(v.term, type, id, 0, { custom: true });
  }
  // currency words so "50 gold" style does not confuse (kept as money only after a number, see parser)

  // index by first word, longest first, then priority
  const index = new Map();
  for (const p of phrases) {
    if (!index.has(p.words[0])) index.set(p.words[0], []);
    index.get(p.words[0]).push(p);
  }
  const home = world.baseline === 'modern' || (world.currency && world.currency.symbol === '$') ? 'modern' : world.baseline === 'scifi' ? 'scifi' : null;
  const rankOf = p => { if (p.type !== 'entry' || !home) return 0; const e = byId.get(p.id); return e && listOf(e) === home ? 0 : 1; };
  for (const arr of index.values()) arr.sort((a, b) => b.words.length - a.words.length || a.prio - b.prio || rankOf(a) - rankOf(b));

  return { world, entries: list, byId, mods, modList, econ, phrases, index };
}

export function entryName(ctx, id) { const e = ctx.byId.get(id); return e ? e.name : id; }
