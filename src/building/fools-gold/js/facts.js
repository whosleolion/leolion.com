// Facts typed as a sentence in World settings > Changes: "a healing potion costs 40 gp", "a shiv is a dagger",
// "sellers pay 40%". Read by plain patterns, shown back for confirmation, then saved as a price, a word or a dial.
import { parseSetting } from './setting.js?v=c198cc38';

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
