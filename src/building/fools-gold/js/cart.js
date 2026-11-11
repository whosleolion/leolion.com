// The cart: a list of saved questions (queries), not saved prices. Each line is priced live by the engine,
// so every factor stays editable by loading the line back into the price screen.
// A haggle belongs to the question: { pct } moves with the other fields, { price } is an agreed amount that stays put.
import { parse } from './parser.js?v=82a76fa1';
import { estimate } from './engine.js?v=82a76fa1';

export const emptyCart = () => ({ lines: [], mods: [], next: 1, haggle: null });

const clone = o => JSON.parse(JSON.stringify(o));
const fixedOf = q => !!(q.haggle && q.haggle.price > 0);

// two queries are the same line when only the quantity differs
export function lineKey(q) {
  const h = q.haggle ? (q.haggle.price > 0 ? 'p' + q.haggle.price : q.haggle.pct || 0) : 0;
  return JSON.stringify([q.action, q.subject, q.family, q.span, q.rarity, q.tier, [...(q.mods || [])].sort(), h]);
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

export function addToCart(cart, q) {
  const base = clone(q); delete base.overrides;
  const hit = cart.lines.find(l => !fixedOf(l.q) && lineKey(l.q) === lineKey(base));
  if (hit) {
    const a = qtyOf(hit.q), b = qtyOf(base);
    if (a != null && b != null) {
      const n = a + b; hit.q.qty = n === 1 ? null : { ...(hit.q.qty || {}), lo: n, hi: n };
      return hit;
    }
  }
  const line = { id: cart.next++, q: base };
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
  // a cart haggle is a change to what you buy, on top of any percent haggle on the line; an agreed price is left alone
  const hgLine = (!fixedOf(line.q) && line.q.haggle && line.q.haggle.pct) || 0;
  const hgCart = q.action !== 'sell' && !fixedOf(line.q) && cart.haggle && cart.haggle.pct ? cart.haggle.pct : 0;
  if (hgCart) q.haggle = { pct: Math.round(((1 + hgLine / 100) * (1 + hgCart / 100) - 1) * 1000) / 10 };
  const e = estimate(q, ctx);
  if (!e.ok) return { ok: false, reason: e.error || 'bad' };
  const sell = q.action === 'sell';
  return { ok: true, e, q, sell, hgLine, hgCart, fixed: fixedOf(line.q), was: e.pre ? e.pre.typical : null, t: e.typical, lo: e.lo, hi: e.hi };
}

function totalsOf(cart, ctx) {
  let spend = 0, get = 0, missing = 0, n = 0;
  const v = { spendLo: 0, spendHi: 0, getLo: 0, getHi: 0 };
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
// totals: what you pay, what you receive, and a likely band that treats lines as varying independently.
// With a cart haggle on, `pre` holds the same totals without it, which is the scale the haggle is made against.
export function cartTotals(cart, ctx) {
  const t = totalsOf(cart, ctx);
  t.pre = cart.haggle ? totalsOf({ ...cart, haggle: null }, ctx) : null;
  return t;
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

// plain text for pasting, as a tally from your wallet's side: buying takes money out (minus), selling brings it in (plus)
export function cartText(cart, ctx, fmt, labelOf) {
  const M = '\u2212', t = cartTotals(cart, ctx), rows = [];
  for (const line of cart.lines) {
    const r = lineResult(line, cart, ctx);
    if (!r.ok) { rows.push(`${labelOf(null, line)}: not in your lists`); continue; }
    rows.push(`${labelOf(r)}${r.fixed ? ' (agreed)' : r.e.haggle ? ' (haggled)' : ''}: ${r.sell ? '+' : M}${fmt(r.t)}`);
  }
  const shop = cart.mods.map(id => ctx.mods.get(id)?.label).filter(Boolean).join(', ');
  const out = [shop ? `Cart, ${shop.charAt(0).toUpperCase()}${shop.slice(1)}` : 'Cart', ...rows];
  if (cart.haggle) out.push(`Haggle: ${cart.haggle.pct < 0 ? M : '+'}${Math.abs(cart.haggle.pct)}% on what you buy`);
  if (t.spend) out.push(`Buying: ${M}${fmt(t.spend)}`);
  if (t.get) out.push(`Selling: +${fmt(t.get)}`);
  const net = `${t.net < 0 ? M : '+'}${fmt(Math.abs(t.net))}`;
  out.push(t.mixed ? `Net: ${net} (you ${t.net < 0 ? 'pay' : 'receive'})` : `Total: ${net}`);
  return out.join('\n');
}

const cleanHaggle = h => {
  if (!h || typeof h !== 'object') return null;
  if (Number.isFinite(+h.price) && +h.price > 0) return { price: +h.price };
  if (Number.isFinite(+h.pct) && +h.pct) return { pct: Math.max(-90, Math.min(300, +h.pct)) };
  return null;
};

// store helper: keep what we load sane. Older carts had a "quote" on a line; that is now an agreed price.
export function normalizeCart(c) {
  const out = emptyCart();
  if (!c || typeof c !== 'object') return out;
  out.mods = Array.isArray(c.mods) ? c.mods.filter(x => typeof x === 'string').slice(0, 4) : [];
  const ch = cleanHaggle(c.haggle); out.haggle = ch && ch.pct ? ch : null;
  for (const l of Array.isArray(c.lines) ? c.lines.slice(0, 200) : []) {
    if (!l || typeof l !== 'object' || !l.q || typeof l.q !== 'object') continue;
    const q = l.q;
    if (typeof q.subject !== 'string' && typeof q.family !== 'string') continue;
    let haggle = cleanHaggle(q.haggle);
    if (!haggle && l.quote != null && Number.isFinite(+l.quote) && +l.quote > 0) haggle = { price: +l.quote };
    out.lines.push({ id: Number.isFinite(+l.id) ? +l.id : out.next, q: { action: ['buy', 'sell', 'value'].includes(q.action) ? q.action : 'buy', subject: typeof q.subject === 'string' ? q.subject : null, family: typeof q.family === 'string' ? q.family : null, qty: q.qty && Number.isFinite(+q.qty.lo) ? q.qty : null, span: q.span && Number.isFinite(+q.span.lo) ? q.span : null, rarity: typeof q.rarity === 'string' ? q.rarity : null, tier: typeof q.tier === 'string' ? q.tier : null, mods: Array.isArray(q.mods) ? q.mods.filter(x => typeof x === 'string') : [], haggle, assumed: Array.isArray(q.assumed) ? q.assumed.filter(x => typeof x === 'string') : [] } });
  }
  out.next = Math.max(1, ...out.lines.map(l => l.id + 1), +c.next || 1);
  return out;
}
