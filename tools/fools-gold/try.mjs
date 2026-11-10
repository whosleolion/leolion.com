import { compileWorld } from '../../src/building/fools-gold/js/world.js';
import { parse, queryToText } from '../../src/building/fools-gold/js/parser.js';
import { estimate } from '../../src/building/fools-gold/js/engine.js';
import { analyze } from '../../src/building/fools-gold/js/unstated.js';
import { formatMoney, formatRange } from '../../src/building/fools-gold/js/money.js';
import { WORLD_PRESETS } from '../../src/building/fools-gold/js/data.js';
const w = WORLD_PRESETS[process.argv[2] || 'vcm']();
const ctx = compileWorld(w);
for (const s of process.argv.slice(3)) {
  const r = parse(s, ctx);
  console.log('\n>', s, '\n  ', JSON.stringify(r.query), '\n   unrec:', r.unrecognized, 'sugg:', r.suggestions.map(x=>x.from+'→'+x.to), 'notes:', r.notes);
  console.log('   text:', queryToText(r.query, ctx));
  const e = estimate(r.query, ctx);
  if (!e.ok) { console.log('   ', e.error, JSON.stringify(e.conflicts)); continue; }
  console.log('   =>', formatMoney(e.typical, w.currency), '(', formatRange(e.lo, e.hi, w.currency), ')');
  for (const f of e.factors) console.log('     ', f.label.padEnd(36), (+f.lo.toFixed(2)) + '-' + (+f.hi.toFixed(2)), f.weight!==undefined?'w'+f.weight:'', '->', formatMoney((f.runLo*f.runHi)**.5, w.currency));
  console.log('   notes', e.notes, 'assume', e.assumptions.map(a=>a.text));
  const a = analyze(r.query, e, ctx);
  for (const d of a.dimensions) console.log('   ?', d.ask, d.options.map(o => o.label + ' ' + formatMoney(o.typical, w.currency)).join(' | '));
}
