// Money formatting: Base Units -> the world's coins. Pure functions, no DOM.

export function niceRound(v, sig = 2) {
  if (!isFinite(v) || v === 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - (sig - 1));
  return Math.round(v / p) * p;
}

const group = n => n.toLocaleString('en-US', { maximumFractionDigits: 20 });
function decimal(n) {
  if (n >= 100) return group(Math.round(n));
  if (n >= 10) return group(+n.toFixed(1));
  if (n >= 1) return String(+n.toFixed(2));
  return String(+n.toPrecision(2));
}
function label(d, n) { return n === 1 ? d.name : (d.plural || d.name + 's'); }
export const short = d => d.id;

// Format a Base Unit value. Rounds to 2 significant figures first (estimates, not appraisals).
export function formatMoney(bu, currency, opts = {}) {
  const dens = [...currency.denominations].sort((a, b) => b.bu - a.bu);
  const abbr = (opts.long || dens.length === 1) ? (d, n) => label(d, n) : d => d.id;
  const mode = currency.belowSmallest || 'decimals';
  let v = opts.exact ? bu : niceRound(bu, 2);
  if (v <= 0) return '0 ' + abbr(dens[dens.length - 1], 0);
  if (dens.length === 1) {
    const d = dens[0];
    let n = v / d.bu;
    if (mode === 'round') { n = Math.max(1, Math.round(n)); return group(n) + ' ' + abbr(d, n); }
    n = n < 10 ? +n.toPrecision(2) : Math.round(n * 10) / 10;
    if (n >= 100) n = Math.round(n);
    return group(n) + ' ' + abbr(d, n);
  }
  const smallest = dens[dens.length - 1];
  if (v < smallest.bu) {
    if (mode === 'round') return '1 ' + abbr(smallest, 1);
    const n = v / smallest.bu;
    return decimal(n) + ' ' + abbr(smallest, n);
  }
  const parts = [];
  let rest = v;
  for (let i = 0; i < dens.length && parts.length < 2; i++) {
    const d = dens[i];
    const n = Math.floor(rest / d.bu + 1e-9);
    if (n > 0) { parts.push(group(n) + ' ' + abbr(d, n)); rest -= n * d.bu; }
    else if (parts.length) break;
  }
  // If a tiny remainder in a lower coin would be dropped, that is fine: estimates.
  return parts.join(' ');
}

// Short form for tight places, e.g. a range endpoint: same as formatMoney.
export function formatRange(lo, hi, currency) {
  const a = formatMoney(lo, currency), b = formatMoney(hi, currency);
  if (a === b) return a;
  // Collapse shared coin: "8 gp to 17 gp" -> "8 to 17 gp" when both are single-coin.
  const ma = /^([\d.,]+) (\S+)$/.exec(a), mb = /^([\d.,]+) (\S+)$/.exec(b);
  if (ma && mb && ma[2] === mb[2]) return ma[1] + ' to ' + mb[1] + ' ' + mb[2];
  return a + ' to ' + b;
}

// Parse a typed amount like "5 gp 3 sp" or "250" (BU) in a given currency.
export function parseMoney(text, currency) {
  const t = String(text).trim().toLowerCase();
  if (!t) return null;
  const dens = currency.denominations;
  let total = 0, found = false;
  const re = /([\d.,]+)\s*([a-z]+)?/g;
  let m;
  while ((m = re.exec(t))) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (isNaN(n)) continue;
    const d = m[2] ? dens.find(x => x.id === m[2] || x.name === m[2] || x.plural === m[2]) : null;
    total += n * (d ? d.bu : 1);
    found = true;
  }
  return found ? total : null;
}
