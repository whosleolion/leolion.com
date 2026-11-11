// The cart: a list of saved questions (queries), not saved prices. Each line is priced live by the engine,
// so every factor stays editable by loading the line back into the price screen.
import { parse } from './parser.js?v=fb67fb0a';
import { estimate } from './engine.js?v=fb67fb0a';

export const emptyCart = () => ({ lines: [], mods: [], next: 1, haggle: null });

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = o => JSON.parse(JSON.stringify(o));

// two queries are the same line when only the quantity differs
export function lineKey(q) {
  return JSON.stringify([q.action, q.subject, q.family, q.span, q.rarity, q.tier, [...(q.mods || [])].sort(), q.haggle ? q.haggle.pct : 0]);
}

// the shop (place and the like) applies to every line, unless the line already picked something in that group
export function withShop(q, shopMods, ctx) {
  const out = clone(q), have = new Set((out.mods || []).map(id => ctx.mods.get(id)?.group));
  out.mods = [...(out.mods || [])];
  for (const id of shopMods || []) {
    const m = ctx.mods.get(id);
    if (!m || have.has(m.group)) continue;
    out.mods.push(id); have.add(m.group);
  }
  return out;
}
// the reverse, when a line is saved from the price screen: shop mods stay with the cart
export function stripShop(q, shopMods) {
  const out = clone(q);
  out.mods = (out.mods || []).filter(id => !(shopMods || []).includes(id));
  return out;
}

const qtyOf = q => (q.qty ? (q.qty.lo === q.qty.hi ? q.qty.lo : null) : 1);

export function addToCart(cart, q, qty) {
  const base = clone(q); delete base.overrides;
  const hit = cart.lines.find(l => l.quote == null && lineKey(l.q) === lineKey(base));
  if (hit) {
    const a = qtyOf(hit.q), b = qtyOf(base);
    if (a != null && b != null) {
      const n = a + b; hit.q.qty = n === 1 ? null : { ...(hit.q.qty || { unit: undefined }), lo: n, hi: n };
      if (hit.q.qty && hit.q.qty.unit === undefined) delete hit.q.qty.unit;
      return hit;
    }
  }
  const line = { id: cart.next++, q: base, quote: null };
  cart.lines.push(line);
  return line;
}
export function unitsInCart(cart, q) {
  const k = lineKey(q);
  return cart.lines.filter(l => lineKey(l.q) === k).reduce((n, l) => n + (qtyOf(l.q) ?? 0), 0);
}

// one line, priced
export function lineResult(line, cart, ctx) {
  const q = withShop(line.q, cart.mods, ctx);
  if (!q.subject || !ctx.byId.has(q.subject)) return { ok: false, reason: 'missing' };
  // a cart haggle is a change to what you buy, on top of any haggle on the line itself
  const hgLine = (line.q.haggle && line.q.haggle.pct) || 0, hgCart = q.action !== 'sell' && line.quote == null && cart.haggle && cart.haggle.pct ? cart.haggle.pct : 0;
  if (hgCart) q.haggle = { pct: Math.round(((1 + hgLine / 100) * (1 + hgCart / 100) - 1) * 1000) / 10 };
  const e = estimate(q, ctx);
  if (!e.ok) return { ok: false, reason: e.error || 'bad' };
  const sell = q.action === 'sell';
  const t = line.quote != null ? line.quote : e.typical;
  return { ok: true, e, q, sell, hgLine, hgCart, was: e.pre ? e.pre.typical : null, quoted: line.quote != null, t, lo: line.quote != null ? t : e.lo, hi: line.quote != null ? t : e.hi };
}

// totals: what you pay, what you receive, and a likely band that treats lines as varying independently
export function cartTotals(cart, ctx) {
  let spend = 0, get = 0;
  const v = { spendLo: 0, spendHi: 0, getLo: 0, getHi: 0 };
  let missing = 0, n = 0;
  const ext = { spendLo: 0, spendHi: 0, getLo: 0, getHi: 0 };
  for (const line of cart.lines) {
    const r = lineResult(line, cart, ctx);
    if (!r.ok) { missing++; continue; }
    n++;
    if (r.sell) { get += r.t; v.getLo += (r.t - r.lo) ** 2; v.getHi += (r.hi - r.t) ** 2; ext.getLo += r.lo; ext.getHi += r.hi; }
    else { spend += r.t; v.spendLo += (r.t - r.lo) ** 2; v.spendHi += (r.hi - r.t) ** 2; ext.spendLo += r.lo; ext.spendHi += r.hi; }
  }
  const net = get - spend;
  const dLo = Math.sqrt(v.spendHi + v.getLo), dHi = Math.sqrt(v.spendLo + v.getHi); // spend high hurts the net, receive low hurts it
  return {
    spend, get, net, n, missing,
    spendBand: [Math.max(0, spend - Math.sqrt(v.spendLo)), spend + Math.sqrt(v.spendHi)],
    getBand: [Math.max(0, get - Math.sqrt(v.getLo)), get + Math.sqrt(v.getHi)],
    spendExt: [ext.spendLo, ext.spendHi], getExt: [ext.getLo, ext.getHi],
    netBand: [net - dLo, net + dHi],
    mixed: get > 0 && spend > 0,
  };
}

// "3 rope, 2 torches, sell 2 longswords in a village": several items in one sentence
export function readSentence(text, ctx) {
  const segs = String(text || '').split(/\s*(?:,|;|\n|\band\b)\s*/i).map(s => s.trim()).filter(Boolean);
  const items = [], shared = [], bad = [];
  let lastAction = null;
  for (const seg of segs) {
    const p = parse(seg, ctx), q = p.query;
    if (q.family && q.assumed.includes('mode') && items.length) continue; // "3 days travel" after a trip is a detail of that trip
    if (q.subject || q.family) {
      if (q.assumed.includes('action') && lastAction) { q.action = lastAction; q.assumed = q.assumed.filter(x => x !== 'action'); }
      if (!q.assumed.includes('action')) lastAction = q.action;
      // a place applies to the whole trip
      const keep = [];
      for (const id of q.mods) { const m = ctx.mods.get(id); if (m && m.group === 'place') { if (!shared.includes(id)) shared.push(id); } else keep.push(id); }
      q.mods = keep;
      items.push(q);
    } else if (q.mods.length && !p.unrecognized.length) {
      for (const id of q.mods) if (!shared.includes(id)) shared.push(id);
    } else bad.push(seg);
  }
  // one place at most
  const placed = shared.filter(id => ctx.mods.get(id)?.group === 'place');
  const shop = [...shared.filter(id => ctx.mods.get(id)?.group !== 'place'), ...placed.slice(-1)];
  return { items, shop, bad };
}

// plain text for pasting
export function cartText(cart, ctx, fmt, labelOf) {
  const rows = [], t = cartTotals(cart, ctx);
  for (const line of cart.lines) {
    const r = lineResult(line, cart, ctx);
    rows.push(r.ok ? `${labelOf(r)}${r.sell ? ' (sell)' : ''}${r.quoted ? ' (agreed)' : r.e.haggle ? ' (haggled)' : ''}: ${fmt(r.t)}` : `${labelOf(null, line)}: not in your lists`);
  }
  const shop = cart.mods.map(id => ctx.mods.get(id)?.label).filter(Boolean).join(', ');
  const total = t.get > 0 && t.spend > 0 ? `Net: you ${t.net < 0 ? 'pay' : 'receive'} ${fmt(Math.abs(t.net))}` : t.get > 0 ? `You receive ${fmt(t.get)}` : `Total: ${fmt(t.spend)}`;
  return [shop ? `Cart, ${shop}` : 'Cart', ...rows, total].join('\n');
}

// store helper: keep what we load sane
export function normalizeCart(c) {
  const out = emptyCart();
  if (!c || typeof c !== 'object') return out;
  out.mods = Array.isArray(c.mods) ? c.mods.filter(x => typeof x === 'string').slice(0, 4) : [];
  out.haggle = c.haggle && Number.isFinite(+c.haggle.pct) && +c.haggle.pct ? { pct: Math.max(-90, Math.min(300, +c.haggle.pct)) } : null;
  for (const l of Array.isArray(c.lines) ? c.lines.slice(0, 200) : []) {
    if (!l || typeof l !== 'object' || !l.q || typeof l.q !== 'object') continue;
    const q = l.q;
    if (typeof q.subject !== 'string' && typeof q.family !== 'string') continue;
    out.lines.push({ id: Number.isFinite(+l.id) ? +l.id : out.next, q: { action: ['buy', 'sell', 'value'].includes(q.action) ? q.action : 'buy', subject: typeof q.subject === 'string' ? q.subject : null, family: typeof q.family === 'string' ? q.family : null, qty: q.qty && Number.isFinite(+q.qty.lo) ? q.qty : null, span: q.span && Number.isFinite(+q.span.lo) ? q.span : null, rarity: typeof q.rarity === 'string' ? q.rarity : null, tier: typeof q.tier === 'string' ? q.tier : null, mods: Array.isArray(q.mods) ? q.mods.filter(x => typeof x === 'string') : [], haggle: q.haggle && Number.isFinite(+q.haggle.pct) && +q.haggle.pct ? { pct: Math.max(-90, Math.min(300, +q.haggle.pct)) } : null, assumed: Array.isArray(q.assumed) ? q.assumed.filter(x => typeof x === 'string') : [] }, quote: l.quote != null && Number.isFinite(+l.quote) ? +l.quote : null });
  }
  out.next = Math.max(1, ...out.lines.map(l => l.id + 1), +c.next || 1);
  return out;
}
export { same as _same };
