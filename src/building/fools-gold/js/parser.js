// Plain-text parser: sentence -> Query. No AI. Dictionary matching, number parsing, slot filling.
import { tokenize, stem } from './world.js?v=e893ea51';
import { parseMoney, formatFull } from './money.js?v=e893ea51';
import { NUMBER_WORDS, FILLERS, INTENSIFIERS, TIER_NAMES, RARITIES, ROUTE_TEXT, FAMILIES } from './data.js?v=e893ea51';

const SKIP_SUGGEST = new Set(['unit', 'count', 'money']);
const BIGNUM = { hundred: 100, thousand: 1000, dozen: 12 };

function matchAt(toks, i, ctx) {
  const t = toks[i];
  if (t.type === 'dash' || (t.type === 'num' && t.mult)) return null;
  const cands = ctx.index.get(t.stem);
  if (!cands) return null;
  for (const p of cands) {
    if (i + p.words.length > toks.length) continue;
    let ok = true;
    for (let j = 0; j < p.words.length; j++) {
      const u = toks[i + j];
      if (u.type === 'dash' || (u.type === 'num' && u.mult) || u.stem !== p.words[j]) { ok = false; break; }
    }
    if (ok) return p;
  }
  return null;
}

function numberWords(toks, i) {
  let j = i, total = 0, cur = 0, any = false;
  const w0 = toks[j]?.stem;
  if (w0 === 'half' && toks[j + 1]?.stem === 'a' && toks[j + 2]?.stem === 'dozen') return { value: 6, len: 3 };
  if (w0 === 'half' && toks[j + 1]?.stem === 'dozen') return { value: 6, len: 2 };
  if ((w0 === 'a' || w0 === 'an') && BIGNUM[toks[j + 1]?.stem]) { cur = 1; j++; }
  for (; j < toks.length; j++) {
    const t = toks[j];
    if (t.type !== 'word') break;
    const w = t.stem;
    if (w === 'and' && any && cur >= 100 && NUMBER_WORDS[toks[j + 1]?.stem] !== undefined && NUMBER_WORDS[toks[j + 1].stem] < 100) continue;
    if (['couple', 'pair', 'few', 'several'].includes(w)) { if (any || cur) break; return { value: NUMBER_WORDS[w], len: 1 + (j - i) }; }
    if (BIGNUM[w]) {
      if (w === 'hundred') cur = (cur || 1) * 100;
      else if (w === 'thousand') { total += (cur || 1) * 1000; cur = 0; }
      else cur = (cur || 1) * 12;
      any = true; continue;
    }
    const v = NUMBER_WORDS[w];
    if (v === undefined) break;
    if (v >= 20 && cur % 100 >= 20) break;
    if (v < 20 && cur % 10 !== 0 && cur % 100 < 20 && cur !== 0 && !(cur >= 100 && cur % 100 === 0)) break;
    cur += v; any = true;
  }
  if (!any) return null;
  const bigOnly = j - i === 1 && BIGNUM[toks[i].stem] !== undefined;
  return { value: total + cur, len: j - i, big: bigOnly };
}

// Optimal-string-alignment edit distance.
export function editDistance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = [];
  for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function suggest(unks, ctx) {
  const out = [];
  for (let a = 0; a < unks.length; a++) {
    for (let size = Math.min(3, unks.length - a); size >= 1; size--) {
      const win = unks.slice(a, a + size);
      // only adjacent source tokens
      let adj = true;
      for (let k = 1; k < win.length; k++) if (win[k].tokIdx !== win[k - 1].tokIdx + 1) adj = false;
      if (!adj) continue;
      const str = win.map(u => u.stem).join(' ');
      if (str.replace(/ /g, '').length < 4) continue;
      const maxd = str.length >= 7 ? 2 : 1;
      let best = null;
      for (const p of ctx.phrases) {
        if (SKIP_SUGGEST.has(p.type)) continue;
        if (Math.abs(p.key.length - str.length) > maxd) continue;
        if (p.key[0] !== str[0]) continue;
        if (p.key === str) continue;
        const d = editDistance(str, p.key, maxd);
        if (d > maxd) continue;
        if (!best || d < best.d || (d === best.d && p.prio < best.prio)) best = { d, prio: p.prio, p };
      }
      if (best) {
        const first = win[0], last = win[win.length - 1];
        out.push({ start: first.start, end: last.end, from: win.map(u => u.raw).join(' '), to: best.p.display, type: best.p.type, id: best.p.id });
        a += size - 1;
        break;
      }
    }
  }
  return out;
}

export function emptyQuery() {
  return { action: 'buy', subject: null, family: null, qty: null, span: null, rarity: null, tier: null, mods: [], haggle: null, assumed: ['action'] };
}

// A haggle written into the sentence: "longsword, 15% off" or "rope 20% extra". Blanked out in place so word positions hold.
const HAGGLE_OFF = /(?:,\s*)?(?:\bhaggled\s+)?(?:\bdown\s+)?(\d+(?:\.\d+)?)\s*%\s*(?:off|discount|cheaper|less)\b/i;
const HAGGLE_ON = /(?:,\s*)?(\d+(?:\.\d+)?)\s*%\s*(?:extra|markup|surcharge|higher|on top)\b/i;
const AGREED = /(?:,\s*)?\bagreed(?:\s+(?:at|for|on))?\s+([^,;]+)/i;
export function extractHaggle(text, ctx) {
  const a = ctx && AGREED.exec(text);
  if (a) {
    const bu = parseMoney(a[1].trim(), ctx.world.currency);
    if (bu > 0) return { pct: 0, price: bu, text: text.slice(0, a.index) + ' '.repeat(a[0].length) + text.slice(a.index + a[0].length) };
  }
  let m = HAGGLE_OFF.exec(text), pct = 0;
  if (m) pct = -Math.min(90, +m[1]);
  else if ((m = HAGGLE_ON.exec(text))) pct = Math.min(300, +m[1]);
  if (!m || !pct) return { pct: 0, text };
  return { pct, text: text.slice(0, m.index) + ' '.repeat(m[0].length) + text.slice(m.index + m[0].length) };
}

export function parse(text, ctx) {
  const hx = extractHaggle(text, ctx);
  text = hx.text;
  const toks = tokenize(text);
  const parts = [];
  const notes = [];
  for (let i = 0; i < toks.length;) {
    const t = toks[i];
    if (t.type === 'dash') { parts.push({ k: 'dash', start: t.start, end: t.end }); i++; continue; }
    const m = matchAt(toks, i, ctx);
    if (m) {
      const last = toks[i + m.words.length - 1];
      parts.push({ k: 'c', type: m.type, id: m.id, p: m, start: t.start, end: last.end, plural: last.raw.toLowerCase() !== last.stem && /s$/.test(last.raw), tokIdx: i, n: m.words.length });
      i += m.words.length; continue;
    }
    if (t.type === 'num') { parts.push({ k: 'n', lo: t.value, hi: t.value, mult: !!t.mult, start: t.start, end: t.end, tokIdx: i }); i++; continue; }
    const nw = t.type === 'word' ? numberWords(toks, i) : null;
    if (nw) { parts.push({ k: 'n', lo: nw.value, hi: nw.value, big: nw.big, start: t.start, end: toks[i + nw.len - 1].end, tokIdx: i }); i += nw.len; continue; }
    if (t.ench) { parts.push({ k: 'ench', raw: t.raw, start: t.start, end: t.end }); i++; continue; }
    if (FILLERS.has(t.stem) || FILLERS.has(t.raw)) { parts.push({ k: 'f', raw: t.raw.toLowerCase(), stem: t.stem }); i++; continue; }
    parts.push({ k: 'u', raw: t.raw, stem: t.stem, start: t.start, end: t.end, tokIdx: i }); i++;
  }

  // "3 dozen", "2 hundred": a number followed by a big-number word multiplies
  for (let a = 1; a < parts.length; a++) {
    const p = parts[a], prev = parts[a - 1];
    if (p.k === 'n' && p.big && prev.k === 'n' && !prev.big && !prev.mult) { prev.lo *= p.lo; prev.hi *= p.hi; prev.end = p.end; parts.splice(a, 1); a--; }
  }
  // ranges: n (to|or|-) n, or "between n and n"
  for (let a = 0; a < parts.length - 2; a++) {
    const p = parts[a], s = parts[a + 1], q = parts[a + 2];
    if (p.k === 'n' && q.k === 'n' && (s.k === 'dash' || (s.k === 'f' && (s.raw === 'to' || s.raw === 'or' || (s.raw === 'and' && parts[a - 1]?.k === 'f' && parts[a - 1].raw === 'between'))))) {
      p.lo = Math.min(p.lo, q.lo); p.hi = Math.max(p.hi, q.hi); p.end = q.end;
      parts.splice(a + 1, 2);
    }
  }

  const q = emptyQuery();
  const concept = type => parts.filter(p => p.k === 'c' && p.type === type);

  // action
  const acts = concept('action');
  if (acts.length) {
    q.action = acts[0].id; q.assumed = q.assumed.filter(x => x !== 'action');
    if (acts.some(a => a.id !== acts[0].id)) notes.push('Buying and selling both appear. Using "' + acts[0].p.display + '".');
  }
  // rarity, tier
  const rars = concept('rarity'); if (rars.length) { q.rarity = rars[0].id; if (rars.some(r => r.id !== rars[0].id)) notes.push('Several rarities given. Using ' + rars[0].id + '.'); }
  const tiers = concept('tier'); if (tiers.length) { q.tier = tiers[0].id; if (tiers.some(r => r.id !== tiers[0].id)) notes.push('Several classes given. Using ' + tiers[0].id + '.'); }
  // "very cheap", "extremely expensive", "super rare": the word before pushes one step further out
  const pushed = c => { const k = parts.indexOf(c); return k > 0 && parts[k - 1].k === 'f' && INTENSIFIERS.has(parts[k - 1].raw); };
  if (tiers.length && pushed(tiers[0]) && q.tier !== 'standard') { const o = TIER_NAMES.indexOf(q.tier), n = o + (o < 2 ? -1 : 1); if (o >= 0 && n >= 0 && n < TIER_NAMES.length) q.tier = TIER_NAMES[n]; notes.push('"' + parts[parts.indexOf(tiers[0]) - 1].raw + '" pushes the class one step further.'); }
  if (rars.length && pushed(rars[0]) && RARITIES.indexOf(q.rarity) >= 0 && RARITIES.indexOf(q.rarity) < RARITIES.length - 1 && q.rarity !== 'very rare') q.rarity = RARITIES[RARITIES.indexOf(q.rarity) + 1];
  for (const p of rars.slice(0)) p.used = true;
  for (const p of tiers) p.used = true;
  for (const p of acts) p.used = true;

  // subject
  const subs = parts.filter(p => p.k === 'c' && (p.type === 'entry' || p.type === 'family'));
  const isComm = s => s.type === 'entry' && (() => { const e = ctx.byId.get(s.id); return e && (e.tags || []).some(t => t === 'trade' || t === 'raw'); })();
  // a raw material word next to a real item is a material (gold dagger), not a bullion order
  const hasNonComm = subs.some(s => !isComm(s));
  subs.sort((a, b) => (hasNonComm ? (isComm(a) ? 1 : 0) - (isComm(b) ? 1 : 0) : 0) || (a.p.prio - b.p.prio) || (b.n - a.n) || (a.start - b.start));
  let subjectEntry = null;
  if (subs.length) {
    const s = subs[0];
    if (s.type === 'entry') subjectEntry = ctx.byId.get(s.id) || null;
    else {
      const fam = FAMILIES.find(f => f.id === s.id);
      const want = ctx.world.defaults?.[fam.defaultKey] || fam.fallback;
      subjectEntry = ctx.byId.get(want) || ctx.byId.get(fam.fallback) || ctx.entries.find(e => e.group === fam.id) || null;
      if (subjectEntry) { q.family = fam.id; q.assumed.push('mode'); }
    }
    if (!subjectEntry) { subs.forEach(p => { p.used = false; }); }
    const others = subs.slice(1).filter(o => {
      if (o.type === 'family') return !(subjectEntry && subjectEntry.group === o.id);
      if (subjectEntry && o.id === subjectEntry.id) return false;
      return true;
    });
    let rentSeen = false;
    for (const o of others) { if (o.type === 'family' && o.id === 'rent') { rentSeen = true; continue; } notes.push(isComm(o) && hasNonComm ? 'Read "' + o.p.display + '" as the material. Priced the ' + subjectEntry.name.toLowerCase() + ' at its normal price.' : 'Also saw "' + o.p.display + '". Priced "' + subjectEntry.name + '". Ask about the other separately.'); }
    if (rentSeen && subjectEntry.kind === 'property') notes.push('Renting a property is not priced yet. This is the purchase price.');
    if (subjectEntry) { subs.forEach(p => { p.used = true; }); q.subject = subjectEntry.id; }
  }
  const kind = subjectEntry ? subjectEntry.kind : null;

  // modifiers
  const modParts = concept('mod');
  const places = modParts.filter(p => ctx.mods.get(p.id)?.group === 'place');
  const addMod = id => { if (!q.mods.includes(id)) q.mods.push(id); };
  for (const p of modParts) p.used = true;
  const routeIds = new Set(['route-trunk', 'route-hub', 'route-local', 'route-remote']);
  for (const p of modParts) {
    if (ctx.mods.get(p.id)?.group === 'place' && kind === 'travel') continue;
    addMod(p.id);
  }
  // route detection for travel
  if (kind === 'travel') {
    const idx = parts.indexOf(places[0]);
    let pair = null;
    if (places.length >= 2) pair = [places[0], places[1]];
    else if (places.length === 1) {
      const p = places[0], at = parts.indexOf(p);
      let both = p.plural;
      for (let k = Math.max(0, at - 4); k < at; k++) {
        const x = parts[k];
        if ((x.k === 'n' && x.lo === 2 && x.hi === 2) || (x.k === 'f' && x.raw === 'both')) { both = true; if (x.k === 'n') x.used = true; }
      }
      if (both) pair = [p, p];
      else notes.push('Only one end of the trip named. Give both, such as "capital to village", to price the route.');
    }
    if (pair) {
      const ra = ctx.mods.get(pair[0].id).rank, rb = ctx.mods.get(pair[1].id).rank;
      const id = Math.min(ra, rb) === 0 ? 'route-remote' : Math.min(ra, rb) >= 3 ? 'route-trunk' : Math.max(ra, rb) >= 3 ? 'route-hub' : 'route-local';
      addMod(id);
    }
  }
  if (kind && kind !== 'travel') for (const id of [...q.mods]) if (routeIds.has(id)) q.mods.splice(q.mods.indexOf(id), 1);

  // numbers
  const nextMeaningful = i => { for (let k = i + 1; k < parts.length; k++) { if (parts[k].k === 'dash') continue; if (parts[k].k === 'f' && ['of', 'for', 'a', 'an', 'the'].includes(parts[k].raw)) continue; return parts[k]; } return null; };
  let bare = null, multQty = null, counted = false, bareBeforeSubject = false;
  const unusedNums = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.k !== 'n' || p.used) continue;
    if (p.mult) { multQty = { lo: p.lo, hi: p.hi }; p.used = true; continue; }
    const nx = nextMeaningful(i);
    if (nx && nx.k === 'c' && nx.type === 'unit') {
      nx.used = true; p.used = true;
      if (nx.id === 'lb') { q.qty = { lo: p.lo, hi: p.hi, unit: 'lb' }; }
      else if (!q.span) q.span = { lo: p.lo, hi: p.hi, unit: nx.id };
      else notes.push('Two lengths given. Using ' + q.span.lo + ' ' + q.span.unit + '.');
      continue;
    }
    if (nx && nx.k === 'c' && nx.type === 'money') {
      p.used = true; nx.used = true;
      notes.push('Read "' + p.lo + ' ' + nx.p.display + '" as money. Fool\'s Gold prices items and cannot yet work back from a budget.');
      continue;
    }
    if (nx && nx.k === 'c' && nx.type === 'count') { nx.used = true; p.used = true; q.qty = q.qty && q.qty.unit ? q.qty : { lo: p.lo, hi: p.hi }; counted = true; continue; }
    if (!bare) { bare = p; p.used = true; bareBeforeSubject = !!(nx && nx.k === 'c' && (nx.type === 'entry' || nx.type === 'family')); } else unusedNums.push(p);
  }
  if (bare && !q.qty) q.qty = { lo: bare.lo, hi: bare.hi };
  else if (bare) unusedNums.push(bare);
  if (multQty) q.qty = { lo: multQty.lo, hi: multQty.hi };
  // loose unit words with no number: "for a week", "a night"
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.k === 'c' && p.type === 'unit' && !p.used && p.id !== 'lb') {
      p.used = true;
      if (!q.span) q.span = { lo: 1, hi: 1, unit: p.id, implied: true };
    }
  }
  // count words without a number (e.g. "passenger") are harmless
  parts.forEach(p => { if (p.k === 'c' && (p.type === 'count' || p.type === 'unit' || p.type === 'money')) p.used = true; });

  // bare number on a per-day travel/lodging subject is a length, not a head count
  if (subjectEntry && ['day', 'week', 'month', 'year'].includes(subjectEntry.unit) && (kind === 'travel' || kind === 'lodging') && q.qty && !q.span && !q.qty.unit && !counted && !multQty && !bareBeforeSubject) {
    q.span = { lo: q.qty.lo, hi: q.qty.hi, unit: subjectEntry.unit, implied: true }; q.qty = null;
  }

  // sanity: zero, negative or absurd amounts are not quantities
  for (const key of ['qty', 'span']) {
    const v = q[key];
    if (v && (!(v.lo > 0) || !(v.hi > 0) || !isFinite(v.lo) || !isFinite(v.hi))) { notes.push('Ignored a zero or negative ' + (key === 'qty' ? 'amount' : 'length') + '.'); q[key] = null; }
    else if (v && Math.max(v.lo, v.hi) > 1e7) notes.push('Very large number. Check it.');
  }
  if (subjectEntry && (subjectEntry.tags || []).includes('trade') && q.qty && !q.qty.unit && ctx.world.currency?.denominations?.some(d => String(d.name).toLowerCase().split(' ')[0] === subjectEntry.name.toLowerCase().split(' ')[0])) notes.push('Priced as ' + q.qty.lo + ' lb of ' + subjectEntry.name.toLowerCase() + '. Coins count as money, not an item.');
  for (const p of parts) if (p.k === 'ench') notes.push('"' + p.raw + '" is an enchantment bonus and is not priced directly. Use a rarity instead, such as "rare magic weapon".');
  // unrecognized
  const unk = parts.filter(p => p.k === 'u');
  const unrecognized = unk.map(u => u.raw);
  for (const n of unusedNums) unrecognized.push(String(n.lo));
  const suggestions = suggest(unk, ctx);

  if (hx.price) q.haggle = { price: hx.price };
  else if (hx.pct) q.haggle = { pct: hx.pct };
  return { query: q, unrecognized, suggestions, notes, parts };
}

// ---- Query -> canonical sentence ----
const fmtN = r => r.lo === r.hi ? String(r.lo) : r.lo + ' to ' + r.hi;
export function queryToText(q, ctx) {
  const out = [];
  const e = q.subject ? ctx.byId.get(q.subject) : null;
  if (!q.assumed.includes('action')) out.push(q.action === 'value' ? 'appraise' : q.action);
  if (q.qty) out.push(fmtN(q.qty) + (q.qty.unit === 'lb' ? ' lb of' : ''));
  if (q.rarity) out.push(q.rarity);
  if (q.tier && q.tier !== 'standard') out.push(q.tier);
  else if (q.tier === 'standard') out.push('standard');
  if (e) {
    const fam = q.family ? FAMILIES.find(f => f.id === q.family) : null;
    out.push(fam ? fam.terms[0] : e.name.toLowerCase());
  }
  let s = out.join(' ');
  const tail = [];
  if (q.span) tail.push(fmtN(q.span) + ' ' + q.span.unit + (q.span.hi === 1 ? '' : 's'));
  for (const id of q.mods) {
    const m = ctx.mods.get(id);
    if (!m) continue;
    tail.push(ROUTE_TEXT[id] || m.aliases[0] || m.label);
  }
  if (q.haggle && q.haggle.price > 0) tail.push('agreed at ' + formatFull(q.haggle.price, ctx.world.currency));
  else if (q.haggle && q.haggle.pct) tail.push(q.haggle.pct < 0 ? Math.abs(q.haggle.pct) + '% off' : q.haggle.pct + '% extra');
  return [s, ...tail].filter(Boolean).join(', ');
}

export function chipsFor(q, ctx) {
  const chips = [];
  const as = id => q.assumed.includes(id);
  const e = q.subject ? ctx.byId.get(q.subject) : null;
  chips.push({ role: 'action', label: q.action === 'value' ? 'appraise' : q.action, assumed: as('action'), key: 'action' });
  if (q.qty) chips.push({ role: 'qty', label: (q.qty.lo === q.qty.hi ? q.qty.lo : q.qty.lo + ' to ' + q.qty.hi) + (q.qty.unit === 'lb' ? ' lb' : ' ×'), key: 'qty' });
  if (q.rarity) chips.push({ role: 'rarity', label: q.rarity, key: 'rarity' });
  if (q.tier) chips.push({ role: 'tier', label: q.tier, key: 'tier' });
  if (e) chips.push({ role: 'subject', label: e.name.toLowerCase(), assumed: as('mode'), key: 'subject', hint: as('mode') ? 'assumed travel mode' : null });
  if (q.span) chips.push({ role: 'span', label: (q.span.lo === q.span.hi ? q.span.lo : q.span.lo + ' to ' + q.span.hi) + ' ' + q.span.unit + (q.span.hi === 1 ? '' : 's'), key: 'span', assumed: !!q.span.implied });
  for (const id of q.mods) { const m = ctx.mods.get(id); if (m) chips.push({ role: 'mod', label: m.label, key: 'mod:' + id, group: m.group }); }
  return chips;
}
