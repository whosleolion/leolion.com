// Facts typed as a sentence in World settings > Changes: "a healing potion costs 40 gp", "a shiv is a dagger",
// "sellers pay 40%". Read by plain patterns, shown back for confirmation, then saved as a price, a word or a dial.
import { parseSetting } from './setting.js?v=c6091ad0';

const clean = s => String(s || '').replace(/[.!]+$/g, '').replace(/\s+/g, ' ').trim();
const ART = /^(?:an?|the|my|our)\s+/i;

function resolve(ctx, text) {
  const t = clean(text).replace(ART, '').toLowerCase();
  if (!t) return null;
  const e = ctx.entries.find(x => x.name.toLowerCase() === t) || ctx.entries.find(x => (x.aliases || []).some(a => a.toLowerCase() === t));
  if (e) return { id: e.id, label: e.name };
  const m = ctx.modList.find(x => x.label.toLowerCase() === t || x.aliases.some(a => a.toLowerCase() === t));
  return m ? { id: 'mod:' + m.id, label: m.label } : null;
}

function resolveMod(ctx, text) {
  const t = clean(text).replace(ART, '').toLowerCase();
  return ctx.modList.find(m => m.label.toLowerCase() === t || m.aliases.some(a => a.toLowerCase() === t)) || null;
}
const r2 = n => Math.round(n * 100) / 100;
function modFact(m, lo, hi, how) {
  lo = r2(lo); hi = r2(hi);
  return { kind: 'mod', key: 'mod:' + m.id, lo, hi, label: m.label, line: `${m.label} × ${lo === hi ? lo : lo + ' to ' + hi}`, note: how };
}
const pct = s => { const m = /(\d+(?:\.\d+)?)\s*(%|percent)/i.exec(s); return m ? +m[1] / 100 : null; };

export function readFact(text, ctx) {
  const t = clean(text);
  if (!t || /\?/.test(t) || /^(how|what|which|when|where|why|who|can|could|should|would|will|do|does|did)\b/i.test(t)) return null;

  // dials
  let m;
  if ((m = /^(?:set\s+)?(?:the\s+)?price level\s*(?:is|to|=|of)?\s*(\d+(?:\.\d+)?)$/i.exec(t)) && +m[1] > 0 && +m[1] <= 10) return { kind: 'dial', key: 'priceLevel', value: +m[1], line: `Price level ${+m[1]}`, note: 'Scales every price. 1 is standard.' };
  if ((m = /^everything\s+(?:is|costs?)\s+(\d+(?:\.\d+)?)\s*%\s*(more|less)(?:\s+expensive)?$/i.exec(t))) { const v = m[2].toLowerCase() === 'more' ? 1 + +m[1] / 100 : 1 - +m[1] / 100; if (v > 0) return { kind: 'dial', key: 'priceLevel', value: +v.toFixed(3), line: `Price level ${+v.toFixed(3)}`, note: 'Scales every price. 1 is standard.' }; }
  if ((m = /^(?:shops?|sellers?|merchants?|buyers?|dealers?)\s+(?:pay|give|offer|buy (?:at|for))\s+(?:you\s+)?(.+)$/i.exec(t)) && pct(m[1]) && pct(m[1]) >= 0.1 && pct(m[1]) <= 1) return { kind: 'dial', key: 'sellFraction', value: pct(m[1]), line: `Sellers get ${Math.round(pct(m[1]) * 100)}%`, note: 'The share of a price a shop pays when it buys from you.' };
  if ((m = /^(?:round|rounding)(?:\s+prices)?\s*(?:is\s+)?(on|off)$/i.exec(t)) || (m = /^(?:turn|switch)\s+(on|off)\s+rounding$/i.exec(t))) return { kind: 'dial', key: 'round', value: m[1].toLowerCase() === 'on', line: `Rounding ${m[1].toLowerCase()}`, note: 'Rounds prices to whole coins.' };

  // a circumstance: "black market takes 30%", "rush is 20% more", "village is x0.8 to 0.95"
  let mm;
  if ((mm = /^(.+?)\s+(?:costs?|is|are|adds?|makes?\s+(?:things|prices|it))\s+(\d+(?:\.\d+)?)\s*%\s*(more|less|pricier|cheaper|higher|lower|dearer)(?:\s+expensive)?$/i.exec(t)) || (mm = /^(.+?)\s+adds?\s+(\d+(?:\.\d+)?)\s*%()$/i.exec(t))) {
    const m = resolveMod(ctx, mm[1]);
    if (m && +mm[2] > 0 && +mm[2] < 100) { const up = !mm[3] || /more|pricier|higher|dearer/i.test(mm[3]); const v = up ? 1 + +mm[2] / 100 : 1 - +mm[2] / 100; return modFact(m, v * 0.95, v * 1.05, `${m.label} will change a price by about ${mm[2]}% ${up ? 'more' : 'less'}, whether buying or selling.`); }
  }
  if ((mm = /^(.+?)\s+(pays|gives|offers|takes|keeps|skims)\s+(?:you\s+)?(\d+(?:\.\d+)?)\s*%$/i.exec(t))) {
    const m = resolveMod(ctx, mm[1]);
    if (m && +mm[3] > 0 && +mm[3] < 100) { const pays = /pays|gives|offers/i.test(mm[2]); const v = pays ? +mm[3] / 100 : 1 - +mm[3] / 100; return modFact(m, v * 0.95, v * 1.05, `${m.label} will ${pays ? 'pay' : 'take'} ${mm[3]}%, so a price lands at about ${Math.round(v * 100)}% of normal.`); }
  }
  if ((mm = /^(.+?)\s+(?:is|=|multiplies by|at)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*(?:to|-|–)\s*[x×]?\s*(\d+(?:\.\d+)?))?$/i.exec(t))) {
    const m = resolveMod(ctx, mm[1]), a = +mm[2], b = mm[3] ? +mm[3] : a;
    if (m && a > 0 && b >= a && b <= 100) return modFact(m, a, b, `${m.label} will multiply a price by ${a === b ? a : a + ' to ' + b}.`);
  }

  // a price
  const s = parseSetting(t, ctx);
  if (s) return { kind: 'price', setting: s };

  // a word
  const w = /^(?:when i say|by)\s+(.+?)\s+i\s+mean\s+(.+)$/i.exec(t) || /^(?:call|treat)\s+(.+?)\s+(?:as|an?|the)\s+(.+)$/i.exec(t) || /^(.+?)\s+(?:is|are|means|mean|counts as|count as|is the same as|are the same as|=)\s+(.+)$/i.exec(t);
  if (w) {
    const term = clean(w[1]).replace(ART, '').toLowerCase(), meansText = clean(w[2]);
    if (term && term.length <= 40 && !/\d/.test(term)) {
      const r = resolve(ctx, meansText);
      if (r) return { kind: 'word', term, means: r.id, label: r.label };
      return { kind: 'unknown', term, meansText };
    }
  }
  return null;
}
