/* Duat add-on: the Economy tab (GM only).
   Turn it on with "economy": "economy.json" in world.json (that file is the starting ledger).
   Saved as one shared row (slug economy-ledger, kept like page details), so it syncs between devices. */
(() => {
  'use strict';
  const D = window.Duat && window.Duat.ext;
  if (!D) return;
  const { S, esc, $, page, persist, isGM, session, withSession, route, show } = D;
  const SLUG = 'economy-ledger', AUTHOR = '@meta';
  const KINDS = { cash: 'Cash', account: 'Account', debt: 'Debt' };
  const CP = { pp: 1000, gp: 100, sp: 10, cp: 1 };

  /* ---------- money ---------- */
  // "5gp 3sp", "1,000gp", "-2sp", "12" (gp) → copper pieces, or null if it isn't money
  function parseMoney(str) {
    const s = String(str || '').trim().toLowerCase();
    if (!s) return null;
    const re = /([+-]?)\s*(\d[\d,]*(?:\.\d+)?|\.\d+)\s*(pp|gp|sp|cp)?/g;
    let m, total = 0, n = 0, rest = s;
    while ((m = re.exec(s))) {
      const v = parseFloat(m[2].replace(/,/g, ''));
      total += (m[1] === '-' ? -1 : 1) * v * CP[m[3] || 'gp'];
      n++; rest = rest.replace(m[0], '');
    }
    if (!n || rest.replace(/[\s,]/g, '')) return null;
    return Math.round(total);
  }
  function fmt(cp) {
    if (cp == null) return 'TBE';
    const neg = cp < 0, a = Math.abs(Math.round(cp));
    const gp = Math.floor(a / 100), sp = Math.floor((a % 100) / 10), c = a % 10;
    return (neg ? '−' : '') + gp.toLocaleString('en-US') + 'gp' + (sp ? ` ${sp}sp` : '') + (c ? ` ${c}cp` : '');
  }

  /* ---------- formulas: + - * / % ^ ( ), numbers, 12%, dice like 2d6, balance, periods, floor/ceil/round/min/max/abs ---------- */
  function evalFormula(src, vars, rng = Math.random) {
    src = String(src || '').trim(); if (!src) throw new Error('The formula is empty');
    const toks = [], re = /\s*(?:(\d*d\d+)|(\d+(?:\.\d+)?|\.\d+)(%?)|([a-z_]+)|(.))/gy;
    let m;
    while (re.lastIndex < src.length && (m = re.exec(src))) {
      if (m[1]) toks.push({ t: 'dice', v: m[1] });
      else if (m[2]) toks.push({ t: 'num', v: parseFloat(m[2]) / (m[3] ? 100 : 1) });
      else if (m[4]) toks.push({ t: 'id', v: m[4] });
      else if (m[5] && m[5].trim()) toks.push({ t: 'op', v: m[5] });
    }
    if (re.lastIndex < src.trimEnd().length) throw new Error('Can’t read that formula');
    let i = 0; const rolls = [];
    const peek = v => toks[i] && toks[i].t === 'op' && toks[i].v === v;
    const eat = v => { if (!peek(v)) throw new Error(`Expected “${v}”`); i++; };
    const FN = { floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs, min: Math.min, max: Math.max };
    function expr() { let a = term(); while (peek('+') || peek('-')) { const o = toks[i++].v; const b = term(); a = o === '+' ? a + b : a - b; } return a; }
    function term() { let a = unary(); while (peek('*') || peek('/') || peek('%')) { const o = toks[i++].v; const b = unary(); a = o === '*' ? a * b : o === '/' ? a / b : a % b; } return a; }
    function unary() { if (peek('-')) { i++; return -unary(); } if (peek('+')) { i++; return unary(); } return pow(); }
    function pow() { const a = atom(); if (peek('^')) { i++; return Math.pow(a, unary()); } return a; }
    function atom() {
      const t = toks[i++]; if (!t) throw new Error('The formula ends too soon');
      if (t.t === 'num') return t.v;
      if (t.t === 'dice') {
        const [n, f] = t.v.split('d').map((x, k) => (k === 0 && x === '' ? 1 : parseInt(x, 10)));
        if (n > 100 || f > 1000 || f < 1) throw new Error('Dice too big');
        const r = Array.from({ length: n }, () => 1 + Math.floor(rng() * f)); rolls.push({ d: t.v, r });
        return r.reduce((x, y) => x + y, 0);
      }
      if (t.t === 'id') {
        const k = t.v.toLowerCase();
        if (peek('(')) {
          if (!FN[k]) throw new Error(`Unknown function “${t.v}”`);
          i++; const args = [expr()]; while (peek(',')) { i++; args.push(expr()); } eat(')'); return FN[k](...args);
        }
        if (k === 'b') return vars.balance;
        if (!(k in vars)) throw new Error(`Unknown word “${t.v}” (use balance or periods)`);
        return vars[k];
      }
      if (t.v === '(') { const v = expr(); eat(')'); return v; }
      throw new Error(`Unexpected “${t.v}”`);
    }
    const value = expr();
    if (i < toks.length) throw new Error(`Unexpected “${toks[i].v}”`);
    if (!Number.isFinite(value)) throw new Error('That doesn’t come out as a number');
    return { value, rolls };
  }
  // roll a formula for n periods against an account → { steps:[{gp, rolls}], deltaCp }
  function runFormula(f, acct, n) {
    n = Math.max(1, Math.min(120, Math.floor(n) || 1));
    let bal = (acct.cp || 0) / 100; const steps = [];
    if (f.each) {
      for (let k = 0; k < n; k++) {
        const r = evalFormula(f.expr, { balance: bal, periods: 1 });
        const gp = Math.round(r.value * 100) / 100; bal += gp; steps.push({ gp, rolls: r.rolls });
      }
    } else {
      const r = evalFormula(f.expr, { balance: bal, periods: n });
      steps.push({ gp: Math.round(r.value * 100) / 100, rolls: r.rolls });
    }
    return { steps, deltaCp: Math.round(steps.reduce((x, s) => x + s.gp, 0) * 100) };
  }
  const rollText = steps => steps.map(s => (s.rolls.length ? s.rolls.map(r => `${r.d}=${r.r.reduce((a, b) => a + b, 0)}`).join(', ') + ' → ' : '') + (s.gp >= 0 ? '+' : '−') + fmt(Math.abs(Math.round(s.gp * 100)))).join('; ');

  /* ---------- the ledger ---------- */
  const R = { model: null, stamp: '', status: '', err: false, open: new Set(), preview: {}, logOpen: false };
  const uid = p => p + '-' + Math.random().toString(36).slice(2, 8);
  const rowOf = () => (S.edits || []).find(x => x.slug === SLUG && x.author === AUTHOR);
  async function load() {
    const row = rowOf();
    if (row && !R.pending && (!R.model || String(row.updated) > String(R.stamp))) {
      try { R.model = JSON.parse(row.text); R.stamp = row.updated; } catch { /* fall through to the seed */ }
    }
    if (!R.model) {
      const res = await fetch(S.world.economy, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`${S.world.economy} → HTTP ${res.status}`);
      R.model = await res.json(); R.fresh = true;
    }
    R.model.accounts = R.model.accounts || []; R.model.formulas = R.model.formulas || []; R.model.log = R.model.log || [];
  }
  let chain = Promise.resolve();
  function save() {
    R.pending = true; R.status = 'Saving…'; R.err = false; paintStatus();
    R.model.updated = new Date().toISOString();
    chain = chain.then(() => persist({ slug: SLUG, author: AUTHOR, text: JSON.stringify(R.model) }, session()))
      .then(j => { R.stamp = (j && j.updated) || R.stamp; R.fresh = false; R.pending = false; R.status = 'Saved'; setTimeout(() => { if (R.status === 'Saved') { R.status = ''; paintStatus(); } }, 1800); })
      .catch(x => { R.pending = false; R.err = true; R.status = `Couldn’t save: ${x.message}`; })
      .finally(paintStatus);
  }
  function paintStatus() { const el = $('.ec-status'); if (el) { el.textContent = R.status; el.classList.toggle('is-err', R.err); } }
  const acct = id => R.model.accounts.find(a => a.id === id);
  function adjust(id, delta, note, how) {
    const a = acct(id); if (!a) return;
    a.cp = (a.cp || 0) + delta;
    R.model.log.push({ t: new Date().toISOString(), id, name: a.name, delta, bal: a.cp, note: note || '', how: how || '' });
    R.model.log = R.model.log.slice(-100);
    save(); paint();
  }
  function setBal(id, cp) {
    const a = acct(id); if (!a) return;
    const was = a.cp; a.cp = cp;
    R.model.log.push({ t: new Date().toISOString(), id, name: a.name, delta: cp - (was || 0), bal: cp, note: was == null ? 'first balance' : 'set', how: 'set', was });
    R.model.log = R.model.log.slice(-100);
    save(); paint();
  }
  function undo() {
    const l = R.model.log.pop(); if (!l) return;
    const a = acct(l.id);
    if (a) a.cp = l.how === 'set' ? (l.was === undefined ? a.cp - l.delta : l.was) : (a.cp || 0) - l.delta;
    save(); paint();
  }

  /* ---------- view ---------- */
  const ownerLink = o => {
    const e = o && S.entries.find(x => x.slug === String(o).toLowerCase());
    return e ? `<a href="#/e/${esc(e.slug)}">${esc(e.title)}</a>` : esc(o || '');
  };
  const adjForm = a => {
    const debt = a.kind === 'debt', tbe = a.cp == null;
    return `<form class="ec-adj" data-acct="${esc(a.id)}" autocomplete="off">
      <input name="amt" inputmode="text" placeholder="${tbe ? 'Set balance' : 'e.g. 5gp 3sp'}" aria-label="Amount for ${esc(a.name)}" enterkeyhint="done">
      ${tbe ? '' : `<button type="button" data-do="sub" title="${debt ? 'Pay off' : 'Spend / take out'}" aria-label="${debt ? 'Pay' : 'Subtract'}">−</button>
      <button type="button" data-do="add" title="${debt ? 'Owe more' : 'Add'}" aria-label="${debt ? 'Owe more' : 'Add'}">+</button>`}
      <button type="button" data-do="set" class="ec-set" title="Set the balance to exactly this">${tbe ? 'Set' : '='}</button></form>`;
  };
  const formulaBox = a => {
    const fs = R.model.formulas.filter(f => f.account === a.id);
    if (!fs.length || a.cp == null) return '';
    return `<div class="ec-forms">${fs.map(f => {
      const p = R.preview[f.id];
      return `<div class="ec-formula" data-f="${esc(f.id)}"><span class="ec-fname">${esc(f.name)}</span>
        <label class="ec-per">× <input type="number" min="1" max="120" value="${p ? p.n : f.periods || 1}" data-per> ${esc(f.per || 'period')}${(p ? p.n : f.periods || 1) == 1 ? '' : 's'}</label>
        <button type="button" data-do="roll">Roll</button>
        ${p ? `<div class="ec-roll${p.err ? ' is-err' : ''}">${p.err ? esc(p.err) : `<b>${p.res.deltaCp >= 0 ? '+' : ''}${fmt(p.res.deltaCp)}</b> <span class="muted">${esc(rollText(p.res.steps))}</span>
          <span class="ec-roll-act"><button type="button" class="primary" data-do="apply">Apply</button><button type="button" data-do="reroll">Reroll</button><button type="button" data-do="drop">✕</button></span>`}</div>` : ''}</div>`;
    }).join('')}</div>`;
  };
  const tile = a => `<article class="ec-tile${a.cp == null ? ' is-tbe' : ''}${a.cp != null && a.cp < 0 ? ' is-neg' : ''}">
      <header><span class="ec-name">${esc(a.name)}</span></header>
      <p class="ec-bal">${esc(fmt(a.cp))}</p>${adjForm(a)}</article>`;
  const row = a => `<details class="ec-row k-${esc(a.kind)}" data-id="${esc(a.id)}"${R.open.has(a.id) ? ' open' : ''}>
      <summary><span class="ec-rname">${esc(a.name)}<small>${ownerLink(a.owner)}${a.note ? ` · ${esc(a.note)}` : ''}</small></span>
        <span class="ec-kind">${esc(KINDS[a.kind] || a.kind)}</span><span class="ec-rbal">${a.kind === 'debt' && a.cp != null ? 'owes ' : ''}${esc(fmt(a.cp))}</span></summary>
      <div class="ec-body">${adjForm(a)}${formulaBox(a)}</div></details>`;
  const when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  function paint() {
    const m = R.model, cash = m.accounts.filter(a => a.kind === 'cash'), other = m.accounts.filter(a => a.kind !== 'cash');
    const y = scrollY;
    page(`<div class="wrap ec"><header class="list-head"><p class="kicker">GM only</p><h1>Economy</h1>
      <p class="muted">Tap an account to adjust it. Amounts take gp, sp and cp (<code>5gp 3sp</code>). <span class="ec-status" role="status"></span></p></header>
      <section><h2 class="ec-h">Cash</h2><div class="ec-tiles">${cash.map(tile).join('') || '<p class="muted">No cash accounts yet.</p>'}</div></section>
      <section><h2 class="ec-h">Accounts &amp; debts</h2><div class="ec-rows">${other.map(row).join('') || '<p class="muted">Nothing here yet. Add accounts in Balance settings.</p>'}</div></section>
      <section><details class="ec-log"${R.logOpen ? ' open' : ''}><summary><h2 class="ec-h">History</h2></summary>
        ${m.log.length ? `<ul>${m.log.slice(-30).reverse().map(l => `<li><span class="muted">${esc(when(l.t))}</span> ${esc(l.name || '')} <b>${l.delta >= 0 ? '+' : ''}${esc(fmt(l.delta))}</b> → ${esc(fmt(l.bal))}${l.note ? ` <span class="muted">${esc(l.note)}</span>` : ''}</li>`).join('')}</ul>
        <button type="button" data-do="undo">Undo last</button>` : '<p class="muted">Nothing yet.</p>'}</details></section>
      <p class="ec-foot"><button type="button" class="ec-gear" data-do="settings">⚙ Balance settings</button></p></div>`, 'Economy', 'economy');
    paintStatus(); scrollTo(0, y);
    $('.ec').addEventListener('click', onClick);
    $('.ec').addEventListener('submit', ev => ev.preventDefault());
    $('.ec').addEventListener('toggle', ev => { const d = ev.target; if (d.classList.contains('ec-row')) (d.open ? R.open.add(d.dataset.id) : R.open.delete(d.dataset.id)); if (d.classList.contains('ec-log')) R.logOpen = d.open; }, true);
  }
  function onClick(ev) {
    const b = ev.target.closest('[data-do]'); if (!b) return;
    const act = b.dataset.do, form = b.closest('.ec-adj'), fbox = b.closest('.ec-formula');
    if (form) {
      const id = form.dataset.acct, cp = parseMoney(form.amt.value);
      if (cp == null || (act !== 'set' && cp === 0)) { form.amt.classList.add('is-bad'); form.amt.focus(); return; }
      if (act === 'set') setBal(id, cp);
      else adjust(id, act === 'sub' ? -Math.abs(cp) : Math.abs(cp));
      return;
    }
    if (fbox) {
      const f = R.model.formulas.find(x => x.id === fbox.dataset.f), a = acct(b.closest('.ec-row').dataset.id);
      const n = parseInt($('[data-per]', fbox).value, 10) || 1;
      if (act === 'roll' || act === 'reroll') {
        try { R.preview[f.id] = { n, res: runFormula(f, a, n) }; } catch (x) { R.preview[f.id] = { n, err: x.message }; }
        return paint();
      }
      if (act === 'drop') { delete R.preview[f.id]; return paint(); }
      if (act === 'apply') {
        const p = R.preview[f.id]; if (!p || p.err) return;
        delete R.preview[f.id];
        return adjust(a.id, p.res.deltaCp, `${f.name} ×${p.n} ${f.per || 'period'}${p.n === 1 ? '' : 's'}: ${rollText(p.res.steps)}`, 'formula');
      }
    }
    if (act === 'undo') return undo();
    if (act === 'settings') return settings();
  }

  /* ---------- Balance settings (kept out of the way) ---------- */
  function settings() {
    const dlg = S.dlg, draft = JSON.parse(JSON.stringify({ accounts: R.model.accounts, formulas: R.model.formulas }));
    const accOpts = sel => draft.accounts.map(a => `<option value="${esc(a.id)}"${a.id === sel ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
    const draw = () => {
      dlg.innerHTML = `<form method="dialog" class="ed-form ec-set-form"><p class="kicker">Economy</p><h2>Balance settings</h2>
        <h3 class="ec-h3">Accounts</h3>
        ${draft.accounts.map((a, i) => `<div class="ec-edit" data-i="${i}">
          <input name="name" value="${esc(a.name)}" aria-label="Name" placeholder="Name">
          <input name="owner" value="${esc(a.owner || '')}" aria-label="Owner" placeholder="Owner (page name or text)">
          <select name="kind" aria-label="Kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${a.kind === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
          <input name="note" value="${esc(a.note || '')}" aria-label="Note" placeholder="Note">
          <button type="button" data-s="del-acct" aria-label="Delete ${esc(a.name)}">✕</button></div>`).join('')}
        <button type="button" data-s="add-acct">＋ Account</button>
        <h3 class="ec-h3">Rolled formulas</h3>
        <p class="muted ec-help">Each runs on one account (set it up here, roll it from that account). The result is in gp. Use <code>balance</code>, <code>periods</code>, dice like <code>2d6</code>, <code>+ − * / ^ ( )</code>, <code>5%</code>, <code>floor() round() min() max()</code>.<br>
        Examples: <code>balance * 0.02 * periods</code> · <code>balance * (1d6) / 100</code> · <code>2d6 * periods</code> · <code>balance * ((1.05)^periods − 1)</code> (use <code>-</code>)</p>
        ${draft.formulas.map((f, i) => `<div class="ec-edit ec-fedit" data-i="${i}">
          <input name="fname" value="${esc(f.name)}" aria-label="Formula name" placeholder="Name">
          <select name="facct" aria-label="Account">${accOpts(f.account)}</select>
          <input name="expr" value="${esc(f.expr)}" aria-label="Formula" placeholder="balance * 0.02 * periods" spellcheck="false" autocapitalize="off">
          <input name="per" value="${esc(f.per || '')}" aria-label="Period name" placeholder="month" size="7">
          <input name="periods" type="number" min="1" value="${f.periods || 1}" aria-label="Default periods">
          <label class="ec-chk"><input type="checkbox" name="each"${f.each ? ' checked' : ''}> roll each period</label>
          <button type="button" data-s="test" aria-label="Test roll">🎲 Test</button><button type="button" data-s="del-f" aria-label="Delete formula">✕</button>
          <p class="ec-test muted" hidden></p></div>`).join('')}
        <button type="button" data-s="add-f">＋ Formula</button>
        <p class="ed-err" hidden></p>
        <div class="ed-actions"><span></span><button type="button" data-cancel>Cancel</button><button value="ok" class="primary">Save</button></div></form>`;
      show(dlg);
      const f = $('form', dlg);
      f.addEventListener('click', ev => {
        const b = ev.target.closest('[data-s]'); if (!b) return;
        read(f); const i = parseInt((b.closest('.ec-edit') || {}).dataset?.i, 10);
        if (b.dataset.s === 'add-acct') draft.accounts.push({ id: uid('acct'), name: 'New account', owner: '', kind: 'account', cp: 0 });
        else if (b.dataset.s === 'del-acct') { if (!confirm(`Delete “${draft.accounts[i].name}”? Its balance goes with it.`)) return; const id = draft.accounts[i].id; draft.accounts.splice(i, 1); draft.formulas = draft.formulas.filter(x => x.account !== id); }
        else if (b.dataset.s === 'add-f') draft.formulas.push({ id: uid('f'), name: 'New formula', account: (draft.accounts.find(a => a.kind !== 'cash') || draft.accounts[0] || {}).id || '', expr: 'balance * 0.02 * periods', per: 'month', periods: 1, each: false });
        else if (b.dataset.s === 'del-f') draft.formulas.splice(i, 1);
        else if (b.dataset.s === 'test') {
          const fo = draft.formulas[i], a = draft.accounts.find(x => x.id === fo.account) || { cp: 0 }, out = $('.ec-test', b.closest('.ec-edit'));
          try { const r = runFormula(fo, a, fo.periods || 1); out.textContent = `Sample roll: ${rollText(r.steps)} (total ${r.deltaCp >= 0 ? '+' : ''}${fmt(r.deltaCp)})`; }
          catch (x) { out.textContent = x.message; }
          out.hidden = false; return;
        } else return;
        draw();
      });
      f.addEventListener('submit', ev => {
        if (ev.submitter && ev.submitter.dataset.cancel !== undefined) return;
        ev.preventDefault(); read(f);
        for (const fo of draft.formulas) { try { evalFormula(fo.expr, { balance: 100, periods: 1 }); } catch (x) { const e = $('.ed-err', f); e.textContent = `“${fo.name}”: ${x.message}.`; e.hidden = false; return; } }
        R.model.accounts = draft.accounts; R.model.formulas = draft.formulas; R.preview = {};
        save(); dlg.close(); paint();
      });
    };
    const read = f => {
      $$('.ec-edit', f).forEach(r => {
        const i = parseInt(r.dataset.i, 10), g = n => (r.querySelector(`[name=${n}]`) || {});
        if (r.classList.contains('ec-fedit')) {
          Object.assign(draft.formulas[i], { name: g('fname').value.trim() || 'Formula', account: g('facct').value, expr: g('expr').value.trim(), per: g('per').value.trim(), periods: Math.max(1, parseInt(g('periods').value, 10) || 1), each: g('each').checked });
        } else Object.assign(draft.accounts[i], { name: g('name').value.trim() || 'Account', owner: g('owner').value.trim(), kind: g('kind').value, note: g('note').value.trim() });
      });
    };
    const $$ = (s, r) => [...r.querySelectorAll(s)];
    draw();
  }

  /* ---------- the route ---------- */
  D.views.economy = async function () {
    if (!isGM()) {
      page(`<div class="wrap ec"><header class="list-head"><p class="kicker">GM only</p><h1>Economy</h1></header>
        <p>The ledger is for the GM. <button type="button" class="primary" data-ec-in>Sign in</button></p></div>`, 'Economy', 'economy');
      $('[data-ec-in]').addEventListener('click', () => withSession(S.dlg, 'Sign in', () => { if (S.dlg.open) S.dlg.close(); route(); }));
      return;
    }
    page('<div class="wrap ec"><p class="muted">Opening the ledger…</p></div>', 'Economy', 'economy');
    try { await load(); } catch (x) { return page(`<div class="wrap ec"><p class="ed-err">Couldn’t open the ledger: ${esc(x.message)}</p></div>`, 'Economy', 'economy'); }
    if (location.hash.replace(/^#\/?/, '') === 'economy') paint();
  };
})();
