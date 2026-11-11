// Autocomplete for the price box: while you type, the suggestions are steps of the tap flow (verb, kind, item),
// filled in as far as your words went. No AI: prefix and substring matches on names, aliases and kinds.
const VERBS = [['buy', 'Buy', 'buy'], ['sell', 'Sell', 'sell'], ['appraise', 'Appraise', 'value']];
const ARTICLE = /^(a|an|the|some)$/i;

export function complete(text, ctx, { cats, catOf }) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  let verb = null, rest = words;
  const w0 = words[0].toLowerCase();
  const asVerb = w0 === 'hire' ? VERBS[0] : w0 === 'value' ? VERBS[2] : VERBS.find(v => w0.length >= 2 && v[0].startsWith(w0) || v[0] === w0);
  const nameStarts = ctx.entries.some(e => e.name.toLowerCase().startsWith(w0));
  if (asVerb && (words.length > 1 || !nameStarts || w0.length >= 3)) { verb = asVerb; rest = words.slice(1); }
  rest = rest.filter((w, i) => !(i === 0 && ARTICLE.test(w) && rest.length > 1));
  const typed = rest.join(' ').toLowerCase();
  const v = verb || VERBS[0], out = [];
  const catLabel = id => (cats.find(c => c[0] === id) || [])[1] || '';
  if (!typed) {
    if (!verb) return [];
    const pre = words.length === 1 ? VERBS.filter(x => x[0].startsWith(w0) || x === verb) : [verb];
    for (const x of pre) out.push({ type: 'verb', verb: x[2], label: x[1], path: [x[1]] });
    for (const [id, label] of cats.slice(0, 8)) if (ctx.entries.some(e => catOf(e) === id)) out.push({ type: 'cat', verb: v[2], cat: id, label, path: [v[1], label] });
    return out;
  }
  if (typed.length < 2) return [];
  const hit = ctx.entries.filter(e => !e.isCategory && [e.name, ...(e.aliases || [])].some(n => n && n.toLowerCase().includes(typed)));
  const rank = e => { const ns = [e.name, ...(e.aliases || [])].map(n => n.toLowerCase()); return ns.some(n => n === typed) ? 0 : ns.some(n => n.startsWith(typed)) ? 1 : ns.some(n => n.split(/\s+/).some(w => w.startsWith(typed))) ? 2 : 3; };
  hit.sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length);
  const catHits = cats.filter(([id, label]) => label.toLowerCase().includes(typed) && ctx.entries.some(e => catOf(e) === id));
  for (const [id, label] of catHits.slice(0, 2)) out.push({ type: 'cat', verb: v[2], cat: id, label, path: [v[1], label] });
  for (const e of hit.slice(0, 6)) out.push({ type: 'item', verb: verb ? v[2] : null, id: e.id, label: e.name, path: [v[1], catLabel(catOf(e)) || '', e.name].filter(Boolean), entry: e });
  return out;
}
