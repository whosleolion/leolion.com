/* =========================================================
   DUAT — lightweight campaign catalog engine
   ---------------------------------------------------------
   A campaign is a folder containing:
     index.html      shell that loads this script
     world.json      title, theme, and the list of entries
     entries/*.md    one Markdown file per entry (frontmatter + body)
     images/         portraits, maps, etc.
   No build step: edit a .md file, list it in world.json, push.
   ========================================================= */
(() => {
  'use strict';

  const DEFAULT_TYPES = {
    map:       { label: 'Maps',       one: 'Map',       color: '#6fb3ff' },
    character: { label: 'Characters', one: 'Character', color: '#ff8a5c' },
    location:  { label: 'Locations',  one: 'Location',  color: '#7ddc8a' },
    faction:   { label: 'Factions',   one: 'Faction',   color: '#c792ff' },
    item:      { label: 'Items',      one: 'Item',      color: '#ffd166' },
    session:   { label: 'Sessions',   one: 'Session',   color: '#8fd3d6' },
    note:      { label: 'Notes',      one: 'Note',      color: '#a4abb8' },
  };
  // Frontmatter keys the engine uses itself; every other key becomes an infobox row.
  const RESERVED = new Set(['title', 'type', 'aliases', 'alias', 'tags', 'summary', 'image', 'order', 'hidden', 'pins', 'author', 'major', 'overlay']);
  const ITEM_RE = /^\s*([-*+]|\d+[.)])\s+/;
  const WL_RE = /\[\[([^\]]+)\]\]/g;

  const S = { world: null, entries: [], lookup: new Map(), types: {}, typeOrder: [], edit: false, cleanup: null };

  /* ---------- small helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').trim().toLowerCase();
  const slugify = s => norm(s).replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const protectPipes = s => s.replace(/\[\[[^\]]*\]\]/g, m => m.replace(/\|/g, '\u0001'));
  const restorePipes = s => s.replace(/\u0001/g, '|');
  const toArray = v => Array.isArray(v) ? v : (v === '' || v == null || typeof v === 'boolean') ? [] : String(v).split(',').map(x => x.trim()).filter(Boolean);
  const safeUrl = u => /^\s*(javascript|vbscript|data):/i.test(u) ? '#' : u;
  const asset = u => /^(https?:)?\/\//.test(u) || u.startsWith('/') || u.includes('/') ? safeUrl(u) : 'images/' + u;
  const href = e => '#/e/' + e.slug.split('/').map(encodeURIComponent).join('/');
  const typeOf = t => S.types[t] || (S.types[t] = { label: cap(t) + 's', one: cap(t), color: '#a4abb8' });
  const byTitle = (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.title.localeCompare(b.title, undefined, { numeric: true });

  /* ---------- frontmatter ---------- */
  function scalar(v) {
    v = v.trim();
    if (/^(['"]).*\1$/.test(v)) return v.slice(1, -1);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  }
  function parseFrontmatter(text) {
    text = text.replace(/\r\n?/g, '\n');
    const fm = {};
    if (!text.startsWith('---\n')) return { fm, body: text };
    const end = text.indexOf('\n---', 3);
    if (end === -1) return { fm, body: text };
    const after = text.indexOf('\n', end + 1);
    const body = after === -1 ? '' : text.slice(after + 1);
    let key = null;
    for (const line of text.slice(4, end).split('\n')) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const li = line.match(/^\s*-\s+(.*)$/);
      if (li && key) {
        if (!Array.isArray(fm[key])) fm[key] = [];
        fm[key].push(scalar(li[1]));
        continue;
      }
      const m = line.match(/^(\w[\w -]*?)\s*:(?:\s+(.*)|$)/);
      if (!m) continue;
      key = m[1].toLowerCase();
      const v = (m[2] || '').trim();
      fm[key] = /^\[(?!\[)[\s\S]*\]$/.test(v) ? v.slice(1, -1).split(',').map(scalar).filter(x => x !== '') : scalar(v);
    }
    return { fm, body };
  }

  /* ---------- markdown (the subset we need, plus [[wikilinks]] and callouts) ---------- */
  function isBlockStart(l) {
    return /^\s*(#{1,6}\s|```|~~~|>)|^:::/.test(l) || ITEM_RE.test(l) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(l) || /^\s*\|/.test(l);
  }
  function blocks(lines) {
    let out = '', i = 0, m;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      if ((m = line.match(/^:::\s*([\w-]+)\s*$/))) {
        // ::: author … ::: — one person's account, attributed (see world.json "authors")
        const buf = []; i++;
        while (i < lines.length && !/^:::\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        const a = authorOf(m[1]);
        out += `<section class="account" style="--c:${a.color}"><header class="account-by"><a href="#/by/${esc(a.id)}">${esc(a.name)}’s notes</a>${a.role ? `<span>${esc(a.role)}</span>` : ''}</header>${blocks(buf)}</section>`;
        continue;
      }
      if ((m = line.match(/^\s*(```|~~~)/))) {
        const buf = []; i++;
        while (i < lines.length && !lines[i].trim().startsWith(m[1])) buf.push(lines[i++]);
        i++;
        out += `<pre><code>${esc(buf.join('\n'))}</code></pre>`;
        continue;
      }
      if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
        const lvl = Math.min(6, m[1].length + 1); // the entry title owns <h1>
        out += `<h${lvl} id="${slugify(m[2])}">${inline(m[2])}</h${lvl}>`;
        i++; continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out += '<hr>'; i++; continue; }

      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
        const c = buf[0].match(/^\[!(\w+)\][-+]?\s*(.*)$/);
        if (c) {
          const kind = c[1].toLowerCase();
          out += `<aside class="callout callout-${esc(kind)}"><div class="callout-title">${inline(c[2] || cap(kind))}</div>${blocks(buf.slice(1))}</aside>`;
        } else {
          out += `<blockquote>${blocks(buf)}</blockquote>`;
        }
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
        const row = l => protectPipes(l.trim()).replace(/^\||\|$/g, '').split('|').map(c => restorePipes(c.trim()));
        const head = row(line); i += 2;
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(row(lines[i++]));
        out += `<div class="table-wrap"><table><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${
          rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        continue;
      }
      if (ITEM_RE.test(line)) {
        const buf = [];
        while (i < lines.length && (ITEM_RE.test(lines[i]) || (buf.length && /^\s{2,}\S/.test(lines[i])))) buf.push(lines[i++]);
        out += list(buf);
        continue;
      }
      const buf = [lines[i++].trim()];
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++].trim());
      out += `<p>${buf.map(inline).join('<br>')}</p>`;
    }
    return out;
  }
  function list(lines) {
    const indent = l => l.match(/^\s*/)[0].replace(/\t/g, '  ').length;
    const base = indent(lines[0]);
    const tag = /^\s*\d/.test(lines[0]) ? 'ol' : 'ul';
    const items = [];
    for (const l of lines) {
      const m = l.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
      if (m && indent(l) <= base) items.push({ text: m[1], sub: [] });
      else if (items.length) items[items.length - 1].sub.push(l);
    }
    return `<${tag}>${items.map(it => {
      const task = it.text.match(/^\[([ xX])\]\s+(.*)$/);
      let html = task ? `<input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> ${inline(task[2])}` : inline(it.text);
      const first = it.sub.findIndex(s => ITEM_RE.test(s));
      const cont = first === -1 ? it.sub : it.sub.slice(0, first);
      if (cont.length) html += ' ' + inline(cont.map(s => s.trim()).join(' '));
      if (first !== -1) html += list(it.sub.slice(first));
      return `<li${task ? ' class="task"' : ''}>${html}</li>`;
    }).join('')}</${tag}>`;
  }
  function inline(s) {
    const stash = [];
    const keep = html => `\u0000${stash.push(html) - 1}\u0000`;
    s = String(s ?? '')
      .replace(/`([^`]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`))
      .replace(/!\[\[([^\]]+)\]\]/g, (_, t) => keep(embed(t)))
      .replace(WL_RE, (_, t) => keep(wikilink(t)))
      .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt, src) => keep(`<img src="${esc(asset(src))}" alt="${esc(alt)}" loading="lazy">`))
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, txt, url) => keep(
        /^https?:/.test(url)
          ? `<a href="${esc(url)}" target="_blank" rel="noopener">${inline(txt)}</a>`
          : `<a href="${esc(safeUrl(url))}">${inline(txt)}</a>`));
    s = esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*(?![\s*])(.+?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/(^|[^\w])_(?![\s_])(.+?)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/==(.+?)==/g, '<mark>$1</mark>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, n) => stash[n]);
  }
  function wikilink(raw) {
    const [target, label] = raw.split('|').map(x => x.trim());
    const e = resolve(target);
    const text = esc(label || (e ? e.title : target.split('#')[0]));
    return e
      ? `<a class="wl" href="${href(e)}" style="--c:${typeOf(e.type).color}" data-type="${esc(e.type)}">${text}</a>`
      : `<span class="wl wl-missing" title="No entry yet">${text}</span>`;
  }
  function embed(raw) {
    const [target, alt] = raw.split('|').map(x => x.trim());
    if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(target)) return `<img src="${esc(asset(target))}" alt="${esc(alt || '')}" loading="lazy">`;
    return wikilink(raw);
  }
  function plain(s) {
    return String(s ?? '')
      .replace(/!\[\[[^\]]*\]\]/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, (_, t) => t.split('#')[0])
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_~=`]+/g, '').replace(/\s+/g, ' ').trim();
  }
  function authorOf(id) {
    id = norm(id);
    const a = (S.world.authors || {})[id] || {};
    return { id, name: a.name || cap(id), role: a.role || '', color: a.color || 'var(--accent)' };
  }
  const md = text => blocks(String(text ?? '').replace(/\r\n?/g, '\n').split('\n'));

  /* ---------- entries ---------- */
  function parsePin(line) {
    const l = protectPipes(line.trim());
    if (!l || l.startsWith('//') || l.startsWith('#')) return null;
    const m = l.match(/^(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\|\s*([^|]+?)\s*(?:\|\s*(.*))?$/);
    if (!m) return null;
    const t = restorePipes(m[3]);
    const wl = t.match(/^\[\[(.+)\]\]$/);
    const [target, label] = wl ? wl[1].split('|').map(x => x.trim()) : [null, t];
    return { x: +m[1], y: +m[2], target, label: label || null, note: m[4] ? restorePipes(m[4]) : '' };
  }
  function autoSummary(body) {
    for (const block of body.replace(/^:::.*$/gm, '').split(/\n\s*\n/)) {
      const t = block.trim();
      if (!t || /^(#|```|~~~|>|\||!\[|[-*+]\s|\d+[.)]\s|---)/.test(t)) continue;
      const p = plain(t);
      return p.length > 180 ? p.slice(0, 180).replace(/\s+\S*$/, '') + '…' : p;
    }
    return '';
  }
  function parseEntry(slug, text) {
    let { fm, body } = parseFrontmatter(text);
    const pins = [];
    body = body.replace(/^```pins[^\n]*\n([\s\S]*?)^```[ \t]*$/gm, (_, block) => {
      block.split('\n').forEach(l => { const p = parsePin(l); if (p) pins.push(p); });
      return '';
    });
    let title = fm.title;
    if (!title) {
      const h = body.match(/^\s*#\s+(.+)$/m);
      if (h && !body.slice(0, h.index).trim()) { title = h[1].trim(); body = body.slice(h.index + h[0].length); }
    }
    return {
      slug, fm, body, pins,
      title: String(title || cap(slug.split('/').pop().replace(/[-_]+/g, ' '))),
      type: norm(fm.type || 'note'),
      aliases: toArray(fm.aliases ?? fm.alias),
      tags: toArray(fm.tags).map(t => String(t).replace(/^#/, '')),
      image: fm.image ? String(fm.image) : '',
      summary: fm.summary ? String(fm.summary) : autoSummary(body),
      order: fm.order != null && !isNaN(+fm.order) ? +fm.order : null,
      hidden: fm.hidden === true,
      authors: [...new Set([...toArray(fm.author), ...[...body.matchAll(/^:::\s*([\w-]+)\s*$/gm)].map(m => m[1])].map(norm))],
      backlinks: [], onMaps: [],
    };
  }
  function resolve(target) {
    if (!target) return null;
    const t = target.split('#')[0];
    return S.lookup.get(norm(t)) || S.lookup.get(slugify(t)) || null;
  }
  function index() {
    const add = (k, e) => { if (k && !S.lookup.has(k)) S.lookup.set(k, e); };
    S.entries.forEach(e => add(norm(e.slug), e));
    S.entries.forEach(e => [e.title, ...e.aliases].forEach(n => { add(norm(n), e); add(slugify(n), e); }));
    for (const e of S.entries) {
      const src = [e.body, ...Object.values(e.fm).flat().filter(v => typeof v === 'string')].join('\n');
      const out = new Set([...src.matchAll(WL_RE)].map(m => resolve(m[1].split('|')[0])).filter(x => x && x !== e));
      out.forEach(t => t.backlinks.push(e));
      for (const p of e.pins) {
        p.entry = resolve(p.target);
        p.label = p.label || (p.entry ? p.entry.title : p.target) || '?';
        if (p.entry && p.entry !== e) p.entry.onMaps.push({ map: e, pin: p });
      }
      e.hay = norm([e.title, ...e.aliases, ...e.tags, e.summary, plain(e.body), ...e.pins.map(p => p.label + ' ' + p.note)].join(' '));
    }
  }
  const listed = () => S.entries.filter(e => !e.hidden);
  // world.json "navTypes": the types that get a nav chip and a home section; everything else is reached via maps, links or search
  const navTypes = () => S.world.navTypes || S.typeOrder;
  const sorter = t => (S.world.newestFirst || []).includes(t) ? (a, b) => byTitle(b, a) : byTitle;

  /* ---------- search ---------- */
  function search(q) {
    q = norm(q);
    if (!q) return [];
    const words = q.split(/\s+/);
    return listed().map(e => {
      const t = norm(e.title);
      let s = t === q ? 100 : t.startsWith(q) ? 60 : t.includes(q) ? 40 : 0;
      if (e.aliases.some(a => norm(a).includes(q))) s += 30;
      if (e.tags.some(x => norm(x) === q)) s += 20;
      if (words.every(w => e.hay.includes(w))) s += 10;
      return { e, s };
    }).filter(r => r.s > 0).sort((a, b) => b.s - a.s || byTitle(a.e, b.e)).map(r => r.e);
  }

  /* ---------- chrome ---------- */
  function renderChrome(root) {
    const w = S.world;
    root.innerHTML = `
      <div class="chrome">
        <header class="topbar">
          <a class="brand" href="#/"><span class="brand-short">${esc(w.short || w.title)}</span><span class="brand-full">${esc(w.title)}</span></a>
          <div class="search" role="search">
            <input type="search" placeholder="Search" aria-label="Search the catalog" autocomplete="off" spellcheck="false">
            <kbd class="search-key" aria-hidden="true">/</kbd>
            <div class="search-results" role="listbox" hidden></div>
          </div>
          ${w.edit ? '<button type="button" class="new-btn" data-new aria-label="Add a new page">＋ New</button>' : ''}
        </header>
        <nav class="typenav" aria-label="Browse by type"></nav>
      </div>
      <main id="main" tabindex="-1"></main>
      <footer class="foot"><span>${esc(w.title)}</span><button type="button" class="foot-duat">catalogued in Duat</button></footer>`;
    const counts = {};
    listed().forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; });
    $('.typenav').innerHTML = `<a href="#/" data-nav="home">Home</a>` + navTypes().filter(t => counts[t]).map(t =>
      `<a href="#/t/${encodeURIComponent(t)}" data-nav="t/${esc(t)}" style="--c:${typeOf(t).color}">${esc(typeOf(t).label)}<span>${counts[t]}</span></a>`).join('');
    wireSearch();
    const measure = () => document.documentElement.style.setProperty('--chrome-h', $('.chrome').offsetHeight + 'px');
    measure();
    new ResizeObserver(measure).observe($('.chrome'));
  }
  function wireSearch() {
    const input = $('.search input'), box = $('.search-results');
    let hits = [], cur = 0;
    const draw = () => {
      box.innerHTML = hits.length
        ? hits.slice(0, 8).map((e, i) => `<a href="${href(e)}" role="option" class="${i === cur ? 'is-cur' : ''}" style="--c:${typeOf(e.type).color}">
            <span class="sr-type">${esc(typeOf(e.type).one)}</span><span class="sr-title">${esc(e.title)}</span></a>`).join('')
          + (hits.length > 8 ? `<a href="#/s/${encodeURIComponent(input.value)}" class="sr-more">All ${hits.length} results →</a>` : '')
        : `<div class="sr-empty">Nothing matches “${esc(input.value)}”</div>`;
      box.hidden = !input.value.trim();
    };
    input.addEventListener('input', () => { hits = search(input.value); cur = 0; draw(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = Math.min(hits.length, 8);
        if (n) { cur = (cur + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; draw(); }
      } else if (e.key === 'Enter') {
        if (hits[cur]) location.hash = href(hits[cur]).slice(1);
        else if (input.value.trim()) location.hash = '/s/' + encodeURIComponent(input.value.trim());
        closeSearch(true);
      } else if (e.key === 'Escape') closeSearch(true);
    });
    input.addEventListener('focus', () => { if (input.value.trim()) box.hidden = false; });
    box.addEventListener('click', () => closeSearch(true));
    document.addEventListener('click', e => { if (!e.target.closest('.search')) box.hidden = true; });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); input.select(); }
    });
  }
  function closeSearch(clear) {
    const input = $('.search input');
    if (!input) return;
    $('.search-results').hidden = true;
    if (clear) { input.value = ''; input.blur(); }
  }

  /* ---------- views ---------- */
  function card(e) {
    const t = typeOf(e.type);
    return `<a class="card${e.type === 'map' ? ' card-map' : ''}" href="${href(e)}" style="--c:${t.color}">
      ${e.image ? `<span class="card-img"><img src="${esc(asset(e.image))}" alt="" loading="lazy"></span>` : ''}
      <span class="card-body">
        <span class="kicker">${esc(t.one)}</span>
        <span class="card-title">${esc(e.title)}</span>
        ${e.summary ? `<span class="card-sum">${esc(plain(e.summary))}</span>` : ''}
      </span></a>`;
  }
  const grid = list => `<div class="grid">${list.map(card).join('')}</div>`;
  const setNav = key => document.querySelectorAll('.typenav a').forEach(a => a.classList.toggle('is-on', a.dataset.nav === key));
  function page(html, title, nav) {
    $('#main').innerHTML = html;
    document.title = (title ? title + ' · ' : '') + (S.world.title || 'Duat');
    setNav(nav);
  }

  function viewHome() {
    const w = S.world, home = resolve(w.home);
    const sections = navTypes().map(t => {
      const list = listed().filter(e => e.type === t).sort(sorter(t));
      if (!list.length) return '';
      const shown = t === 'map' ? list : list.slice(0, 6);
      return `<section class="home-sec" style="--c:${typeOf(t).color}">
        <h2><a href="#/t/${encodeURIComponent(t)}">${esc(typeOf(t).label)}</a>${list.length > shown.length ? `<a class="more" href="#/t/${encodeURIComponent(t)}">all ${list.length} →</a>` : ''}</h2>
        ${grid(shown)}</section>`;
    }).join('');
    page(`<div class="wrap home">
      <header class="hero">
        ${w.kicker ? `<p class="kicker">${esc(w.kicker)}</p>` : ''}
        <h1>${esc(w.title)}</h1>
        ${w.subtitle ? `<p class="hero-sub">${inline(w.subtitle)}</p>` : ''}
      </header>
      ${home ? `<div class="prose home-intro">${md(home.body)}</div>` : ''}
      ${sections}
    </div>`, '', 'home');
  }

  function viewType(t, tag) {
    const list = listed().filter(e => (t ? e.type === t : true) && (tag ? e.tags.some(x => norm(x) === norm(tag)) : true)).sort(t ? sorter(t) : byTitle);
    const title = tag ? `#${tag}` : typeOf(t).label;
    page(`<div class="wrap">
      <header class="list-head" style="--c:${t ? typeOf(t).color : 'var(--accent)'}">
        <p class="kicker">${tag ? 'Tag' : 'Browse'}</p><h1>${esc(title)}</h1><p class="muted">${list.length} ${list.length === 1 ? 'entry' : 'entries'}</p>
      </header>
      ${list.length ? grid(list) : '<p class="muted">Nothing here yet.</p>'}
    </div>`, title, t ? 't/' + t : '');
  }

  function viewAuthor(id) {
    const a = authorOf(id);
    const list = listed().filter(e => e.authors.includes(id)).sort((x, y) => S.typeOrder.indexOf(x.type) - S.typeOrder.indexOf(y.type) || sorter(x.type)(x, y));
    page(`<div class="wrap">
      <header class="list-head" style="--c:${a.color}"><p class="kicker">Notes by</p><h1>${esc(a.name)}</h1>
        <p class="muted">${a.role ? esc(a.role) + ' · ' : ''}${list.length} ${list.length === 1 ? 'entry' : 'entries'}</p></header>
      ${list.length ? grid(list) : '<p class="muted">Nothing yet.</p>'}
    </div>`, a.name + '’s notes', '');
  }

  function viewSearch(q) {
    const hits = search(q);
    page(`<div class="wrap">
      <header class="list-head"><p class="kicker">Search</p><h1>“${esc(q)}”</h1><p class="muted">${hits.length} result${hits.length === 1 ? '' : 's'}</p></header>
      ${hits.length ? grid(hits) : '<p class="muted">No matches. Try a shorter word, or a nickname.</p>'}
    </div>`, 'Search', '');
  }

  function viewMissing(slug) {
    page(`<div class="wrap"><header class="list-head"><p class="kicker">Not found</p><h1>${esc(slug)}</h1>
      <p class="muted">There’s no entry by that name (yet). <a href="#/">Back home</a>.</p></header></div>`, 'Not found', '');
  }

  function infobox(e) {
    const rows = Object.entries(e.fm).filter(([k, v]) => !RESERVED.has(k) && v !== '' && !(Array.isArray(v) && !v.length));
    if (!rows.length) return '';
    const val = v => Array.isArray(v) ? v.map(x => inline(String(x))).join(', ') : v === true ? 'Yes' : v === false ? 'No' : inline(String(v));
    return `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${esc(cap(k.replace(/[-_]+/g, ' ')))}</dt><dd>${val(v)}</dd></div>`).join('')}</dl>`;
  }
  function related(e) {
    const back = e.backlinks.filter(b => !b.hidden).sort(byTitle);
    const maps = e.onMaps.map(({ map, pin }) => `<a class="chip" href="${href(map)}?pin=${encodeURIComponent(e.slug)}" style="--c:${typeOf('map').color}">
      ◉ ${esc(map.title)}${pin.label !== e.title ? ` — ${esc(pin.label)}` : ''}</a>`).join('');
    return (maps ? `<section class="related"><h2>On the map</h2><div class="chips">${maps}</div></section>` : '')
      + (back.length ? `<section class="related"><h2>Mentioned in</h2><div class="chips">${back.map(b =>
        `<a class="chip" href="${href(b)}" style="--c:${typeOf(b.type).color}"><span class="chip-type">${esc(typeOf(b.type).one)}</span>${esc(b.title)}</a>`).join('')}</div></section>` : '');
  }

  function byline(e) {
    if (!e.authors.length) return '';
    const inBody = new Set([...e.body.matchAll(/^:::\s*([\w-]+)\s*$/gm)].map(m => norm(m[1])));
    return `<p class="byline">${e.authors.map(id => { const a = authorOf(id);
      return `<a href="#/by/${esc(a.id)}" style="--c:${a.color}">${inBody.has(id) ? '' : 'From '}${esc(a.name)}’s notes</a>`; }).join('')}</p>`;
  }

  function viewEntry(e) {
    const t = typeOf(e.type);
    const side = (e.image ? `<figure class="portrait"><img src="${esc(asset(e.image))}" alt="${esc(e.title)}"></figure>` : '') + infobox(e);
    page(`<article class="wrap entry" style="--c:${t.color}">
      <header class="entry-head">
        ${editButton(e)}
        <p class="kicker"><a href="#/t/${encodeURIComponent(e.type)}">${esc(t.one)}</a></p>
        <h1>${esc(e.title)}</h1>
        ${e.aliases.length ? `<p class="aka">aka ${e.aliases.map(a => `<span>${esc(a)}</span>`).join(', ')}</p>` : ''}
        ${byline(e)}
        ${e.tags.length ? `<p class="tags">${e.tags.map(x => `<a href="#/tag/${encodeURIComponent(x)}">#${esc(x)}</a>`).join('')}</p>` : ''}
      </header>
      <div class="entry-grid${side ? '' : ' no-side'}">
        ${side ? `<aside class="entry-side">${side}</aside>` : ''}
        <div class="entry-main">
          ${e.fm.summary ? `<p class="lede">${inline(e.summary)}</p>` : ''}
          <div class="prose">${e.body.trim() ? md(e.body) : '<p class="muted">No notes for this one yet.</p>'}</div>
          ${related(e)}
        </div>
      </div>
    </article>`, e.title, 't/' + e.type);
  }

  /* ---------- explorable map ---------- */
  function viewMap(m, focus) {
    const mapColor = typeOf('map').color;
    // pins: labels = the pin *is* its label (map-style name plates, no dot).
    const labelMode = norm(m.fm.pins) === 'labels';
    // Label tiers keep a zoomed-out map readable: 1 = major (world.json mapMajorTypes,
    // default every linked pin), 2 = other linked pins, 3 = plain pins. Tiers 2/3 reveal as you zoom.
    const major = m.fm.major ? toArray(m.fm.major).map(norm) : S.world.mapMajorTypes; // per map, else world default
    const tierOf = p => !p.target ? 3 : !p.entry || (major && !major.includes(p.entry.type)) ? 2 : 1;
    page(`<section class="map-view" style="--c:${mapColor}">
      <div class="map-stage${labelMode ? ' label-pins' : ''}" tabindex="0" aria-label="${esc(m.title)}. Drag to pan; pinch, scroll or double-tap to zoom.">
        <img class="map-img" alt="${esc(m.title)}" draggable="false">
        ${m.fm.overlay ? '<img class="map-img map-overlay" alt="" draggable="false">' : ''}
        <div class="map-pins"></div>
        <div class="map-hud">
          <div class="map-title"><span class="kicker">Map</span><h1>${esc(m.title)}</h1></div>
          <div class="map-tools">
            <button type="button" data-act="in" aria-label="Zoom in">+</button>
            <button type="button" data-act="out" aria-label="Zoom out">−</button>
            <button type="button" data-act="fit" aria-label="Show whole map">⤢</button>
            <button type="button" data-act="labels" aria-pressed="true" aria-label="Show labels">Aa</button>
          </div>
        </div>
        <div class="map-card" hidden></div>
        ${S.edit ? '<div class="map-toast">Edit mode — tap the map to copy pin coordinates</div>' : ''}
        <a class="map-more" href="#about-map">About this map ↓</a>
      </div>
      <div class="wrap map-below" id="about-map">
        ${editButton(m)}
        ${m.fm.summary ? `<p class="lede">${inline(m.summary)}</p>` : ''}
        <div class="prose">${md(m.body)}</div>
        ${m.pins.length ? `<section class="related"><h2>On this map</h2><div class="chips">${m.pins.map((p, i) =>
          `<button type="button" class="chip" data-pin="${i}" style="--c:${p.entry ? typeOf(p.entry.type).color : 'var(--muted)'}">${esc(p.label)}</button>`).join('')}</div></section>` : ''}
        ${related(m)}
      </div>
    </section>`, m.title, 't/map');

    const main = $('#main');
    const stage = $('.map-stage', main), img = $('.map-img', main), over = $('.map-overlay', main), layer = $('.map-pins', main), cardEl = $('.map-card', main);
    let W = 1000, H = 1000, s = 1, tx = 0, ty = 0, fitS = 1, raf = 0, sel = -1, touched = false, ready = false;
    const ghosts = [];

    const pins = m.pins.map((p, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pin' + (p.target && !p.entry ? ' pin-missing' : '') + (p.entry ? '' : ' pin-plain') + ' tier-' + tierOf(p);
      el.dataset.i = i;
      el.style.setProperty('--c', p.entry ? typeOf(p.entry.type).color : 'var(--text)');
      el.innerHTML = `<span class="pin-dot"></span><span class="pin-label">${esc(p.label)}</span>`;
      el.setAttribute('aria-label', p.label);
      layer.append(el);
      return { ...p, el };
    });

    const size = () => ({ w: stage.clientWidth, h: stage.clientHeight });
    const maxS = () => Math.max(fitS * 8, 3);
    function limits() { const { w, h } = size(); fitS = Math.min(w / W, h / H) || 1; }
    function clamp() {
      const { w, h } = size();
      limits();
      s = Math.min(maxS(), Math.max(fitS * 0.8, s));
      tx = Math.min(w / 2, Math.max(w / 2 - W * s, tx));
      ty = Math.min(h / 2, Math.max(h / 2 - H * s, ty));
    }
    function draw() {
      raf = 0;
      img.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
      if (over) over.style.transform = img.style.transform;
      stage.classList.toggle('show-t2', W * s >= 1100);
      stage.classList.toggle('show-t3', W * s >= 1600);
      for (const p of [...pins, ...ghosts]) p.el.style.transform = `translate(${tx + p.x / 100 * W * s}px,${ty + p.y / 100 * H * s}px)`;
    }
    const paint = () => { if (!raf) raf = requestAnimationFrame(draw); };
    function fit() { const { w, h } = size(); limits(); s = fitS; tx = (w - W * s) / 2; ty = (h - H * s) / 2; paint(); }
    // Opening view: whole map, except portrait screens fill the height (pan sideways) instead of a thin strip.
    function initial() {
      fit();
      const { w, h } = size();
      if (h > w) { s = Math.min(maxS(), h / H); tx = (w - W * s) / 2; ty = (h - H * s) / 2; paint(); }
    }
    function zoomAt(cx, cy, f) {
      limits();
      const ns = Math.min(maxS(), Math.max(fitS * 0.8, s * f));
      tx = cx - (cx - tx) * ns / s; ty = cy - (cy - ty) * ns / s; s = ns;
      touched = true; clamp(); paint();
    }
    function focusPin(i) {
      const p = pins[i];
      if (!p) return;
      const { w, h } = size();
      limits();
      s = Math.max(s, Math.min(maxS(), fitS * 2.5));
      tx = w / 2 - p.x / 100 * W * s;
      ty = h * 0.4 - p.y / 100 * H * s;
      touched = true; clamp(); paint(); select(i);
    }
    function select(i) {
      sel = i;
      pins.forEach((p, j) => p.el.classList.toggle('is-sel', j === i));
      if (i < 0) { cardEl.hidden = true; return; }
      const p = pins[i], e = p.entry;
      const t = e ? typeOf(e.type) : null;
      cardEl.style.setProperty('--c', t ? t.color : 'var(--muted)');
      cardEl.innerHTML = `<button type="button" class="mc-close" aria-label="Close">×</button>
        ${e && e.image && e.type !== 'map' ? `<img class="mc-img" src="${esc(asset(e.image))}" alt="">` : ''}
        <div class="mc-body">
          <p class="kicker">${t ? esc(t.one) : p.target ? 'Unwritten' : 'Place'}</p>
          <h2>${esc(p.label)}</h2>
          ${e && e.summary ? `<p>${inline(e.summary)}</p>` : ''}
          ${p.note ? `<p class="mc-note">${inline(p.note)}</p>` : ''}
          ${e ? `<a class="mc-open" href="${href(e)}">Open ${e.type === 'map' ? 'map' : 'entry'} →</a>` : ''}
        </div>`;
      cardEl.hidden = false;
    }
    function editTap(r) {
      const x = (r.x - tx) / s / W * 100, y = (r.y - ty) / s / H * 100;
      if (x < 0 || y < 0 || x > 100 || y > 100) return;
      const line = `${x.toFixed(1)}, ${y.toFixed(1)} | `;
      const el = document.createElement('span');
      el.className = 'pin pin-ghost';
      el.innerHTML = `<span class="pin-dot"></span><span class="pin-label">${x.toFixed(1)}, ${y.toFixed(1)}</span>`;
      layer.append(el);
      ghosts.push({ x, y, el });
      paint();
      const toast = $('.map-toast', stage);
      toast.innerHTML = `<code>${esc(line)}</code> copied — paste into the <code>pins</code> block`;
      if (navigator.clipboard) navigator.clipboard.writeText(line).catch(() => { toast.innerHTML = `<code>${esc(line)}</code>`; });
    }

    // pointer: one finger/mouse pans, two fingers pinch-zoom
    const pts = new Map();
    let moved = false, sx = 0, sy = 0, lastTap = 0, lx = 0, ly = 0;
    const rel = e => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onDown = e => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('.map-hud, .map-card, .map-more')) return;
      pts.set(e.pointerId, rel(e));
      if (pts.size === 1) { moved = false; sx = e.clientX; sy = e.clientY; } else moved = true;
      stage.classList.add('is-dragging');
    };
    const onMove = e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId), cur = rel(e);
      pts.set(e.pointerId, cur);
      if (pts.size === 1) {
        tx += cur.x - prev.x; ty += cur.y - prev.y;
        if (Math.hypot(e.clientX - sx, e.clientY - sy) > 6) { moved = true; touched = true; }
        clamp(); paint();
      } else {
        const o = [...pts].find(([id]) => id !== e.pointerId)[1];
        const d0 = Math.hypot(prev.x - o.x, prev.y - o.y), d1 = Math.hypot(cur.x - o.x, cur.y - o.y);
        tx += (cur.x - prev.x) / 2; ty += (cur.y - prev.y) / 2;
        if (d0 > 0) zoomAt((cur.x + o.x) / 2, (cur.y + o.y) / 2, d1 / d0); else { clamp(); paint(); }
      }
    };
    const onUp = e => {
      if (!pts.delete(e.pointerId)) return;
      if (!pts.size) stage.classList.remove('is-dragging');
    };
    stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    stage.addEventListener('click', e => {
      if (e.target.closest('.map-more')) return;
      if (e.target.closest('.mc-close')) { select(-1); return; }
      if (e.target.closest('.map-card')) return;
      const tool = e.target.closest('[data-act]');
      if (tool) {
        const { w, h } = size(), act = tool.dataset.act;
        if (act === 'in') zoomAt(w / 2, h / 2, 1.6);
        if (act === 'out') zoomAt(w / 2, h / 2, 1 / 1.6);
        if (act === 'fit') { touched = false; fit(); }
        if (act === 'labels') tool.setAttribute('aria-pressed', String(!stage.classList.toggle('no-labels')));
        return;
      }
      if (e.target.closest('.map-hud')) return;
      if (moved && e.detail !== 0) { moved = false; return; }
      const pin = e.target.closest('.pin[data-i]');
      if (pin) { select(+pin.dataset.i === sel ? -1 : +pin.dataset.i); return; }
      const r = rel(e), now = performance.now();
      if (now - lastTap < 320 && Math.hypot(r.x - lx, r.y - ly) < 30) { lastTap = 0; zoomAt(r.x, r.y, 2); return; }
      lastTap = now; lx = r.x; ly = r.y;
      select(-1);
      if (S.edit) editTap(r);
    });
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      const r = rel(e), dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(r.x, r.y, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
    }, { passive: false });
    stage.addEventListener('keydown', e => {
      if (e.target !== stage) return;
      const { w, h } = size(), step = 60;
      const k = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (k) { e.preventDefault(); tx += k[0]; ty += k[1]; clamp(); paint(); }
      else if (e.key === '+' || e.key === '=') zoomAt(w / 2, h / 2, 1.4);
      else if (e.key === '-') zoomAt(w / 2, h / 2, 1 / 1.4);
      else if (e.key === '0') fit();
      else if (e.key === 'Escape') select(-1);
    });
    $('.map-below', main).addEventListener('click', e => {
      const b = e.target.closest('[data-pin]');
      if (!b) return;
      stage.scrollIntoView({ behavior: 'smooth', block: 'end' });
      focusPin(+b.dataset.pin);
    });
    $('.map-more', main).addEventListener('click', e => { e.preventDefault(); $('#about-map').scrollIntoView({ behavior: 'smooth' }); });

    const ro = new ResizeObserver(() => { if (!ready) return; if (touched) { clamp(); paint(); } else initial(); });
    ro.observe(stage);

    img.addEventListener('load', () => {
      W = img.naturalWidth || 1000; H = img.naturalHeight || 1000;
      img.style.width = W + 'px'; img.style.height = H + 'px';
      // overlay: a transparent drawing (roads, walls, …) in the same pixel space as the image
      if (over) { over.style.width = W + 'px'; over.style.height = H + 'px'; over.src = asset(String(m.fm.overlay)); }
      ready = true;
      initial();
      if (focus != null) {
        const i = pins.findIndex(p => (p.entry && p.entry.slug === focus) || String(pins.indexOf(p)) === focus);
        if (i >= 0) focusPin(i);
      }
      stage.classList.add('is-ready');
    });
    img.addEventListener('error', () => { stage.insertAdjacentHTML('beforeend', `<p class="map-error">Couldn’t load map image <code>${esc(m.image)}</code></p>`); });
    img.src = asset(m.image);

    S.cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      ro.disconnect();
    };
  }

  /* ---------- editing ----------
     Anyone listed in world.json "authors" can sign in (name + shared passkey) and write
     their own ::: account block on any entry. Edits are stored by world.json edit.endpoint
     (a small Google Apps Script, see duat-backend/) and layered over the .md files at load.
     With no endpoint configured, edits are kept in this browser only (a local preview). */
  const worldId = () => slugify(S.world.id || S.world.title || 'world');
  const editCfg = () => S.world.edit || {};
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const localKey = () => `duat:${worldId()}:edits`;
  const sessionKey = () => `duat:${worldId()}:session`;

  async function loadEdits() {
    if (!S.world.edit) return [];
    const ep = editCfg().endpoint;
    if (!ep) return store.get(localKey()) || [];
    try {
      const r = await fetch(`${ep}?world=${encodeURIComponent(worldId())}`, { cache: 'no-cache' });
      const j = await r.json();
      return j.ok ? j.edits : [];
    } catch (err) {
      console.warn('Duat: couldn’t load shared edits', err);
      return [];
    }
  }
  const blockRe = id => new RegExp(`^:::\\s*${id}\\s*\\n[\\s\\S]*?^:::\\s*$`, 'm');
  function ownText(e, id) {
    const m = e.body.match(new RegExp(`^:::\\s*${id}\\s*\\n([\\s\\S]*?)^:::\\s*$`, 'm'));
    if (m) return m[1].trim();
    // whole-entry attribution (author: id, no blocks) — that text is theirs to edit
    if (toArray(e.fm.author).map(norm).includes(id) && !/^:::/m.test(e.body)) return e.body.trim();
    return '';
  }
  const NEW_RE = /^---\n([\s\S]*?)\n---\n?/;   // a saved edit that starts with a header creates a new page
  function applyEdit({ slug, author, text }) {
    const e = S.entries.find(x => x.slug === slug);
    if (!e || !author) return;
    const id = norm(author);
    const body = String(text || '').replace(NEW_RE, '').trim();
    const whole = toArray(e.fm.author).map(norm).includes(id) && !/^:::/m.test(e.body);
    if (whole) e.body = body;
    else if (blockRe(id).test(e.body)) e.body = e.body.replace(blockRe(id), body ? `::: ${id}\n${body}\n:::` : '');
    else if (body) e.body = `${e.body.trim()}\n\n::: ${id}\n${body}\n:::`;
    e.body = e.body.replace(/\n{3,}/g, '\n\n').trim();
    if (!e.fm.summary) e.summary = autoSummary(e.body);
    const inBody = [...e.body.matchAll(/^:::\s*([\w-]+)\s*$/gm)].map(m => norm(m[1]));
    e.authors = [...new Set([...(whole && !body ? [] : toArray(e.fm.author).map(norm)), ...inBody])];
  }
  function createFrom({ slug, author, text }) {
    const m = String(text || '').match(NEW_RE);
    if (!m || !author) return;
    if (S.entries.some(x => x.slug === slug)) return applyEdit({ slug, author, text }); // already a real .md page
    const id = norm(author);
    const e = parseEntry(slug, `---\n${m[1]}\nauthor: ${id}\n---\n${text.slice(m[0].length)}`);
    e.newHeader = `---\n${m[1]}\n---`;
    e.createdBy = id;
    S.entries.push(e);
  }
  function applyEdits(edits) {
    const isNew = x => NEW_RE.test(String(x.text || ''));
    edits.filter(isNew).forEach(createFrom);
    edits.filter(x => !isNew(x)).forEach(applyEdit);
  }
  const editButton = e => S.world.edit ? `<button type="button" class="edit-btn" data-edit="${esc(e.slug)}" aria-label="Edit ${esc(e.title)}">✎ Edit</button>` : '';

  async function sha256(t) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function wireEditing() {
    if (!S.world.edit) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'editor';
    document.body.append(dlg);
    document.addEventListener('click', ev => {
      if (ev.target.closest('[data-new]')) return withSession(dlg, 'Sign in to add a page', () => openCreator(dlg));
      const b = ev.target.closest('[data-edit]');
      const e = b && S.entries.find(x => x.slug === b.dataset.edit);
      if (e) withSession(dlg, 'Sign in to edit', () => openEditor(dlg, e), e.title);
    });
  }
  function show(dlg) {
    if (!dlg.open) dlg.showModal();
    setTimeout(() => { const t = $('input[name=title], textarea, select', dlg); if (t) t.focus(); }, 30);
  }
  function withSession(dlg, kicker, next, title = '') {
    if (store.get(sessionKey())) return next();
    const authors = Object.entries(S.world.authors || {});
    dlg.innerHTML = `<form method="dialog" class="ed-form">
      <p class="kicker">${esc(kicker)}</p>${title ? `<h2>${esc(title)}</h2>` : ''}
      <label>Who are you?<select name="author" required><option value="">Choose…</option>${authors.map(([id, a]) =>
        `<option value="${esc(id)}">${esc(a.name)}${a.role ? ` (${esc(a.role)})` : ''}</option>`).join('')}</select></label>
      <label>Passkey<input name="key" type="password" autocomplete="current-password" required></label>
      <p class="ed-err" hidden></p>
      <div class="ed-actions"><button value="cancel" formnovalidate>Cancel</button><button value="ok" class="primary">Continue</button></div>
    </form>`;
    const f = $('form', dlg);
    f.addEventListener('submit', async ev => {
      if (ev.submitter && ev.submitter.value === 'cancel') return;
      ev.preventDefault();
      if (editCfg().keyHash && await sha256(f.key.value) !== editCfg().keyHash) {
        const err = $('.ed-err', f); err.textContent = 'That passkey isn’t right.'; err.hidden = false; return;
      }
      store.set(sessionKey(), { author: f.author.value, key: f.key.value });
      next();
    });
    show(dlg);
  }
  const helpText = a => `Markdown works. Tap <b>🔗 Link</b> or type <code>[[</code> to link another page. Your text shows as “${esc(a.name)}’s notes”.`;
  const linkBar = '<div class="ed-bar"><button type="button" class="ed-link">🔗 Link</button></div>';
  const field = ta => `<div class="ed-field">${ta}<div class="ed-links" role="listbox" hidden></div></div>`;
  async function persist(edit, sess) {
    if (!editCfg().endpoint) {
      const all = (store.get(localKey()) || []).filter(x => !(x.slug === edit.slug && x.author === edit.author));
      store.set(localKey(), [...all, { ...edit, updated: new Date().toISOString() }]);
      return;
    }
    const r = await fetch(editCfg().endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...edit, world: worldId(), key: sess.key }) });
    const j = await r.json();
    if (!j.ok) {
      if (/passkey/i.test(j.error || '')) store.set(sessionKey(), null);
      throw new Error(j.error || 'Save failed');
    }
  }
  function wireForm(dlg, f, sess, onSave, again) {
    attachLinker($('textarea', f), $('.ed-links', f), $('.ed-link', f));
    const sw = $('.ed-switch', f);
    if (sw) sw.addEventListener('click', () => { store.set(sessionKey(), null); again(); });
    f.addEventListener('submit', async ev => {
      if (ev.submitter && ev.submitter.value === 'cancel') return;
      ev.preventDefault();
      const btn = $('.primary', f), err = $('.ed-err', f), label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Saving…';
      try { await onSave(); }
      catch (x) {
        err.textContent = `Couldn’t save: ${x.message}. Your text is still here.`; err.hidden = false;
        btn.disabled = false; btn.textContent = label;
      }
    });
  }
  const footer = (a, action) => `${!editCfg().endpoint ? '<p class="ed-warn">Preview mode: saves stay in this browser until the shared save service is connected.</p>' : ''}
    <p class="ed-err" hidden></p>
    <div class="ed-actions"><button type="button" class="ed-switch">Not ${esc(a.name)}?</button><span></span>
      <button value="cancel" formnovalidate>Cancel</button><button value="ok" class="primary">${action}</button></div>`;

  function openEditor(dlg, e) {
    const sess = store.get(sessionKey()), a = authorOf(sess.author);
    dlg.innerHTML = `<form method="dialog" class="ed-form ed-write" style="--c:${a.color}">
      <p class="kicker">${esc(a.name)}’s notes on</p><h2>${esc(e.title)}</h2>
      ${linkBar}
      ${field(`<textarea name="text" rows="12" spellcheck="true" placeholder="What does ${esc(a.name)} know about ${esc(e.title)}?">${esc(ownText(e, a.id))}</textarea>`)}
      <p class="ed-help">${helpText(a)} Other people’s notes aren’t touched. Save it empty to remove yours.</p>
      ${footer(a, 'Save')}
    </form>`;
    const f = $('form', dlg);
    wireForm(dlg, f, sess, async () => {
      const body = f.text.value.trim();
      const text = e.newHeader && e.createdBy === a.id ? `${e.newHeader}\n${body}` : body; // keep a new page's header
      await persist({ slug: e.slug, author: a.id, text }, sess);
      location.reload();
    }, () => withSession(dlg, 'Sign in to edit', () => openEditor(dlg, e), e.title));
    show(dlg);
  }
  function openCreator(dlg) {
    const sess = store.get(sessionKey()), a = authorOf(sess.author);
    const types = S.typeOrder.filter(t => t !== 'map');
    dlg.innerHTML = `<form method="dialog" class="ed-form ed-write" style="--c:${a.color}">
      <p class="kicker">New page</p><h2>Add to the catalog</h2>
      <label>Name<input name="title" required maxlength="80" autocomplete="off" placeholder="e.g. Madame Vex"></label>
      <label>Category<select name="type" required><option value="">Choose…</option>${types.map(t =>
        `<option value="${esc(t)}">${esc(typeOf(t).one)}</option>`).join('')}</select></label>
      <label for="ed-new-text">${esc(a.name)}’s notes</label>
      ${linkBar}
      ${field('<textarea id="ed-new-text" name="text" rows="9" spellcheck="true" required placeholder="What do you know about it?"></textarea>')}
      <p class="ed-help">${helpText(a)}</p>
      ${footer(a, 'Create page')}
    </form>`;
    const f = $('form', dlg);
    wireForm(dlg, f, sess, async () => {
      const title = f.title.value.trim().replace(/\s+/g, ' '), slug = slugify(title);
      const clash = resolve(title) || S.entries.find(x => x.slug === slug);
      if (!slug) throw new Error('that name needs some letters');
      if (clash) throw new Error(`“${clash.title}” already has a page. Open it and use ✎ Edit`);
      const header = `---\ntitle: "${title.replace(/"/g, '’')}"\ntype: ${f.type.value}\n---`;
      await persist({ slug, author: a.id, text: `${header}\n${f.text.value.trim()}` }, sess);
      location.hash = '#/e/' + slug;
      location.reload();
    }, () => withSession(dlg, 'Sign in to add a page', () => openCreator(dlg)));
    show(dlg);
  }

  /* [[ link helper: type [[ (or tap 🔗 Link) and pick a page. The list floats under the line
     being typed (nothing on the page moves) and matches page names and aliases only. */
  function nameMatches(q) {
    q = norm(q);
    const all = S.entries.filter(e => !e.hidden);
    if (!q) return all.slice().sort(byTitle);
    const score = e => Math.max(...[e.title, ...e.aliases].map(n => {
      n = norm(n);
      return n === q ? 4 : n.startsWith(q) ? 3 : n.split(/[\s\-'’&.]+/).some(w => w.startsWith(q)) ? 2 : n.includes(q) ? 1 : 0;
    }));
    return all.map(e => [e, score(e)]).filter(([, sc]) => sc).sort((a, b) => b[1] - a[1] || byTitle(a[0], b[0])).map(([e]) => e);
  }
  function caretTop(ta) {
    // mirror the textarea to find the caret's y position (px, relative to the textarea's box)
    const cs = getComputedStyle(ta), m = document.createElement('div');
    for (const k of ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth',
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize']) m.style[k] = cs[k];
    Object.assign(m.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '-9999px' });
    m.textContent = ta.value.slice(0, ta.selectionStart);
    const mark = document.createElement('span'); mark.textContent = '​'; m.append(mark);
    document.body.append(m);
    const y = mark.offsetTop + mark.offsetHeight - ta.scrollTop;
    m.remove();
    return Math.max(0, Math.min(y, ta.clientHeight));
  }
  function attachLinker(ta, box, btn) {
    let hits = [], cur = 0;
    const query = () => {
      const m = ta.value.slice(0, ta.selectionStart).match(/\[\[([^\]\[\n|]*)$/);
      return m ? m[1] : null;
    };
    const close = () => { box.hidden = true; };
    const place = () => {
      const y = caretTop(ta), h = box.offsetHeight, room = ta.clientHeight;
      box.style.top = (y + 6 + h <= room + 40 || y < h + 12 ? y + 6 : y - h - 28) + 'px';
    };
    const draw = () => {
      const q = query();
      if (q === null) return close();
      hits = nameMatches(q).slice(0, 6);
      if (q.trim() && !hits.some(e => norm(e.title) === norm(q))) hits.push({ title: q.trim(), fresh: true });
      cur = Math.min(cur, Math.max(hits.length - 1, 0));
      box.innerHTML = hits.map((e, i) => `<button type="button" role="option" data-i="${i}" class="${i === cur ? 'is-cur' : ''}"${e.fresh ? '' : ` style="--c:${typeOf(e.type).color}"`}>
        <span class="sr-type">${e.fresh ? 'New link' : esc(typeOf(e.type).one)}</span><span>${esc(e.title)}</span></button>`).join('')
        || '<p class="muted">Type a name…</p>';
      box.hidden = false;
      place();
    };
    const pick = i => {
      const e = hits[i]; if (!e) return;
      const pos = ta.selectionStart, before = ta.value.slice(0, pos).replace(/\[\[([^\]\[\n|]*)$/, `[[${e.title}]]`);
      let after = ta.value.slice(pos);
      if (after.startsWith(']]')) after = after.slice(2);
      ta.value = before + after;
      ta.focus(); ta.setSelectionRange(before.length, before.length);
      close();
    };
    ta.addEventListener('input', () => { cur = 0; draw(); });
    ta.addEventListener('click', draw);
    ta.addEventListener('scroll', () => { if (!box.hidden) place(); });
    ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) close(); }, 120));
    ta.addEventListener('keydown', ev => {
      if (box.hidden) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); cur = (cur + (ev.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length; draw(); }
      else if (ev.key === 'Enter' || ev.key === 'Tab') { if (hits.length) { ev.preventDefault(); pick(cur); } }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); }
    });
    // phone keyboards often skip keydown for Enter; catch the line break instead
    ta.addEventListener('beforeinput', ev => {
      if (!box.hidden && hits.length && ev.inputType === 'insertLineBreak') { ev.preventDefault(); pick(cur); }
    });
    box.addEventListener('pointerdown', ev => ev.preventDefault()); // keep the keyboard up while choosing
    box.addEventListener('click', ev => { const b = ev.target.closest('[data-i]'); if (b) pick(+b.dataset.i); });
    btn.addEventListener('click', () => {
      const p = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, p) + '[[' + ta.value.slice(ta.selectionEnd ?? p);
      ta.focus(); ta.setSelectionRange(p + 2, p + 2); cur = 0; draw();
    });
  }

  /* about Duat */
  function wireAbout() {
    const b = $('.foot-duat'); if (!b) return;
    const d = document.createElement('dialog');
    d.className = 'about-duat';
    d.innerHTML = `<form method="dialog"><p><b>Duat</b> is a WIP lightweight game-world cataloging system by Junction (Jamon Lancaster and Katherine-May Willendorf). Thank you for testing our system!</p><button class="primary">Close</button></form>`;
    document.body.append(d);
    b.addEventListener('click', () => d.showModal());
    d.addEventListener('click', ev => { if (ev.target === d) d.close(); });
  }

  /* ---------- router ---------- */
  function route() {
    if (S.cleanup) { S.cleanup(); S.cleanup = null; }
    closeSearch(false);
    const raw = location.hash.replace(/^#\/?/, '');
    if (raw && !/^(e|t|s|tag|by)\//.test(raw) && document.getElementById(raw)) return; // in-page anchor
    const [path, query] = raw.split('?');
    const params = new URLSearchParams(query || '');
    const [kind, ...rest] = path.split('/');
    const arg = rest.map(decodeURIComponent).join('/');
    if (kind === 'e') {
      const e = resolve(arg);
      if (!e) viewMissing(arg);
      else if (e.type === 'map' && e.image) viewMap(e, params.get('pin'));
      else viewEntry(e);
    } else if (kind === 't') viewType(norm(arg));
    else if (kind === 'tag') viewType(null, arg);
    else if (kind === 'by') viewAuthor(norm(arg));
    else if (kind === 's') viewSearch(arg);
    else viewHome();
    window.scrollTo(0, 0);
  }

  /* ---------- boot ---------- */
  async function boot() {
    const root = document.getElementById('duat');
    S.edit = new URLSearchParams(location.search).has('edit');
    try {
      const res = await fetch(root.dataset.world || 'world.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`world.json → HTTP ${res.status}`);
      const w = S.world = await res.json();
      S.types = { ...DEFAULT_TYPES };
      for (const [k, v] of Object.entries(w.types || {})) S.types[k] = { ...(S.types[k] || typeOf(k)), ...v };
      if (w.theme) for (const [k, v] of Object.entries(w.theme)) document.documentElement.style.setProperty('--' + k, v);
      const loaded = await Promise.all((w.entries || []).map(async slug => {
        try {
          const r = await fetch(`entries/${slug}.md`, { cache: 'no-cache' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return parseEntry(slug, await r.text());
        } catch (err) {
          console.warn(`Duat: couldn’t load entries/${slug}.md`, err);
          return null;
        }
      }));
      S.entries = loaded.filter(Boolean);
      applyEdits(await loadEdits());
      index();
      const present = [...new Set(S.entries.map(e => e.type))];
      S.typeOrder = [...new Set([...(w.typeOrder || Object.keys(DEFAULT_TYPES)), ...present])];
      renderChrome(root);
      wireEditing();
      wireAbout();
      window.addEventListener('hashchange', route);
      route();
    } catch (err) {
      console.error(err);
      root.innerHTML = `<div class="wrap boot-error"><h1>Couldn’t open this world</h1><p>${esc(err.message)}</p>
        <p class="muted">If you opened the file directly from disk, serve the folder instead (e.g. <code>python3 -m http.server</code> in <code>src/</code>).</p></div>`;
    }
  }
  boot();
})();
