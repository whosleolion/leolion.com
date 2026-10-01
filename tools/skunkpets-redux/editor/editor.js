/* =========================================================
   SKUNKPETS REDUX: BACKEND EDITOR (preview only)
   ---------------------------------------------------------
   Loaded only on leolion.com/building/skunkpets-preview/
   (the preview workflow adds it, plus codemirror.bundle.js;
   the live game never has either).

   "✎ Backend" opens a panel beside the game with four
   editors as tabs, Markup, Comments, Diskette and Events,
   that all follow one shared selection (THE SHARED
   SELECTION below): words dragged across in the game, or, in
   Edit mode (⌖), a paragraph, photo or thing clicked. A popup
   by the selection jumps between them. "Save to preview"
   commits every change to GitHub (the branch the preview was
   built from), which rebuilds the preview.

   Links, photos and Diskette's zones are shown in a shorter
   form while editing and turned back into the game's markup
   on save:
     [[Tom Barry]]   [[shown words->Page name]]
     [[photo: file.jpg | right | 40% | description]]
     [[diskette: 80 | what she says]]            a point zone
     [[diskette: 10 | on: words | ...]]          a zone on words
     [[diskette: 10 | around | ...]]…[[/diskette]]  around more
     [[diskette: page | ...]]                    the whole page
   Notes (comments) are kept in editor/comments.json on the
   same branch; never part of the game.
   See tools/skunkpets-redux/editor/README.md.
   ========================================================= */

(function () {
  "use strict";

  /* =======================================================
     PURE HELPERS (no browser needed; tested in Node)
     ======================================================= */

  const LINK_RE = /\(link: "([^"]*)"\)\[\(set: \$navPending to "([^"]*)"\)\(display: "func-navigate"\)\]/g;
  const PHOTO_RE = /<div class="article-art( article-art-left)?" data-art="([^"]+)"(?: style="width: ([\d.]+%)")? role="img" aria-label="([^"]*)"><\/div>/g;
  /* Diskette's response zones and whole-page comments (her "inspecting"
     mode; see DISKETTE INSPECTING in the game's script). */
  const ZONE_RE = /<span class="diskette-(zone|page)"(?: data-radius="(\d+)")?(?: data-mood="(hop|shake|wide)")?(?: data-if="([^"]*)")?(?: data-on="([^"]*)")?(?: data-cycle="(loop|random)")?(?: data-then="([^"]*)")?(?: data-draft="(1)")? data-say="([^"]*)">([^<>\[\]|]*)<\/span>/g;
  const PHOTO_ON_RE = /^\[data-art='([^']+)'\]$/;
  const ZONE_RADIUS = 60;

  const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const unescAttr = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  /* Harlowe breaks a tag on &quot; inside an attribute, so straight double
     quotes in what Diskette says become curly ones. */
  const escSay = (s) => {
    let open = true;
    return s.replace(/"/g, () => ((open = !open) ? "\u201d" : "\u201c"))
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };
  const unescSay = (s) => unescAttr(s.replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  const quote = (s) => (s.indexOf('"') < 0 ? '"' + s + '"' : "'" + s + "'");

  /* The </span> that closes the span opening at `from` (counting nested spans), or -1. */
  function matchingClose(source, from) {
    const re = /<span\b[^>]*>|<\/span>/g;
    re.lastIndex = from;
    let depth = 0;
    for (let m = re.exec(source); m; m = re.exec(source)) {
      if (m[0][1] === "/") { depth--; if (depth === 0) return m.index; }
      else depth++;
    }
    return -1;
  }

  /* The short-form marker for a zone's opening tag (attrs from attrsOf). */
  function zoneMarker(kind, a, extra) {
    const parts = [kind === "page" ? "page" : a.radius || String(ZONE_RADIUS)];
    if (a.mood) parts.push(a.mood);
    if (a.cycle) parts.push(a.cycle);
    if (a.draft) parts.push("draft");
    if (a.if) parts.push("if: " + unescAttr(a.if));
    if (extra) parts.push(extra);
    if (a.then) parts.push("then: " + unescSay(a.then));
    parts.push(unescSay(a.say || ""));
    return "[[diskette: " + parts.join(" | ") + "]]";
  }

  /* Zones wrapped around more than plain words (a paragraph with links, other
     tags) become [[diskette: ... | around | ...]] … [[/diskette]]. */
  function wrapsToFriendly(source) {
    let out = "";
    let at = 0;
    const re = /<span class="diskette-zone"((?:\s[a-z-]+="[^"]*")*)>/g;
    for (let m = re.exec(source); m; m = re.exec(source)) {
      const close = matchingClose(source, m.index);
      const inside = close < 0 ? "" : source.slice(m.index + m[0].length, close);
      if (close < 0 || inside === "" || /^[^<>\[\]|]*$/.test(inside)) continue; /* empty or plain words: ZONE_RE's */
      const a = attrsOf(m[1]);
      if (a.on) continue;
      /* Only if it would come back the same (attribute order). */
      if (zoneTag({ kind: "zone", radius: a.radius, mood: a.mood, cond: unescAttr(a.if || ""), cycle: a.cycle, then: a.then ? unescSay(a.then) : "", draft: a.draft !== undefined, say: unescSay(a.say || "") }) !== m[0]) continue;
      out += source.slice(at, m.index) + zoneMarker("zone", a, "around") + wrapsToFriendly(inside) + "[[/diskette]]";
      at = close + "</span>".length;
      re.lastIndex = at;
    }
    return out + source.slice(at);
  }

  /* Game markup -> the short form shown in the editor. */
  function toFriendly(source) {
    return wrapsToFriendly(source)
      .replace(ZONE_RE, function (_, kind, radius, mood, cond, on, cycle, then, draft, say, words) {
        const parts = [kind === "page" ? "page" : radius || String(ZONE_RADIUS)];
        if (mood) parts.push(mood);
        if (cycle) parts.push(cycle);
        if (draft) parts.push("draft");
        if (cond) parts.push("if: " + unescAttr(cond));
        if (on) {
          const photo = PHOTO_ON_RE.exec(unescAttr(on));
          parts.push(photo ? "on photo: " + photo[1] : "on element: " + unescAttr(on));
        } else if (words) parts.push("on: " + words);
        if (then) parts.push("then: " + unescSay(then));
        parts.push(unescSay(say));
        return "[[diskette: " + parts.join(" | ") + "]]";
      })
      .replace(PHOTO_RE, function (_, left, file, width, alt) {
        const parts = [file, left ? "left" : "right"];
        if (width) parts.push(width);
        parts.push(unescAttr(alt));
        return "[[photo: " + parts.join(" | ") + "]]";
      })
      .replace(LINK_RE, function (_, shown, target) {
        return shown === target ? "[[" + shown + "]]" : "[[" + shown + "->" + target + "]]";
      });
  }

  function photoHtml(inner) {
    const parts = inner.split("|").map((p) => p.trim());
    const file = parts.shift();
    let left = false;
    let width = "";
    const rest = [];
    parts.forEach(function (p) {
      if (p === "left" || p === "right") left = p === "left";
      else if (/^\d+(\.\d+)?%$/.test(p)) width = p;
      else rest.push(p);
    });
    return '<div class="article-art' + (left ? " article-art-left" : "") + '" data-art="' + escAttr(file) + '"' +
      (width ? ' style="width: ' + width + '"' : "") +
      ' role="img" aria-label="' + escAttr(rest.join(" | ")) + '"></div>';
  }

  /* [[diskette: ...]] -> its tag(s). The parts before her line can come in
     any order: a radius or "page", hop/shake/wide, loop/random, draft,
     if: …, on: … / on photo: … / on element: …, around, then: … */
  function zoneHtml(inner) {
    const parts = inner.split("|").map((p) => p.trim());
    const f = { kind: "zone", radius: ZONE_RADIUS, mood: "", cond: "" };
    let words = "";
    let around = false;
    while (parts.length > 1) {
      const x = parts[0];
      if (/^(page|\d+(px)?)$/.test(x)) { if (x === "page") f.kind = "page"; else f.radius = parseInt(x, 10); }
      else if (/^(hop|shake|wide)$/.test(x)) f.mood = x;
      else if (/^(loop|random)$/.test(x)) f.cycle = x;
      else if (x === "draft") f.draft = true;
      else if (x === "around") around = true;
      else if (/^if:/.test(x)) f.cond = x.slice(3).trim();
      else if (/^on photo:/.test(x)) f.on = "[data-art='" + x.slice(9).trim() + "']";
      else if (/^on element:/.test(x)) f.on = x.slice(11).trim();
      else if (/^on:/.test(x)) words = x.slice(3).trim();
      else if (/^then:/.test(x)) f.then = x.slice(5).trim();
      else break;
      parts.shift();
    }
    f.say = parts.join(" | ");
    return zoneTag(f) + (around ? "" : words + "</span>");
  }

  /* ---------- Diskette's reactions (pure) ---------- */

  /* The opening tag of a zone or page comment, attributes in the one order
     toFriendly understands. */
  function zoneTag(f) {
    return '<span class="diskette-' + (f.kind === "page" ? "page" : "zone") + '"' +
      (f.kind === "page" ? "" : ' data-radius="' + (parseInt(f.radius, 10) || ZONE_RADIUS) + '"') +
      (f.mood && f.mood !== "hop" ? ' data-mood="' + f.mood + '"' : "") +
      (f.cond ? ' data-if="' + escAttr(f.cond.replace(/"/g, "")) + '"' : "") +
      (f.on && f.kind !== "page" ? ' data-on="' + escAttr(f.on.replace(/"/g, "'")) + '"' : "") +
      (f.cycle && f.cycle !== "order" ? ' data-cycle="' + f.cycle + '"' : "") +
      (f.then ? ' data-then="' + escSay(f.then) + '"' : "") +
      (f.draft ? ' data-draft="1"' : "") +
      ' data-say="' + escSay(f.say || "") + '">';
  }

  const attrsOf = (str) => {
    const out = {};
    for (const m of str.matchAll(/\sdata-([a-z]+)="([^"]*)"/g)) out[m[1]] = m[2];
    return out;
  };

  /* "TODO P1-04 Ticket: the first clue" -> { prio: 1, num: 4, note: "Ticket: the first clue" } */
  function todoOf(text) {
    const m = /^TODO\b\s*(?:P(\d)(?:-(\d+))?)?\s*([\s\S]*)$/.exec((text || "").trim());
    return m ? { prio: m[1] ? +m[1] : 9, num: m[2] ? +m[2] : 999, note: m[3].trim() } : null;
  }

  /* Every zone and page comment in a passage's source, in order. */
  function findReactions(source) {
    const out = [];
    for (const m of source.matchAll(/<span class="diskette-(zone|page)"((?:\s[a-z-]+="[^"]*")*)>/g)) {
      const a = attrsOf(m[2]);
      const say = unescSay(a.say || "");
      const at = m.index + m[0].length;
      const close = matchingClose(source, m.index);
      const inside = close >= 0 ? source.slice(at, close) : "";
      const on = unescAttr(a.on || "");
      const photo = PHOTO_ON_RE.exec(on);
      out.push({
        kind: m[1], from: m.index, to: at, empty: inside === "",
        /* what it covers: a point, the words it wraps, or elements (data-on) */
        shape: m[1] === "page" ? "page" : on ? "element" : inside === "" ? "point" : "words",
        on: on, photo: photo ? photo[1] : "", words: inside, draft: a.draft !== undefined,
        radius: a.radius ? +a.radius : on || inside ? 10 : ZONE_RADIUS, mood: a.mood || "hop", cycle: a.cycle || "order", then: unescSay(a.then || ""), cond: unescAttr(a.if || ""), say: say, todo: todoOf(say),
      });
    }
    return out;
  }

  /* Rewrites (fields) or deletes (null) the n-th reaction in a passage. */
  function editReaction(source, n, fields) {
    const r = findReactions(source)[n];
    if (!r) throw new Error("That reaction isn't there any more.");
    if (fields) return source.slice(0, r.from) + zoneTag(Object.assign({}, r, fields)) + source.slice(r.to);
    if (r.empty) return source.slice(0, r.from) + source.slice(r.to + "</span>".length);
    /* Words (or anything) inside: keep them, drop the zone around them. */
    const close = matchingClose(source, r.from);
    if (close < 0) throw new Error("Couldn't find the end of this zone; remove it in the markup.");
    return source.slice(0, r.from) + source.slice(r.to, close) + source.slice(close + "</span>".length);
  }

  /* DisketteLooks: one <p data-look="keys" ...>text</p> per line. */
  const LOOK_RE = /^<p data-look="([^"]*)"((?:\s[a-z-]+="[^"]*")*)>(.*)<\/p>$/gm;
  function findLooks(source) {
    const out = [];
    for (const m of source.matchAll(LOOK_RE)) {
      const a = attrsOf(m[2]);
      const text = m[3];
      out.push({ keys: m[1].split(/[\s,]+/).filter(Boolean), from: m.index, to: m.index + m[0].length, mood: a.mood || "hop", cycle: a.cycle || "order", then: unescSay(a.then || ""), draft: a.draft !== undefined, cond: unescAttr(a.if || ""), text: text, todo: todoOf(text) });
    }
    return out;
  }
  function lookLine(f) {
    return '<p data-look="' + f.keys.join(" ") + '"' + (f.mood && f.mood !== "hop" ? ' data-mood="' + f.mood + '"' : "") +
      (f.cond ? ' data-if="' + escAttr(f.cond.replace(/"/g, "")) + '"' : "") +
      (f.cycle && f.cycle !== "order" ? ' data-cycle="' + f.cycle + '"' : "") +
      (f.then ? ' data-then="' + escSay(f.then) + '"' : "") +
      (f.draft ? ' data-draft="1"' : "") + ">" + (f.text || "").replace(/\n/g, " ") + "</p>";
  }
  function editLook(source, n, fields) {
    const l = findLooks(source)[n];
    if (!l) throw new Error("That line isn't there any more.");
    if (!fields) return source.slice(0, l.from) + source.slice(l.to).replace(/^\n/, "");
    return source.slice(0, l.from) + lookLine(Object.assign({}, l, fields)) + source.slice(l.to);
  }
  function addLook(source, fields) {
    return source.replace(/\n*$/, "\n") + lookLine(fields) + "\n";
  }

  /* GameEvents: <p data-event="id" data-after="a, b">what it is</p>. */
  function findEvents(source) {
    const out = [];
    for (const m of source.matchAll(/^<p data-event="([^"]*)"((?:\s[a-z-]+="[^"]*")*)>(.*)<\/p>$/gm)) {
      const a = attrsOf(m[2]);
      out.push({ id: unescAttr(m[1]), after: unescAttr(a.after || "").split(",").map((x) => x.trim()).filter(Boolean), text: m[3] });
    }
    return out;
  }

  /* A place in the short form where a [[diskette: ...]] can go without
     breaking a word, title, link, photo or tag: the end of the sentence pos
     is in (or, if that's far, of the word), moved past any link or tag. */
  function safeInsertPos(text, pos) {
    const rest = text.slice(pos, pos + 160);
    const end = /[.!?…](?=["”’')]*(?:\s|$|<|\[|\\))|\n/.exec(rest);
    if (end) {
      pos += end.index + (end[0] === "\n" ? 0 : 1);
      while (pos < text.length && /["”’')]/.test(text[pos])) pos++;
    } else {
      while (pos < text.length && /[\w’'-]/.test(text[pos]) && pos > 0 && /[\w’'-]/.test(text[pos - 1])) pos++;
    }
    const open = text.lastIndexOf("[[", pos - 1);
    if (open >= 0 && open < pos && text.indexOf("]]", open) >= pos - 1) {
      const close = text.indexOf("]]", open);
      if (close >= 0 && text.lastIndexOf("]]", pos - 1) < open) pos = close + 2;
    }
    const lt = text.lastIndexOf("<", pos - 1);
    if (lt >= 0 && text.lastIndexOf(">", pos - 1) < lt) {
      const gt = text.indexOf(">", lt);
      if (gt >= 0) pos = gt + 1;
    }
    return pos;
  }

  /* The short form -> game markup. */
  function fromFriendly(text) {
    return text
      .replace(/\[\[\/diskette\]\]/g, "</span>")
      .replace(/\[\[diskette:([^\]]*)\]\]/g, (_, inner) => zoneHtml(inner))
      .replace(/\[\[photo:([^\]]*)\]\]/g, (_, inner) => photoHtml(inner))
      .replace(/\[\[([^\]]+?)\]\]/g, function (_, inner) {
        const arrow = inner.lastIndexOf("->");
        const shown = arrow >= 0 ? inner.slice(0, arrow) : inner;
        const target = arrow >= 0 ? inner.slice(arrow + 2) : inner;
        return "(link: " + quote(shown) + ")[(set: $navPending to " + quote(target) + ')(display: "func-navigate")]';
      });
  }

  function photoFiles(source) {
    return Array.from(source.matchAll(/data-art="([^"]+)"/g), (m) => unescAttr(m[1]));
  }

  /* Links in the short form: where they point and where they sit. */
  function linkTargets(text) {
    const out = [];
    for (const m of text.matchAll(/\[\[(?!photo:|diskette:|\/diskette)([^\]]+?)\]\]/g)) {
      const arrow = m[1].lastIndexOf("->");
      out.push({ target: arrow >= 0 ? m[1].slice(arrow + 2) : m[1], from: m.index, to: m.index + m[0].length });
    }
    return out;
  }

  /* Roughly the words a reader sees for a piece of short-form markup, used to
     find a comment's quote in the game. */
  function gameText(text) {
    return text
      .replace(/\[\[(?:photo:|diskette:|\/diskette)[^\]]*\]\]/g, " ")
      .replace(/\[\[([^\]]+?)\]\]/g, function (_, inner) {
        const arrow = inner.lastIndexOf("->");
        return arrow >= 0 ? inner.slice(0, arrow) : inner;
      })
      .replace(/\\\n/g, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/''|\^\^|~~|(?<!:)\/\//g, "")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* Where a comment's quote is in the page text now, preferring the
     occurrence whose surroundings still match; null if it's gone. */
  function locateQuote(doc, c) {
    if (!c || !c.quote) return null;
    let best = null;
    let bestScore = -1;
    for (let i = doc.indexOf(c.quote); i >= 0; i = doc.indexOf(c.quote, i + 1)) {
      let score = 0;
      if (c.prefix && doc.slice(Math.max(0, i - c.prefix.length), i) === c.prefix) score += 2;
      if (c.suffix && doc.slice(i + c.quote.length, i + c.quote.length + c.suffix.length) === c.suffix) score += 1;
      if (score > bestScore) { best = i; bestScore = score; }
    }
    return best === null ? null : { from: best, to: best + c.quote.length };
  }

  /* An anchor for the words from..to in doc: the words plus a little of
     what's around them, so they can be found again after edits. */
  function makeAnchor(doc, from, to) {
    const q = doc.slice(from, to);
    if (!q.trim()) return {};
    return { quote: q.slice(0, 400), prefix: doc.slice(Math.max(0, from - 30), from), suffix: doc.slice(to, to + 30) };
  }

  /* ---------- Editing the .twee (same passage rules as build.js) ---------- */

  const unTwee = (s) => s.replace(/\\(.)/g, "$1");
  const HEADER_RE = /^((?:\\.|[^\[{\\])+?)\s*(?:\[((?:\\.|[^\]\\])*)\])?\s*(\{.*\})?$/;

  /* Returns { twee, before } with the passage's body replaced, or throws. */
  function replacePassage(twee, name, body) {
    const headers = Array.from(twee.matchAll(/^::(?!:)(.*)$/gm));
    for (let i = 0; i < headers.length; i++) {
      const m = headers[i][1].trim().match(HEADER_RE);
      if (!m || unTwee(m[1].trim()) !== name) continue;
      const start = headers[i].index + headers[i][0].length + 1;
      const end = i + 1 < headers.length ? headers[i + 1].index : twee.length;
      const old = twee.slice(start, end);
      const trailing = old.match(/\n*$/)[0];
      const before = old.replace(/\n+$/, "").replace(/^\\::/gm, "::");
      const escaped = body.replace(/\n+$/, "").replace(/^::/gm, "\\::");
      return { twee: twee.slice(0, start) + escaped + (trailing || "\n") + twee.slice(end), before: before };
    }
    throw new Error('No passage named "' + name + '" in the .twee');
  }

  function hasPassage(twee, name) {
    try { replacePassage(twee, name, ""); return true; } catch (e) { return false; }
  }

  /* Adds a new passage at the end of the .twee. */
  function insertPassage(twee, name, tags, body) {
    const header = ":: " + name + (tags.length ? " [" + tags.join(" ") + "]" : "");
    return twee.replace(/\n*$/, "\n\n") + header + "\n" + body.replace(/\n+$/, "").replace(/^::/gm, "\\::") + "\n";
  }

  /* A page name that's safe in the .twee, in Harlowe links and in search,
     and doesn't clash with an existing page (ignoring case). Returns an
     error message, or "" if it's fine. */
  function pageNameProblem(name, existing) {
    if (!name) return "Give the page a name.";
    if (name !== name.trim()) return "The name can't start or end with a space.";
    if (name.length > 60) return "Keep the name under 60 characters.";
    if (/[\[\]{}\\"|<>]/.test(name)) return 'The name can\'t contain [ ] { } \\ " | < or >.';
    if (/^[:$_]/.test(name) || name.indexOf("->") >= 0) return "The name can't start with : $ or _, or contain ->.";
    const lower = name.toLowerCase();
    if (existing.some((n) => n.toLowerCase() === lower)) return "There's already a page called that.";
    return "";
  }

  /* Starting text for new pages, in the short form. */
  const TEMPLATES = [
    {
      id: "article", label: "Winkipedia article", tags: ["wiki", "article"],
      note: "Looks like the other encyclopedia pages; findable in Winkipedia search.",
      body: (n) => '<div class="wiki-article">\\\n<h1>' + n + "</h1>\\\n" + n + " is … (write the opening here).\n\n<h2>History</h2>\\\nMore here.\n</div>",
    },
    {
      id: "fanwiki", label: "Fan wiki page", tags: ["wiki", "fanwiki"],
      note: "The dark Skunkpets Fan Wiki look, with its banner.",
      body: (n) => '<div class="wiki-fanwiki">\\\n(display:"img-fanwikibar")\\\n<h1>' + n + "</h1>\\\nWrite here.\n</div>",
    },
    {
      id: "forum", label: "Forum thread", tags: ["wiki", "fanwiki"],
      note: "A fan wiki forum thread with one post (copy the POST block for more).",
      body: (n) => '<div class="wiki-fanwiki">\\\n(display:"img-fanwikibar")\\\n<h1>' + n + '</h1>\\\n<div class="forum-thread">\\\n<!--POST-->\\\n<div class="forum-post">\\\n(display:"forum-user-bruce1")\n<div class="forum-post-body">\\\n<div class="forum-post-headerline">\\\n<span>Posted: 1 January 2009, 12:00</span>\\\n<span class="forum-post-number">#1</span></div>\\\n<div class="forum-post-content">\\\nFirst post goes here.\n</div></div></div>\\\n<!--POST END-->\\\n</div>\\\n</div>',
    },
    {
      id: "gamesarchive", label: "Games archive page", tags: ["wiki", "gamesarchive"],
      note: "The Global Games Archive look, with its banner.",
      body: (n) => '<div class="wiki-gamesarchive">\\\n(display:"img-gamesarch")<hr>\\\n<h1>' + n + "</h1>\\\nWrite here.\n</div>",
    },
    {
      id: "blank", label: "Blank wiki page", tags: ["wiki"],
      note: "Nothing but a heading.",
      body: (n) => "<h1>" + n + "</h1>\\\nWrite here.",
    },
  ];

  /* The line build.js puts in WinkiIndex for each searchable page. */
  const winkiIndexLink = (n) => '(link-repeat: "' + n + '")[(set: $navPending to "' + n + '")(display: "func-navigate")]';

  /* ---------- Comments (pure) ---------- */

  /* Applies one change to the comments file's data. Changes are replayed on
     the newest copy if someone else saved in between, so two people
     commenting at once never lose each other's notes. */
  function applyCommentOp(data, op) {
    let comments = (data && Array.isArray(data.comments) ? data.comments : []).slice();
    const patch = (id, fields) => { comments = comments.map((c) => (c.id === id ? Object.assign({}, c, fields) : c)); };
    if (op.type === "add") {
      if (!comments.some((c) => c.id === op.comment.id)) comments.push(op.comment);
    } else if (op.type === "resolve") {
      patch(op.id, { resolved: op.resolved, resolvedBy: op.resolved ? op.by : undefined });
    } else if (op.type === "reanchor") {
      patch(op.id, { quote: op.anchor.quote, prefix: op.anchor.prefix, suffix: op.anchor.suffix });
    } else if (op.type === "delete") {
      comments = comments.filter((c) => c.id !== op.id && c.parent !== op.id);
    }
    return { comments: comments };
  }

  /* Line-by-line differences between two texts: [{ type: " " | "+" | "-", text }]. */
  function lineDiff(a, b) {
    const x = a === "" ? [] : a.split("\n");
    const y = b === "" ? [] : b.split("\n");
    const n = x.length;
    const m = y.length;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) { out.push({ type: " ", text: x[i] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) out.push({ type: "-", text: x[i++] });
      else out.push({ type: "+", text: y[j++] });
    }
    while (i < n) out.push({ type: "-", text: x[i++] });
    while (j < m) out.push({ type: "+", text: y[j++] });
    return out;
  }

  /* Three-way merge by lines: the changes from base to mine, applied on top of
     theirs (base changed by someone else). Returns the merged text, or null
     when both changed the same lines differently. */
  function mergeLines(base, mine, theirs) {
    if (mine === base) return theirs;
    if (theirs === base || theirs === mine) return mine;
    const b = base.split("\n");
    /* Per base line: deleted (and what replaces it), and lines inserted before it. */
    const edits = function (other) {
      const del = new Set();
      const repl = {};
      const ins = {};
      let i = 0;
      let lastDel = -1;
      lineDiff(base, other).forEach(function (r) {
        if (r.type === " ") { i++; lastDel = -1; }
        else if (r.type === "-") { del.add(i); lastDel = i; i++; }
        else if (lastDel >= 0) (repl[lastDel] = repl[lastDel] || []).push(r.text);
        else (ins[i] = ins[i] || []).push(r.text);
      });
      return { del: del, repl: repl, ins: ins };
    };
    const A = edits(mine);
    const B = edits(theirs);
    const same = (x, y) => String(x || "") === String(y || "");
    const out = [];
    for (let i = 0; i <= b.length; i++) {
      if (A.ins[i] && B.ins[i] && !same(A.ins[i], B.ins[i])) return null;
      out.push.apply(out, A.ins[i] || B.ins[i] || []);
      if (i === b.length) break;
      const da = A.del.has(i);
      const db = B.del.has(i);
      if (da && db && !same(A.repl[i], B.repl[i])) return null;
      if (da) out.push.apply(out, A.repl[i] || []);
      else if (db) out.push.apply(out, B.repl[i] || []);
      else out.push(b[i]);
    }
    return out.join("\n");
  }

  /* What a reader sees of some short-form markup, with where each character
     came from: { vis, map } (map[i] = index in text of vis[i]). Whitespace is
     collapsed, markup that shows nothing is dropped, link text kept. Used to
     find text selected in the game in the markup. */
  const BLOCK_TAG = /^<\/?(div|p|h\d|li|ul|ol|br|tr|td|th|table|hr|blockquote)\b/i;
  const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
  function visibleMap(text) {
    let vis = "";
    const map = [];
    const put = function (ch, at) {
      if (/\s/.test(ch)) {
        if (!vis.length || vis[vis.length - 1] === " ") return;
        ch = " ";
      }
      vis += ch;
      map.push(at);
    };
    let i = 0;
    while (i < text.length) {
      const rest = text.slice(i, i + 400);
      let m;
      if ((m = /^(`+)([\s\S]*?)\1/.exec(rest)) && m[2]) {
        /* Harlowe verbatim: shown as is, without the backticks. */
        for (let k = 0; k < m[2].length; k++) put(m[2][k], i + m[1].length + k);
        i += m[0].length;
        continue;
      }
      if ((m = /^\[\[diskette:[^\]]*?\|\s*on:\s*([^|\]]*?)\s*\|[^\]]*\]\]/.exec(rest))) {
        /* A zone on words: the words show. */
        const at = i + m[0].indexOf(m[1], m[0].indexOf("on:"));
        for (let k = 0; k < m[1].length; k++) put(m[1][k], at + k);
        i += m[0].length;
        continue;
      }
      if ((m = /^\[\[(?:photo:|diskette:|\/diskette)[^\]]*\]\]/.exec(rest))) { i += m[0].length; continue; }
      if ((m = /^\[\[([^\]]+?)\]\]/.exec(rest))) {
        const arrow = m[1].lastIndexOf("->");
        const shown = arrow >= 0 ? m[1].slice(0, arrow) : m[1];
        for (let k = 0; k < shown.length; k++) put(shown[k], i + 2 + k);
        i += m[0].length;
        continue;
      }
      if ((m = /^<[^>]*>/.exec(rest))) { if (BLOCK_TAG.test(m[0])) put(" ", i); i += m[0].length; continue; }
      if ((m = /^\([a-z][a-z0-9-]*:[^)]*\)/i.exec(rest))) { i += m[0].length; continue; }
      if ((m = /^&#(\d+);/.exec(rest))) { put(String.fromCharCode(+m[1]), i); i += m[0].length; continue; }
      if ((m = /^&[a-z]+;/.exec(rest)) && ENTITIES[m[0]]) { put(ENTITIES[m[0]], i); i += m[0].length; continue; }
      if (/^(''|\^\^|~~)/.test(rest) || (rest.startsWith("//") && text[i - 1] !== ":")) { i += 2; continue; }
      if (rest.startsWith("\\\n")) { i += 2; continue; }
      if (rest[0] === "*" && (i === 0 || text[i - 1] === "\n") && rest[1] === " ") { i += 2; continue; }
      put(text[i], i);
      i++;
    }
    return { vis: vis, map: map };
  }

  /* Widens from..to so it doesn't cut a [[link]], marker or <tag> in half. */
  function expandRange(text, from, to) {
    const constructs = /\[\[[^\]]*\]\]|<[^>]*>/g;
    for (const m of text.matchAll(constructs)) {
      const a = m.index;
      const b = m.index + m[0].length;
      if (a < from && from < b) from = a;
      if (a < to && to < b) to = b;
    }
    /* Don't leave a bold or italic pair half inside. */
    ["''", "//"].forEach(function (mark) {
      const inside = text.slice(from, to).split(mark).length - 1;
      if (inside % 2 === 1) {
        const after = text.indexOf(mark, to);
        const before = text.lastIndexOf(mark, from - 1);
        if (after >= 0 && (before < 0 || after - to <= from - before)) to = after + mark.length;
        else if (before >= 0) from = before;
      }
    });
    return { from: from, to: to };
  }

  /* The paragraph (line) of short-form text around pos, without a trailing
     line-joining backslash or a leading list bullet. */
  function lineAround(text, pos) {
    let from = text.lastIndexOf("\n", Math.max(0, pos - 1)) + 1;
    if (pos > 0 && text[pos - 1] === "\n") from = pos;
    let to = text.indexOf("\n", pos);
    if (to < 0) to = text.length;
    if (text[to - 1] === "\\") to--;
    if (text.startsWith("* ", from)) from += 2;
    return { from: from, to: to };
  }

  /* Pages named in an editor commit message ("Edit Winkipedia: A, B (new), photo x.jpg"). */
  function pagesInMessage(message) {
    const first = (message || "").split("\n")[0];
    if (first.indexOf("Edit Winkipedia: ") !== 0) return [];
    return first.slice(17).split(", ").filter((p) => p.indexOf("photo ") !== 0).map((p) => p.replace(/ \(new\)$/, ""));
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      toFriendly, fromFriendly, replacePassage, insertPassage, hasPassage, photoFiles, linkTargets, gameText,
      locateQuote, makeAnchor, pageNameProblem, TEMPLATES, winkiIndexLink, applyCommentOp, lineDiff, pagesInMessage,
      visibleMap, expandRange, lineAround, mergeLines, zoneTag, zoneHtml, matchingClose, todoOf, findReactions, editReaction, findLooks, lookLine, editLook, addLook, findEvents, safeInsertPos,
    };
  }
  if (typeof document === "undefined") return;

  /* =======================================================
     IN THE BROWSER
     ======================================================= */

  const CM = window.SkeCM;
  const script = document.currentScript;
  const REPO = (script && script.dataset.repo) || "whosleolion/leolion.com";
  const BRANCH = (script && script.dataset.branch) || "";
  const BUILT = script && script.dataset.built ? Date.parse(script.dataset.built) : 0;
  const TWEE_PATH = "tools/skunkpets-redux/skunkpets-redux.twee";
  const ART_PATH = "tools/skunkpets-redux/art/";
  const COMMENTS_PATH = "tools/skunkpets-redux/editor/comments.json";
  const STORE_KEY = "skunkpets-editor";
  const TOKEN_KEY = "skunkpets-editor-token";
  const NAME_KEY = "skunkpets-editor-name";
  const PANEL_WIDTH = 460;

  const store = (function () {
    let data;
    try { data = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { data = {}; }
    data.drafts = data.drafts || {};      /* name -> short-form text not yet saved */
    data.photos = data.photos || {};      /* file -> { url, w, h }, added but not yet saved */
    data.saved = data.saved || {};        /* name -> source saved but not yet in this build */
    data.savedPhotos = data.savedPhotos || {};
    data.newPages = data.newPages || {};  /* name -> { tags, saved } for pages made here, until built */
    data.raw = data.raw || {};            /* name -> true: its draft is plain source, not the short form
                                             (passages that aren't wiki pages, edited from the Diskette tab) */
    data.tab = data.tab || "markup";
    data.bases = data.bases || {};        /* name -> the source a draft was started from */
    data.conflicts = data.conflicts || {}; /* name -> true: changed underneath and couldn't be merged */
    data.savedAt = data.savedAt || {};    /* name -> when it was saved (ms) */
    data.open = !!data.open;
    return {
      data: data,
      write: function () { try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) {} },
    };
  })();

  const local = {
    get: (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } },
    set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} },
  };
  const getToken = () => local.get(TOKEN_KEY);
  const getName = () => local.get(NAME_KEY);

  /* Asks once for the name shown on comments and saves. */
  function ensureName() {
    let name = getName();
    if (!name) {
      name = (prompt("Your name (shown on your comments and saves):") || "").trim();
      if (name) local.set(NAME_KEY, name);
    }
    return name;
  }
  const authorFor = (name) => ({ name: name, email: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "@skunkpets-editor.invalid" });

  let hook = null;
  const original = {}; /* name -> source as built into this page */

  /* ---------- Pages in the game ---------- */

  function passage(name) {
    const p = hook && hook.passages.get(name);
    return p instanceof Map ? p : null;
  }
  const tagsOf = (name) => (passage(name) && passage(name).get("tags")) || (store.data.newPages[name] && store.data.newPages[name].tags) || [];
  const isWikiPage = (name) => tagsOf(name).indexOf("wiki") >= 0;
  const isNewPage = (name) => !!store.data.newPages[name] && !(name in original);
  const pageExists = (name) => !!passage(name);

  function allPageNames() {
    const names = [];
    hook.passages.forEach((p, name) => { if (p instanceof Map) names.push(name); });
    return names;
  }
  const wikiPageNames = () => allPageNames().filter(isWikiPage).sort((a, b) => a.localeCompare(b));

  /* Short-form text the page had before this browser's unsaved changes. */
  function baseline(name) {
    if (name in store.data.saved) return store.data.saved[name];
    if (name in original) return original[name];
    return "";
  }

  function forgetDraft(name) {
    delete store.data.drafts[name];
    delete store.data.raw[name];
    delete store.data.bases[name];
    delete store.data.conflicts[name];
  }

  /* Drafts started on an older build: carry them over onto what the game
     has now, or flag them if both changed the same lines (saving would
     undo someone else's change). */
  function rebaseDrafts() {
    Object.keys(store.data.drafts).forEach(function (name) {
      const base = store.data.bases[name];
      const now = baseline(name);
      if (base === undefined) { store.data.bases[name] = now; return; }
      if (base === now) return;
      const merged = mergeLines(base, draftSource(name), now);
      if (merged === null) { store.data.conflicts[name] = true; return; }
      store.data.drafts[name] = store.data.raw[name] ? merged : toFriendly(merged);
      store.data.bases[name] = now;
      delete store.data.conflicts[name];
      if (merged === now) forgetDraft(name);
    });
    store.write();
  }

  /* The source a draft stands for. */
  function draftSource(name) {
    const d = store.data.drafts[name];
    return store.data.raw[name] ? d : fromFriendly(d);
  }

  function currentSource(name) {
    if (store.data.drafts[name] != null) return draftSource(name);
    return baseline(name);
  }

  /* While the panel is open, links to pages that don't exist yet become red
     "create me" words in the game instead of links that would break. */
  function gameSource(name) {
    const source = currentSource(name);
    if (!store.data.open || !isWikiPage(name)) return source;
    return source.replace(LINK_RE, function (m, shown, target) {
      if (pageExists(target)) return m;
      return '<span class="ske-redlink" data-page="' + escAttr(target) + '" title="There\'s no page called this yet. Click to create it.">' + shown + "</span>";
    });
  }

  function makePassage(name, tags, source) {
    return Object.assign(new Map([["source", source], ["tags", tags], ["name", name]]), {
      TwineScript_TypeName: "a passage datamap",
      TwineScript_ObjectName: "a passage datamap",
    });
  }

  function applyToGame(name) {
    const p = passage(name);
    if (p) p.set("source", gameSource(name));
    else if (store.data.newPages[name]) hook.passages.set(name, makePassage(name, store.data.newPages[name].tags, gameSource(name)));
  }

  /* Winkipedia search reads the WinkiIndex passage; new searchable pages
     join it here straight away (build.js does the same on the next build). */
  function syncSearchIndex() {
    const index = passage("WinkiIndex");
    if (!index || !("WinkiIndex" in original)) return;
    let source = original.WinkiIndex;
    Object.keys(store.data.newPages).forEach(function (name) {
      if (pageExists(name) && tagsOf(name).indexOf("article") >= 0 && source.indexOf(winkiIndexLink(name)) < 0) source += winkiIndexLink(name);
    });
    index.set("source", source);
  }

  /* Re-applies every wiki page (edits, new pages, red links) to the game. */
  function syncGame() {
    /* New pages first, so links to them on other pages aren't red. */
    Object.keys(store.data.newPages).forEach(applyToGame);
    wikiPageNames().forEach(applyToGame);
    /* Reactions edited in other passages (mail, the ticket, DisketteLooks). */
    Object.keys(store.data.drafts).forEach(function (name) { if (!isWikiPage(name) && passage(name)) applyToGame(name); });
    syncSearchIndex();
  }

  function photoStyles() {
    let el = document.getElementById("ske-photo-styles");
    if (!el) {
      el = document.createElement("style");
      el.id = "ske-photo-styles";
      document.head.appendChild(el);
    }
    const all = Object.assign({}, store.data.savedPhotos, store.data.photos);
    el.textContent = Object.keys(all).map(function (f) {
      /* .browser-page-content in front: this sheet loads before the game's,
         whose general .article-art rule would otherwise win. */
      return '.browser-page-content .article-art[data-art="' + f + '"] { aspect-ratio: ' + all[f].w + " / " + all[f].h + '; background-image: url("' + all[f].url + '"); }';
    }).join("\n");
  }

  /* Redraw the game, keeping the browser page's scroll position. */
  function redraw() {
    const content = document.querySelector(".browser-page-content");
    const top = content ? content.scrollTop : 0;
    hook.redraw();
    const after = document.querySelector(".browser-page-content");
    if (after) after.scrollTop = top;
  }

  /* Saved edits stay applied until the preview has been rebuilt with them. */
  function settleSaved() {
    Object.keys(store.data.saved).forEach(function (name) {
      /* The build has it (or something newer: built after it was saved). */
      const built = BUILT && (store.data.savedAt[name] || 0) < BUILT;
      if ((name in original && (original[name] === store.data.saved[name] || built)) || (!(name in original) && !store.data.newPages[name])) {
        delete store.data.saved[name];
        delete store.data.savedAt[name];
      }
    });
    Object.keys(store.data.newPages).forEach(function (name) {
      if (name in original) delete store.data.newPages[name]; /* the build has it now */
    });
    const probe = document.createElement("div");
    probe.className = "article-art";
    probe.style.display = "none";
    document.body.appendChild(probe);
    Object.keys(store.data.savedPhotos).forEach(function (f) {
      probe.setAttribute("data-art", f);
      if (getComputedStyle(probe).backgroundImage.indexOf("data:") >= 0) delete store.data.savedPhotos[f];
    });
    probe.remove();
    store.write();
  }

  /* Every photo file the game knows: in any passage, or added in the editor. */
  function knownPhotos() {
    const files = new Set(Object.keys(store.data.photos).concat(Object.keys(store.data.savedPhotos)));
    Object.keys(original).forEach((name) => photoFiles(original[name]).forEach((f) => files.add(f)));
    return files;
  }

  /* ---------- GitHub ---------- */

  async function gh(path, options) {
    options = options || {};
    const res = await fetch("https://api.github.com/repos/" + REPO + path, {
      method: options.method || "GET",
      headers: Object.assign({
        Authorization: "Bearer " + getToken(),
        Accept: options.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      }, options.body ? { "Content-Type": "application/json" } : {}),
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      let text = "GitHub said " + res.status + " for " + path + ": " + body;
      if (res.status === 401) {
        text = "GitHub didn't accept the token (it may have expired or been mistyped). Paste a new one under GitHub (top of the panel).";
      } else if (res.status === 403 && (options.method || "GET") !== "GET") {
        text = "Your token can read the repository but isn't allowed to change it. On GitHub, open the token " +
          "(Settings → Developer settings → Fine-grained tokens), and under Permissions set " +
          "Contents to “Read and write” (not Read-only), then Save to preview again. Nothing was saved.";
      } else if (res.status === 403 || res.status === 404) {
        text = "Your token can't see " + REPO + ". Make sure the token's Repository access includes it.";
      }
      const err = new Error(text);
      err.status = res.status;
      throw err;
    }
    return options.raw ? res.text() : res.json();
  }

  /* One commit with every changed and new page and new photo, under the
     editor's name. Retries if the branch moved underneath (another save, or
     a push from Claude). */
  async function commitAll(names, photos, author, confirmOverwrite) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = await gh("/git/ref/heads/" + encodeURIComponent(BRANCH));
      const head = ref.object.sha;
      const commit = await gh("/git/commits/" + head);
      let twee = await gh("/contents/" + TWEE_PATH + "?ref=" + head, { raw: true });

      const clashes = [];
      names.forEach(function (name) {
        const body = draftSource(name);
        if (isNewPage(name) && !hasPassage(twee, name)) {
          twee = insertPassage(twee, name, store.data.newPages[name].tags, body);
          return;
        }
        const r = replacePassage(twee, name, body);
        const expected = name in store.data.saved ? store.data.saved[name] : (name in original ? original[name] : null);
        if (r.before !== expected) clashes.push(name);
        twee = r.twee;
      });
      if (clashes.length && !confirmOverwrite(clashes)) throw new Error("Not saved.");

      const tree = [{ path: TWEE_PATH, mode: "100644", type: "blob", content: twee }];
      for (const f of photos) {
        const blob = await gh("/git/blobs", { method: "POST", body: { content: store.data.photos[f].url.split(",")[1], encoding: "base64" } });
        tree.push({ path: ART_PATH + f, mode: "100644", type: "blob", sha: blob.sha });
      }
      const newTree = await gh("/git/trees", { method: "POST", body: { base_tree: commit.tree.sha, tree: tree } });
      const message = "Edit Winkipedia: " +
        names.map((n) => (isNewPage(n) ? n + " (new)" : n)).concat(photos.map((f) => "photo " + f)).join(", ") +
        "\n\nMade with the preview's article editor by " + author.name + ".";
      const newCommit = await gh("/git/commits", { method: "POST", body: { message: message, tree: newTree.sha, parents: [head], author: author } });
      try {
        await gh("/git/refs/heads/" + encodeURIComponent(BRANCH), { method: "PATCH", body: { sha: newCommit.sha } });
        return newCommit.sha;
      } catch (e) {
        if (e.status !== 422) throw e; /* branch moved: start over on the new head */
      }
    }
    throw new Error("The branch kept changing while saving. Try again in a minute.");
  }

  /* "Last saved by Sofe, 2 h ago": from the editor's commits to the .twee. */
  let history = { at: 0, pages: {} };
  async function loadHistory(force) {
    if (!getToken() || !BRANCH) return;
    if (!force && Date.now() - history.at < 120000) return;
    try {
      const commits = await gh("/commits?sha=" + encodeURIComponent(BRANCH) + "&path=" + encodeURIComponent(TWEE_PATH) + "&per_page=60");
      const pages = {};
      commits.forEach(function (c) {
        pagesInMessage(c.commit.message).forEach(function (p) {
          if (!pages[p]) pages[p] = { name: c.commit.author.name, at: c.commit.author.date };
        });
      });
      history = { at: Date.now(), pages: pages };
      renderTitle();
    } catch (e) { /* not important enough to shout about */ }
  }

  /* ---------- Comments on GitHub ---------- */

  let comments = [];        /* newest copy read from GitHub */
  let commentsLoaded = false;
  let focusedComment = null;

  const b64ToText = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), (ch) => ch.charCodeAt(0)));
  function textToB64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function readComments() {
    try {
      const file = await gh("/contents/" + COMMENTS_PATH + "?ref=" + encodeURIComponent(BRANCH));
      return { data: JSON.parse(b64ToText(file.content)), sha: file.sha };
    } catch (e) {
      if (e.status === 404) return { data: { comments: [] }, sha: null };
      throw e;
    }
  }

  async function loadComments() {
    if (!getToken() || !BRANCH) return;
    try {
      comments = (await readComments()).data.comments || [];
      commentsLoaded = true;
      commentsChanged();
    } catch (e) {
      ui.commentStatus.textContent = e.message;
    }
  }

  /* One commit per change; retried on the newest copy if the file moved. */
  async function changeComments(op, message) {
    const author = authorFor(getName() || "Leo");
    for (let attempt = 0; attempt < 4; attempt++) {
      const cur = await readComments();
      const next = applyCommentOp(cur.data, op);
      const body = { message: message, content: textToB64(JSON.stringify(next, null, 2) + "\n"), branch: BRANCH, author: author };
      if (cur.sha) body.sha = cur.sha;
      try {
        await gh("/contents/" + COMMENTS_PATH, { method: "PUT", body: body });
        comments = next.comments;
        commentsLoaded = true;
        commentsChanged();
        return;
      } catch (e) {
        if (e.status !== 409 && e.status !== 422) throw e; /* someone else saved first: go again */
      }
    }
    throw new Error("Couldn't save the comment (the file kept changing). Try again.");
  }

  const rootsOn = (page) => comments.filter((c) => c.page === page && !c.parent);
  const repliesTo = (id) => comments.filter((c) => c.parent === id);
  const openRoots = () => comments.filter((c) => !c.parent && !c.resolved);

  /* ---------- The markup editor (CodeMirror) ---------- */

  let view = null;
  let settingText = false;
  const refreshDecorations = CM.StateEffect.define();

  function buildDecorations(v) {
    const text = v.state.doc.toString();
    const marks = [];
    const add = (from, to, cls, attrs) => {
      if (to > from) marks.push(CM.Decoration.mark({ class: cls, attributes: attrs }).range(from, to));
    };
    for (const m of text.matchAll(/<[^>\n]*>/g)) add(m.index, m.index + m[0].length, "cm-ske-tag");
    for (const m of text.matchAll(/\([a-z][a-z0-9-]*:/gi)) add(m.index, m.index + m[0].length, "cm-ske-macro");
    for (const m of text.matchAll(/''|\^\^|(?<!:)\/\//g)) add(m.index, m.index + m[0].length, "cm-ske-dim");
    for (const m of text.matchAll(/\[\[photo:[^\]]*\]\]/g)) add(m.index, m.index + m[0].length, "cm-ske-photo");
    for (const m of text.matchAll(/\[\[\/diskette\]\]/g)) add(m.index, m.index + m[0].length, "cm-ske-diskette");
    for (const m of text.matchAll(/\[\[diskette:[^\]]*\]\]/g)) add(m.index, m.index + m[0].length, /\|\s*TODO\b/.test(m[0]) ? "cm-ske-diskette cm-ske-todo" : "cm-ske-diskette");
    if (hook) {
      linkTargets(text).forEach(function (l) {
        if (pageExists(l.target)) add(l.from, l.to, "cm-ske-link");
        else add(l.from, l.to, "cm-ske-redlink", { "data-page": l.target, title: "No page called “" + l.target + "” yet. Ctrl/Cmd-click to create it." });
      });
    }
    if (shownPage) {
      rootsOn(shownPage).forEach(function (c) {
        if (c.resolved) return;
        const at = locateQuote(text, c);
        if (at) add(at.from, at.to, "cm-ske-comment" + (c.id === focusedComment ? " cm-ske-comment-focus" : ""), { "data-cid": c.id, title: c.author + ": " + c.text.slice(0, 120) });
      });
    }
    return CM.Decoration.set(marks, true);
  }

  const decorationPlugin = CM.ViewPlugin.fromClass(class {
    constructor(v) { this.decorations = buildDecorations(v); }
    update(u) {
      if (u.docChanged || u.transactions.some((t) => t.effects.some((e) => e.is(refreshDecorations)))) this.decorations = buildDecorations(u.view);
    }
  }, { decorations: (p) => p.decorations });

  /* Typing [[ (or ->) suggests page names. */
  function pageCompletions(ctx) {
    const m = ctx.matchBefore(/\[\[(?:[^\]\n]*->)?[^\]\n>]*/);
    if (!m || /^\[\[(photo|diskette):/.test(m.text)) return null;
    const lead = /^\[\[(?:[^\]\n]*->)?/.exec(m.text)[0];
    return {
      from: m.from + lead.length,
      validFor: /^[^\]\n>]*$/,
      options: wikiPageNames().map((name) => ({
        label: name,
        apply: function (v, completion, from, to) {
          const close = v.state.sliceDoc(to, to + 2) === "]]" ? "" : "]]";
          v.dispatch({ changes: { from: from, to: to, insert: completion.label + close }, selection: { anchor: from + completion.label.length + close.length } });
        },
      })),
    };
  }

  function makeEditor(parent) {
    return new CM.EditorView({
      parent: parent,
      state: CM.EditorState.create({
        doc: "",
        extensions: [
          CM.history(),
          CM.drawSelection(),
          CM.EditorView.lineWrapping,
          CM.search({ top: true }),
          CM.autocompletion({ override: [pageCompletions], activateOnTyping: true }),
          CM.keymap.of([].concat(CM.completionKeymap, CM.searchKeymap, CM.historyKeymap, CM.defaultKeymap)),
          CM.placeholder("Open a Winkipedia page in the game's browser to edit it here."),
          decorationPlugin,
          CM.EditorView.updateListener.of(function (u) {
            if (u.docChanged && !settingText) onInput();
            if (u.selectionSet || u.docChanged) updateQuoteHint();
          }),
          CM.EditorView.domEventHandlers({
            /* Clicking into the markup to edit lets go of the game's selection. */
            focus: function () { releaseSelection(); },
            mousedown: function (e) {
              releaseSelection();
              const red = e.target.closest(".cm-ske-redlink");
              if (red && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openNewPageDialog(red.dataset.page); return true; }
              const mark = e.target.closest("[data-cid]");
              if (mark) setTimeout(() => focusComment(mark.dataset.cid, "markup"), 0);
              return false;
            },
          }),
        ],
      }),
    });
  }

  const getText = () => view.state.doc.toString();
  function setText(text) {
    settingText = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: 0 } });
    settingText = false;
  }
  const redecorate = () => view && view.dispatch({ effects: refreshDecorations.of(null) });
  function selectRange(from, to, focus) {
    const len = view.state.doc.length;
    from = Math.max(0, Math.min(from, len));
    to = Math.max(0, Math.min(to, len));
    view.dispatch({ selection: { anchor: from, head: to }, effects: CM.EditorView.scrollIntoView(from, { y: "center" }) });
    if (focus) view.focus();
  }
  function selection() {
    const r = view.state.selection.main;
    return { from: r.from, to: r.to };
  }
  function insertAtCursor(text) {
    const r = view.state.selection.main;
    view.dispatch({ changes: { from: r.from, to: r.to, insert: text }, selection: { anchor: r.from + text.length } });
    view.focus();
  }
  function wrap(before, after) {
    const r = view.state.selection.main;
    const inner = view.state.sliceDoc(r.from, r.to);
    view.dispatch({ changes: { from: r.from, to: r.to, insert: before + inner + after }, selection: { anchor: r.from + before.length, head: r.from + before.length + inner.length } });
    view.focus();
  }

  /* ---------- Panel ---------- */

  let ui = null;
  let shownPage = null;
  let lastSeenPage;          /* the game's page at the last check (undefined = check again) */
  let applyTimer = null;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach((c) => c && node.appendChild(c));
    return node;
  }

  const CHEAT_SHEET = [
    ["Links", "[[Tom Barry]]   link to a page\n[[the founder->Tom Barry]]   link with other words\nType [[ for page names. Red = no such page yet: Ctrl/Cmd-click it to create it."],
    ["Photos", "[[photo: file.jpg | right | description]]\n[[photo: file.jpg | left | 36% | description]]\nMove a photo's line to move it; right after a heading puts it beside that section."],
    ["Diskette", "[[diskette: 80 | Her line.]]   a point zone\n[[diskette: 10 | on: these words | Her line.]]\n[[diskette: 10 | on photo: file.jpg | Her line.]]\n[[diskette: page | ...]]   her comment on the page\nAdd shake or wide, loop or random, and if: events before her line. Line 1 >> line 2 = alternatives. then: … = her follow-up after Thanks. TODO … = still to write. More in the Diskette tab's ?."],
    ["Text", "''bold''   //italic//   <h2>Heading</h2>\nA \\ at the end of a line joins it to the next one."],
    ["Moving around", "Drag across words in the game (or ⌖ Edit, then click a paragraph) to jump to them here. ☰ Pages lists every page. Ctrl/Cmd-F finds, Ctrl/Cmd-Z undoes."],
  ];

  function buildUi() {
    const toggle = el("button", { class: "ske-toggle", type: "button", text: "✎ Backend", onclick: () => setOpen(!store.data.open) });
    const title = el("div", { class: "ske-title" });
    const lastEdit = el("div", { class: "ske-muted ske-last-edit" });
    const editorBox = el("div", { class: "ske-cm" });
    const status = el("div", { class: "ske-status" });
    const pending = el("div", { class: "ske-pending" });
    const missing = el("div", { class: "ske-missing" });
    const tool = (label, tip, fn) => el("button", { type: "button", title: tip, text: label, onclick: fn });
    const fileInput = el("input", { type: "file", accept: "image/*", class: "ske-file", onchange: onPhotoChosen });
    const commentsTitle = el("div", { class: "ske-section-title", text: "Comments" });
    const commentList = el("div", { class: "ske-comment-list" });
    const commentOthers = el("div", { class: "ske-others" });
    const commentStatus = el("div", { class: "ske-muted ske-comment-status" });
    const commentInput = el("textarea", { class: "ske-comment-input", rows: "2", placeholder: "Leave a comment for whoever edits next…" });
    const quoteHint = el("div", { class: "ske-muted ske-quote-hint" });

    const tabButton = (id, label) => el("button", { type: "button", class: "ske-tab-btn", "data-tab": id, onclick: () => setTab(id) }, [
      el("span", { class: "ske-tab-label", text: label }),
      el("span", { class: "ske-tab-badge ske-hidden" }),
    ]);
    const pageIndex = el("div", { class: "ske-pageindex" });
    const pagesBtn = el("button", { type: "button", class: "ske-pages-btn", title: "Every page: open one, or see what needs work", text: "☰ Pages", onclick: () => { indexOpen = !indexOpen || !shownPage; updateMarkupMode(); } });
    const saveChip = el("button", { type: "button", class: "ske-save-chip ske-hidden", title: "Review and save your changes to the preview", onclick: () => openReview() });
    const disketteTab = el("div", { class: "ske-tab ske-tab-diskette" });
    const statusTab = el("div", { class: "ske-tab ske-tab-events" });
    const crumbs = el("div", { class: "ske-crumbs ske-hidden" });
    const commentsTab = el("div", { class: "ske-tab ske-tab-comments" }, [
      el("div", { class: "ske-comments-body" }, [
        commentsTitle,
        commentStatus,
        commentList,
        commentInput,
        quoteHint,
        el("div", { class: "ske-actions" }, [
          el("button", { type: "button", class: "ske-post", text: "Post comment", onclick: onPostComment }),
          el("button", { type: "button", text: "Refresh", onclick: () => { loadComments(); loadHistory(true); } }),
          el("button", { type: "button", title: "The name shown on your comments and saves", text: "My name…", onclick: function () {
            const n = (prompt("Your name (shown on your comments and saves):", getName()) || "").trim();
            if (n) { local.set(NAME_KEY, n); renderComments(); }
          } }),
        ]),
        commentOthers,
      ]),
    ]);
    const articleTab = el("div", { class: "ske-tab ske-tab-markup" }, [
      el("div", { class: "ske-title-row" }, [pagesBtn, title]),
      lastEdit,
      pageIndex,
      el("div", { class: "ske-tools" }, [
        tool("Link", "Link the selected words: [[Page]] or [[words->Page]]", () => wrap("[[", "]]")),
        tool("Bold", "''bold''", () => wrap("''", "''")),
        tool("Italic", "//italic//", () => wrap("//", "//")),
        tool("Heading", "<h2>Heading</h2>", () => wrap("<h2>", "</h2>\\")),
        tool("+ Photo", "Add a photo from your computer", () => fileInput.click()),
        tool("+ New page", "Make a new page", () => openNewPageDialog("")),
        fileInput,
        helpButton("Markup cheat sheet", CHEAT_SHEET),
      ]),
      editorBox,
      el("div", { class: "ske-rawview ske-hidden" }),
      missing,
      el("div", { class: "ske-actions" }, [
        el("button", { type: "button", class: "ske-undo", text: "Undo my changes to this page", onclick: onRevert }),
      ]),
    ]);
    const panel = el("div", { class: "ske-panel" }, [
      el("div", { class: "ske-head" }, [
        el("b", { text: "Backend Editor" }),
        el("span", { class: "ske-head-tools" }, [
          saveChip,
          el("button", { type: "button", class: "ske-aim-btn", title: "Edit mode: click things in the game to select them (E)", text: "⌖ Edit", onclick: () => setAiming(!aiming) }),
          el("button", { type: "button", class: "ske-github-btn", title: "GitHub access (needed to save and comment)", text: "GitHub", onclick: () => openGithubDialog() }),
          el("button", { type: "button", class: "ske-close", title: "Close the editor", text: "×", onclick: () => setOpen(false) }),
        ]),
      ]),
      el("div", { class: "ske-tabs" }, [
        tabButton("markup", "Markup"),
        tabButton("comments", "Comments"),
        tabButton("diskette", "Diskette"),
        tabButton("events", "Events"),
      ]),
      crumbs,
      articleTab,
      commentsTab,
      disketteTab,
      statusTab,
      el("div", { class: "ske-footer" }, [
        el("div", { class: "ske-actions" }, [
          el("button", { type: "button", class: "ske-save", text: "Save to preview…", onclick: openReview }),
        ]),
        status,
        pending,
      ]),
    ]);
    document.body.appendChild(toggle);
    document.body.appendChild(panel);
    ui = { toggle, panel, title, lastEdit, status, pending, missing, commentsTitle, commentList, commentOthers, commentStatus, commentInput, quoteHint, disketteTab, statusTab, crumbs, pageIndex, pagesBtn, saveChip };
    view = makeEditor(editorBox);
    setTab(store.data.tab);
  }

  /* GitHub access, in a popup: the token that lets this browser save. */
  function openGithubDialog() {
    const tokenInput = el("input", { type: "password", class: "ske-input ske-token-input", placeholder: "github_pat_...", autocomplete: "off" });
    const has = !!getToken();
    openModal("GitHub access", [
      el("div", { class: has ? "ske-status ske-ok" : "ske-status", text: has ? "This browser has a token: saving and comments work." : "No token yet: saving and comments need one." }),
      el("div", { class: "ske-help-text", text: "Saving commits to " + REPO + " (branch " + (BRANCH || "?") + "). It needs a fine-grained token with Contents: Read and write on that one repository. It's kept only in this browser." }),
      el("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener", text: "Make a token on GitHub ↗" }),
      el("label", { class: "ske-field" }, [el("span", { text: has ? "Replace it" : "Paste it here" }), tokenInput]),
    ], [
      el("button", { type: "button", class: "ske-save", text: "Use this token", onclick: function () {
        if (!tokenInput.value.trim()) { tokenInput.focus(); return; }
        local.set(TOKEN_KEY, tokenInput.value.trim());
        closeModal(); refresh(); loadComments(); loadHistory(true);
        say("Token saved in this browser.", "ok");
      } }),
      has ? el("button", { type: "button", text: "Forget it", onclick: function () {
        local.set(TOKEN_KEY, ""); comments = []; commentsLoaded = false;
        closeModal(); refresh(); commentsChanged();
      } }) : null,
      el("button", { type: "button", text: "Close", onclick: closeModal }),
    ].filter(Boolean));
    tokenInput.focus();
  }

  const TABS = ["markup", "comments", "diskette", "events"];
  function setTab(id) {
    id = { article: "markup", status: "events" }[id] || id;
    if (TABS.indexOf(id) < 0) id = "markup";
    store.data.tab = id;
    store.write();
    ui.panel.querySelectorAll(".ske-tab-btn").forEach((b) => b.classList.toggle("ske-tab-on", b.dataset.tab === id));
    ui.panel.querySelectorAll(".ske-tab").forEach((t) => t.classList.toggle("ske-tab-shown", t.classList.contains("ske-tab-" + id)));
    /* What the game shows follows the tab: notes in Comments, zones in Diskette. */
    showZones();
    markGame(true);
    if (id === "markup") { focusMarkupOnSelection(); if (view) view.requestMeasure(); }
    if (id === "comments") renderComments();
    if (id === "diskette") renderDiskette(true);
    if (id === "events") renderStatus(true);
  }

  function setOpen(open) {
    store.data.open = open;
    if (!open) { setAiming(false); sel = null; topBar(); if (overlay) overlay.textContent = ""; }
    store.write();
    ui.panel.classList.toggle("ske-open", open);
    ui.toggle.classList.toggle("ske-toggle-on", open);
    hook.reserveRight(open ? PANEL_WIDTH : 0);
    lastSeenPage = undefined;
    syncGame(); /* red links only while open */
    redraw();
    refresh();
    markGame();
  }

  function say(message, kind) {
    ui.status.textContent = message;
    ui.status.className = "ske-status" + (kind ? " ske-" + kind : "");
  }

  function refresh() {
    const drafts = Object.keys(store.data.drafts);
    const photos = Object.keys(store.data.photos);
    const saved = Object.keys(store.data.saved);
    const lines = [];
    if (drafts.length || photos.length) lines.push("Not saved yet: " + drafts.map((n) => (isNewPage(n) ? n + " (new)" : n)).concat(photos.map((f) => "photo " + f)).join(", "));
    if (saved.length) lines.push("Saved, waiting for the preview to rebuild: " + saved.join(", "));
    const clashing = Object.keys(store.data.conflicts).filter((n) => n in store.data.drafts);
    if (clashing.length) lines.push("⚠ Changed by someone else since you started editing: " + clashing.join(", ") + ". Saving would undo their changes; check it, or Undo yours.");
    if (!getToken()) lines.push("Add a GitHub token (GitHub, top of the panel) to be able to save.");
    ui.pending.textContent = lines.join("\n");
    scheduleBadges();
  }

  /* ---------- Tab badges and the save chip ---------- */

  let badgeTimer = 0;
  function scheduleBadges() {
    if (badgeTimer || !ui) return;
    badgeTimer = setTimeout(function () { badgeTimer = 0; updateBadges(); }, 80);
  }

  function eventsOutOfOrder() {
    const events = hook.events ? hook.events() : null;
    if (!events) return [];
    const happened = new Set(events);
    return findEvents(currentSource("GameEvents")).filter((d) => happened.has(d.id) && d.after.some((a) => !happened.has(a))).map((d) => d.id);
  }

  function setBadge(id, text, tip) {
    const b = ui && ui.panel.querySelector('.ske-tab-btn[data-tab="' + id + '"] .ske-tab-badge');
    if (!b) return;
    b.textContent = text;
    b.title = text ? tip : "";
    b.classList.toggle("ske-hidden", !text);
  }

  function updateEventsBadge() {
    const odd = eventsOutOfOrder();
    setBadge("events", odd.length ? "⚠" : "", "Happened out of order: " + odd.join(", "));
  }

  function updateBadges() {
    if (!ui) return;
    const badge = function (id, text, tip) {
      const b = ui.panel.querySelector('.ske-tab-btn[data-tab="' + id + '"] .ske-tab-badge');
      if (!b) return;
      b.textContent = text;
      b.title = text ? tip : "";
      b.classList.toggle("ske-hidden", !text);
    };
    const unsaved = Object.keys(store.data.drafts).length + Object.keys(store.data.photos).length;
    badge("markup", unsaved ? "●" : "", unsaved + (unsaved === 1 ? " unsaved change" : " unsaved changes"));
    const open = commentsLoaded ? openRoots().length : 0;
    badge("comments", open ? String(open) : "", open + (open === 1 ? " open comment" : " open comments"));
    const drafts = allReactions().filter((i) => i.draft).length;
    badge("diskette", drafts ? drafts + (drafts === 1 ? " draft" : " drafts") : "", "Reactions that aren't in the game yet");
    updateEventsBadge();
    const pages = Object.keys(store.data.drafts).length;
    ui.saveChip.textContent = unsaved + " unsaved · Save";
    ui.saveChip.title = "Review and save: " + Object.keys(store.data.drafts).concat(Object.keys(store.data.photos).map((f) => "photo " + f)).join(", ");
    ui.saveChip.classList.toggle("ske-hidden", !pages);
  }

  function ago(iso) {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    return new Date(iso).toLocaleDateString();
  }

  function renderTitle() {
    if (!ui) return;
    const h = shownPage && history.pages[shownPage];
    ui.lastEdit.textContent = shownPage && isNewPage(shownPage) ? "New page, not in the build yet" : h ? "Last saved by " + h.name + ", " + ago(h.at) : "";
  }

  /* Pages this page links to that don't exist yet, each with Create. */
  function renderMissing() {
    ui.missing.textContent = "";
    if (!shownPage) return;
    const targets = Array.from(new Set(linkTargets(getText()).map((l) => l.target).filter((t) => !pageExists(t))));
    if (!targets.length) return;
    ui.missing.appendChild(el("div", { class: "ske-muted", text: "Links to pages that don't exist yet:" }));
    targets.forEach(function (t) {
      ui.missing.appendChild(el("div", { class: "ske-other" }, [
        el("span", { class: "ske-redword", text: t }),
        el("button", { type: "button", text: "Create", onclick: () => openNewPageDialog(t) }),
      ]));
    });
  }

  function onInput() {
    if (!shownPage) return;
    const name = shownPage;
    const text = getText();
    const unchanged = fromFriendly(text) === baseline(name) && (!isNewPage(name) || name in store.data.saved);
    if (unchanged) forgetDraft(name);
    else {
      if (!(name in store.data.drafts)) store.data.bases[name] = baseline(name);
      store.data.drafts[name] = text;
    }
    store.write();
    refresh();
    checkPhotos();
    renderMissing();
    renderComments();
    clearTimeout(applyTimer);
    applyTimer = setTimeout(function () {
      applyToGame(name);
      if (hook.currentPage() === name) redraw();
      countTodos();
    }, 400);
  }

  function checkPhotos() {
    const known = knownPhotos();
    const missingPhotos = photoFiles(fromFriendly(getText())).filter((f) => !known.has(f));
    if (missingPhotos.length) say("No photo called " + missingPhotos.join(", ") + ". Use + Photo to add one.", "error");
    else if (ui.status.classList.contains("ske-error")) say("");
    return missingPhotos;
  }

  function onRevert() {
    if (!shownPage) return;
    const name = shownPage;
    if (isNewPage(name) && !store.data.newPages[name].saved) {
      if (!confirm("Remove the new page “" + name + "”? It hasn't been saved.")) return;
      delete store.data.drafts[name];
      delete store.data.newPages[name];
      store.write();
      hook.passages.delete(name);
      syncGame(); /* links to it go red again */
      if (!hook.goTo("Winkipedia")) redraw();
      refresh();
      return;
    }
    if (!(name in store.data.drafts)) return;
    if (!confirm("Undo your unsaved changes to “" + name + "”?")) return;
    forgetDraft(name);
    store.write();
    applyToGame(name);
    redraw();
    showPage(name, true);
    refresh();
  }

  function onPhotoChosen(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || !shownPage) return;
    const img = new Image();
    img.onload = function () {
      const scale = Math.min(1, 480 / img.width, 600 / img.height);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const slug = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "photo";
      const name = slug + "-" + Math.random().toString(36).slice(2, 6) + ".jpg";
      store.data.photos[name] = { url: canvas.toDataURL("image/jpeg", 0.86), w: w, h: h };
      store.write();
      photoStyles();
      URL.revokeObjectURL(img.src);
      const at = selection().from;
      const before = at > 0 && getText()[at - 1] !== "\n" ? "\n" : "";
      insertAtCursor(before + "[[photo: " + name + " | right | " + file.name.replace(/\.[^.]+$/, "").replace(/[|\]]/g, " ") + "]]\n");
      say("Added " + name + ". Move its line to move the photo; it's saved with the article.", "ok");
    };
    img.onerror = () => say("That file isn't an image this browser can read.", "error");
    img.src = URL.createObjectURL(file);
  }

  /* ---------- Markup: the page index ---------- */

  let indexOpen = false;
  let pageQuery = "";
  const PAGE_KINDS = [["article", "Winkipedia"], ["fanwiki", "Fan wiki & forum"], ["gamesarchive", "Games archive"], ["devlink", "devlink"], ["", "Other pages"]];

  /* The page the game's browser shows, or null when the browser isn't open. */
  const gamePage = () => (document.querySelector(".browser-page-content") ? hook.currentPage() || null : null);

  /* The index shows when no page is open (and no game code is selected), or
     when ☰ Pages is pressed. */
  function updateMarkupMode() {
    if (!ui) return;
    const tab = ui.panel.querySelector(".ske-tab-markup");
    const raw = tab.classList.contains("ske-raw-mode");
    const on = indexOpen || (!shownPage && !raw);
    tab.classList.toggle("ske-index-mode", on);
    ui.pagesBtn.classList.toggle("ske-pages-on", on);
    ui.pagesBtn.disabled = on && !shownPage;
    if (on) {
      ui.title.textContent = "All pages";
      renderPageIndex();
    } else if (!raw) ui.title.textContent = shownPage || "";
  }

  function renderPageIndex() {
    const box = ui.pageIndex;
    let search = box.querySelector(".ske-page-search");
    let list = box.querySelector(".ske-page-list");
    if (!search) {
      search = el("input", { type: "search", class: "ske-input ske-page-search", placeholder: "Find a page" });
      search.addEventListener("input", () => { pageQuery = search.value; renderPageIndex(); });
      list = el("div", { class: "ske-page-list" });
      box.appendChild(el("div", { class: "ske-bar" }, [search, el("button", { type: "button", text: "+ New page", onclick: () => openNewPageDialog("") })]));
      box.appendChild(list);
    }
    search.value = pageQuery;
    list.textContent = "";
    const q = pageQuery.trim().toLowerCase();
    const names = wikiPageNames().filter((n) => !q || n.toLowerCase().indexOf(q) >= 0);
    const reactions = {};
    allReactions().forEach((r) => { if (r.type !== "look") reactions[r.passage] = (reactions[r.passage] || 0) + 1; });
    const open = {};
    openRoots().forEach((c) => (open[c.page] = (open[c.page] || 0) + 1));
    const kindOf = (n) => (PAGE_KINDS.find((k) => k[0] && tagsOf(n).indexOf(k[0]) >= 0) || PAGE_KINDS[PAGE_KINDS.length - 1])[0];
    PAGE_KINDS.forEach(function (k) {
      const these = names.filter((n) => kindOf(n) === k[0]);
      if (!these.length) return;
      list.appendChild(el("div", { class: "ske-section-title ske-tiny", text: k[1] + " (" + these.length + ")" }));
      these.forEach(function (n) {
        const bits = [];
        if (n in store.data.drafts) bits.push(el("span", { class: "ske-pi-unsaved", title: "Unsaved changes", text: "●" }));
        if (isNewPage(n)) bits.push(el("span", { class: "ske-pi-tag", text: "new" }));
        if (open[n]) bits.push(el("span", { class: "ske-pi-count", title: open[n] + " open comments", text: "💬 " + open[n] }));
        if (reactions[n]) bits.push(el("span", { class: "ske-pi-count", title: reactions[n] + " Diskette reactions", text: "◉ " + reactions[n] }));
        list.appendChild(el("button", { type: "button", class: "ske-pi-row" + (n === shownPage ? " ske-pi-current" : ""), title: "Open " + n + " in the game and here", onclick: () => openFromIndex(n) }, [
          el("span", { class: "ske-pi-name", text: n }),
        ].concat(bits)));
      });
    });
    if (!names.length) list.appendChild(el("div", { class: "ske-muted", text: "No page called that. + New page makes one." }));
    /* Pages linked to that don't exist yet. */
    const missing = {};
    wikiPageNames().forEach(function (n) {
      linkTargets(n === shownPage ? getText() : friendlyOf(n)).forEach(function (l) {
        if (!pageExists(l.target)) (missing[l.target] = missing[l.target] || new Set()).add(n);
      });
    });
    const gaps = Object.keys(missing).filter((t) => !q || t.toLowerCase().indexOf(q) >= 0).sort();
    if (gaps.length) {
      list.appendChild(el("div", { class: "ske-section-title ske-tiny", text: "Linked to but missing (" + gaps.length + ")" }));
      gaps.forEach(function (t) {
        list.appendChild(el("div", { class: "ske-pi-row ske-pi-missing" }, [
          el("span", { class: "ske-pi-name ske-redword", text: t }),
          el("span", { class: "ske-muted ske-tiny", text: "from " + Array.from(missing[t]).join(", ") }),
          el("button", { type: "button", text: "Create", onclick: () => openNewPageDialog(t) }),
        ]));
      });
    }
  }

  function openFromIndex(name) {
    if (name !== gamePage() && !hook.goTo(name)) { say("Get Browse out of the Trash first, then pages open from here.", "error"); return; }
    indexOpen = false;
    setTab("markup");
    showPage(name, name !== shownPage);
  }

  function showPage(name, force) {
    if (name === shownPage && !force) return;
    /* A selection on another page goes when the game moves on. */
    if (sel && !sel.raw && sel.kind !== "app" && sel.passage !== name) { sel = null; if (ui) { renderCrumbs(); drawSelection(); } }
    shownPage = name;
    focusedComment = null;
    if (name && !isWikiPage(name)) {
      ui.title.textContent = "“" + name + "” isn't a Winkipedia page, so it can't be edited here.";
      shownPage = null;
    } else {
      ui.title.textContent = name || "Open a Winkipedia page in the game's browser to edit it here.";
    }
    setText(shownPage ? (shownPage in store.data.drafts ? store.data.drafts[shownPage] : toFriendly(currentSource(shownPage))) : "");
    view.contentDOM.setAttribute("contenteditable", shownPage ? "true" : "false");
    renderTitle();
    renderMissing();
    renderComments();
    updateQuoteHint();
    if (shownPage) checkPhotos();
    markGame();
    renderDiskette(false);
    updateMarkupMode();
  }

  /* ---------- New pages ---------- */

  function openNewPageDialog(prefill) {
    closeModal();
    const nameInput = el("input", { type: "text", class: "ske-input", value: prefill || "", placeholder: "Page name, e.g. Bin City" });
    const problem = el("div", { class: "ske-status ske-error ske-hidden" });
    let chosen = TEMPLATES[0].id;
    const choices = TEMPLATES.map(function (t) {
      const radio = el("input", { type: "radio", name: "ske-template", value: t.id });
      if (t.id === chosen) radio.checked = true;
      radio.addEventListener("change", () => { chosen = t.id; });
      return el("label", { class: "ske-template" }, [radio, el("b", { text: " " + t.label }), el("span", { class: "ske-muted", text: " — " + t.note })]);
    });
    const create = function () {
      const name = nameInput.value;
      const msg = pageNameProblem(name, allPageNames().concat(Object.keys(store.data.newPages)));
      if (msg) { problem.textContent = msg; problem.classList.remove("ske-hidden"); return; }
      const t = TEMPLATES.find((x) => x.id === chosen);
      store.data.newPages[name] = { tags: t.tags.slice(), saved: false };
      store.data.drafts[name] = t.body(name);
      store.write();
      syncGame(); /* also un-reds links to it on other pages */
      closeModal();
      refresh();
      if (hook.goTo(name)) say("Made “" + name + "”. It's in the game now; Save to preview to keep it.", "ok");
      else say("Made “" + name + "”. Get Browse out of the Trash to see it.", "ok");
      if (shownPage) { renderMissing(); redecorate(); }
    };
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") create(); });
    openModal("New page", [
      el("label", { class: "ske-field" }, [el("span", { text: "Name" }), nameInput]),
      problem,
      el("div", { class: "ske-muted", text: "Looks like:" }),
      el("div", { class: "ske-templates" }, choices),
    ], [
      el("button", { type: "button", class: "ske-save ske-create", text: "Create page", onclick: create }),
      el("button", { type: "button", text: "Cancel", onclick: closeModal }),
    ]);
    nameInput.focus();
  }

  /* ---------- Review and save ---------- */

  function openReview() {
    const names = Object.keys(store.data.drafts);
    if (!names.length) { say("Nothing to save.", ""); return; }
    const known = knownPhotos();
    const used = new Set([].concat.apply([], names.map((n) => photoFiles(draftSource(n)))));
    const missingPhotos = Array.from(used).filter((f) => !known.has(f));
    if (missingPhotos.length) { say("Can't save: no photo called " + missingPhotos.join(", ") + ".", "error"); return; }
    const photos = Object.keys(store.data.photos).filter((f) => used.has(f));

    const blocks = names.map(function (name) {
      const before = isNewPage(name) && !(name in store.data.saved) ? "" : store.data.raw[name] ? baseline(name) : toFriendly(baseline(name));
      const rows = lineDiff(before, store.data.drafts[name]);
      const changed = rows.map((r, i) => (r.type !== " " ? i : -1)).filter((i) => i >= 0);
      const keep = new Set();
      changed.forEach((i) => { for (let k = i - 2; k <= i + 2; k++) keep.add(k); });
      const lines = [];
      let skipped = false;
      rows.forEach(function (r, i) {
        if (!keep.has(i)) { if (!skipped && lines.length) lines.push(el("div", { class: "ske-diff-gap", text: "⋯" })); skipped = true; return; }
        skipped = false;
        lines.push(el("div", { class: "ske-diff-" + (r.type === "+" ? "add" : r.type === "-" ? "del" : "same"), text: (r.type === " " ? "  " : r.type + " ") + r.text }));
      });
      return el("div", { class: "ske-review-page" }, [
        el("div", { class: "ske-review-name", text: name + (isNewPage(name) ? " (new page)" : "") }),
        el("div", { class: "ske-diff" }, lines.length ? lines : [el("div", { class: "ske-muted", text: "No visible change." })]),
      ]);
    });
    if (photos.length) blocks.push(el("div", { class: "ske-review-page" }, [el("div", { class: "ske-review-name", text: "New photos: " + photos.join(", ") })]));
    openModal("Save to preview", [
      el("div", { class: "ske-muted", text: "Green lines are added, red are removed. This makes one commit on " + BRANCH + "; the preview rebuilds in about a minute." }),
    ].concat(blocks), [
      el("button", { type: "button", class: "ske-save ske-review-save", text: "Save to preview", onclick: () => { closeModal(); doSave(names, photos); } }),
      el("button", { type: "button", text: "Keep editing", onclick: closeModal }),
    ], "ske-modal-wide");
  }

  async function doSave(names, photos) {
    if (!getToken()) {
      openGithubDialog();
      say("Add a GitHub token first.", "error");
      return;
    }
    if (!BRANCH) { say("This preview doesn't know which branch it came from.", "error"); return; }
    const clashing = names.filter((n) => store.data.conflicts[n]);
    if (clashing.length && !confirm(clashing.join(", ") + " changed in the game since you started editing. Saving your version would undo those changes. Save anyway?")) return;
    const who = ensureName();
    if (!who) { say("Not saved: saves need a name.", "error"); return; }
    say("Saving…", "");
    try {
      const sha = await commitAll(names, photos, authorFor(who), function (clashes) {
        return confirm(clashes.join(", ") + " changed on GitHub since this preview was built. Save yours over it anyway?");
      });
      names.forEach(function (n) {
        store.data.saved[n] = draftSource(n);
        store.data.savedAt[n] = Date.now();
        forgetDraft(n);
        if (store.data.newPages[n]) store.data.newPages[n].saved = true;
      });
      photos.forEach(function (f) {
        store.data.savedPhotos[f] = store.data.photos[f];
        delete store.data.photos[f];
      });
      store.write();
      refresh();
      loadHistory(true);
      say("Saved (" + sha.slice(0, 7) + "). The preview rebuilds in about a minute; your changes already show here.", "ok");
      renderDiskette(true);
    } catch (err) {
      say(err.message || String(err), "error");
    }
  }

  /* ---------- Modal ---------- */

  function openModal(title, body, buttons, extraClass) {
    closeModal();
    const box = el("div", { class: "ske-modal " + (extraClass || "") }, [
      el("div", { class: "ske-modal-title", text: title }),
      el("div", { class: "ske-modal-body" }, body),
      el("div", { class: "ske-actions" }, buttons),
    ]);
    const shade = el("div", { class: "ske-shade", onmousedown: (e) => { if (e.target === shade) closeModal(); } }, [box]);
    document.body.appendChild(shade);
  }
  function closeModal() {
    document.querySelectorAll(".ske-shade").forEach((s) => s.remove());
  }

  /* ---------- Comments in the panel ---------- */

  function selectedQuote() {
    if (!shownPage) return "";
    const r = selection();
    return getText().slice(r.from, r.to).trim().slice(0, 300);
  }

  function updateQuoteHint() {
    if (!ui) return;
    if (sel && (sel.raw || sel.kind === "photo" || sel.kind === "app" || sel.kind === "page")) {
      ui.quoteHint.textContent = "Pinned to: " + selectionLabel(sel);
      return;
    }
    const q = selectedQuote();
    if (!sel && !shownPage) { ui.quoteHint.textContent = "Select something in the game to comment on it."; return; }
    ui.quoteHint.textContent = q ? "Quoting: “" + (q.length > 60 ? q.slice(0, 60) + "…" : q) + "”" : "Tip: select words first (in the game or the markup) to pin your comment to them.";
  }

  function commentsChanged() {
    renderComments();
    redecorate();
    markGame(true);
  }

  let commentQuery = "";

  /* What a comment is pinned to, as a selection (for Show me). */
  function selectionForComment(c) {
    if (c.about && c.about.indexOf("app:") === 0) return appSelection(c.about.slice(4));
    if (c.about && c.about.indexOf("photo:") === 0) return { kind: "photo", passage: c.page, file: c.about.slice(6) };
    if (!pageExists(c.page)) return null;
    if (!isWikiPage(c.page)) {
      const at = c.quote ? locateQuote(currentSource(c.page), c) : null;
      return at ? { kind: "words", passage: c.page, raw: true, from: at.from, to: at.to } : null;
    }
    const at = c.quote ? locateQuote(friendlyOf(c.page), c) : null;
    return at ? { kind: "words", passage: c.page, from: at.from, to: at.to } : { kind: "page", passage: c.page };
  }

  /* A desktop thing as a selection, from its DisketteLooks-style key. */
  function appSelection(key) {
    const fixed = { self: [".diskette-character", "Diskette"], start: [".start-button", "the Start button"], clock: [".taskbar-clock", "the clock"], volume: [".tray-volume", "the volume"], taskbar: [".taskbar", "the taskbar"], desktop: [".wallpaper", "the wallpaper"] };
    if (fixed[key]) return { kind: "app", key: key, css: fixed[key][0], label: fixed[key][1] };
    const icon = /^icon-(.+)$/.exec(key);
    if (icon) return { kind: "app", key: key, css: '.desktop-icon[data-window-template="' + icon[1] + '"]', label: "the " + iconName(icon[1]) + " icon" };
    return { kind: "app", key: key, css: '.panel[data-window-template="' + key + '"]', label: "the " + iconName(key) + " window", passage: WINDOW_PASSAGE[key] || null };
  }

  /* Takes the game to a comment and selects what it's pinned to. */
  function showComment(c) {
    const go = function () {
      const s = selectionForComment(c);
      if (s) setSelection(s);
      focusComment(c.id, "panel");
      if (s && !selectionRects(s).length) say(s.kind === "app" ? "Open " + s.label.replace(/^the /, "") + " in the game to see it." : "Open " + placeLabel(c.page) + " in the game to see it.", "");
    };
    if (isWikiPage(c.page) && hook.currentPage() !== c.page) {
      if (!hook.goTo(c.page)) { say("Get Browse out of the Trash first, then Show me works.", "error"); return; }
      setTimeout(go, 700);
    } else go();
  }

  /* The text a comment's quote is found in (to number and check it). */
  function commentText(page) {
    if (page === shownPage) return getText();
    if (!pageExists(page)) return "";
    return isWikiPage(page) ? friendlyOf(page) : currentSource(page);
  }

  function commentMatches(c, q) {
    if (!q) return true;
    const hay = [c.text, c.quote, c.author, c.page, c.about].concat(repliesTo(c.id).map((r) => r.text + " " + r.author)).join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.indexOf(w) >= 0);
  }

  /* Comments: with a selection, the ones on it; otherwise every comment in
     the game, grouped by page (the open one first), filtered and searchable. */
  function renderComments() {
    if (!ui) return;
    const open = openRoots();
    ui.toggle.textContent = "✎ Backend" + (open.length ? " · " + open.length + (open.length === 1 ? " comment" : " comments") : "");
    scheduleBadges();
    ui.commentList.textContent = "";
    ui.commentOthers.textContent = "";
    const canPost = !!sel || !!shownPage;
    ui.commentInput.disabled = !canPost;
    ui.commentInput.placeholder = canPost ? "Leave a comment for whoever edits next…" : "Select something in the game (or open a page) to comment on it.";
    if (!getToken()) {
      ui.commentStatus.textContent = "Add a GitHub token (GitHub, top of the panel) to see and leave comments.";
      return;
    }
    if (!commentsLoaded) { ui.commentStatus.textContent = "Loading comments…"; return; }
    ui.commentStatus.textContent = "";
    /* Numbers match the badges in the game (quoted, open, on the open page). */
    const numbered = shownPage ? rootsOn(shownPage).filter((c) => !c.resolved && c.quote) : [];
    const numberOf = (c) => numbered.indexOf(c) + 1;
    const thread = (c) => commentThread(c, numberOf(c), commentText(c.page));

    if (sel) {
      const mine = notesFor(sel);
      const done = notesFor(sel, true);
      /* Comments whose words were edited away, so they can be re-pinned here. */
      const lostText = sel.kind === "app" || sel.kind === "photo" ? "" : commentText(sel.passage);
      const lost = lostText ? rootsOn(sel.passage).filter((c) => !c.resolved && c.quote && mine.indexOf(c) < 0 && !locateQuote(lostText, c)) : [];
      ui.commentsTitle.textContent = "";
      ui.commentsTitle.appendChild(el("button", { type: "button", class: "ske-link-btn ske-back", title: "Every comment in the game (Esc clears the selection)", text: "← All comments", onclick: () => setSelection(null) }));
      ui.commentsTitle.appendChild(el("span", { text: " Comments on " + selectionLabel(sel) + (mine.length ? " (" + mine.length + ")" : "") }));
      if (!mine.length) ui.commentList.appendChild(el("div", { class: "ske-muted", text: "None yet. Write one below; it's pinned to the selection." }));
      mine.forEach((c) => ui.commentList.appendChild(thread(c)));
      if (lost.length) {
        ui.commentList.appendChild(el("div", { class: "ske-section-title ske-tiny", text: "Lost their words on this page (" + lost.length + ")" }));
        lost.forEach((c) => ui.commentList.appendChild(thread(c)));
      }
      if (done.length) {
        const d = el("details", { class: "ske-resolved" }, [el("summary", { text: "Resolved (" + done.length + ")" })]);
        done.forEach((c) => d.appendChild(thread(c)));
        ui.commentList.appendChild(d);
      }
      return;
    }

    const me = getName();
    const roots = comments.filter((c) => !c.parent);
    const FILTERS = [
      ["open", "Open", (c) => !c.resolved],
      ["resolved", "Resolved", (c) => c.resolved],
      ["mine", "Mine", (c) => !!me && (c.author === me || repliesTo(c.id).some((r) => r.author === me))],
    ];
    const filter = FILTERS.find((f) => f[0] === store.data.commentFilter) || FILTERS[0];
    ui.commentsTitle.textContent = "All comments";
    const search = el("input", { type: "search", class: "ske-input ske-small ske-comment-search", placeholder: "Search comments", value: commentQuery });
    search.addEventListener("input", function () {
      commentQuery = search.value;
      renderComments();
      const again = ui.commentList.querySelector(".ske-comment-search");
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });
    ui.commentList.appendChild(el("div", { class: "ske-comment-bar" }, [
      el("div", { class: "ske-cycle ske-filter" }, FILTERS.map((f) => el("button", {
        type: "button", class: "ske-cycle-btn" + (f === filter ? " ske-cycle-on" : ""), text: f[1] + " " + roots.filter(f[2]).length,
        onclick: () => { store.data.commentFilter = f[0]; store.write(); renderComments(); },
      }))),
      search,
    ]));
    const shown = roots.filter((c) => filter[2](c) && commentMatches(c, commentQuery));
    if (!shown.length) {
      ui.commentList.appendChild(el("div", { class: "ske-muted", text: commentQuery ? "No comments match." : filter[0] === "open" ? "No open comments. Select something in the game to leave one." : "None." }));
      return;
    }
    const byPage = {};
    shown.forEach((c) => (byPage[c.page] = byPage[c.page] || []).push(c));
    const pages = Object.keys(byPage).sort((a, b) => (a === shownPage ? -1 : b === shownPage ? 1 : a.localeCompare(b)));
    pages.forEach(function (p) {
      const here = p === shownPage;
      ui.commentList.appendChild(el("div", { class: "ske-comment-group" }, [
        el("b", { text: placeLabel(p) }),
        el("span", { class: "ske-muted", text: " · " + byPage[p].length + (here ? " · open now" : "") }),
      ]));
      byPage[p].sort((a, b) => numberOf(a) - numberOf(b) || a.at.localeCompare(b.at)).forEach((c) => ui.commentList.appendChild(thread(c)));
    });
  }

  function commentBody(c) {
    return [
      el("div", { class: "ske-comment-meta", text: c.author + " · " + ago(c.at) + (c.resolved && c.resolvedBy ? " · resolved by " + c.resolvedBy : "") }),
      el("div", { class: "ske-comment-text", text: c.text }),
    ];
  }

  function commentThread(c, number, text) {
    const me = getName();
    const orphan = c.quote && !c.resolved && !locateQuote(text, c);
    const replyBox = el("div", { class: "ske-reply ske-hidden" });
    const actions = [
      el("button", { type: "button", title: "Take the game there and select what it's pinned to", text: "Show me", onclick: (e) => { e.stopPropagation(); showComment(c); } }),
      el("button", { type: "button", text: "Reply", onclick: function (e) {
        e.stopPropagation();
        replyBox.classList.toggle("ske-hidden");
        if (!replyBox.firstChild) {
          const input = el("textarea", { class: "ske-comment-input", rows: "2", placeholder: "Reply…" });
          replyBox.appendChild(input);
          replyBox.appendChild(el("button", { type: "button", text: "Post reply", onclick: () => postComment(input.value, { parent: c.id }) }));
        }
        const input = replyBox.querySelector("textarea");
        if (input) input.focus();
      } }),
      el("button", { type: "button", text: c.resolved ? "Reopen" : "Resolve", onclick: (e) => { e.stopPropagation(); runComment({ type: "resolve", id: c.id, resolved: !c.resolved, by: me || "someone" }, (c.resolved ? "Reopen" : "Resolve") + " comment on " + c.page); } }),
    ];
    if (orphan) {
      actions.push(el("button", { type: "button", title: "Pin this comment to the words selected in the article", text: "Re-pin to selection", onclick: function (e) {
        e.stopPropagation();
        const r = selection();
        if (r.to <= r.from) { say("Select some words in the article first.", "error"); return; }
        runComment({ type: "reanchor", id: c.id, anchor: makeAnchor(getText(), r.from, r.to) }, "Re-pin comment on " + c.page);
      } }));
    }
    if (me && c.author === me) {
      actions.push(el("button", { type: "button", text: "Delete", onclick: function (e) {
        e.stopPropagation();
        if (confirm("Delete this comment" + (repliesTo(c.id).length ? " and its replies" : "") + "?")) runComment({ type: "delete", id: c.id }, "Delete comment on " + c.page);
      } }));
    }
    const children = [
      number ? el("span", { class: "ske-comment-num", text: String(number) }) : null,
      c.quote ? el("div", { class: "ske-comment-quote", text: "“" + c.quote + "”" }) : c.about ? el("div", { class: "ske-comment-quote", text: c.about.indexOf("app:") === 0 ? "on " + appSelection(c.about.slice(4)).label : c.about.replace(/^photo:/, "on photo ") }) : null,
      orphan ? el("div", { class: "ske-orphan", text: "⚠ These words aren't in the page any more. Select new ones and Re-pin, or Resolve it." }) : null,
    ].concat(commentBody(c));
    repliesTo(c.id).forEach(function (r) {
      const rActions = [];
      if (me && r.author === me) rActions.push(el("button", { type: "button", text: "Delete", onclick: (e) => { e.stopPropagation(); if (confirm("Delete this reply?")) runComment({ type: "delete", id: r.id }, "Delete reply on " + c.page); } }));
      children.push(el("div", { class: "ske-comment-reply" }, commentBody(r).concat([el("div", { class: "ske-comment-actions" }, rActions)])));
    });
    children.push(el("div", { class: "ske-comment-actions" }, actions), replyBox);
    const box = el("div", {
      class: "ske-comment" + (c.resolved ? " ske-comment-done" : "") + (c.id === focusedComment ? " ske-comment-focus" : ""),
      "data-cid": c.id,
      onclick: (e) => { if (!e.target.closest("button, textarea")) focusComment(c.id, "panel"); },
    }, children);
    return box;
  }

  async function runComment(op, message) {
    ui.commentStatus.textContent = "Saving…";
    try {
      await changeComments(op, message);
      ui.commentStatus.textContent = "";
    } catch (e) {
      ui.commentStatus.textContent = e.message;
    }
  }

  function postComment(text, extra) {
    text = (text || "").trim();
    if (!text) return;
    /* Pinned to a selection that isn't words in the open page's markup. */
    if (!(extra && extra.parent) && sel && (sel.raw || sel.kind === "photo" || sel.kind === "app" || sel.kind === "page")) {
      if (!getToken()) { ui.commentStatus.textContent = "Add a GitHub token first (GitHub, top of the panel)."; return; }
      const who = ensureName();
      if (!who) return;
      const pinned = Object.assign({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        page: sel.passage || "Desktop",
        author: who,
        text: text,
        at: new Date().toISOString(),
        resolved: false,
      }, sel.raw ? makeAnchor(currentSource(sel.passage), sel.from, sel.to) : sel.kind === "photo" ? { about: "photo:" + sel.file } : sel.kind === "app" ? { about: "app:" + sel.key } : {});
      return runComment({ type: "add", comment: pinned }, "Comment on " + pinned.page + " (" + who + ")");
    }
    if (!shownPage) return;
    if (!getToken()) { ui.commentStatus.textContent = "Add a GitHub token first (GitHub, top of the panel)."; return; }
    const name = ensureName();
    if (!name) return;
    const r = selection();
    const comment = Object.assign({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      page: shownPage,
      author: name,
      text: text,
      at: new Date().toISOString(),
      resolved: false,
    }, extra && extra.parent ? { parent: extra.parent } : r.to > r.from ? makeAnchor(getText(), r.from, r.to) : {});
    return runComment({ type: "add", comment: comment }, (comment.parent ? "Reply on " : "Comment on ") + shownPage + " (" + name + ")");
  }

  async function onPostComment() {
    const text = ui.commentInput.value;
    if (!text.trim()) return;
    ui.commentInput.value = "";
    await postComment(text);
  }

  /* Highlights a comment everywhere: its thread in the panel, its words in
     the markup, and its words in the game. */
  function focusComment(id, from) {
    focusedComment = id;
    const c = comments.find((x) => x.id === id);
    renderComments();
    redecorate();
    markGame(true);
    const item = ui.commentList.querySelector('.ske-comment[data-cid="' + id + '"]');
    if (item && from !== "panel") item.scrollIntoView({ block: "nearest" });
    if (c && from !== "markup") {
      const at = locateQuote(getText(), c);
      if (at) selectRange(at.from, at.to, false);
    }
    const mark = document.querySelector('.ske-mark[data-cid="' + id + '"]');
    if (mark && from !== "game") {
      mark.scrollIntoView({ block: "center" });
      mark.classList.add("ske-mark-flash");
      setTimeout(() => mark.classList.remove("ske-mark-flash"), 900);
    }
  }

  /* ---------- Comment highlights in the game ---------- */

  /* Finds text in the rendered page (spaces squashed) and wraps it in
     <mark>s, across tags if need be. Returns the marks made. */
  function markText(root, needle, cid, number, focused) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest(".ske-mark-badge, script, style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let flat = "";
    const map = [];
    let lastSpace = true;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push(n);
      const t = n.nodeValue;
      for (let i = 0; i < t.length; i++) {
        const space = /\s/.test(t[i]);
        if (space && lastSpace) continue;
        flat += space ? " " : t[i];
        map.push([n, i]);
        lastSpace = space;
      }
    }
    let at = flat.indexOf(needle);
    let len = needle.length;
    if (at < 0 && needle.length > 50) { at = flat.indexOf(needle.slice(0, 50)); len = 50; }
    if (at < 0) return [];
    const start = map[at];
    const end = map[at + len - 1];
    const marks = [];
    let inside = false;
    nodes.forEach(function (n) {
      if (n === start[0]) inside = true;
      if (!inside) return;
      const from = n === start[0] ? start[1] : 0;
      const to = n === end[0] ? end[1] + 1 : n.nodeValue.length;
      if (to > from && n.nodeValue.slice(from, to).trim()) {
        let target = n;
        if (to < target.nodeValue.length) target.splitText(to);
        if (from > 0) target = target.splitText(from);
        const mark = document.createElement("mark");
        mark.className = "ske-mark" + (focused ? " ske-mark-focus" : "");
        mark.dataset.cid = cid;
        target.parentNode.insertBefore(mark, target);
        mark.appendChild(target);
        marks.push(mark);
      }
      if (n === end[0]) inside = false;
    });
    if (marks.length) {
      const badge = document.createElement("sup");
      badge.className = "ske-mark-badge";
      badge.dataset.cid = cid;
      badge.textContent = String(number);
      marks[marks.length - 1].after(badge);
    }
    return marks;
  }

  let markSignature = "";
  function markGame(force) {
    const content = document.querySelector(".browser-page-content");
    if (!content) return;
    const page = store.data.open && store.data.tab === "comments" && shownPage && hook.currentPage() === shownPage ? shownPage : null;
    const open = page ? rootsOn(page).filter((c) => !c.resolved && c.quote) : [];
    const sig = page + "|" + focusedComment + "|" + open.map((c) => c.id + c.quote).join(",") + "|" + getText().length;
    if (!force && content.dataset.skeMarked === sig && sig === markSignature) return;
    content.querySelectorAll(".ske-mark-badge").forEach((b) => b.remove());
    content.querySelectorAll("mark.ske-mark").forEach(function (m) { m.replaceWith.apply(m, Array.from(m.childNodes)); });
    content.normalize();
    open.forEach(function (c, i) {
      markText(content, gameText(c.quote), c.id, i + 1, c.id === focusedComment);
    });
    content.dataset.skeMarked = sig;
    markSignature = sig;
  }

  /* The elements a data-on zone covers (same rule as the game). */
  function zoneTargets(z) {
    const scope = z.closest(".browser-page-content, .panel-body, .panel") || z.closest(".playfield");
    try { return scope ? Array.from(scope.querySelectorAll(z.dataset.on)) : []; } catch (e) { return []; }
  }

  /* What a reaction covers, as a selection: its words, its photo, its page,
     or (a point, or a zone around more than words) its paragraph. */
  function selectionForItem(item) {
    if (item.type === "look") return null;
    if (item.photo) return { kind: "photo", passage: item.passage, file: item.photo };
    if (item.type === "page") return { kind: "page", passage: item.passage };
    if (!isWikiPage(item.passage)) {
      const src = currentSource(item.passage);
      const close = matchingClose(src, item.from);
      return { kind: "words", passage: item.passage, raw: true, from: item.from, to: close > item.to ? close + 7 : item.to };
    }
    const src = currentSource(item.passage);
    const text = friendlyOf(item.passage);
    const from = toFriendly(src.slice(0, item.from)).length;
    /* Words (also an "around" zone, or one stacked around another): from
       its marker to its end. */
    if (item.shape === "words") {
      const end = toFriendly(src.slice(0, zoneEnd(src, item))).length;
      if (end > from) return { kind: "words", passage: item.passage, from: from, to: end };
    }
    const line = lineAround(text, from);
    return { kind: "paragraph", passage: item.passage, from: line.from, to: line.to };
  }

  /* Clicking a zone in the game (Diskette tab) selects what it covers. */
  function openZoneCard(z) {
    const content = z.closest(".browser-page-content");
    let item = null;
    if (content && shownPage) {
      const index = Array.from(content.querySelectorAll(".diskette-zone, .diskette-page")).indexOf(z);
      item = allReactions().find((i) => i.passage === shownPage && i.index === index && i.type !== "look");
    } else {
      item = allReactions().find((i) => i.type !== "look" && !isWikiPage(i.passage) && i.say === (z.dataset.say || ""));
    }
    if (!item) { say("Couldn't find that zone in the markup.", "error"); return; }
    focusAfterRender = { passage: item.passage, index: item.index };
    expandedCards.add(item.passage + "#" + item.index);
    if (store.data.tab !== "diskette") setTab("diskette");
    setSelection(selectionForItem(item));
    z.classList.remove("ske-zone-flash");
    void z.offsetWidth;
    z.classList.add("ske-zone-flash");
  }

  /* While the panel is open, Diskette's response zones show as dashed
     circles of their radius, and her page comment as a tag. */
  function showZones() {
    const on = !!store.data.open && store.data.tab === "diskette";
    document.querySelectorAll(".ske-zone-target").forEach((t) => t.classList.remove("ske-zone-target"));
    document.querySelectorAll(".playfield .diskette-zone, .playfield .diskette-page").forEach(function (z) {
      const todo = on && /^TODO\b/.test((z.dataset.say || "").trim());
      const words = on && z.classList.contains("diskette-zone") && !z.dataset.on && (z.textContent.trim() !== "" || z.children.length > 0);
      const el = on && !!z.dataset.on;
      if (z.classList.contains("ske-zone") !== on) z.classList.toggle("ske-zone", on);
      if (z.classList.contains("ske-zone-words") !== words) z.classList.toggle("ske-zone-words", words);
      if (z.classList.contains("ske-zone-el") !== el) z.classList.toggle("ske-zone-el", el);
      if (el) zoneTargets(z).forEach((t) => t.classList.add("ske-zone-target"));
      if (z.classList.contains("ske-zone-todo") !== todo) z.classList.toggle("ske-zone-todo", todo);
      if (on && z.dataset.radius && z.style.getPropertyValue("--ske-r") !== z.dataset.radius + "px") z.style.setProperty("--ske-r", z.dataset.radius + "px");
      const title = on ? "Diskette: " + (z.dataset.say || "") + (z.dataset.if ? "  (if: " + z.dataset.if + ")" : "") + "\nClick to edit it" : null;
      if (title === null) { if (z.hasAttribute("title")) z.removeAttribute("title"); }
      else if (z.title !== title) z.title = title;
    });
  }

  /* Clicks in the game while the panel is open. In Edit mode they select
     (and do nothing else). Otherwise the game plays, except on what the
     editor itself shows: a zone (Diskette tab) or a comment's highlight
     (Comments tab) selects it, and a red link offers to create the page. */
  function onGameClick(e) {
    if (!store.data.open) return;
    if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); return; }
    if (e.target.closest(".ske-pop")) return;
    if (aiming && e.target.closest(".playfield")) {
      e.preventDefault();
      e.stopPropagation();
      const fromDrag = selectionFromGame();
      const t = fromDrag || aimTarget(e.clientX, e.clientY);
      if (t) setSelection(t);
      /* One pick per Edit. */
      if (t) setAiming(false);
      return;
    }
    if (store.data.tab === "diskette" && e.target.closest(".playfield") && !e.target.closest(".diskette-assistant")) {
      const z = e.target.closest(".diskette-zone.ske-zone, .diskette-page.ske-zone");
      if (z) { e.preventDefault(); e.stopPropagation(); openZoneCard(z); return; }
    }
    if (!e.target.closest(".browser-page-content")) return;
    const red = e.target.closest(".ske-redlink");
    if (red) { e.preventDefault(); e.stopPropagation(); openNewPageDialog(red.dataset.page); return; }
    /* A comment's highlight selects its words and opens its thread. */
    const mark = e.target.closest(".ske-mark-badge, .ske-mark");
    if (mark && (mark.classList.contains("ske-mark-badge") || !mark.closest("tw-link, tw-enchantment"))) {
      const c = comments.find((x) => x.id === mark.dataset.cid);
      const at = c && shownPage ? locateQuote(getText(), c) : null;
      if (at) setSelection({ kind: "words", passage: shownPage, from: at.from, to: at.to });
      focusComment(mark.dataset.cid, "game");
    }
    /* Anything else plays the game. */
  }

  /* Where a point in the game's page is in the markup (by matching the words
     around it), or null. */
  function textPosAt(x, y) {
    const caret = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (!caret || caret.startContainer.nodeType !== Node.TEXT_NODE) return null;
    const t = caret.startContainer.nodeValue;
    const off = caret.startOffset;
    const doc = getText();
    const tries = [[off - 20, off + 20], [off - 10, off + 10], [0, 30]];
    for (const [a, b] of tries) {
      const from = Math.max(0, a);
      const snippet = t.slice(from, Math.min(t.length, b)).replace(/\s+/g, " ");
      if (snippet.trim().length < 6) continue;
      const i = doc.indexOf(snippet);
      if (i >= 0) return i + Math.min(snippet.length, off - from);
    }
    return null;
  }

  /* =======================================================
     THE SHARED SELECTION
     -------------------------------------------------------
     What the editor is working on. Picked in the game by
     dragging across words (any time the panel is open) or, in
     Edit mode (⌖, or E), by clicking a paragraph, a photo or a
     thing (an icon, a window, the clock, Diskette...). All four
     tabs follow it, and a small popup by it jumps to the right
     one. Kinds:
       words / paragraph  a range of a page's short-form markup
                          (or, raw: true, of a game passage like
                          Mail or the ticket)
       photo              a photo on a page
       page               a whole browser page
       app                a thing on the desktop (key as in
                          DisketteLooks)
     ======================================================= */

  let sel = null;
  let aiming = false;
  let swallowClick = false;
  const WINDOW_PASSAGE = { readme: "RenderDesktop", recycle: "RenderDesktop", downloads: "RenderDesktop", mail: "RenderMailInbox", netcontkts: "RenderNetconTicket" };

  function setAiming(on) {
    aiming = !!on && store.data.open;
    document.body.classList.toggle("ske-aiming", aiming);
    const btn = ui && ui.panel.querySelector(".ske-aim-btn");
    if (btn) btn.classList.toggle("ske-aim-on", aiming);
    drawHover(null);
    topBar();
  }

  /* A slim bar over the game: Edit mode while it's on, otherwise what's
     selected (and that Esc lets go of it). */
  function topBar() {
    let bar = document.querySelector(".ske-aimbar");
    const show = store.data.open && (aiming || sel);
    if (!show) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = el("div", { class: "ske-aimbar" });
      document.body.appendChild(bar);
    }
    bar.textContent = "";
    bar.classList.toggle("ske-selbar", !aiming);
    if (aiming) {
      bar.appendChild(el("span", { text: "⌖ Click something in the game to select it" }));
      bar.appendChild(el("button", { type: "button", text: "Done (Esc)", onclick: () => setAiming(false) }));
    } else {
      const label = selectionLabel(sel);
      bar.appendChild(el("span", { class: "ske-selbar-label", text: "Selected: " + (label.length > 50 ? label.slice(0, 50) + "…" : label) }));
      bar.appendChild(el("button", { type: "button", title: "Let go of the selection", text: "Esc to deselect", onclick: () => setSelection(null) }));
    }
    bar.style.left = Math.round((window.innerWidth - (store.data.open ? PANEL_WIDTH : 0)) / 2) + "px";
  }


  /* The short-form text of a passage as it is now. */
  function friendlyOf(name) {
    if (name === shownPage) return getText();
    return name in store.data.drafts && !store.data.raw[name] ? store.data.drafts[name] : toFriendly(currentSource(name));
  }

  /* ---------- Finding text in the game ---------- */

  /* The visible text of a DOM subtree, whitespace collapsed, with where each
     character is: { norm, pos: [[node, offset]] }. */
  function domText(root) {
    let norm = "";
    const pos = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest(".ske-mark-badge, script, style, [hidden], .winki-index") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.nodeValue;
      for (let k = 0; k < t.length; k++) {
        let c = t[k];
        if (/\s/.test(c)) {
          if (!norm.length || norm[norm.length - 1] === " ") continue;
          c = " ";
        }
        norm += c;
        pos.push([n, k]);
      }
    }
    return { norm: norm, pos: pos };
  }

  /* The occurrence of needle in hay nearest to index near, or -1. */
  function nearest(hay, needle, near) {
    let best = -1;
    for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
      if (best < 0 || Math.abs(i - near) < Math.abs(best - near)) best = i;
    }
    return best;
  }

  /* A DOM Range over the visible text `words` inside root, near character near. */
  function domRangeFor(root, words, near) {
    if (!root || !words) return null;
    const d = domText(root);
    const at = nearest(d.norm, words, near || 0);
    if (at < 0) return null;
    const r = document.createRange();
    const a = d.pos[at];
    const b = d.pos[at + words.length - 1];
    r.setStart(a[0], a[1]);
    r.setEnd(b[0], b[1] + 1);
    return r;
  }

  /* Where in the game a selection is: client rects (empty if not on screen). */
  function selectionRects(s) {
    if (!s) return [];
    const content = document.querySelector(".browser-page-content");
    const rectsOf = (el) => (el && el.isConnected ? [el.getBoundingClientRect()] : []);
    if (s.kind === "page") return s.passage === hook.currentPage() ? rectsOf(content) : [];
    if (s.kind === "photo") return s.passage === hook.currentPage() && content ? rectsOf(content.querySelector('.article-art[data-art="' + CSS.escape(s.file) + '"]')) : [];
    if (s.kind === "app") return rectsOf(s.css ? document.querySelector(s.css) : null);
    let range = null;
    if (s.raw) {
      const panel = Array.from(document.querySelectorAll(".panel[data-window-template]")).find((p) => WINDOW_PASSAGE[p.dataset.windowTemplate] === s.passage);
      range = panel ? domRangeFor(panel.querySelector(".panel-body") || panel, visibleMap(currentSource(s.passage).slice(s.from, s.to)).vis.trim(), 0) : null;
    } else if (s.passage === hook.currentPage() && content) {
      const text = friendlyOf(s.passage);
      const r = expandRange(text, s.from, Math.min(s.to, text.length));
      const full = visibleMap(text);
      let near = full.map.findIndex((m) => m >= r.from);
      if (near < 0) near = 0;
      range = domRangeFor(content, visibleMap(text.slice(r.from, r.to)).vis.trim(), near);
    }
    if (!range) return [];
    const view = content ? content.getBoundingClientRect() : null;
    return Array.from(range.getClientRects()).filter((r) => r.width > 0 && (!view || (r.bottom > view.top && r.top < view.bottom)));
  }

  /* ---------- Picking ---------- */

  /* A thing on the desktop under the pointer, keyed like DisketteLooks. */
  const APP_RULES = [
    [".diskette-assistant, .diskette-balloon, .tray-diskette", () => ["self", "Diskette", ".diskette-character"]],
    [".desktop-icon[data-window-template]", (e) => ["icon-" + e.dataset.windowTemplate, "the " + iconName(e.dataset.windowTemplate) + " icon", '.desktop-icon[data-window-template="' + e.dataset.windowTemplate + '"]']],
    [".bin-icon[data-app]", (e) => ["trash-item", "something in the Trash", '.bin-icon[data-app="' + e.dataset.app + '"]']],
    [".folder-file[data-file]", (e) => [e.dataset.file, e.dataset.file + " in Downloads", '.folder-file[data-file="' + e.dataset.file + '"]']],
    [".start-button, .start-menu", () => ["start", "the Start button", ".start-button"]],
    [".taskbar-clock", () => ["clock", "the clock", ".taskbar-clock"]],
    [".tray-volume, .volume-popup", () => ["volume", "the volume", ".tray-volume"]],
    [".taskbar", () => ["taskbar", "the taskbar", ".taskbar"]],
    [".xp-dialog", (e) => {
      const a = e.querySelector(".xp-dialog-action");
      const k = a && a.dataset.action ? "dialog-" + a.dataset.action : "dialog";
      return [k, "this popup", ".xp-dialog"];
    }],
    [".panel[data-window-template]", (e) => {
      const t = e.dataset.windowTemplate;
      return [t, "the " + iconName(t) + " window", '.panel[data-window-template="' + t + '"]'];
    }],
  ];
  function iconName(t) {
    return { readme: "READ_ME", recycle: "Trash", browser: "Browse", mail: "Mail", notes: "Notes", downloads: "Downloads", diskette: "Diskette", granmas: "granmas.jpg", netcontkts: "NetCon ticket" }[t] || t;
  }

  function appAt(hit) {
    for (const [selector, fn] of APP_RULES) {
      const e = hit.closest(selector);
      if (e) {
        const [key, label, css] = fn(e);
        const panel = e.closest(".panel[data-window-template]");
        return { kind: "app", key: key, label: label, css: css, passage: panel ? WINDOW_PASSAGE[panel.dataset.windowTemplate] || null : null };
      }
    }
    return { kind: "app", key: "desktop", label: "the wallpaper", css: ".wallpaper" };
  }

  /* What a click at x, y in Edit mode selects. */
  function aimTarget(x, y) {
    const hit = document.elementFromPoint(x, y);
    if (!hit || !hit.closest(".playfield") || hit.closest(".ske-pop")) return null;
    const content = hit.closest(".browser-page-content");
    const page = hook.currentPage();
    if (content && page) {
      /* (A floated photo can sit under the list or paragraph beside it.) */
      const photo = document.elementsFromPoint(x, y).map((e) => e.closest(".article-art[data-art]")).find(Boolean);
      if (photo && content.contains(photo)) return { kind: "photo", passage: page, file: photo.dataset.art };
      if (shownPage === page) {
        const pos = textPosAt(x, y);
        if (pos !== null) {
          const line = lineAround(getText(), pos);
          if (line.to > line.from && visibleMap(getText().slice(line.from, line.to)).vis.trim()) return { kind: "paragraph", passage: page, from: line.from, to: line.to };
        }
      }
      return { kind: "page", passage: page };
    }
    return appAt(hit);
  }

  /* Words selected in the game, as a selection (or null). */
  function selectionFromGame() {
    const ws = window.getSelection();
    if (!ws || ws.isCollapsed || !ws.rangeCount) return null;
    const node = ws.anchorNode;
    const elem = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!elem || !elem.closest(".playfield")) return null;
    const words = ws.toString().replace(/\s+/g, " ").trim();
    if (!words) return null;
    const content = elem.closest(".browser-page-content");
    if (content && shownPage && shownPage === hook.currentPage()) {
      const text = getText();
      const v = visibleMap(text);
      const d = domText(content);
      const r = ws.getRangeAt(0);
      let domAt = d.pos.findIndex((p) => p[0] === r.startContainer && p[1] >= r.startOffset);
      if (domAt < 0) domAt = 0;
      const at = nearest(v.vis, words, domAt);
      if (at < 0) return null;
      const range = expandRange(text, v.map[at], v.map[at + words.length - 1] + 1);
      return { kind: "words", passage: shownPage, from: range.from, to: range.to };
    }
    const panel = elem.closest(".panel[data-window-template]");
    const passageName = panel && WINDOW_PASSAGE[panel.dataset.windowTemplate];
    if (passageName) {
      const src = currentSource(passageName);
      const at = src.indexOf(words);
      if (at >= 0) return { kind: "words", passage: passageName, raw: true, from: at, to: at + words.length };
    }
    return null;
  }

  /* ---------- Showing it ---------- */

  function selectionLabel(s) {
    if (!s) return "";
    if (s.kind === "page") return s.passage;
    if (s.kind === "photo") return "photo " + s.file;
    if (s.kind === "app") return s.label;
    const full = s.raw ? currentSource(s.passage) : friendlyOf(s.passage);
    const r = s.raw ? s : expandRange(full, s.from, Math.min(s.to, full.length));
    const t = full.slice(r.from, r.to);
    const words = visibleMap(t).vis.trim();
    return (s.kind === "paragraph" ? "¶ " : "") + "“" + (words.length > 48 ? words.slice(0, 48) + "…" : words) + "”";
  }

  function renderCrumbs() {
    const box = ui.crumbs;
    box.textContent = "";
    box.classList.toggle("ske-hidden", !sel);
    topBar();
    if (!sel) return;
    const crumb = (label, s, current) => el(current ? "b" : "button", current ? { class: "ske-crumb", text: label } : { type: "button", class: "ske-crumb ske-crumb-link", text: label, title: "Select this instead", onclick: () => setSelection(s) });
    const parts = [];
    if (sel.kind === "app") parts.push(el("span", { class: "ske-crumb ske-muted", text: "Desktop" }));
    else if (sel.raw) parts.push(el("span", { class: "ske-crumb ske-muted", text: placeLabel(sel.passage) }));
    else parts.push(crumb(sel.passage, { kind: "page", passage: sel.passage }, sel.kind === "page"));
    if (sel.kind === "words" && !sel.raw) {
      const line = lineAround(friendlyOf(sel.passage), sel.from);
      parts.push(crumb("¶ paragraph", { kind: "paragraph", passage: sel.passage, from: line.from, to: line.to }, false));
    }
    if (sel.kind !== "page") parts.push(crumb(selectionLabel(sel), sel, true));
    parts.forEach((p, i) => { if (i) box.appendChild(el("span", { class: "ske-crumb-sep", text: "›" })); box.appendChild(p); });
    box.appendChild(el("button", { type: "button", class: "ske-crumb-x", title: "Clear the selection (Esc)", text: "×", onclick: () => setSelection(null) }));
  }

  let overlay = null;
  function overlayLayer() {
    if (!overlay || !overlay.isConnected) {
      overlay = el("div", { class: "ske-overlay" });
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function drawRects(cls, rects) {
    const layer = overlayLayer();
    layer.querySelectorAll("." + cls).forEach((n) => n.remove());
    rects.forEach(function (r) {
      const box = el("div", { class: "ske-rect " + cls });
      box.style.left = r.left - 2 + "px";
      box.style.top = r.top - 1 + "px";
      box.style.width = r.width + 4 + "px";
      box.style.height = r.height + 2 + "px";
      layer.appendChild(box);
    });
  }

  function drawHover(t) {
    drawRects("ske-hover", t ? selectionRects(t) : []);
  }

  /* The selection's outline and its popup, redrawn whenever the game moves. */
  function drawSelection() {
    const rects = store.data.open ? selectionRects(sel) : [];
    drawRects("ske-sel", rects);
    const layer = overlayLayer();
    let pop = layer.querySelector(".ske-pop");
    if (!sel || !rects.length) { if (pop) pop.remove(); return; }
    if (!pop || pop.dataset.sig !== popSignature()) {
      if (pop) pop.remove();
      pop = buildPopup();
      layer.appendChild(pop);
    }
    const top = Math.min.apply(null, rects.map((r) => r.top));
    const bottom = Math.max.apply(null, rects.map((r) => r.bottom));
    const left = Math.min.apply(null, rects.map((r) => r.left));
    const h = pop.offsetHeight || 30;
    pop.style.left = Math.max(4, Math.min(left, window.innerWidth - pop.offsetWidth - 4 - (store.data.open ? PANEL_WIDTH : 0))) + "px";
    pop.style.top = (top - h - 6 > 4 ? top - h - 6 : bottom + 6) + "px";
  }

  let redrawFrame = 0;
  function redrawSoon() {
    if (redrawFrame) return;
    redrawFrame = requestAnimationFrame(function () { redrawFrame = 0; drawSelection(); });
  }

  /* ---------- What's attached to it ---------- */

  /* The selection as a range of its passage's source (for words, paragraphs). */
  function sourceRange(s) {
    if (s.raw) return { from: s.from, to: s.to };
    const text = friendlyOf(s.passage);
    const r = expandRange(text, s.from, Math.min(s.to, text.length));
    return { from: fromFriendly(text.slice(0, r.from)).length, to: fromFriendly(text.slice(0, r.to)).length };
  }

  function reactionsFor(s) {
    if (!s) return [];
    const items = allReactions();
    if (s.kind === "app") return items.filter((i) => i.type === "look" && i.keys.indexOf(s.key) >= 0);
    if (s.kind === "photo") return items.filter((i) => i.passage === s.passage && i.photo === s.file);
    if (s.kind === "page") return items.filter((i) => i.passage === s.passage && i.type === "page");
    const r = sourceRange(s);
    return items.filter((i) => i.passage === s.passage && i.type === "zone" && !i.photo && i.from >= r.from - 1 && i.from <= r.to);
  }

  function notesFor(s, resolved) {
    if (!s) return [];
    const roots = comments.filter((c) => !c.parent && !c.resolved === !resolved).filter((c) => c.page === s.passage || (s.kind === "app" && c.about === "app:" + s.key));
    if (s.kind === "app") return roots.filter((c) => c.about === "app:" + s.key);
    if (s.kind === "photo") return roots.filter((c) => c.about === "photo:" + s.file);
    if (s.kind === "page") return roots;
    const text = s.raw ? currentSource(s.passage) : friendlyOf(s.passage);
    return roots.filter(function (c) {
      const at = locateQuote(text, c);
      return at && at.from < s.to && at.to > s.from;
    });
  }

  function popSignature() {
    const r = reactionsFor(sel);
    return JSON.stringify([sel, notesFor(sel).length, r.map((x) => x.say || x.text)]);
  }

  function buildPopup() {
    const reactions = reactionsFor(sel);
    const notes = notesFor(sel);
    const first = reactions[0];
    const line = first ? gameText((first.say || first.text || "").replace(/\s*(>>|&gt;&gt;)\s*/g, " / ")) : "";
    const canMarkup = sel.kind !== "app" || !!sel.passage;
    const pop = el("div", { class: "ske-pop" }, [
      el("button", { type: "button", class: "ske-pop-btn", title: canMarkup ? "Show it in the page's markup" : "No markup for this", text: "✎ Markup", onclick: () => editSelectionInMarkup() }),
      el("button", { type: "button", class: "ske-pop-btn", title: notes.length ? "Its comments" : "Leave a comment on it", text: "💬 " + (notes.length ? notes.length + (notes.length === 1 ? " comment" : " comments") : "Comment") , onclick: () => { setTab("comments"); ui.commentInput.focus(); } }),
      el("button", { type: "button", class: "ske-pop-btn ske-pop-diskette", title: first ? "Her response here" : "Make Diskette react to this", text: first ? "◉ “" + (line.length > 26 ? line.slice(0, 26) + "…" : line || "…") + "”" + (reactions.length > 1 ? " +" + (reactions.length - 1) : "") : "◉ Diskette +", onclick: function () {
        if (!first) createReactionFor(sel);
        else setTab("diskette");
      } }),
      el("button", { type: "button", class: "ske-pop-x", title: "Clear the selection (Esc)", text: "×", onclick: () => setSelection(null) }),
    ]);
    pop.dataset.sig = popSignature();
    if (!canMarkup) pop.firstChild.disabled = true;
    /* Doing something with the selection ends Edit mode. */
    pop.addEventListener("click", (e) => { if (e.target.closest("button")) setAiming(false); });
    pop.addEventListener("mousedown", (e) => e.stopPropagation());
    return pop;
  }

  /* Drops the shared selection without moving the markup (for editing). */
  function releaseSelection() {
    if (!sel || sel.raw || (sel.kind === "app" && sel.passage)) return;
    sel = null;
    renderCrumbs();
    drawSelection();
    const tab = store.data.tab;
    if (tab === "comments") { renderComments(); updateQuoteHint(); }
    if (tab === "diskette") renderDiskette(true);
    if (tab === "events") renderStatus(true);
  }

  /* ✎ Markup: straight to editing it there, its text selected; the game's
     selection goes (game code stays selected: it's read-only there). */
  function editSelectionInMarkup() {
    const s = sel;
    if (!s) return;
    if (s.raw || s.kind === "app" || s.passage !== shownPage) { setTab("markup"); return; }
    const text = getText();
    let r = null;
    if (s.kind === "words" || s.kind === "paragraph") r = expandRange(text, s.from, Math.min(s.to, text.length));
    else if (s.kind === "photo") {
      const i = text.indexOf("[[photo: " + s.file);
      if (i >= 0) r = { from: i, to: text.indexOf("]]", i) + 2 };
    }
    sel = null;
    indexOpen = false;
    renderCrumbs();
    drawSelection();
    setTab("markup");
    if (r) selectRange(r.from, r.to, true);
    else view.focus();
  }

  /* ---------- Changing it ---------- */

  function setSelection(s) {
    sel = s;
    if (s) indexOpen = false;
    if (!ui) return;
    renderCrumbs();
    drawSelection();
    /* The markup box selects it too (comments quote what's selected there). */
    if (sel && !sel.raw && (sel.kind === "words" || sel.kind === "paragraph") && sel.passage === shownPage) selectRange(sel.from, sel.to, false);
    const tab = store.data.tab;
    if (tab === "markup") focusMarkupOnSelection();
    if (tab === "comments") { renderComments(); updateQuoteHint(); }
    if (tab === "diskette") renderDiskette(true);
    if (tab === "events") renderStatus(true);
  }

  /* Markup follows the selection: its words selected and scrolled to, or, for
     game code (Mail, the ticket...), a read-only look at that passage. */
  function focusMarkupOnSelection() {
    if (!ui) return;
    const raw = ui.panel.querySelector(".ske-rawview");
    const cm = ui.panel.querySelector(".ske-tab-markup .ske-cm");
    const showRaw = !!(sel && (sel.raw || (sel.kind === "app" && sel.passage)));
    raw.classList.toggle("ske-hidden", !showRaw);
    cm.classList.toggle("ske-hidden", showRaw);
    ui.panel.querySelector(".ske-tab-markup").classList.toggle("ske-raw-mode", showRaw);
    ui.title.textContent = showRaw ? sel.passage + " (game code)" : shownPage || "Open a Winkipedia page in the game's browser to edit it here.";
    if (showRaw) {
      const src = currentSource(sel.passage);
      const from = sel.raw ? sel.from : 0;
      const to = sel.raw ? sel.to : 0;
      const start = Math.max(0, src.lastIndexOf("\n", Math.max(0, from - 300)));
      raw.textContent = "";
      raw.appendChild(el("div", { class: "ske-muted ske-tiny", text: sel.passage + " is game code, so it's shown here read-only. Diskette reactions and comments on it work from their tabs." }));
      const pre = el("pre", { class: "ske-rawpre" }, [
        document.createTextNode(src.slice(start, from)),
        el("mark", { text: src.slice(from, to) }),
        document.createTextNode(src.slice(to, Math.min(src.length, to + 600))),
      ]);
      raw.appendChild(pre);
      const mark = pre.querySelector("mark");
      if (mark && to > from) setTimeout(() => mark.scrollIntoView({ block: "center" }), 0);
      updateMarkupMode();
      return;
    }
    updateMarkupMode();
    if (sel && !sel.raw && sel.from !== undefined && sel.passage === shownPage) selectRange(sel.from, sel.to, false);
  }

  /* Makes Diskette react to the selection: a zone shaped to it (or, for a
     thing on the desktop, her line for it), then opens it to write. */
  function createReactionFor(s) {
    if (!s) return;
    if (s.kind === "app") {
      const have = reactionsFor(s);
      if (!have.length) setSource(LOOKS, addLook(currentSource(LOOKS), { keys: [s.key], text: "" }));
      const items = allReactions().filter((i) => i.type === "look" && i.keys.indexOf(s.key) >= 0);
      const it = items[items.length - 1];
      focusAfterRender = it ? { passage: it.passage, index: it.index } : null;
      setTab("diskette");
      return;
    }
    if (s.raw) {
      const src = currentSource(s.passage);
      const words = src.slice(s.from, s.to);
      if (/[<>[\]()$]/.test(words)) { say("Those words are mixed up with game code; select plainer words, or the window itself.", "error"); return; }
      const before = src.slice(0, s.from) + zoneTag({ kind: "zone", radius: 10, say: "" });
      setSource(s.passage, before + words + "</span>" + src.slice(s.to));
      focusAfterRender = { passage: s.passage, index: findReactions(before).length - 1 };
      setTab("diskette");
      return;
    }
    if (s.passage !== shownPage) { say("Open " + s.passage + " in the game's browser first.", "error"); return; }
    const text = getText();
    let at;
    let insert;
    let open;
    if (s.kind === "page") {
      at = { from: 0, to: 0 };
      open = insert = "[[diskette: page | ]]";
    } else if (s.kind === "photo") {
      const p = text.indexOf("[[photo: " + s.file);
      const end = p >= 0 ? text.indexOf("]]", p) + 2 : 0;
      at = { from: end, to: end };
      open = insert = "[[diskette: 10 | on photo: " + s.file + " | ]]";
    } else {
      at = { from: s.from, to: s.to };
      const words = text.slice(s.from, s.to);
      if (/^\[\[diskette:[^\]]*\]\]$/.test(words)) { setTab("diskette"); return; }
      if (words && !/[[\]|<>\n]/.test(words)) open = insert = "[[diskette: 10 | on: " + words + " | ]]";
      else {
        open = "[[diskette: 10 | around | ]]";
        insert = open + words + "[[/diskette]]";
      }
    }
    view.dispatch({ changes: { from: at.from, to: at.to, insert: insert } });
    focusAfterRender = { passage: s.passage, index: findReactions(fromFriendly(text.slice(0, at.from) + open)).length - 1 };
    if (s.kind === "words" || s.kind === "paragraph") sel = Object.assign({}, s, { from: at.from, to: at.from + insert.length });
    setTab("diskette");
    say("Diskette reacts to it now. Write her line.", "ok");
  }

  /* ---------- Pointer and keys ---------- */

  function onAimMove(e) {
    if (!aiming || !store.data.open) return;
    if (onAimMove.frame) return;
    const x = e.clientX;
    const y = e.clientY;
    onAimMove.frame = requestAnimationFrame(function () {
      onAimMove.frame = 0;
      drawHover(aimTarget(x, y));
    });
  }

  /* In Edit mode, presses in the game don't drag icons or windows. */
  function onAimDown(e) {
    if (!aiming || !store.data.open || !e.target.closest(".playfield") || e.target.closest(".ske-pop")) return;
    if (!e.target.closest(".browser-page-content, .panel-body")) { e.preventDefault(); e.stopPropagation(); }
  }

  /* Words dragged across in the game become the selection. */
  function onGameMouseUp(e) {
    if (!store.data.open || !e.target.closest(".playfield") || e.target.closest(".ske-pop")) return;
    setTimeout(function () {
      const s = selectionFromGame();
      if (s) setSelection(s);
    }, 0);
  }

  function onKey(e) {
    if (!store.data.open) return;
    const typing = e.target.closest && e.target.closest("input, textarea, [contenteditable='true'], .cm-editor");
    if (e.key === "Escape") {
      if (aiming) setAiming(false);
      else if (sel) setSelection(null);
      return;
    }
    if (!typing && (e.key === "e" || e.key === "E") && !e.metaKey && !e.ctrlKey && !e.altKey) setAiming(!aiming);
  }


  /* ---------- Diskette tab: every reaction, in one place ---------- */

  /* What each DisketteLooks key is (the game's DISKETTE INSPECTING reads them). */
  const LOOK_KEYS = [
    ["self", "Diskette herself"], ["poke", "a click on her eyes, no drag"], ["page-winkipedia", "a Winkipedia page (no comment of its own)"], ["page-fanwiki", "a fan wiki page"], ["page-forum", "a fan wiki forum thread"],
    ["page-gamesarchive", "the Global Games Archive"], ["page-kraska1", "Anya's kraska1 pages"], ["page-devlink", "the devlink pages"],
    ["page-404", "the Skunkpets.com 404 page"], ["page-newtab", "a new tab"], ["page", "any browser page without a line of its own"],
    ["browser", "the Browse window's bars and buttons"], ["icon-browser", "the Browse icon"],
    ["mail", "the Mail window"], ["icon-mail", "the Mail icon"], ["notes", "the Notes window"], ["icon-notes", "the Notes icon"],
    ["readme", "the READ_ME window"], ["icon-readme", "the READ_ME icon"], ["recycle", "the Trash window"], ["icon-recycle", "the Trash icon"],
    ["trash-item", "anything inside the Trash"], ["downloads", "the Downloads window"], ["icon-downloads", "the Downloads icon"],
    ["granmas", "granmas.jpg, open"], ["netcontkts", "the NetCon ticket, open"], ["icon-diskette", "her own icon"],
    ["start", "the Start button and menu"], ["clock", "the clock"], ["volume", "the speaker and volume popup"], ["taskbar", "the taskbar"],
    ["dialog", "any popup"], ["dialog-exit", "the “exiting to external website” popup"], ["dialog-devlink", "the popup before devlink-userbase"],
    ["dialog-openmail", "the “new email” popup"], ["desktop", "the wallpaper"], ["monitor", "the edge of the screen"],
    ["outside", "off the monitor"], ["anything", "anything with no line of its own"],
  ];
  const PLACE_LABELS = {
    RenderDesktop: "the desktop's windows (READ_ME, Trash)",
    RenderMailInbox: "Mail",
    RenderNetconTicket: "the NetCon ticket (Downloads)",
    DisketteLooks: "apps & things (DisketteLooks)",
  };
  const placeLabel = (name) => PLACE_LABELS[name] || name;
  const LOOKS = "DisketteLooks";

  let focusAfterRender = null;   /* { passage, index } of a card to focus */
  let redrawTimer = null;

  /* Every reaction in the game as it is now (drafts included). */
  function allReactions() {
    const names = Array.from(new Set(Object.keys(original).concat(Object.keys(store.data.newPages))));
    const items = [];
    names.forEach(function (name) {
      const tags = tagsOf(name);
      if (tags.indexOf("script") >= 0 || tags.indexOf("stylesheet") >= 0) return;
      const src = currentSource(name);
      if (name === LOOKS) {
        findLooks(src).forEach((l, i) => items.push(Object.assign({ type: "look", passage: name, index: i }, l)));
      } else {
        findReactions(src).forEach(function (r, i) {
          /* The words just before it, as a reader sees them. */
          const before = gameText(toFriendly(src.slice(Math.max(0, r.from - 400), r.from)).replace(/\([a-z-]+:[^)]*\)/g, " ").replace(/\[\[diskette:[^\]]*\]\]/g, ""));
          const plain = before.split(/[\[\]{}>|]/).pop().trim();
          items.push(Object.assign({ type: r.kind, passage: name, index: i, context: plain.slice(-70) }, r));
        });
      }
    });
    return items;
  }

  const byTodo = (a, b) => a.todo.prio - b.todo.prio || a.todo.num - b.todo.num || a.passage.localeCompare(b.passage);

  /* Changes a passage from outside the markup box (a Diskette card). */
  function setSource(name, source) {
    const raw = !isWikiPage(name);
    if (source === baseline(name)) {
      forgetDraft(name);
    } else {
      if (!(name in store.data.drafts)) store.data.bases[name] = baseline(name);
      store.data.drafts[name] = raw ? source : toFriendly(source);
      if (raw) store.data.raw[name] = true;
      else delete store.data.raw[name];
    }
    store.write();
    applyToGame(name);
    if (name === shownPage) {
      const at = selection().from;
      setText(name in store.data.drafts ? store.data.drafts[name] : toFriendly(currentSource(name)));
      const len = view.state.doc.length;
      view.dispatch({ selection: { anchor: Math.min(at, len) } });
      renderMissing();
    }
    refresh();
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(redraw, 350);
  }

  function conditionNow(cond) {
    if (!cond) return "";
    const happened = new Set((hook.events && hook.events()) || []);
    const missing = cond.split(",").map((c) => c.trim()).filter(Boolean).filter(function (c) {
      return c.charAt(0) === "!" ? happened.has(c.slice(1).trim()) : !happened.has(c);
    });
    return missing.length ? "Not in this playthrough yet (" + missing.join(", ") + ")" : "";
  }

  function moodSelect(value, onchange) {
    const s = el("select", { class: "ske-input ske-small", title: "How she reacts", onchange: onchange });
    [["hop", "hop"], ["shake", "shake her head"], ["wide", "wide eyes"]].forEach(function (m) {
      const o = el("option", { value: m[0], text: m[1] });
      if (m[0] === value) o.selected = true;
      s.appendChild(o);
    });
    return s;
  }

  /* Alternatives are one per line in a card's box, and " >> " in the markup. */
  const ALT_SPLIT = /\s*(?:>>|&gt;&gt;)\s*/;

  /* How she picks among several lines when asked about the same spot again.
     Only shown when there is more than one line. */
  const CYCLES = [
    ["order", "In order", "1, 2, 3, then she keeps saying the last one"],
    ["loop", "Loop", "1, 2, 3, 1, 2, 3…"],
    ["random", "Random", "A random one each time (never the same twice in a row)"],
  ];
  function cyclePicker(value, onchange) {
    const box = el("div", { class: "ske-cycle", title: "When she's asked about it again" });
    box.value = value || "order";
    box.appendChild(el("span", { class: "ske-muted ske-tiny", text: "Asked again:" }));
    CYCLES.forEach(function (c) {
      const b = el("button", { type: "button", class: "ske-cycle-btn" + (c[0] === box.value ? " ske-cycle-on" : ""), text: c[1], title: c[2], onclick: function () {
        box.value = c[0];
        box.querySelectorAll(".ske-cycle-btn").forEach((x) => x.classList.toggle("ske-cycle-on", x === b));
        onchange();
      } });
      box.appendChild(b);
    });
    return box;
  }

  /* Her line(s): one box per alternative. Enter adds the next one, Backspace in
     an empty one removes it, pasting several lines splits them. */
  function lineBoxes(initial, placeholder, onchange) {
    const wrap = el("div", { class: "ske-lines" });
    const list = el("div", { class: "ske-lines-list" });
    const more = el("button", { type: "button", class: "ske-link-btn ske-tiny", text: "+ Another line", title: "Something else she can say here when asked again" });
    const boxes = () => Array.from(list.querySelectorAll("textarea"));
    const renumber = function () {
      const all = boxes();
      list.classList.toggle("ske-lines-many", all.length > 1);
      all.forEach((t, i) => { t.previousSibling.textContent = String(i + 1); t.placeholder = i ? "…or this, when asked again" : placeholder; });
    };
    const add = function (value, after) {
      const t = el("textarea", { class: "ske-react-text", rows: "1" });
      t.value = value || "";
      const fit = () => { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; };
      t.addEventListener("input", function () { fit(); onchange(); });
      t.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          add("", row).focus();
          onchange();
        } else if (e.key === "Backspace" && !t.value && boxes().length > 1) {
          e.preventDefault();
          const prev = row.previousSibling || row.nextSibling;
          row.remove();
          renumber();
          if (prev) prev.querySelector("textarea").focus();
          onchange();
        }
      });
      t.addEventListener("paste", function (e) {
        const pasted = (e.clipboardData && e.clipboardData.getData("text")) || "";
        const parts = pasted.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        if (parts.length < 2) return;
        e.preventDefault();
        t.value = (t.value + " " + parts[0]).trim();
        let at = row;
        parts.slice(1).forEach(function (x) { at = add(x, at).closest(".ske-line"); });
        onchange();
      });
      const row = el("div", { class: "ske-line" }, [el("span", { class: "ske-line-num" }), t]);
      if (after && after.nextSibling) list.insertBefore(row, after.nextSibling);
      else list.appendChild(row);
      renumber();
      setTimeout(fit, 0);
      return t;
    };
    (initial.length ? initial : [""]).forEach((x) => add(x));
    more.addEventListener("click", function () { add("").focus(); onchange(); });
    wrap.appendChild(list);
    wrap.appendChild(more);
    wrap.values = () => boxes().map((t) => t.value.trim()).filter(Boolean);
    wrap.count = () => boxes().length;
    return wrap;
  }

  const expandedCards = new Set();

  /* The item again from the current source (its card may have edited it). */
  function freshItem(item) {
    try {
      const src = currentSource(item.passage);
      const now = item.type === "look" ? findLooks(src)[item.index] : findReactions(src)[item.index];
      return now ? Object.assign({}, item, now) : item;
    } catch (err) { return item; }
  }

  /* alt (optional): { rank, total, now, never, move(dir) } when it's one of
     several responses for the same spot. */
  function reactionCard(item, alt) {
    const isLook = item.type === "look";
    const cardKey = item.passage + "#" + item.index;
    const card = el("div", { class: "ske-react" + (item.todo ? " ske-react-todo" : "") });
    card.dataset.key = cardKey;
    const covers = item.shape === "words" ? "on “" + gameText(item.words).slice(0, 40) + "”"
      : item.shape === "element" ? (item.photo ? "on photo " + item.photo : "on " + item.on)
      : item.type === "page" ? "page comment" : "point · " + item.radius + " px";
    const where = isLook ? item.keys.join(", ") : placeLabel(item.passage) + " · " + covers;
    const was = isLook ? item.text : item.say;
    const title = item.todo ? item.todo.note || "To write" : gameText((was || "").split(ALT_SPLIT)[0]) || "(nothing yet)";

    const head = el("div", { class: "ske-react-head", title: "Click to " + (expandedCards.has(cardKey) ? "fold" : "edit") });
    if (item.draft) head.appendChild(el("span", { class: "ske-prio ske-draft-badge", title: "A draft: she doesn't say it until it's published", text: "draft" }));
    if (item.todo) head.appendChild(el("span", { class: "ske-prio ske-prio-" + item.todo.prio, title: "P1: needed to solve the demo. P2: story. P3: flavor.", text: item.todo.prio < 9 ? "P" + item.todo.prio + (item.todo.num < 999 ? "-" + String(item.todo.num).padStart(2, "0") : "") : "TODO" }));
    if (alt) {
      head.appendChild(el("span", { class: "ske-alt-rank" + (alt.now ? " ske-alt-now" : ""), title: alt.now ? "What she says here now, in this playthrough" : "Number " + alt.rank + " of " + alt.total + ": she says the first one whose “only if” fits", text: (alt.now ? "▶ " : "") + alt.rank }));
    }
    if (item.cond) head.appendChild(el("span", { class: "ske-cond-chip", title: "Only if: " + item.cond, text: "if " + item.cond.replace(/\s*,\s*/g, ", ").replace(/(^|, )!/g, "$1not ") }));
    else if (alt) head.appendChild(el("span", { class: "ske-cond-chip ske-cond-else", title: "No condition: she says it whenever the ones above don't fit", text: "otherwise" }));
    if (alt && alt.never) head.appendChild(el("span", { class: "ske-alt-never", title: "Never said: a response above has no condition, so it always wins. Give that one a condition, or move this one up.", text: "⚠ never" }));
    head.appendChild(el("span", { class: "ske-react-title", text: title }));
    const altCount = (was || "").split(ALT_SPLIT).filter((x) => x.trim()).length;
    if (altCount > 1 && !item.todo) head.appendChild(el("span", { class: "ske-alt-badge", title: altCount + " lines, " + (CYCLES.find((c) => c[0] === (item.cycle || "order")) || CYCLES[0])[2].toLowerCase(), text: (item.cycle === "random" ? "⤮ " : item.cycle === "loop" ? "↻ " : "") + altCount + " lines" }));
    head.appendChild(el("span", { class: "ske-react-where", text: where, title: where }));
    head.addEventListener("click", function () {
      if (expandedCards.has(cardKey)) expandedCards.delete(cardKey);
      else expandedCards.add(cardKey);
      card.replaceWith(reactionCard(freshItem(item), alt));
    });
    card.appendChild(head);
    if (!expandedCards.has(cardKey)) return card;
    card.classList.add("ske-react-open");

    if (item.type === "zone" && item.shape === "point" && item.context) card.appendChild(el("div", { class: "ske-react-context", text: "…" + item.context + " ●" }));
    if (isLook) card.appendChild(el("div", { class: "ske-muted ske-tiny", text: "When you drag her eyes to " + item.keys.map((k) => (LOOK_KEYS.find((x) => x[0] === k) || [k, k])[1]).join(" / ") }));
    const lines = lineBoxes(item.todo ? [] : (was || "").split(ALT_SPLIT).map((x) => x.trim()).filter(Boolean), item.todo ? "Write her line here…" : "What she says", () => { showCycle(); apply(); });
    const keys = isLook ? el("input", { type: "text", class: "ske-input ske-small", value: item.keys.join(" "), title: "Keys: what she's looking at (see ?)" }) : null;
    const radius = item.type === "zone" ? el("input", { type: "number", class: "ske-input ske-small ske-radius", min: "0", max: "400", step: item.shape === "point" ? "10" : "2", value: String(item.radius), title: item.shape === "point" ? "Reach: how far from the point it counts (game px)" : "Slack around the words or element (game px)" }) : null;
    const selector = item.shape === "element" && !item.photo ? el("input", { type: "text", class: "ske-input ske-small ske-cond", value: item.on, title: "CSS selector of what it covers, in the same page or window" }) : null;
    const cond = el("input", { type: "text", class: "ske-input ske-small ske-cond", value: item.cond, placeholder: "only if: event, !event", title: "Only when these events have happened (!name = only before). See the Events tab." });
    const condNote = el("div", { class: "ske-muted ske-cond-note", text: conditionNow(item.cond) });
    const then = el("input", { type: "text", class: "ske-input ske-small ske-cond", value: item.then || "", placeholder: "after Thanks: Need me to look at anything else?", title: "Her follow-up after “Thanks, Diskette!” (it offers Sure! and No, that's all.)" });
    let timer = null;
    const apply = function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        const said = lines.values().join(isLook ? " &gt;&gt; " : " >> ") || (item.todo ? was : "");
        const fields = { mood: mood.value, cond: cond.value.trim(), cycle: cycle.value, then: then.value.trim().replace(/[|\]]/g, "") };
        try {
          const src = currentSource(item.passage);
          if (isLook) {
            fields.text = said;
            fields.keys = keys.value.split(/[\s,]+/).filter(Boolean);
            if (!fields.keys.length) return;
            setSource(item.passage, editLook(src, item.index, fields));
          } else {
            fields.say = said;
            if (radius) fields.radius = isNaN(parseInt(radius.value, 10)) ? item.radius : parseInt(radius.value, 10);
            if (selector && selector.value.trim()) fields.on = selector.value.trim();
            setSource(item.passage, editReaction(src, item.index, fields));
          }
          condNote.textContent = conditionNow(fields.cond);
          const titleEl = card.querySelector(".ske-react-title");
          if (titleEl && !todoOf(said)) titleEl.textContent = gameText(said.split(ALT_SPLIT)[0]) || "(nothing yet)";
          card.classList.toggle("ske-react-todo", !!todoOf(said));
          countTodos();
        } catch (err) { say(err.message, "error"); }
      }, 350);
    };
    const mood = moodSelect(item.mood, apply);
    const cycle = cyclePicker(item.cycle, apply);
    /* The picker only matters (and only shows) with more than one line. */
    const showCycle = () => { cycle.hidden = lines.count() < 2; };
    [cond, radius, keys, selector, then].forEach((i) => i && i.addEventListener("input", apply));
    card.appendChild(lines);
    card.appendChild(cycle);
    showCycle();
    card.appendChild(el("div", { class: "ske-react-row" }, [
      keys,
      radius ? el("span", { class: "ske-muted ske-tiny", text: item.shape === "point" ? "reach" : "slack" }) : null, radius,
      mood,
    ]));
    card.appendChild(el("div", { class: "ske-react-row" }, [selector, cond]));
    card.appendChild(el("div", { class: "ske-react-row" }, [then]));
    card.appendChild(condNote);
    const iconBtn = (label, tip, fn) => el("button", { type: "button", class: "ske-icon-btn", title: tip, text: label, onclick: fn });
    card.appendChild(el("div", { class: "ske-react-row ske-react-actions" }, [
      alt && alt.rank > 1 ? iconBtn("↑", "Move up: she checks it before the one above", () => alt.move(-1)) : null,
      alt && alt.rank < alt.total ? iconBtn("↓", "Move down: she checks it after the one below", () => alt.move(1)) : null,
      isLook ? null : iconBtn("Show me", "Take the game there and flash it", () => showReaction(item)),
      isLook || !isWikiPage(item.passage) ? null : iconBtn("Edit in markup", "Select it in the Article tab", () => editInMarkup(item)),
      iconBtn(item.draft ? "Publish" : "Make draft", item.draft ? "Put it in the game" : "Take it out of the game (she won't say it) but keep it here", function () {
        try {
          const src = currentSource(item.passage);
          setSource(item.passage, isLook ? editLook(src, item.index, { draft: !item.draft }) : editReaction(src, item.index, { draft: !item.draft }));
          say(item.draft ? "Published: she says it now." : "Made it a draft.", "ok");
          renderDiskette(true);
        } catch (err) { say(err.message, "error"); }
      }),
      iconBtn("Delete", "Delete this " + (isLook ? "line" : item.type === "page" ? "page comment" : "zone"), function () {
        if (!confirm("Delete this " + (isLook ? "line" : item.type === "page" ? "page comment" : "zone") + "?")) return;
        try {
          const src = currentSource(item.passage);
          setSource(item.passage, isLook ? editLook(src, item.index, null) : editReaction(src, item.index, null));
          renderDiskette(true);
        } catch (err) { say(err.message, "error"); }
      }),
    ]));
    return card;
  }

  /* Takes the game to a reaction and flashes it. */
  function showReaction(item) {
    const flash = function () {
      let target = null;
      if (isWikiPage(item.passage)) {
        const all = document.querySelectorAll(".browser-page-content .diskette-zone, .browser-page-content .diskette-page");
        target = all[item.index] || null;
      } else {
        target = Array.from(document.querySelectorAll(".playfield .diskette-zone, .playfield .diskette-page")).find((z) => (z.dataset.say || "") === item.say) || null;
      }
      if (!target) { say("Open " + placeLabel(item.passage) + " in the game to see it.", ""); return; }
      target.scrollIntoView({ block: "center" });
      target.classList.remove("ske-zone-flash");
      void target.offsetWidth;
      target.classList.add("ske-zone-flash");
    };
    if (isWikiPage(item.passage) && hook.currentPage() !== item.passage) {
      if (!hook.goTo(item.passage)) { say("Get Browse out of the Trash to see " + item.passage + ".", ""); return; }
      setTimeout(flash, 500);
    } else flash();
  }

  /* Shows a page's zone in the Article tab's markup, selected. */
  function editInMarkup(item) {
    const go = function () {
      if (shownPage !== item.passage) { say("Open " + item.passage + " in the game first.", "error"); return; }
      setTab("markup");
      const src = currentSource(item.passage);
      const r = findReactions(src)[item.index];
      if (!r) return;
      const from = toFriendly(src.slice(0, r.from)).length;
      const text = getText();
      const end = text.startsWith("[[diskette:", from) ? text.indexOf("]]", from) + 2 : text.indexOf(">", from) + 1;
      selectRange(from, end > from ? end : from, true);
    };
    if (hook.currentPage() !== item.passage) {
      if (!hook.goTo(item.passage)) { say("Get Browse out of the Trash to open " + item.passage + ".", ""); return; }
      setTimeout(go, 700);
    } else go();
  }

  function countTodos() {
    scheduleBadges();
  }

  function openLookDialog() {
    closeModal();
    const keySel = el("select", { class: "ske-input" });
    LOOK_KEYS.forEach((k) => keySel.appendChild(el("option", { value: k[0], text: k[0] + " (" + k[1] + ")" })));
    const text = el("textarea", { class: "ske-react-text", rows: "3", placeholder: "What she says. <b>bold</b> works." });
    const mood = moodSelect("hop", null);
    const cond = el("input", { type: "text", class: "ske-input", placeholder: "Only if (optional): event, !event" });
    openModal("New line for an app or thing", [
      el("label", { class: "ske-field" }, [el("span", { text: "When you drag her eyes to" }), keySel]),
      el("label", { class: "ske-field" }, [el("span", { text: "She says" }), text]),
      el("label", { class: "ske-field" }, [el("span", { text: "Reaction" }), mood]),
      el("label", { class: "ske-field" }, [el("span", { text: "Only if" }), cond]),
      el("div", { class: "ske-muted", text: "A key with several lines picks one at random. {page} is the page open in the browser." }),
    ], [
      el("button", { type: "button", class: "ske-save", text: "Add line", onclick: function () {
        if (!text.value.trim()) { text.focus(); return; }
        const src = currentSource(LOOKS);
        setSource(LOOKS, addLook(src, { keys: [keySel.value], text: text.value.trim(), mood: mood.value, cond: cond.value.trim() }));
        focusAfterRender = { passage: LOOKS, index: findLooks(currentSource(LOOKS)).length - 1 };
        closeModal();
        renderDiskette(true);
      } }),
      el("button", { type: "button", text: "Cancel", onclick: closeModal }),
    ]);
    text.focus();
  }

  /* A small "?" that opens a short explanation in a popup. */
  function helpButton(title, sections) {
    return el("button", { type: "button", class: "ske-help-btn", title: title, text: "?", onclick: function () {
      openModal(title, sections.map((s) => el("div", { class: "ske-help-sec" }, [
        el("div", { class: "ske-help-head", text: s[0] }),
        el("div", { class: "ske-help-text", text: s[1] }),
      ])), [el("button", { type: "button", text: "Got it", onclick: closeModal })]);
    } });
  }

  const DISKETTE_HELP = [
    ["What she says", "Drag from Diskette's eyes to anything in the game and she reacts. First match wins: a zone where you let go, then the page's comment (browser pages), then her line for the thing under the arrow (a window, an icon, the clock, herself...)."],
    ["Making one", "Select something in the game: drag across words, or turn on ⌖ Edit (or press E) and click a paragraph, a photo or a thing. Then ◉ in the little popup (or “Diskette reacts here” in this tab). The zone takes the shape of what you selected; for things on the desktop it's her line for that thing. Selecting the page itself (the first step of the breadcrumb) gives her comment on the whole page."],
    ["Several lines", "“+ Another line” (or Enter at the end of one) gives her something else to say when she's asked about the same spot again. With more than one, “Asked again” picks which: In order (then she keeps saying the last), Loop, or Random. The card's header shows how many (e.g. ↻ 3 lines). In the markup they're separated by >>."],
    ["Several responses", "One spot can have several responses, each with its own “only if”: she says the first one that fits (one without a condition always fits, so it goes last, as the “otherwise”). “+ Another response here” asks when she should say it and puts it in place; the cards are numbered, ▶ marks what she'd say now in this playthrough, ↑ ↓ reorder them, and ⚠ never means one above always wins first."],
    ["Only if (events)", "Event names from the Events tab, comma-separated: the reaction counts only when they've all happened. !name means only before it. e.g. zoom-started, !visited:kraska1."],
    ["Reactions", "hop (default), shake her head, or wide eyes."],
    ["Thanks / That's enough", "Every answer offers “Thanks, Diskette!” and “That's enough, Diskette.”. Thanks brings her follow-up: the reaction's own (the “after Thanks” box), otherwise “Need me to look at anything else?”, offering “Sure!” and “No, that's all.”."],
    ["Drafts", "New reactions are live straight away. “Make draft” takes one out of the game while you work on it; drafts are listed last, and “Publish” puts one back."],
    ["In the game", "On this tab, zones show in the game: points as a dot and dashed circle, words and elements outlined; drafts dashed grey. Click a zone to open it here."],
    ["In the markup", "[[diskette: 80 | Her line.]]   a point\n[[diskette: 10 | on: these words | Her line.]]\n[[diskette: 10 | around | Her line.]] … [[/diskette]]   around a whole paragraph\n[[diskette: 10 | on photo: file.jpg | Her line.]]\n[[diskette: page | Her line.]]"],
  ];

  let disketteSearch = "";

  /* Where a reaction lives, for grouping: the page, or "Desktop & apps". */
  const placeOf = (item) => (item.type === "look" || !isWikiPage(item.passage) ? "Desktop & apps" : item.passage);

  function renderDiskette(force) {
    if (!ui) return;
    countTodos();
    if (store.data.tab !== "diskette" && !force) return;
    const tab = ui.disketteTab;
    tab.textContent = "";
    if (sel) renderDisketteForSelection(tab);
    else renderDisketteOverview(tab);
    if (focusAfterRender) {
      const card = tab.querySelector('[data-key="' + CSS.escape(focusAfterRender.passage + "#" + focusAfterRender.index) + '"]');
      focusAfterRender = null;
      if (card) { card.scrollIntoView({ block: "center" }); const t = card.querySelector("textarea"); if (t) t.focus(); card.classList.add("ske-react-new"); }
    }
  }

  /* With a selection: her responses to it, grouped by spot. Several
     responses for one spot are a numbered list: she says the first one
     whose "only if" fits. */
  function renderDisketteForSelection(tab) {
    const items = reactionsFor(sel);
    const groups = spotGroups(items);
    tab.appendChild(el("div", { class: "ske-bar" }, [
      el("span", { class: "ske-muted", text: items.length ? "Her response to the selection:" : "She has nothing to say about this yet." }),
      helpButton("How Diskette's reactions work", DISKETTE_HELP),
    ]));
    if (focusAfterRender) expandedCards.add(focusAfterRender.passage + "#" + focusAfterRender.index);
    groups.forEach(function (group) {
      const box = el("div", { class: "ske-spot" + (group.length > 1 ? " ske-spot-many" : "") });
      if (group.length > 1) box.appendChild(el("div", { class: "ske-spot-head ske-muted ske-tiny", text: group.length + " responses here: she says the first one whose “only if” fits" }));
      const info = altInfo(group);
      group.forEach(function (item, i) {
        expandedCards.add(item.passage + "#" + item.index);
        box.appendChild(reactionCard(item, group.length > 1 ? Object.assign(info[i], { move: (dir) => moveAlternate(group, i, dir) }) : null));
      });
      box.appendChild(el("button", { type: "button", class: "ske-link-btn ske-tiny ske-add-alt", title: "Something else she says here, depending on what's happened in the game", text: "+ Another response here", onclick: () => openAlternateDialog(group) }));
      tab.appendChild(box);
    });
    tab.appendChild(el("div", { class: "ske-actions" }, [
      selIsOneSpot(groups) ? null : el("button", { type: "button", class: items.length ? "" : "ske-save", text: items.length ? "◉ New response on the selection" : "◉ Diskette reacts here", onclick: () => createReactionFor(sel) }),
      el("button", { type: "button", text: "See all her reactions", onclick: () => setSelection(null) }),
    ]));
  }

  /* ---------- Alternate responses for one spot ---------- */

  /* Where a zone ends (after its </span>). */
  function zoneEnd(src, item) {
    const close = matchingClose(src, item.from);
    return close >= 0 ? close + 7 : item.to;
  }
  const plainWords = (html) => gameText((html || "").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

  /* Does it answer for the same spot as last (the latest one in its group)? */
  function sameSpot(first, last, it) {
    if (first.passage !== it.passage || first.type !== it.type) return false;
    if (it.type === "look") return first.keys.slice().sort().join(" ") === it.keys.slice().sort().join(" ");
    if (it.type === "page") return true;
    if (first.shape !== it.shape) return false;
    if (it.shape === "element") return first.on === it.on;
    const src = currentSource(it.passage);
    if (it.shape === "point") return src.slice(zoneEnd(src, last), it.from).trim() === "";
    return it.from >= last.to && it.from < matchingClose(src, last.from) && plainWords(it.words) === plainWords(last.words);
  }

  function spotGroups(items) {
    const groups = [];
    items.slice().sort((a, b) => (a.passage === b.passage ? a.from - b.from : a.passage.localeCompare(b.passage))).forEach(function (it) {
      const g = groups.find((x) => sameSpot(x[0], x[x.length - 1], it));
      if (g) g.push(it);
      else groups.push([it]);
    });
    return groups;
  }

  /* Is the selection exactly one group's spot (so a new response there is
     an alternate, not a new zone)? */
  function selIsOneSpot(groups) {
    if (groups.length !== 1) return false;
    if (sel.kind === "app" || sel.kind === "photo" || sel.kind === "page") return true;
    const g = groups[0][0];
    if (g.shape !== "words") return false;
    const full = sel.raw ? currentSource(sel.passage) : friendlyOf(sel.passage);
    const r = sel.raw ? sel : expandRange(full, sel.from, Math.min(sel.to, full.length));
    const vis = (sel.raw ? plainWords(full.slice(r.from, r.to)) : visibleMap(full.slice(r.from, r.to)).vis).replace(/\s+/g, " ").trim();
    const words = plainWords(g.words);
    /* (allowing for a stray character of punctuation at either end) */
    return !!words && vis.indexOf(words) >= 0 && vis.length - words.length <= 2;
  }

  /* For each response in a group: its rank, whether it's what she'd say now,
     and whether it can never be said (an unconditional one is above it). */
  function altInfo(group) {
    let nowFound = false;
    let blocked = false;
    return group.map(function (item, i) {
      const said = item.type === "look" ? item.text : item.say;
      const live = !item.draft && (said || "").trim() !== "" && !item.todo;
      const now = live && !nowFound && !conditionNow(item.cond);
      if (now) nowFound = true;
      const info = { rank: i + 1, total: group.length, now: now, never: blocked && live };
      if (live && !item.cond) blocked = true;
      return info;
    });
  }

  /* The shared selection keeps covering the spot after its source changes. */
  function keepSelection(passage, before) {
    if (!sel || sel.passage !== passage || sel.from === undefined) return;
    const after = sel.raw ? currentSource(passage).length : friendlyOf(passage).length;
    sel = Object.assign({}, sel, { to: Math.max(sel.from, sel.to + after - before) });
  }
  const selLength = (passage) => (sel && sel.raw ? currentSource(passage).length : isWikiPage(passage) ? friendlyOf(passage).length : 0);

  /* Asks when she should say it, then adds it to the spot. */
  function openAlternateDialog(group) {
    const defs = findEvents(currentSource("GameEvents"));
    const happened = new Set((hook.events && hook.events()) || []);
    const when = el("select", { class: "ske-input ske-alt-when" });
    when.appendChild(el("option", { value: "?", text: "Choose when…" }));
    const after = el("optgroup", { label: "Once this has happened" });
    const before = el("optgroup", { label: "Until this happens" });
    defs.forEach(function (d) {
      const desc = d.text.replace(/<[^>]*>/g, "").replace(/&#95;/g, "_");
      const short = d.id + " — " + (desc.length > 50 ? desc.slice(0, 50) + "…" : desc) + (happened.has(d.id) ? " ✓" : "");
      after.appendChild(el("option", { value: d.id, text: "after " + short }));
      before.appendChild(el("option", { value: "!" + d.id, text: "before " + short }));
    });
    when.appendChild(after);
    when.appendChild(before);
    when.appendChild(el("option", { value: "", text: "Otherwise (no condition; goes last)" }));
    const text = el("textarea", { class: "ske-comment-input", rows: "2", placeholder: "What she says then (you can write it later)" });
    const hint = el("div", { class: "ske-muted ske-tiny", text: "A response with a condition goes first, so it wins when it fits; the others are what she says otherwise. Reorder with ↑ ↓ on the cards; more conditions (a, !b) in its “only if” box." });
    openModal("Another response here", [
      el("label", { class: "ske-field" }, [el("span", { text: "She says it" }), when]),
      el("label", { class: "ske-field" }, [el("span", { text: "Her line" }), text]),
      hint,
    ], [
      el("button", { type: "button", class: "ske-save", text: "Add it", onclick: function () {
        if (when.value === "?") { when.focus(); say("Choose when she says it.", "error"); return; }
        closeModal();
        addAlternate(group, when.value, text.value.trim());
      } }),
      el("button", { type: "button", text: "Cancel", onclick: closeModal }),
    ]);
    when.focus();
  }

  /* Adds a response to a spot: with a condition, first (it wins when it
     fits); without, last (the "otherwise"). */
  function addAlternate(group, cond, line) {
    const first = group[0];
    const last = group[group.length - 1];
    const passage = first.passage;
    const before = selLength(passage);
    const src = currentSource(passage);
    let out;
    let at;
    if (first.type === "look") {
      const row = lookLine({ keys: first.keys, cond: cond, text: line.replace(/\n+/g, " &gt;&gt; ") });
      if (cond) { at = first.from; out = src.slice(0, at) + row + "\n" + src.slice(at); }
      else { at = last.to + 1; out = src.slice(0, last.to) + "\n" + row + src.slice(last.to); }
      setSource(passage, out);
      focusAfterRender = { passage: passage, index: findLooks(out).findIndex((l) => l.from === at) };
    } else {
      const tag = zoneTag({ kind: first.kind, radius: first.radius, on: first.on, cond: cond, say: line.replace(/\n+/g, " >> ") });
      if (first.shape === "words") {
        if (cond) {
          at = first.from;
          const end = zoneEnd(src, first);
          out = src.slice(0, at) + tag + src.slice(at, end) + "</span>" + src.slice(end);
        } else {
          at = last.to;
          const close = matchingClose(src, last.from);
          out = src.slice(0, at) + tag + src.slice(at, close) + "</span>" + src.slice(close);
        }
      } else {
        at = cond ? first.from : zoneEnd(src, last);
        out = src.slice(0, at) + tag + "</span>" + src.slice(at);
      }
      setSource(passage, out);
      focusAfterRender = { passage: passage, index: findReactions(out).findIndex((r) => r.from === at) };
    }
    keepSelection(passage, before);
    renderCrumbs();
    drawSelection();
    renderDiskette(true);
    say(cond ? "Added: she says it " + (cond.charAt(0) === "!" ? "until " + cond.slice(1) : "once " + cond) + " (it's first, so it wins then)." : "Added as the otherwise, last.", "ok");
  }

  /* Swaps a response with the one above (-1) or below (+1) it. */
  function moveAlternate(group, i, dir) {
    const j = i + dir;
    if (j < 0 || j >= group.length) return;
    const a = group[Math.min(i, j)];
    const b = group[Math.max(i, j)];
    const passage = a.passage;
    const before = selLength(passage);
    const src = currentSource(passage);
    /* Zones: swap their opening tags (nesting stays); lines: swap lines. */
    const A = src.slice(a.from, a.to);
    const B = src.slice(b.from, b.to);
    setSource(passage, src.slice(0, a.from) + B + src.slice(a.to, b.from) + A + src.slice(b.to));
    keepSelection(passage, before);
    const moved = group[i];
    const newFrom = dir < 0 ? a.from : a.from + (b.to - b.from) + (b.from - a.to);
    const list = moved.type === "look" ? findLooks(currentSource(passage)) : findReactions(currentSource(passage));
    focusAfterRender = { passage: passage, index: list.findIndex((r) => r.from === newFrom) };
    renderCrumbs();
    drawSelection();
    renderDiskette(true);
  }

  /* No selection: everything she says, this page first, then by place; drafts last. */
  function renderDisketteOverview(tab) {
    const all = allReactions();
    const q = disketteSearch.trim().toLowerCase();
    const items = q ? all.filter((i) => ((i.say || i.text || "") + " " + (i.keys || []).join(" ") + " " + i.passage + " " + (i.words || "") + " " + (i.photo || "")).toLowerCase().indexOf(q) >= 0) : all;
    const search = el("input", { type: "search", class: "ske-input ske-small ske-search", placeholder: "Search her lines", value: disketteSearch });
    search.addEventListener("input", function () { disketteSearch = search.value; renderDiskette(true); const again = ui.disketteTab.querySelector(".ske-search"); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } });
    tab.appendChild(el("div", { class: "ske-bar" }, [search, helpButton("How Diskette's reactions work", DISKETTE_HELP)]));
    tab.appendChild(el("div", { class: "ske-muted ske-tiny", text: "To add one, select something in the game: drag across words, or ⌖ Edit and click a paragraph, photo or thing." }));
    const groups = {};
    items.filter((i) => !i.draft).forEach((i) => (groups[placeOf(i)] = groups[placeOf(i)] || []).push(i));
    const here = hook.currentPage();
    const order = Object.keys(groups).sort(function (a, b) {
      const rank = (g) => (g === here ? 0 : g === "Desktop & apps" ? 1 : 2);
      return rank(a) - rank(b) || a.localeCompare(b);
    });
    if (focusAfterRender) expandedCards.add(focusAfterRender.passage + "#" + focusAfterRender.index);
    order.forEach(function (g) {
      const box = el("div", { class: "ske-group" }, [el("div", { class: "ske-group-title", text: g + (g === here ? " (open now)" : "") + " · " + groups[g].length })]);
      groups[g].forEach((item) => box.appendChild(reactionCard(item)));
      tab.appendChild(box);
    });
    const drafts = items.filter((i) => i.draft);
    if (drafts.length) {
      const box = el("div", { class: "ske-group ske-group-drafts" }, [el("div", { class: "ske-group-title", text: "Drafts · " + drafts.length + " (she doesn't say these until they're published)" })]);
      drafts.forEach((item) => box.appendChild(reactionCard(item)));
      tab.appendChild(box);
    }
    if (!items.length) tab.appendChild(el("div", { class: "ske-muted", text: q ? "Nothing matches." : "No reactions yet." }));
    const missing = LOOK_KEYS.filter((k) => !all.some((i) => i.type === "look" && !i.draft && i.keys.indexOf(k[0]) >= 0));
    tab.appendChild(el("div", { class: "ske-actions ske-tiny" }, [
      el("button", { type: "button", class: "ske-icon-btn", title: "For things you can't click: off the screen, a poke in the eye, any page, anything at all", text: "+ Line for something you can't point at", onclick: openLookDialog }),
      missing.length ? el("span", { class: "ske-muted", title: missing.map((k) => k[0] + ": " + k[1]).join("\n"), text: missing.length + " things have no line yet (hover)" }) : null,
    ]));
  }

  /* ---------- Events tab ---------- */

  const EVENTS_HELP = [
    ["Events", "Moments that, once they happen, stay happened for this playthrough (saved with the game). The list is the GameEvents passage, in story order."],
    ["The marks", "✓ happened   → next (everything it follows has happened)   ○ not yet   ⚠ happened before something it normally follows."],
    ["Testing", "Tick or untick one to fake it (NEW GAME undoes it), e.g. to try a Diskette line with “only if: zoom-started”."],
    ["Used by", "◉ 2 on an event: two of Diskette's reactions depend on it (hover to see them). Events used by the selection's reaction are highlighted."],
    ["Automatic ones", "The game also records every window opened (opened:mail) and every page visited (visited:Tom Barry). Those work in “only if” too."],
    ["In Harlowe", "(if: $events contains \"zoom-started\")[...]\nTo mark a new one: (set: $events to it + (ds: \"my-event\"))"],
  ];

  let statusSignature = "";
  function renderStatus(force) {
    if (!ui || store.data.tab !== "events" || !store.data.open) return;
    const events = hook.events ? hook.events() : null;
    const defs = findEvents(currentSource("GameEvents"));
    const sig = JSON.stringify([events, defs.map((d) => d.id)]);
    if (!force && sig === statusSignature) return;
    statusSignature = sig;
    const tab = ui.statusTab;
    tab.textContent = "";
    const happened = new Set(events || []);
    /* Which of Diskette's reactions depend on each event. */
    const usedBy = {};
    allReactions().forEach(function (r) {
      (r.cond || "").split(",").map((x) => x.trim().replace(/^!/, "")).filter(Boolean).forEach(function (ev) {
        (usedBy[ev] = usedBy[ev] || []).push(r);
      });
    });
    const selected = new Set();
    reactionsFor(sel).forEach((r) => (r.cond || "").split(",").map((x) => x.trim().replace(/^!/, "")).filter(Boolean).forEach((ev) => selected.add(ev)));
    tab.appendChild(el("div", { class: "ske-bar" }, [
      el("span", { class: "ske-muted", text: events ? defs.filter((d) => happened.has(d.id)).length + " of " + defs.length + " have happened" : "Press PLAY (or CONTINUE) to see this playthrough's events." }),
      helpButton("How events work", EVENTS_HELP),
    ]));
    if (!events) return;
    const list = el("div", { class: "ske-events" });
    defs.forEach(function (d) {
      const done = happened.has(d.id);
      const waiting = d.after.filter((a) => !happened.has(a));
      const state = done ? (waiting.length ? "⚠" : "✓") : waiting.length ? "○" : "→";
      const desc = d.text.replace(/<[^>]*>/g, "").replace(/&#95;/g, "_");
      const box = el("input", { type: "checkbox", title: "Mark as happened (for testing)", onchange: (e) => hook.setEvent(d.id, e.target.checked) });
      box.checked = done;
      const users = usedBy[d.id] || [];
      list.appendChild(el("label", { class: "ske-event ske-event-" + (done ? "done" : waiting.length ? "wait" : "next") + (selected.has(d.id) ? " ske-event-sel" : ""), title: desc + (waiting.length ? (done ? "\nHappened before: " : "\nAfter: ") + waiting.join(", ") : "") + (users.length ? "\nUsed by: " + users.map((r) => gameText(r.say || r.text || "").slice(0, 50)).join(" / ") : "") }, [
        box,
        el("span", { class: "ske-event-state", text: state }),
        el("code", { text: d.id }),
        el("span", { class: "ske-event-desc", text: desc }),
        users.length ? el("span", { class: "ske-used", text: "◉ " + users.length }) : null,
      ]));
    });
    tab.appendChild(list);
    const extra = events.filter((e) => !defs.some((d) => d.id === e));
    if (extra.length) {
      tab.appendChild(el("div", { class: "ske-muted ske-tiny", text: "Also happened:" }));
      tab.appendChild(el("div", { class: "ske-extra" }, extra.map((e) => el("code", { text: e }))));
    }
  }

  /* ---------- Start ---------- */

  function start() {
    hook = window.SkunkpetsEditorHook;
    if (!hook || ui || !CM) return;
    hook.passages.forEach((p, name) => { if (p instanceof Map) original[name] = p.get("source"); });
    settleSaved();
    rebaseDrafts();
    /* Pages made here but not in this build yet come back. */
    Object.keys(store.data.newPages).forEach(function (name) {
      if (!store.data.drafts[name] && !(name in store.data.saved)) delete store.data.newPages[name];
    });
    photoStyles();
    buildUi();
    syncGame();
    setOpen(store.data.open);
    countTodos();
    renderComments();
    loadComments();
    loadHistory();
    document.addEventListener("click", onGameClick, true);
    document.addEventListener("pointermove", onAimMove, true);
    document.addEventListener("mousedown", onAimDown, true);
    document.addEventListener("mouseup", onGameMouseUp, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", redrawSoon, true);
    window.addEventListener("resize", function () { redrawSoon(); topBar(); });
    new MutationObserver(function () {
      if (store.data.open) requestAnimationFrame(() => markGame(false));
      requestAnimationFrame(showZones);
      redrawSoon();
    }).observe(document.body, { childList: true, subtree: true });
    setInterval(function () { if (store.data.open) { renderStatus(false); updateEventsBadge(); } }, 1000);
    setInterval(function () {
      if (!store.data.open) return;
      const page = gamePage();
      if (page !== lastSeenPage) {
        lastSeenPage = page;
        showPage(page, true);
      }
    }, 400);
    /* Pick up the other person's comments and saves while the panel is open. */
    setInterval(function () { if (store.data.open) { loadComments(); loadHistory(); } }, 60000);
    window.SkunkpetsEditorDebug = { getText: getText, setText: (t) => { setText(t); onInput(); }, select: (a, b) => { releaseSelection(); selectRange(a, b, true); }, cursor: () => view.state.selection.main.head };
  }

  if (window.SkunkpetsEditorHook) start();
  else window.addEventListener("skunkpets-editor-hook", start);
})();
