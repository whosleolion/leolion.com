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
    character: { label: 'Characters', one: 'Character', color: '#ff8a5c',
                 fields: [{ label: 'Status', kind: 'text' }, { label: 'Faction', kind: 'page' }] },
    location:  { label: 'Locations',  one: 'Location',  color: '#7ddc8a' },
    faction:   { label: 'Factions',   one: 'Faction',   color: '#c792ff' },
    item:      { label: 'Items',      one: 'Item',      color: '#ffd166' },
    session:   { label: 'Sessions',   one: 'Session',   color: '#8fd3d6',
                 fields: [{ label: 'Session number', kind: 'sort' }, { label: 'Date', kind: 'date' }, { label: 'Players', kind: 'text' }] },
    note:      { label: 'Notes',      one: 'Note',      color: '#a4abb8' },
  };
  // Frontmatter keys the engine uses itself; every other key becomes an infobox row.
  const RESERVED = new Set(['title', 'type', 'aliases', 'alias', 'tags', 'summary', 'image', 'order', 'hidden', 'pins', 'author', 'major', 'overlay']);
  const ITEM_RE = /^\s*([-*+]|\d+[.)])\s+/;
  const WL_RE = /\[\[([^\]]+)\]\]/g;

  const S = { world: null, entries: [], lookup: new Map(), types: {}, typeOrder: [], cleanup: null, deleted: [], dlg: null };

  /* ---------- small helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').trim().toLowerCase();
  const slugify = s => norm(s).replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const protectPipes = s => s.replace(/\[\[[^\]]*\]\]/g, m => m.replace(/\|/g, '\u0001'));
  const restorePipes = s => s.replace(/\u0001/g, '|');
  const toArray = v => Array.isArray(v) ? v : (v === '' || v == null || typeof v === 'boolean') ? [] : String(v).split(',').map(x => x.trim()).filter(Boolean);
  const safeUrl = u => /^\s*data:image\/(png|jpe?g|webp|gif);base64,/i.test(u) ? u : /^\s*(javascript|vbscript|data):/i.test(u) ? '#' : u;
  const asset = u => /^(https?:)?\/\//.test(u) || /^data:/i.test(u) || u.startsWith('/') || u.includes('/') ? safeUrl(u) : 'images/' + u;
  const href = e => '#/e/' + e.slug.split('/').map(encodeURIComponent).join('/');
  const typeOf = t => S.types[t] || (S.types[t] = { label: cap(t) + 's', one: cap(t), color: '#a4abb8' });
  // Each category can define its own fields (world.json / Campaign settings: types.<id>.fields).
  // kind: text | page (pick a page) | number | date | sort (a number the category is ordered by)
  const FIELD_KINDS = { text: 'Text', page: 'Page link', number: 'Number', date: 'Date', sort: 'Sort number' };
  const catFields = t => ((S.types[t] || {}).fields || []).filter(x => x && x.label)
    .map(x => ({ label: x.label, kind: FIELD_KINDS[x.kind] ? x.kind : 'text', key: x.kind === 'sort' ? 'order' : norm(x.label) }));
  const homeSlug = () => S.world.home || 'home';
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
    return { x: +m[1], y: +m[2], target, label: label || null, rawLabel: wl ? (label || '') : t.trim(), note: m[4] ? restorePipes(m[4]) : '' };
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
      <footer class="foot"><span>${esc(w.title)}</span><span class="foot-right"><span class="foot-gm"></span><button type="button" class="foot-duat">catalogued in Duat</button></span></footer>`;
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
      ${home ? `<div class="home-intro-wrap">${editButton(home)}<div class="prose home-intro">${md(home.body.replace(/^:::.*$/gm, ''))}</div></div>` : ''}
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
    const fields = catFields(e.type), label = Object.fromEntries(fields.map(f => [f.key, f.label]));
    let rows = Object.entries(e.fm).filter(([k, v]) => !RESERVED.has(k) && v !== '' && !(Array.isArray(v) && !v.length));
    const sortF = fields.find(f => f.kind === 'sort');
    if (sortF && e.order != null) rows.push(['order', e.order]);
    const rank = k => { const i = fields.findIndex(f => f.key === k); return i < 0 ? 1e3 : i; };
    rows = rows.sort((a, b) => rank(a[0]) - rank(b[0]));
    if (!rows.length) return '';
    const val = v => Array.isArray(v) ? v.map(x => inline(String(x))).join(', ') : v === true ? 'Yes' : v === false ? 'No' : inline(String(v));
    return `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${esc(label[k] || cap(k.replace(/[-_]+/g, ' ')))}</dt><dd>${val(v)}</dd></div>`).join('')}</dl>`;
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
            ${S.world.edit ? '<button type="button" data-act="pins" aria-label="Add or move pins">📍</button>' : ''}
          </div>
        </div>
        <div class="map-card" hidden></div>
        <div class="pin-bar" hidden><span>Tap the map to add a pin. Tap a pin to change it.</span>
          <button type="button" data-pinbar="cancel">Cancel</button><button type="button" data-pinbar="save" class="primary">Save pins</button></div>
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
    let pins = [], pinMode = false, work = null, moving = -1;

    function buildPins(list) {
      layer.innerHTML = '';
      pins = list.map((p, i) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'pin' + (p.target && !p.entry ? ' pin-missing' : '') + (p.entry ? '' : ' pin-plain') + ' tier-' + tierOf(p) + (i === moving ? ' is-moving' : '');
        el.dataset.i = i;
        el.style.setProperty('--c', p.entry ? typeOf(p.entry.type).color : 'var(--text)');
        el.innerHTML = `<span class="pin-dot"></span><span class="pin-label">${esc(p.label)}</span>`;
        el.setAttribute('aria-label', p.label);
        layer.append(el);
        return { ...p, el };
      });
      if (ready) paint();
    }
    buildPins(m.pins);

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
      for (const p of pins) p.el.style.transform = `translate(${tx + p.x / 100 * W * s}px,${ty + p.y / 100 * H * s}px)`;
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
    /* pin editor: tap empty map to add, tap a pin to change/move/remove, then Save pins */
    const pinBar = $('.pin-bar', stage);
    const livePin = p => {
      const entry = resolve(p.target);
      return { ...p, entry, label: p.rawLabel || (entry ? entry.title : p.target) || '?' };
    };
    function startPins() {
      if (S.dlg && S.dlg.open) S.dlg.close();
      pinMode = true; moving = -1;
      work = m.pins.map(p => ({ x: p.x, y: p.y, target: p.target, rawLabel: p.rawLabel || '', note: p.note || '' }));
      stage.classList.add('pin-editing', 'show-t2', 'show-t3');
      stage.classList.remove('no-labels');
      pinBar.hidden = false; select(-1);
      buildPins(work.map(livePin));
    }
    function pinForm(i, pos) {
      const p = i >= 0 ? work[i] : { x: pos.x, y: pos.y, target: null, rawLabel: '', note: '' };
      let target = p.target;
      pins.forEach((q, j) => q.el.classList.toggle('is-sel', j === i));
      cardEl.style.setProperty('--c', 'var(--accent)');
      cardEl.innerHTML = `<button type="button" class="mc-close" aria-label="Close">×</button>
        <form class="mc-body pin-form">
          <p class="kicker">${i >= 0 ? 'Change pin' : 'New pin'}</p>
          <label>Page or place<span class="ed-field"><input name="name" autocomplete="off" required value="${esc(target || p.rawLabel)}" placeholder="Start typing a page name…"><span class="ed-links" role="listbox" hidden></span></span></label>
          <p class="pin-linked muted">${target ? `Links to <b>${esc(target)}</b>` : 'Not linked to a page (just a label)'}</p>
          <label class="pin-show"${target ? '' : ' hidden'}>Label on the map (optional)<input name="label" autocomplete="off" value="${esc(target ? p.rawLabel : '')}" placeholder="Defaults to the page name"></label>
          <label>Note (optional)<input name="note" autocomplete="off" value="${esc(p.note)}"></label>
          <div class="ed-actions">${i >= 0 ? '<button type="button" data-pf="remove">Remove</button><button type="button" data-pf="move">Move</button>' : ''}<span></span>
            <button type="submit" class="primary">${i >= 0 ? 'Done' : 'Add pin'}</button></div>
        </form>`;
      cardEl.hidden = false;
      const f = $('form', cardEl), inp = f.name, linked = $('.pin-linked', f), show = $('.pin-show', f);
      attachPicker(inp, $('.ed-links', f), e => {
        target = e.title; inp.value = e.title;
        linked.innerHTML = `Links to <b>${esc(e.title)}</b>`; show.hidden = false;
      });
      inp.addEventListener('input', () => {
        if (target && norm(inp.value) !== norm(target)) { target = null; linked.textContent = 'Not linked to a page (just a label)'; show.hidden = true; }
      });
      f.addEventListener('click', ev => {
        const b = ev.target.closest('[data-pf]'); if (!b) return;
        if (b.dataset.pf === 'remove') { work.splice(i, 1); cardEl.hidden = true; buildPins(work.map(livePin)); }
        if (b.dataset.pf === 'move') { moving = i; cardEl.hidden = true; pinBar.querySelector('span').textContent = 'Tap the new spot for this pin.'; buildPins(work.map(livePin)); }
      });
      f.addEventListener('submit', ev => {
        ev.preventDefault();
        const name = inp.value.trim(); if (!name) return;
        const hit = !target && S.entries.find(x => norm(x.title) === norm(name)); // typed a page's exact name without picking it
        if (hit) target = hit.title;
        const out = { x: p.x, y: p.y, target: target || null, rawLabel: (target ? f.label.value : name).trim().replace(/\|/g, '/'), note: f.note.value.trim().replace(/\|/g, '/') };
        if (i >= 0) work[i] = out; else work.push(out);
        cardEl.hidden = true; buildPins(work.map(livePin));
      });
      setTimeout(() => inp.focus(), 30);
    }
    const pinLine = p => `${p.x.toFixed(1)}, ${p.y.toFixed(1)} | ${p.target ? `[[${p.target}${p.rawLabel ? '|' + p.rawLabel : ''}]]` : p.rawLabel}${p.note ? ' | ' + p.note : ''}`;
    pinBar.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-pinbar]'); if (!b) return;
      if (b.dataset.pinbar === 'cancel') return route();
      b.disabled = true; b.textContent = 'Saving…';
      try {
        await persist({ slug: m.slug, author: '@pins', text: work.map(pinLine).join('\n') }, store.get(sessionKey()));
        location.reload();
      } catch (x) { b.disabled = false; b.textContent = 'Save pins'; pinBar.querySelector('span').textContent = `Couldn’t save: ${x.message}`; }
    });

    // pointer: one finger/mouse pans, two fingers pinch-zoom
    const pts = new Map();
    let moved = false, sx = 0, sy = 0, lastTap = 0, lx = 0, ly = 0;
    const rel = e => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onDown = e => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('.map-hud, .map-card, .map-more, .pin-bar')) return;
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
      if (e.target.closest('.map-more, .pin-bar')) return;
      if (e.target.closest('.mc-close')) { select(-1); return; }
      if (e.target.closest('.map-card')) return;
      const tool = e.target.closest('[data-act]');
      if (tool) {
        const { w, h } = size(), act = tool.dataset.act;
        if (act === 'in') zoomAt(w / 2, h / 2, 1.6);
        if (act === 'out') zoomAt(w / 2, h / 2, 1 / 1.6);
        if (act === 'fit') { touched = false; fit(); }
        if (act === 'labels') tool.setAttribute('aria-pressed', String(!stage.classList.toggle('no-labels')));
        if (act === 'pins' && !pinMode) withSession(S.dlg, 'Sign in to edit pins', startPins, m.title);
        return;
      }
      if (e.target.closest('.map-hud')) return;
      if (moved && e.detail !== 0) { moved = false; return; }
      const pin = e.target.closest('.pin[data-i]');
      const r = rel(e), at = { x: +((r.x - tx) / s / W * 100).toFixed(1), y: +((r.y - ty) / s / H * 100).toFixed(1) };
      if (pinMode) {
        if (moving >= 0) {
          if (at.x >= 0 && at.y >= 0 && at.x <= 100 && at.y <= 100) { work[moving].x = at.x; work[moving].y = at.y; }
          moving = -1; pinBar.querySelector('span').textContent = 'Tap the map to add a pin. Tap a pin to change it.';
          buildPins(work.map(livePin)); return;
        }
        if (pin) return pinForm(+pin.dataset.i);
        if (at.x >= 0 && at.y >= 0 && at.x <= 100 && at.y <= 100) pinForm(-1, at);
        return;
      }
      if (pin) { select(+pin.dataset.i === sel ? -1 : +pin.dataset.i); return; }
      const now = performance.now();
      if (now - lastTap < 320 && Math.hypot(r.x - lx, r.y - ly) < 30) { lastTap = 0; zoomAt(r.x, r.y, 2); return; }
      lastTap = now; lx = r.x; ly = r.y;
      select(-1);
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
     Everything in the catalog can be entered from the page itself. Edits are rows kept by
     world.json edit.endpoint (a small Google Apps Script, see duat-backend/) and layered over
     the .md files at load:
       <author id>  that person's notes on a page (a header on first save = a new page)
       @meta        the page's details: name, category, nicknames, tags, info rows, image…
       @pins        a map's full pin list
     With no endpoint configured, edits are kept in this browser only (a local preview).
     A GM passkey (edit.gmHash) unlocks editing anyone's notes, hiding, merging and deleting. */
  const worldId = () => S.worldId;   // fixed at boot, so renaming the campaign never detaches its edits
  const editCfg = () => S.world.edit || {};
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const localKey = () => `duat:${worldId()}:edits`;
  const sessionKey = () => `duat:${worldId()}:session`;
  const session = () => store.get(sessionKey());
  const isGM = () => !!(session() || {}).gm;

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
  const isWhole = (e, id) => e.slug === homeSlug() || (toArray(e.fm.author).map(norm).includes(id) && !/^:::/m.test(e.body));
  function ownText(e, id) {
    const m = e.body.match(new RegExp(`^:::\\s*${id}\\s*\\n([\\s\\S]*?)^:::\\s*$`, 'm'));
    if (m) return m[1].trim();
    return isWhole(e, id) ? e.body.trim() : '';     // whole-entry attribution: that text is theirs
  }
  const refreshAuthors = e => {
    const inBody = [...e.body.matchAll(/^:::\s*([\w-]+)\s*$/gm)].map(m => norm(m[1]));
    e.authors = [...new Set([...toArray(e.fm.author).map(norm), ...inBody])];
  };
  function setNotes(e, id, body) {
    body = String(body || '').trim();
    if (isWhole(e, id)) e.body = body;
    else if (blockRe(id).test(e.body)) e.body = e.body.replace(blockRe(id), body ? `::: ${id}\n${body}\n:::` : '');
    else if (body) {
      // someone else joins a single-author page: the existing text becomes that author's block
      if (e.body.trim() && !/^:::/m.test(e.body) && toArray(e.fm.author).length) {
        const owner = norm(toArray(e.fm.author)[0]);
        e.body = `::: ${owner}\n${e.body.trim()}\n:::`;
        e.fm.author = '';
      }
      e.body = `${e.body.trim()}\n\n::: ${id}\n${body}\n:::`;
    }
    e.body = e.body.replace(/\n{3,}/g, '\n\n').trim();
    if (!e.fm.summary) e.summary = autoSummary(e.body);
    refreshAuthors(e);
    e.dirty = true;
  }
  const NEW_RE = /^---\n([\s\S]*?)\n---\n?/;   // a saved edit that starts with a header creates a new page
  function createFrom({ slug, author, text }) {
    const m = String(text || '').match(NEW_RE);
    if (!m || !author) return;
    const id = norm(author), body = text.slice(m[0].length);
    const have = S.entries.find(x => x.slug === slug);
    if (have) return setNotes(have, id, body);           // it has since become a real .md page
    const e = parseEntry(slug, `---\n${m[1]}\nauthor: ${id}\n---\n${body}`);
    e.newHeader = `---\n${m[1]}\n---`;
    e.createdBy = id;
    e.dirty = e.isNew = true;
    S.entries.push(e);
  }
  function applyPins(e, text) {
    e.pins = String(text || '').split('\n').map(parsePin).filter(Boolean);
    e.dirty = true;
  }
  const META_KEYS = ['title', 'type', 'aliases', 'tags', 'summary', 'image', 'order', 'hidden'];
  function applyMeta(e, meta) {
    if (meta.deleted) { S.entries = S.entries.filter(x => x !== e); S.deleted.push(e.slug); return; }
    if (meta.title && meta.title !== e.title) {
      // renamed: the old name stays a nickname so every existing [[link]] still lands here
      meta.aliases = [...new Set([...(meta.aliases || e.aliases), e.title])];
      e.title = meta.title;
    }
    if (meta.type) e.type = norm(meta.type);
    if (meta.aliases) e.aliases = meta.aliases.filter(Boolean);
    if (meta.tags) e.tags = meta.tags.filter(Boolean);
    if ('summary' in meta) { e.fm.summary = meta.summary || ''; e.summary = meta.summary || autoSummary(e.body); }
    if ('image' in meta) e.image = meta.image || '';
    if ('order' in meta) e.order = meta.order === '' || meta.order == null || isNaN(+meta.order) ? null : +meta.order;
    if ('hidden' in meta) e.hidden = !!meta.hidden;
    if ('pinstyle' in meta) e.fm.pins = meta.pinstyle || '';
    if ('major' in meta) e.fm.major = (meta.major || []).length ? meta.major : '';
    if ('overlay' in meta) e.fm.overlay = meta.overlay || '';
    if (meta.facts) {
      for (const k of Object.keys(e.fm)) if (!RESERVED.has(k)) delete e.fm[k];
      for (const [k, v] of Object.entries(meta.facts)) if (k.trim() && String(v).trim()) e.fm[norm(k)] = String(v).trim();
    }
    Object.assign(e.fm, { title: e.title, type: e.type, aliases: e.aliases, tags: e.tags, image: e.image, order: e.order ?? '', hidden: e.hidden });
    e.dirty = true;
    if (meta.mergeInto) {
      const t = S.entries.find(x => x.slug === meta.mergeInto && x !== e);
      if (!t) return;
      t.aliases = [...new Set([...t.aliases, e.title, ...e.aliases])];
      t.fm.aliases = t.aliases;
      if (/^:::/m.test(e.body)) {
        for (const m of e.body.matchAll(/^:::\s*([\w-]+)\s*\n([\s\S]*?)^:::\s*$/gm)) setNotes(t, norm(m[1]), [ownText(t, norm(m[1])), m[2].trim()].filter(Boolean).join('\n\n'));
      } else if (e.body.trim()) {
        const owner = norm(toArray(e.fm.author)[0] || 'leo');
        setNotes(t, owner, [ownText(t, owner), e.body.trim()].filter(Boolean).join('\n\n'));
      }
      S.entries = S.entries.filter(x => x !== e); S.deleted.push(e.slug);
    }
  }
  function applyEdits(edits) {
    S.deleted = [];
    const find = slug => S.entries.find(x => x.slug === slug);
    const special = x => String(x.author || '').startsWith('@');
    edits.filter(x => !special(x) && NEW_RE.test(String(x.text || ''))).forEach(createFrom);
    edits.filter(x => !special(x) && !NEW_RE.test(String(x.text || ''))).forEach(x => { const e = find(x.slug); if (e) setNotes(e, norm(x.author), x.text); });
    edits.filter(x => x.author === '@pins').forEach(x => { const e = find(x.slug); if (e) applyPins(e, x.text); });
    edits.filter(x => x.author === '@meta').forEach(x => {
      const e = find(x.slug); if (!e) return;
      try { applyMeta(e, JSON.parse(x.text)); } catch (err) { console.warn('Duat: bad page details for', x.slug, err); }
    });
  }
  const editButton = e => S.world.edit ? `<button type="button" class="edit-btn" data-edit="${esc(e.slug)}" aria-label="Edit ${esc(e.title)}">✎ Edit</button>` : '';

  async function sha256(t) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function wireEditing() {
    if (!S.world.edit) return;
    const dlg = S.dlg = document.createElement('dialog');
    dlg.className = 'editor';
    document.body.append(dlg);
    document.addEventListener('click', ev => {
      if (ev.target.closest('[data-new]')) return withSession(dlg, 'Sign in to add a page', () => openCreator(dlg));
      if (ev.target.closest('[data-gm]')) return openGM();
      const b = ev.target.closest('[data-edit]');
      const e = b && S.entries.find(x => x.slug === b.dataset.edit);
      if (e) withSession(dlg, 'Sign in to edit', () => openEditor(dlg, e), e.title);
    });
  }
  function show(dlg) {
    if (!dlg.open) dlg.showModal();
    // focus the first field, unless the person has already started typing somewhere in the dialog
    setTimeout(() => { if (dlg.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      const t = $('[autofocus], input[name=title], textarea, select', dlg); if (t) t.focus(); }, 30);
  }
  function withSession(dlg, kicker, next, title = '') {
    if (session()) return next();
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
      const err = $('.ed-err', f), h = await sha256(f.key.value);
      let gm = !!editCfg().gmHash && h === editCfg().gmHash, ok = gm || !editCfg().keyHash || h === editCfg().keyHash;
      if (editCfg().endpoint) {
        // the save service is the judge (passkeys can be changed from the site)
        try { const j = await post({ action: 'version', world: worldId() }, { key: f.key.value }); ok = true; gm = !!j.gm; }
        catch (x) { if (/passkey/i.test(x.message)) ok = false; else if (!/latest update/.test(x.message)) { err.textContent = `Couldn’t reach the save service: ${x.message}`; err.hidden = false; return; } }
      }
      if (!ok) { err.textContent = 'That passkey isn’t right.'; err.hidden = false; return; }
      store.set(sessionKey(), { author: f.author.value, key: f.key.value, gm });
      renderGMLink();
      next();
    });
    show(dlg);
  }
  const helpText = who => `Plain markup: type <code>[[</code> to link a page (a list pops up), and tap <b>? Markup</b> for the rest. This text shows as “${esc(who.name)}’s notes”.`;
  const guide = `<div class="ed-guide-wrap"><button type="button" class="ed-guide-btn" aria-expanded="false">? Markup</button>
    <div class="ed-guide" role="tooltip" hidden><table>
      <tr><td><code>[[Page name]]</code></td><td>link to a page</td></tr>
      <tr><td><code>[[Page name|shown text]]</code></td><td>link with different wording</td></tr>
      <tr><td><code>**bold**</code> · <code>*italic*</code></td><td><b>bold</b> · <i>italic</i></td></tr>
      <tr><td><code>==highlight==</code> · <code>~~strike~~</code></td><td><mark>highlight</mark> · <del>strike</del></td></tr>
      <tr><td><code>## Heading</code></td><td>a section heading</td></tr>
      <tr><td><code>- item</code> · <code>1. item</code></td><td>lists (indent to nest)</td></tr>
      <tr><td><code>- [ ] to do</code></td><td>a checkbox</td></tr>
      <tr><td><code>&gt; a quote</code></td><td>a quote</td></tr>
      <tr><td><code>&gt; [!rumor] Title</code><br><code>&gt; text</code></td><td>a boxed callout (also note, tip, warning, question)</td></tr>
      <tr><td><code>| A | B |</code><br><code>|---|---|</code><br><code>| 1 | 2 |</code></td><td>a table</td></tr>
      <tr><td><code>---</code></td><td>a divider line</td></tr>
    </table></div></div>`;
  const field = ta => `<div class="ed-field">${ta}<div class="ed-links" role="listbox" hidden></div></div>`;
  const notesBox = (label, ta) => `<div class="ed-notes-head"><span>${label}</span>${guide}</div>${field(ta)}`;
  async function persist(edit, sess) {
    if (!editCfg().endpoint) {
      const all = (store.get(localKey()) || []).filter(x => !(x.slug === edit.slug && x.author === edit.author));
      store.set(localKey(), [...all, { ...edit, updated: new Date().toISOString() }]);
      return;
    }
    const j = await post({ ...edit, world: worldId() }, sess);
    return j;
  }
  async function post(body, sess) {
    const r = await fetch(editCfg().endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, key: sess.key }) });
    const j = await r.json();
    if (!j.ok) {
      if (/passkey/i.test(j.error || '') && !/GM/.test(j.error || '')) store.set(sessionKey(), null);
      // an older save service doesn't know page details, pins, uploads or GM actions yet
      if (/Unknown (author|action)|Bad world/.test(j.error || '') && (body.action || String(body.author || '').startsWith('@')))
        throw new Error('the shared save service needs its latest update (GM: redeploy duat-backend/Code.gs as a new version)');
      throw new Error(j.error || 'Save failed');
    }
    return j;
  }
  function wireForm(f, onSave, again) {
    const ta = $('textarea[name=text]', f);
    if (ta) attachLinker(ta, $('.ed-links', ta.parentNode), null);
    const gb = $('.ed-guide-btn', f);
    if (gb) {
      const pop = gb.nextElementSibling;
      gb.addEventListener('click', () => { pop.hidden = !pop.hidden; gb.setAttribute('aria-expanded', String(!pop.hidden)); });
      f.addEventListener('click', ev => { if (!pop.hidden && !ev.target.closest('.ed-guide-wrap')) { pop.hidden = true; gb.setAttribute('aria-expanded', 'false'); } });
    }
    const sw = $('.ed-switch', f);
    if (sw) sw.addEventListener('click', () => { store.set(sessionKey(), null); renderGMLink(); again(); });
    f.addEventListener('submit', async ev => {
      if (ev.submitter && ev.submitter.value === 'cancel') return;
      ev.preventDefault();
      const btn = ev.submitter && ev.submitter.classList.contains('primary') ? ev.submitter : $('.primary', f);
      const err = $('.ed-err', f), label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Saving…';
      try { await onSave(ev.submitter); }
      catch (x) {
        err.textContent = `Couldn’t save: ${x.message}.`; err.hidden = false;
        btn.disabled = false; btn.textContent = label;
      }
    });
  }
  const footer = (a, action) => `${!editCfg().endpoint ? '<p class="ed-warn">Preview mode: saves stay in this browser until the shared save service is connected.</p>' : ''}
    <p class="ed-err" hidden></p>
    <div class="ed-actions"><button type="button" class="ed-switch">Not ${esc(a.name)}?</button><span></span>
      <button value="cancel" formnovalidate>Cancel</button><button value="ok" class="primary">${action}</button></div>`;
  const tabs = (on) => `<div class="ed-tabs" role="tablist">
    <button type="button" role="tab" data-tab="notes" aria-selected="${on === 'notes'}">Notes</button>
    <button type="button" role="tab" data-tab="details" aria-selected="${on === 'details'}">Page details</button></div>`;
  function wireTabs(dlg, e) {
    dlg.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () =>
      b.dataset.tab === 'notes' ? openEditor(dlg, e) : openDetails(dlg, e)));
  }

  function openEditor(dlg, e, as) {
    const sess = session(), me = authorOf(sess.author), gm = isGM();
    if (e.slug === homeSlug() && !gm) {
      dlg.innerHTML = `<form method="dialog" class="ed-form"><p class="kicker">Welcome text</p><p>Only the GM can change the welcome text.</p>
        <div class="ed-actions"><span></span><button value="cancel" class="primary">OK</button></div></form>`;
      return show(dlg);
    }
    const who = authorOf(gm && as ? as : sess.author);
    const people = Object.entries(S.world.authors || {});
    dlg.innerHTML = `<form method="dialog" class="ed-form ed-write" style="--c:${who.color}">
      ${tabs('notes')}
      <h2>${esc(e.title)}</h2>
      ${gm && e.slug !== homeSlug() ? `<label class="ed-as">Notes by<select name="as">${people.map(([id, a]) =>
        `<option value="${esc(id)}"${id === who.id ? ' selected' : ''}>${esc(a.name)}${id === me.id ? ' (you)' : ''}</option>`).join('')}</select></label>` : ''}
      ${notesBox(e.slug === homeSlug() ? 'Welcome text' : `${esc(who.name)}’s notes`, `<textarea name="text" rows="12" spellcheck="true" placeholder="What does ${esc(who.name)} know about ${esc(e.title)}?">${esc(ownText(e, who.id))}</textarea>`)}
      <p class="ed-help">${e.slug === homeSlug() ? 'Shown at the top of the home page. Write in plain markup (tap <b>? Markup</b>).' : `${helpText(who)} Other people’s notes aren’t touched. Save it empty to remove these notes.`}</p>
      ${footer(me, 'Save')}
    </form>`;
    const f = $('form', dlg);
    wireTabs(dlg, e);
    if (f.as) f.as.addEventListener('change', () => openEditor(dlg, e, f.as.value));
    wireForm(f, async () => {
      const body = f.text.value.trim();
      const text = e.newHeader && e.createdBy === who.id ? `${e.newHeader}\n${body}` : body; // keep a new page's header
      await persist({ slug: e.slug, author: who.id, text }, sess);
      location.reload();
    }, () => withSession(dlg, 'Sign in to edit', () => openEditor(dlg, e), e.title));
    show(dlg);
  }

  /* page details: everything that isn't someone's notes */
  const factRow = (k = '', v = '') => `<div class="fact-row"><input name="fk" placeholder="Label (e.g. Status)" value="${esc(k)}" autocomplete="off">
    <span class="ed-field"><input name="fv" placeholder="Value (markup; type [[ to link)" value="${esc(v)}" autocomplete="off"><span class="ed-links" role="listbox" hidden></span></span>
    <button type="button" class="fact-x" aria-label="Remove row">×</button></div>`;
  const typeOptions = cur => S.typeOrder.map(t => `<option value="${esc(t)}"${t === cur ? ' selected' : ''}>${esc(typeOf(t).one)}</option>`).join('');
  const imageField = (url, isMap) => `<div class="ed-image">
      <span class="ed-thumb">${url ? `<img src="${esc(asset(url))}" alt="">` : ''}</span>
      <input type="hidden" name="image" value="${esc(url || '')}">
      <label class="ed-upload">${url ? 'Replace' : 'Upload'} ${isMap ? 'map image' : 'picture'}<input type="file" accept="image/*" hidden></label>
      ${url && !isMap ? '<button type="button" class="ed-noimg">Remove</button>' : ''}
      <span class="ed-upmsg muted"></span></div>`;
  function wireImage(f, isMap) {
    const box = $('.ed-image', f), file = $('input[type=file]', box);
    file.addEventListener('change', async () => {
      const msg = $('.ed-upmsg', box), fl = file.files[0]; if (!fl) return;
      msg.textContent = 'Uploading…';
      try {
        const url = await uploadImage(fl, isMap ? 3200 : 1600);
        f.image.value = url;
        $('.ed-thumb', box).innerHTML = `<img src="${esc(asset(url))}" alt="">`;
        msg.textContent = 'Uploaded.';
      } catch (x) { msg.textContent = `Upload failed: ${x.message}`; }
    });
    const rm = $('.ed-noimg', box);
    if (rm) rm.addEventListener('click', () => { f.image.value = ''; $('.ed-thumb', box).innerHTML = ''; rm.remove(); });
  }
  function catForm(f, typeNow, initial) {
    const slot = $('.ed-catslot', f), typed = {};
    const redraw = () => {
      slot.querySelectorAll('[data-ck]').forEach(i => { typed[i.dataset.ck] = i.value; });
      const t = typeNow(), fields = t ? catFields(t) : [];
      slot.innerHTML = fields.length ? `<fieldset class="ed-catfields"><legend>${esc(typeOf(t).one)} details</legend>${fields.map(c => {
        const v = c.key in typed ? typed[c.key] : initial(c.key, c.kind) ?? '';
        const input = `<input data-ck="${esc(c.key)}" data-kind="${c.kind}" value="${esc(Array.isArray(v) ? v.join(', ') : v)}" autocomplete="off"${c.kind === 'number' || c.kind === 'sort' ? ' inputmode="numeric"' : ''}${c.kind === 'date' ? ' placeholder="e.g. Nov 17, 2025"' : ''}${c.kind === 'page' ? ' placeholder="[[Page name]] (type [[ to pick)"' : ''}>`;
        return `<label>${esc(c.label)}<span class="ed-field">${input}<span class="ed-links" role="listbox" hidden></span></span></label>`;
      }).join('')}</fieldset>` : '';
    };
    const wireLinks = () => slot.querySelectorAll('[data-ck]').forEach(i => attachLinker(i, $('.ed-links', i.parentNode), null));
    const redraw2 = () => { redraw(); wireLinks(); };
    redraw2();
    return {
      redraw: redraw2,
      values() {
        const out = { facts: {}, hasSort: false, order: '' };
        slot.querySelectorAll('[data-ck]').forEach(i => {
          const v = i.value.trim();
          if (i.dataset.kind === 'sort') { out.hasSort = true; out.order = v; return; }
          if (!v) return;
          // a page field is always a link: plain "Goldtusks" is stored as [[Goldtusks]]
          out.facts[i.dataset.ck] = i.dataset.kind === 'page' && !/\[\[/.test(v) ? v.split(/\s*,\s*/).map(x => `[[${x}]]`).join(', ') : v;
        });
        return out;
      },
    };
  }
  function openDetails(dlg, e) {
    const sess = session(), me = authorOf(sess.author), gm = isGM();
    const facts = Object.entries(e.fm).filter(([k, v]) => !RESERVED.has(k) && v !== '' && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v === true ? 'Yes' : v === false ? 'No' : String(v)]);
    dlg.innerHTML = `<form method="dialog" class="ed-form ed-write ed-details" style="--c:${typeOf(e.type).color}">
      ${tabs('details')}
      <label>Name<input name="title" required maxlength="80" value="${esc(e.title)}" autocomplete="off"></label>
      <label>Category<select name="type" required>${typeOptions(e.type)}</select></label>
      <label>Nicknames &amp; other spellings<input name="aliases" value="${esc(e.aliases.join(', '))}" placeholder="Separate with commas" autocomplete="off"></label>
      <label>Tags<input name="tags" value="${esc(e.tags.join(', '))}" placeholder="Separate with commas" autocomplete="off"></label>
      <div class="ed-catslot"></div>
      <fieldset class="ed-facts"><legend>Other info rows</legend>${facts.filter(([k]) => !catFields(e.type).some(c => c.key === k)).map(([k, v]) => factRow(cap(k), v)).join('')}
        <button type="button" class="fact-add">+ Add row</button></fieldset>
      <label>Short description <span class="muted">(cards and map pins; leave empty to use the start of the notes)</span>
        <input name="summary" value="${esc(e.fm.summary || '')}" autocomplete="off"></label>
      ${imageField(e.image, e.type === 'map')}
      ${e.type === 'map' ? `<fieldset class="ed-mapset"><legend>Map display</legend>
        <label class="ed-check"><input type="checkbox" name="plates"${norm(e.fm.pins) === 'labels' ? ' checked' : ''}> Pins are name plates (the label is the tap target)</label>
        <div>Always label these categories (others appear as you zoom in):<div class="ed-checks">${S.typeOrder.map(t =>
          `<label class="ed-check"><input type="checkbox" name="major" value="${esc(t)}"${toArray(e.fm.major).map(norm).includes(t) ? ' checked' : ''}> ${esc(typeOf(t).label)}</label>`).join('')}</div></div>
        <div class="ed-overlay"><span>Overlay drawing (transparent image laid over the map):</span>
          <input type="hidden" name="overlay" value="${esc(e.fm.overlay || '')}">
          <span class="ed-ovmsg muted">${e.fm.overlay ? esc(String(e.fm.overlay).split('/').pop()) : 'none'}</span>
          <label class="ed-upload">Upload overlay<input type="file" accept="image/*" hidden></label>
          ${e.fm.overlay ? '<button type="button" class="ed-noover">Remove</button>' : ''}</div>
      </fieldset>` : ''}
      ${gm ? `<fieldset class="ed-gm"><legend>GM</legend>
        <label class="ed-check"><input type="checkbox" name="hidden"${e.hidden ? ' checked' : ''}> Hidden from lists and search</label>
        <label>Merge this page into…<span class="ed-field"><input name="merge" placeholder="Pick a page" autocomplete="off"><span class="ed-links" role="listbox" hidden></span></span></label>
        <button type="submit" value="delete" class="ed-danger">Delete this page</button></fieldset>` : ''}
      ${footer(me, 'Save details')}
    </form>`;
    const f = $('form', dlg);
    wireTabs(dlg, e);
    wireImage(f, e.type === 'map');
    const cf = catForm(f, () => f.type.value, k => k === 'order' ? e.order ?? '' : e.fm[k]);
    f.type.addEventListener('change', cf.redraw);
    const ov = $('.ed-overlay', f);
    if (ov) {
      $('input[type=file]', ov).addEventListener('change', async ev => {
        const fl = ev.target.files[0], msg = $('.ed-ovmsg', ov); if (!fl) return;
        msg.textContent = 'Uploading…';
        try { f.overlay.value = await uploadImage(fl, 3200, true); msg.textContent = 'Uploaded.'; } catch (x) { msg.textContent = `Upload failed: ${x.message}`; }
      });
      const rmo = $('.ed-noover', ov);
      if (rmo) rmo.addEventListener('click', () => { f.overlay.value = ''; $('.ed-ovmsg', ov).textContent = 'none'; rmo.remove(); });
    }
    const facts$ = $('.ed-facts', f);
    const wireFact = row => {
      $('.fact-x', row).addEventListener('click', () => row.remove());
      attachLinker($('input[name=fv]', row), $('.ed-links', row), null);
    };
    facts$.querySelectorAll('.fact-row').forEach(wireFact);
    $('.fact-add', f).addEventListener('click', () => {
      $('.fact-add', f).insertAdjacentHTML('beforebegin', factRow());
      const row = [...facts$.querySelectorAll('.fact-row')].pop(); wireFact(row); $('input', row).focus();
    });
    let mergeInto = null;
    if (gm) attachPicker(f.merge, $('.ed-gm .ed-links', f), t => { if (t !== e) { mergeInto = t; f.merge.value = t.title; } }, true);
    wireForm(f, async sub => {
      const list = v => v.split(',').map(x => x.trim()).filter(Boolean);
      const title = f.title.value.trim().replace(/\s+/g, ' ');
      const clash = resolve(title);
      if (clash && clash !== e) throw new Error(`“${clash.title}” is already a page name or nickname`);
      if (e.type === 'map' && !f.image.value) throw new Error('a map needs an image');
      const meta = { title, type: f.type.value, aliases: list(f.aliases.value).filter(a => norm(a) !== norm(title)), tags: list(f.tags.value),
        summary: f.summary.value.trim(), image: f.image.value,
        ...(e.type === 'map' ? { pinstyle: f.plates.checked ? 'labels' : '', major: [...f.querySelectorAll('input[name=major]:checked')].map(x => x.value), overlay: f.overlay.value } : {}),
        facts: { ...Object.fromEntries([...facts$.querySelectorAll('.fact-row')].map(r => [$('input[name=fk]', r).value.trim(), $('input[name=fv]', r).value.trim()]).filter(([k, v]) => k && v)), ...cf.values().facts } };
      meta.order = cf.values().hasSort ? cf.values().order : e.order ?? '';
      if (gm) {
        meta.hidden = f.hidden.checked;
        if (sub && sub.value === 'delete') {
          if (!confirm(`Delete “${e.title}” for everyone?`)) throw new Error('not deleted');
          meta.deleted = true;
        }
        if (mergeInto && f.merge.value.trim()) {
          if (!confirm(`Merge “${e.title}” into “${mergeInto.title}”? Its notes move there and its name becomes a nickname.`)) throw new Error('not merged');
          meta.mergeInto = mergeInto.slug;
        }
      }
      await persist({ slug: e.slug, author: '@meta', text: JSON.stringify(meta) }, sess);
      if (meta.deleted || meta.mergeInto) location.hash = meta.mergeInto ? href(mergeInto) : '#/';
      location.reload();
    }, () => withSession(dlg, 'Sign in to edit', () => openDetails(dlg, e), e.title));
    show(dlg);
  }

  /* broad check for existing pages before creating one: every page, hidden ones included,
     by name and nickname; exact matches (ignoring case, punctuation and a leading "The"),
     close spellings, and shared words; plus names already written as [[links]] with no page */
  const simple = x => norm(x).replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]+/g, '');
  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 3) return 9;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function findSimilar(name) {
    const q = simple(name), qWords = norm(name).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !['the', 'and'].includes(w));
    const out = { exact: null, near: [], mentioned: [] };
    if (!q) return out;
    for (const e of S.entries) {
      const names = [e.title, ...e.aliases];
      if (names.some(n => simple(n) === q)) { out.exact = out.exact || e; continue; }
      const close = names.some(n => {
        const s2 = simple(n), words = norm(n).split(/[^a-z0-9]+/);
        return (q.length >= 4 && editDistance(q, s2) <= Math.max(1, Math.floor(q.length / 6)))
          || (q.length >= 5 && (s2.includes(q) || (s2.length >= 5 && q.includes(s2))))
          || qWords.some(w => words.some(x => x.length >= 4 && (x === w || (w.length >= 5 && editDistance(w, x) <= 1))));
      });
      if (close) out.near.push(e);
    }
    if (!out.exact) out.mentioned = S.entries.filter(e => [...e.body.matchAll(WL_RE)].some(m => simple(m[1].split('|')[0]) === q));
    out.near = out.near.slice(0, 8);
    return out;
  }
  function openCreator(dlg) {
    const sess = session(), a = authorOf(sess.author);
    dlg.innerHTML = `<form method="dialog" class="ed-form ed-write" style="--c:${a.color}">
      <p class="kicker">New page</p><h2>Add to the catalog</h2>
      <label>Name<input name="title" required maxlength="80" autocomplete="off" placeholder="e.g. Madame Vex"></label>
      <div class="ed-similar" hidden></div>
      <label>Category<select name="type" required><option value="">Choose…</option>${typeOptions('')}</select></label>
      <div class="ed-newmap" hidden>${imageField('', true)}</div>
      <div class="ed-catslot"></div>
      ${notesBox(`${esc(a.name)}’s notes`, '<textarea name="text" rows="8" spellcheck="true" placeholder="What do you know about it?"></textarea>')}
      <p class="ed-help">${helpText(a)} Nicknames, tags, more info rows and a picture can be added afterwards under ✎ Edit → Page details.</p>
      ${footer(a, 'Create page')}
    </form>`;
    const f = $('form', dlg);
    wireImage(f, true);
    let similar = { exact: null, near: [] }, acknowledged = '';
    const sim = $('.ed-similar', f);
    f.title.addEventListener('input', () => {
      similar = findSimilar(f.title.value);
      acknowledged = '';
      sim.hidden = !similar.exact && !similar.near.length && !similar.mentioned.length;
      sim.innerHTML = similar.exact
        ? `<p class="ed-err">“${esc(similar.exact.title)}” already has a page${norm(similar.exact.title) !== norm(f.title.value) ? ` (“${esc(f.title.value.trim())}” matches one of its names)` : ''}. <a href="${href(similar.exact)}" data-close>Open it</a> and use ✎ Edit instead.</p>`
        : `${similar.near.length ? `<p>Already here with a similar name:</p><ul>${similar.near.map(e => `<li><a href="${href(e)}" data-close>${esc(e.title)}</a> <span class="muted">${esc(typeOf(e.type).one)}${e.hidden ? ', hidden' : ''}${e.aliases.length ? ` · aka ${esc(e.aliases.slice(0, 3).join(', '))}` : ''}</span></li>`).join('')}</ul>` : ''}
           ${similar.mentioned.length ? `<p class="muted">Already mentioned (no page yet) in ${similar.mentioned.slice(0, 4).map(e => `<a href="${href(e)}" data-close>${esc(e.title)}</a>`).join(', ')}${similar.mentioned.length > 4 ? ` and ${similar.mentioned.length - 4} more` : ''}. Creating it makes those links live.</p>` : ''}`;
    });
    sim.addEventListener('click', ev => { if (ev.target.closest('[data-close]')) dlg.close(); });
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const cf = catForm(f, () => f.type.value, (k, kind) => kind === 'sort'
      ? Math.max(0, ...S.entries.filter(x => x.type === f.type.value).map(x => x.order || 0)) + 1
      : kind === 'date' ? today : '');
    f.type.addEventListener('change', () => { $('.ed-newmap', f).hidden = f.type.value !== 'map'; f.text.required = f.type.value !== 'map'; cf.redraw(); });
    f.text.required = true;
    wireForm(f, async () => {
      const title = f.title.value.trim().replace(/\s+/g, ' '), slug = slugify(title), type = f.type.value;
      similar = findSimilar(title);
      const clash = similar.exact || S.entries.find(x => x.slug === slug);
      if (!slug) throw new Error('that name needs some letters');
      if (clash) throw new Error(`“${clash.title}” already has a page. Open it and use ✎ Edit`);
      if (similar.near.length && acknowledged !== norm(title)) {
        acknowledged = norm(title);
        f.title.dispatchEvent(new Event('input')); acknowledged = norm(title);
        throw new Error('there are pages with similar names (listed under the name). If this is really something new, press Create page again');
      }
      if (type === 'map' && !f.image.value) throw new Error('upload the map image first');
      const extra = [];
      if (type === 'map') extra.push(`image: "${f.image.value}"`, 'pins: labels');
      const cv = cf.values();
      if (cv.hasSort && cv.order !== '') extra.push(`order: ${+cv.order}`);
      for (const [k, v] of Object.entries(cv.facts)) extra.push(`${k}: ${fmVal(v)}`);
      const header = `---\ntitle: "${title.replace(/"/g, '’')}"\ntype: ${type}${extra.length ? '\n' + extra.join('\n') : ''}\n---`;
      await persist({ slug, author: a.id, text: `${header}\n${f.text.value.trim()}` }, sess);
      location.hash = '#/e/' + slug;
      location.reload();
    }, () => withSession(dlg, 'Sign in to add a page', () => openCreator(dlg)));
    show(dlg);
  }

  /* image upload: shrink in the browser, then store with the save service (or inline in preview mode) */
  async function uploadImage(file, maxSide, keepAlpha) {
    if (!/^image\//.test(file.type)) throw new Error('that isn’t an image');
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    let url = keepAlpha ? c.toDataURL('image/png') : c.toDataURL('image/webp', 0.85);
    if (!keepAlpha && !url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', 0.85);
    if (!editCfg().endpoint) return url;
    const [, mime, data] = url.match(/^data:([^;]+);base64,(.*)$/);
    const j = await post({ action: 'upload', world: worldId(), name: `${slugify(file.name.replace(/\.\w+$/, '')) || 'image'}.${mime.split('/')[1]}`, mime, data }, session());
    return j.url;
  }

  /* GM tools: export edits back into .md files, then clear the shared sheet */
  function renderGMLink() {
    const slot = $('.foot-gm'); if (!slot) return;
    slot.innerHTML = isGM() ? '<button type="button" class="foot-link" data-gm>GM tools</button>' : '';
  }
  function openGM() {
    const dlg = S.dlg, changed = S.entries.filter(e => e.dirty);
    dlg.innerHTML = `<form method="dialog" class="ed-form">
      <p class="kicker">GM tools</p><h2>${esc(S.world.title)}</h2>
      <p class="ed-svc muted">${editCfg().endpoint ? 'Checking the save service…' : 'Preview mode: no shared save service connected.'}</p>
      <div class="ed-actions ed-stack">
        <button type="button" data-g="settings" class="primary">Campaign settings</button>
        <button type="button" data-g="newworld">Start a new campaign</button></div>
      <fieldset><legend>Fold site edits into the files</legend>
        <p class="muted">${changed.length} page${changed.length === 1 ? '' : 's'} changed on the site${S.deleted.length ? `, ${S.deleted.length} deleted or merged` : ''}. Optional: site edits work fine where they are. To make the files the master copy again: export, apply with <code>duat-backend/apply_export.py</code>, deploy, then clear.</p>
        <div class="ed-actions ed-stack"><button type="button" data-g="export">1. Download export</button>
        <button type="button" data-g="clear" class="ed-danger" disabled>2. Clear shared edits</button></div></fieldset>
      <p class="ed-err" hidden></p>
      <div class="ed-actions"><button type="button" data-g="out">Sign out</button><span></span><button value="cancel">Close</button></div>
    </form>`;
    const f = $('form', dlg), err = $('.ed-err', f);
    if (editCfg().endpoint) post({ action: 'version', world: worldId() }, session())
      .then(j => { $('.ed-svc', f).textContent = `Save service connected (version ${j.version}).`; })
      .catch(x => { $('.ed-svc', f).textContent = /latest update/.test(x.message) ? 'The save service is an older version: redeploy duat-backend/Code.gs as a new version.' : `Save service problem: ${x.message}`; });
    f.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-g]'); if (!b) return;
      if (b.dataset.g === 'out') { store.set(sessionKey(), null); renderGMLink(); dlg.close(); }
      if (b.dataset.g === 'settings') openSettings();
      if (b.dataset.g === 'newworld') openNewCampaign();
      if (b.dataset.g === 'export') {
        const out = { world: worldId(), exported: new Date().toISOString(), entries: Object.fromEntries(changed.map(e => [e.slug, toMarkdown(e)])), deleted: S.deleted };
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
        a.download = `duat-export-${worldId()}-${out.exported.slice(0, 10)}.json`; a.click();
        $('[data-g=clear]', f).disabled = false;
      }
      if (b.dataset.g === 'clear') {
        if (!confirm('Clear every shared page edit for this campaign? Only do this after the export has been applied and deployed. Campaign settings are kept.')) return;
        try {
          if (editCfg().endpoint) await post({ action: 'clear', world: worldId() }, session());
          else store.set(localKey(), (store.get(localKey()) || []).filter(x => x.author === '@world'));
          location.reload();
        } catch (x) { err.textContent = x.message; err.hidden = false; }
      }
    });
    show(dlg);
  }

  /* campaign settings: everything that used to live only in world.json */
  const personRow = (id = '', a = {}) => `<div class="set-row set-person" data-id="${esc(id)}">
    <input name="pname" placeholder="Name" value="${esc(a.name || '')}" required autocomplete="off">
    <input name="prole" placeholder="Role (e.g. plays Rosie)" value="${esc(a.role || '')}" autocomplete="off">
    <input name="pcolor" type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(a.color || '') ? a.color : '#9fb4ff')}" aria-label="Color">
    <button type="button" class="fact-x" data-x aria-label="Remove">×</button></div>`;
  const fieldChip = (x = {}) => `<span class="set-field"><input name="flabel" placeholder="Field name" value="${esc(x.label || '')}" autocomplete="off">
    <select name="fkind">${Object.entries(FIELD_KINDS).map(([k, l]) => `<option value="${k}"${(x.kind || 'text') === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <button type="button" class="fact-x" data-xf aria-label="Remove field">×</button></span>`;
  const catRow = (id, t, w, used) => `<div class="set-row set-cat" data-id="${esc(id)}">
    <div class="set-cat-main"><input name="clabel" placeholder="Plural (e.g. Gangs)" value="${esc(t.label || '')}" required autocomplete="off">
      <input name="cone" placeholder="Singular (e.g. Gang)" value="${esc(t.one || '')}" required autocomplete="off">
      <input name="ccolor" type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(t.color || '') ? t.color : '#a4abb8')}" aria-label="Color">
      <span class="set-move"><button type="button" data-up aria-label="Move up">↑</button><button type="button" data-down aria-label="Move down">↓</button></span>
      <button type="button" class="fact-x" data-x aria-label="Remove"${used ? ' disabled title="Has pages"' : ''}>×</button></div>
    <div class="set-fields"><span class="muted">Fields on its pages:</span>
      ${(t.fields || []).map(fieldChip).join('')}<button type="button" class="set-addf" data-addf>+ field</button></div>
    <div class="set-cat-opts">
      <label class="ed-check"><input type="checkbox" name="cnav"${(w.navTypes || []).includes(id) ? ' checked' : ''}> In top bar</label>
      <label class="ed-check"><input type="checkbox" name="cnew"${(w.newestFirst || []).includes(id) ? ' checked' : ''}> Newest first</label>
      <label class="ed-check"><input type="checkbox" name="cmajor"${(w.mapMajorTypes || []).includes(id) ? ' checked' : ''}> Always labeled on maps</label></div></div>`;
  function openSettings() {
    const dlg = S.dlg, w = S.world;
    const used = new Set(S.entries.map(e => e.type));
    dlg.innerHTML = `<form method="dialog" class="ed-form ed-details">
      <p class="kicker">GM tools</p><h2>Campaign settings</h2>
      <label>Title<input name="title" required value="${esc(w.title || '')}" autocomplete="off"></label>
      <label>Short name <span class="muted">(shown on phones)</span><input name="short" value="${esc(w.short || '')}" autocomplete="off"></label>
      <label>Kicker <span class="muted">(small line above the title)</span><input name="kicker" value="${esc(w.kicker || '')}" autocomplete="off"></label>
      <label>Tagline<input name="subtitle" value="${esc(w.subtitle || '')}" autocomplete="off"></label>
      <label>Welcome text <span class="muted">(top of the home page; plain markup)</span><textarea name="welcome" rows="4">${esc(((resolve(homeSlug()) || S.entries.find(x => x.slug === homeSlug())) || { body: '' }).body.replace(/^:::.*$/gm, '').trim())}</textarea></label>
      <label class="ed-check">Accent color <input name="accent" type="color" value="${esc(/^#[0-9a-f]{6}$/i.test((w.theme || {}).accent || '') ? w.theme.accent : '#ff5a36')}"></label>
      <fieldset class="set-people"><legend>People who can sign in</legend>
        ${Object.entries(w.authors || {}).map(([id, a]) => personRow(id, a)).join('')}
        <button type="button" class="fact-add" data-addp>+ Add person</button></fieldset>
      <fieldset class="set-cats"><legend>Categories</legend>
        ${S.typeOrder.map(id => catRow(id, typeOf(id), w, used.has(id))).join('')}
        <button type="button" class="fact-add" data-addc>+ Add category</button></fieldset>
      <fieldset><legend>Passkeys</legend>
        <p class="muted">Leave blank to keep the current ones. Everyone signed in will need the new passkey.</p>
        <label>New player passkey<input name="pk" type="password" autocomplete="new-password"></label>
        <label>New GM passkey<input name="gk" type="password" autocomplete="new-password"></label></fieldset>
      <p class="ed-err" hidden></p>
      <div class="ed-actions"><button type="button" data-back>← GM tools</button><span></span><button value="cancel" formnovalidate>Cancel</button><button value="ok" class="primary">Save settings</button></div>
    </form>`;
    const f = $('form', dlg);
    const wire = root => {
      root.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => b.closest('.set-row').remove()));
      root.querySelectorAll('[data-xf]').forEach(b => b.addEventListener('click', () => b.closest('.set-field').remove()));
      root.querySelectorAll('[data-addf]:not([data-bound])').forEach(b => {
        b.dataset.bound = '';
        b.addEventListener('click', () => { b.insertAdjacentHTML('beforebegin', fieldChip()); const c = b.previousElementSibling; wire(c); $('input', c).focus(); });
      });
      root.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => { const r = b.closest('.set-row'); if (r.previousElementSibling && r.previousElementSibling.classList.contains('set-row')) r.parentNode.insertBefore(r, r.previousElementSibling); }));
      root.querySelectorAll('[data-down]').forEach(b => b.addEventListener('click', () => { const r = b.closest('.set-row'), n = r.nextElementSibling; if (n && n.classList.contains('set-row')) r.parentNode.insertBefore(n, r); }));
    };
    wire(f);
    $('[data-addp]', f).addEventListener('click', ev => { ev.target.insertAdjacentHTML('beforebegin', personRow()); wire(ev.target.previousElementSibling); ev.target.previousElementSibling.querySelector('input').focus(); });
    $('[data-addc]', f).addEventListener('click', ev => { ev.target.insertAdjacentHTML('beforebegin', catRow('', {}, w, false)); wire(ev.target.previousElementSibling); ev.target.previousElementSibling.querySelector('input').focus(); });
    $('[data-back]', f).addEventListener('click', openGM);
    wireForm(f, async () => {
      const authors = {};
      for (const r of f.querySelectorAll('.set-person')) {
        const name = $('[name=pname]', r).value.trim(); if (!name) continue;
        let id = r.dataset.id || slugify(name).split('-')[0] || 'person';
        if (!r.dataset.id) { const base = id; let n = 2; while (authors[id] || (w.authors || {})[id]) id = base + n++; }
        authors[id] = { name, role: $('[name=prole]', r).value.trim(), color: $('[name=pcolor]', r).value };
      }
      if (!authors[session().author]) throw new Error('you can’t remove yourself from the people list');
      const types = {}, typeOrder = [], navTypes = [], newestFirst = [], mapMajorTypes = [];
      for (const r of f.querySelectorAll('.set-cat')) {
        const label = $('[name=clabel]', r).value.trim(), one = $('[name=cone]', r).value.trim(); if (!label || !one) continue;
        const id = r.dataset.id || slugify(one);
        if (!id || types[id]) throw new Error(`the category “${one}” is listed twice`);
        const fields = [...r.querySelectorAll('.set-field')].map(c => ({ label: $('[name=flabel]', c).value.trim(), kind: $('[name=fkind]', c).value })).filter(x => x.label);
        if (fields.filter(x => x.kind === 'sort').length > 1) throw new Error(`“${label}” can only have one sort number`);
        types[id] = { label, one, color: $('[name=ccolor]', r).value, fields }; typeOrder.push(id);
        if ($('[name=cnav]', r).checked) navTypes.push(id);
        if ($('[name=cnew]', r).checked) newestFirst.push(id);
        if ($('[name=cmajor]', r).checked) mapMajorTypes.push(id);
      }
      const missing = [...used].filter(t => !types[t]);
      if (missing.length) throw new Error(`pages still use ${missing.map(t => typeOf(t).one).join(', ')}; keep that category`);
      const st = { title: f.title.value.trim(), short: f.short.value.trim(), kicker: f.kicker.value.trim(), subtitle: f.subtitle.value.trim(),
        theme: { ...(w.theme || {}), accent: f.accent.value }, authors, types, typeOrder, navTypes, newestFirst, mapMajorTypes, home: w.home || 'home',
        keyHash: f.pk.value ? await sha256(f.pk.value) : editCfg().keyHash, gmHash: f.gk.value ? await sha256(f.gk.value) : editCfg().gmHash };
      const sess = session();
      await persist({ slug: SETTINGS_SLUG, author: '@world', text: JSON.stringify(st) }, sess);
      const home = S.entries.find(x => x.slug === homeSlug()), welcome = f.welcome.value.trim();
      if (home && welcome !== home.body.replace(/^:::.*$/gm, '').trim()) {
        const text = home.newHeader && home.createdBy === sess.author ? `${home.newHeader}\n${welcome}` : welcome;
        await persist({ slug: home.slug, author: sess.author, text }, sess);
      } else if (!home && welcome) {
        await persist({ slug: homeSlug(), author: sess.author, text: `---\ntitle: Welcome\ntype: note\nhidden: true\n---\n${welcome}` }, sess);
      }
      if ((f.pk.value || f.gk.value) && editCfg().endpoint) await post({ action: 'setkeys', world: worldId(), keyHash: st.keyHash, gmHash: st.gmHash }, sess);
      if (f.gk.value) store.set(sessionKey(), { ...sess, key: f.gk.value });
      location.reload();
    }, openSettings);
    show(dlg);
  }

  /* new campaign: lives entirely in the save service, at /duat/play/?w=<id> */
  function openNewCampaign() {
    const dlg = S.dlg, me = session();
    dlg.innerHTML = `<form method="dialog" class="ed-form">
      <p class="kicker">GM tools</p><h2>Start a new campaign</h2>
      <label>Campaign name<input name="title" required maxlength="60" autocomplete="off" placeholder="e.g. Liar's Night"></label>
      <label>Link name <span class="muted">(letters, numbers, dashes)</span><input name="id" required pattern="[a-z0-9][a-z0-9-]*" autocomplete="off"></label>
      <label>Welcome text for the home page<textarea name="intro" rows="4" placeholder="What players see first."></textarea></label>
      <p class="muted">It starts with this campaign’s categories and just you as a player; add people under Campaign settings once it’s open.</p>
      <p class="ed-err" hidden></p>
      <div class="ed-actions"><button type="button" data-back>← GM tools</button><span></span><button value="ok" class="primary">Create campaign</button></div>
    </form>`;
    const f = $('form', dlg);
    f.title.addEventListener('input', () => { f.id.value = slugify(f.title.value); });
    $('[data-back]', f).addEventListener('click', openGM);
    wireForm(f, async () => {
      const id = slugify(f.id.value), title = f.title.value.trim();
      if (!id) throw new Error('the link name needs letters');
      if (id === worldId()) throw new Error('that’s this campaign');
      const w = S.world, a = authorOf(me.author);
      const st = { title, short: title.split(/\s+/).map(x => x[0]).join('').toUpperCase().slice(0, 4), kicker: 'Player quickref', subtitle: '',
        theme: { ...(w.theme || {}) }, authors: { [a.id]: { name: a.name, role: a.role || 'GM', color: a.color } },
        types: Object.fromEntries(S.typeOrder.map(t => [t, { ...typeOf(t) }])), typeOrder: S.typeOrder,
        navTypes: w.navTypes || S.typeOrder, newestFirst: w.newestFirst || [], mapMajorTypes: w.mapMajorTypes || [], home: 'home',
        keyHash: editCfg().keyHash, gmHash: editCfg().gmHash };
      const intro = f.intro.value.trim() || `Welcome to ${title}.`;
      const rows = [{ slug: SETTINGS_SLUG, author: '@world', text: JSON.stringify(st) },
        { slug: 'home', author: a.id, text: `---\ntitle: Welcome\ntype: note\nhidden: true\n---\n${intro}` }];
      if (editCfg().endpoint) {
        const r = await fetch(`${editCfg().endpoint}?world=${encodeURIComponent(id)}`, { cache: 'no-cache' }).then(x => x.json());
        if (r.ok && r.edits.length) throw new Error(`there’s already a campaign at “${id}”`);
        for (const row of rows) await post({ ...row, world: id }, me);
      } else {
        if ((store.get(`duat:${id}:edits`) || []).length) throw new Error(`there’s already a campaign at “${id}”`);
        store.set(`duat:${id}:edits`, rows.map(x => ({ ...x, updated: new Date().toISOString() })));
      }
      store.set(`duat:${id}:session`, me);
      location.href = `/duat/play/?w=${encodeURIComponent(id)}`;
    }, openNewCampaign);
    show(dlg);
  }
  const fmVal = v => {
    if (Array.isArray(v)) return `[${v.map(x => String(x).replace(/,/g, '，')).join(', ')}]`;
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    v = String(v);
    return /^[\s"'[{>|#&*!%@`-]|:\s|\[\[|,/.test(v) ? `"${v.replace(/"/g, '’')}"` : v;
  };
  function toMarkdown(e) {
    const fm = { title: e.title, type: e.type };
    if (e.aliases.length) fm.aliases = e.aliases;
    if (e.tags.length) fm.tags = e.tags;
    if (e.fm.summary) fm.summary = e.fm.summary;
    if (e.image) fm.image = e.image;
    if (e.order != null) fm.order = e.order;
    if (e.hidden) fm.hidden = true;
    if (e.fm.author && !/^:::/m.test(e.body)) fm.author = toArray(e.fm.author).join(', ');
    for (const k of ['pins', 'overlay', 'major']) if (e.fm[k]) fm[k] = e.fm[k];
    for (const [k, v] of Object.entries(e.fm)) if (!RESERVED.has(k) && v !== '' && !(Array.isArray(v) && !v.length)) fm[k] = v;
    const pins = e.pins.length ? `\n\n\`\`\`pins\n${e.pins.map(p => `${p.x}, ${p.y} | ${p.target ? `[[${p.target}${p.rawLabel ? '|' + p.rawLabel : ''}]]` : p.rawLabel}${p.note ? ' | ' + p.note : ''}`).join('\n')}\n\`\`\`` : '';
    return `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${fmVal(v)}`).join('\n')}\n---\n${e.body.trim()}${pins}\n`;
  }

  /* pick-a-page box for single-line inputs (pins, merge) */
  function attachPicker(input, box, onPick, withHidden) {
    let hits = [], cur = 0;
    const close = () => { box.hidden = true; };
    const draw = () => {
      const q = input.value.trim();
      if (!q) return close();
      hits = nameMatches(q, withHidden).slice(0, 6); cur = Math.min(cur, Math.max(hits.length - 1, 0));
      if (!hits.length) return close();
      box.innerHTML = hits.map((e, i) => `<button type="button" role="option" data-i="${i}" class="${i === cur ? 'is-cur' : ''}" style="--c:${typeOf(e.type).color}">
        <span class="sr-type">${esc(typeOf(e.type).one)}</span><span>${esc(e.title)}</span></button>`).join('');
      box.hidden = false; box.style.top = (input.offsetTop + input.offsetHeight + 4) + 'px';
    };
    const pick = i => { if (hits[i]) { onPick(hits[i]); close(); } };
    input.addEventListener('input', () => { cur = 0; draw(); });
    input.addEventListener('blur', () => setTimeout(close, 150));
    input.addEventListener('keydown', ev => {
      if (box.hidden) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); cur = (cur + (ev.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length; draw(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); pick(cur); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); }
    });
    box.addEventListener('pointerdown', ev => ev.preventDefault());
    box.addEventListener('click', ev => { const b = ev.target.closest('[data-i]'); if (b) pick(+b.dataset.i); });
  }

  /* page names and nicknames matching what's typed: the [[ pop-up, and the pin/merge pickers */
  function nameMatches(q, withHidden) {
    q = norm(q);
    const all = S.entries.filter(e => withHidden || !e.hidden);
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
      if (ta.tagName === 'INPUT') { box.style.top = (ta.offsetTop + ta.offsetHeight + 4) + 'px'; return; }
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
    if (btn) btn.addEventListener('click', () => {
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
  const SETTINGS_SLUG = 'duat-settings';
  const SETTING_KEYS = ['title', 'short', 'kicker', 'subtitle', 'theme', 'authors', 'types', 'typeOrder', 'navTypes', 'newestFirst', 'mapMajorTypes', 'home'];
  function applySettings(row) {
    if (!row) return false;
    let st; try { st = JSON.parse(row.text); } catch { return false; }
    const before = S.world.types || {};
    for (const k of SETTING_KEYS) if (st[k] !== undefined) S.world[k] = st[k];
    for (const [id, t] of Object.entries(S.world.types || {})) if (t && !('fields' in t) && before[id] && before[id].fields) t.fields = before[id].fields;
    S.world.edit = { ...(S.world.edit || {}), ...(st.keyHash ? { keyHash: st.keyHash } : {}), ...(st.gmHash ? { gmHash: st.gmHash } : {}) };
    return true;
  }
  async function boot() {
    const root = document.getElementById('duat');
    try {
      let w;
      if (root.dataset.play !== undefined) {
        // a campaign that lives entirely in the save service: /duat/play/?w=<id>
        const id = slugify(new URLSearchParams(location.search).get('w') || '');
        if (!id) throw new Error('No campaign chosen. Links look like /duat/play/?w=my-campaign');
        w = { id, title: id, entries: [], siteOnly: true,
          edit: { endpoint: root.dataset.endpoint || '', keyHash: root.dataset.keyHash || '', gmHash: root.dataset.gmHash || '' } };
      } else {
        const res = await fetch(root.dataset.world || 'world.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`world.json → HTTP ${res.status}`);
        w = await res.json();
      }
      S.world = w;
      S.worldId = slugify(w.id || w.title || 'world');
      const edits = await loadEdits();
      const found = applySettings(edits.find(x => x.author === '@world'));
      if (w.siteOnly && !found) throw new Error(`There’s no campaign called “${S.worldId}” yet. A GM can start one from GM tools.`);
      document.title = S.world.title || 'Duat';
      S.types = { ...DEFAULT_TYPES };
      for (const [k, v] of Object.entries(S.world.types || {})) S.types[k] = { ...(S.types[k] || typeOf(k)), ...v };
      if (S.world.theme) for (const [k, v] of Object.entries(S.world.theme)) document.documentElement.style.setProperty('--' + k, v);
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
      applyEdits(edits.filter(x => x.author !== '@world'));
      index();
      const present = [...new Set(S.entries.map(e => e.type))];
      S.typeOrder = [...new Set([...(S.world.typeOrder || Object.keys(DEFAULT_TYPES)), ...present])];
      renderChrome(root);
      wireEditing();
      renderGMLink();
      wireAbout();
      window.addEventListener('hashchange', route);
      route();
    } catch (err) {
      console.error(err);
      root.innerHTML = `<div class="wrap boot-error"><h1>Couldn’t open this world</h1><p>${esc(err.message)}</p>
        ${root.dataset.play !== undefined ? '' : '<p class="muted">If you opened the file directly from disk, serve the folder instead (e.g. <code>python3 -m http.server</code> in <code>src/</code>).</p>'}</div>`;
    }
  }
  boot();
})();
