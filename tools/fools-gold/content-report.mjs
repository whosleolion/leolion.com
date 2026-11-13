// Prints what the current content patch contains, so a patch's notes can quote real numbers.
// Usage: node tools/fools-gold/content-report.mjs
import { CATALOG } from '../../src/building/fools-gold/js/data.js';
import { CONTENT, contentLabel, contentCounts } from '../../src/building/fools-gold/js/content.js';
const c = contentCounts(CATALOG);
const aliases = CATALOG.reduce((n, e) => n + (e.aliases || []).length, 0);
const derived = CATALOG.filter(e => (e.tags || []).includes('derived')).length;
console.log(contentLabel(), '(' + CONTENT.date + ')', '-', CONTENT.title);
console.log('entries', c.total, '| SRD', c.srd, '| Fantasy', c.fantasy, '| Sci-fi', c.scifi, '| Modern', c.modern);
console.log('aliases', aliases, '| flagged as derived estimates', derived);
