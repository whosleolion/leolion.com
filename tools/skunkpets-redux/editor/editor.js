/* =========================================================
   SKUNKPETS REDUX: WINKIPEDIA ARTICLE EDITOR (preview only)
   ---------------------------------------------------------
   Loaded only on leolion.com/building/skunkpets-preview/
   (the preview workflow adds it, plus codemirror.bundle.js;
   the live game never has either).

   "Edit articles" opens a panel beside the game. Open any
   Winkipedia page in the in-game browser and its text shows
   up in the panel; changes appear in the game as you type.
   "Save to preview" shows what changed, then commits it to
   GitHub (the branch the preview was built from), which
   rebuilds the preview; from there it ships like any other
   change.

   Links and photos are shown in a shorter form while editing
   and turned back into the game's real markup on save:
     [[Tom Barry]]                  link to a page
     [[shown words->Page name]]     link with other words
     [[photo: file.jpg | right | 40% | description]]
     [[diskette: 80 | what Diskette says]]   a response zone
     [[diskette: page | what she says]]      her comment on the page
   A link to a page that doesn't exist yet shows red; create
   the page from the panel (templates below). Saving needs a
   GitHub token (asked for once, kept in this browser).

   Comments: notes for the people editing, pinned to the words
   they quote, highlighted in the markup and (while the panel
   is open) in the game. Kept in editor/comments.json on the
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
  const ZONE_RE = /<span class="diskette-(zone|page)"(?: data-radius="(\d+)")?(?: data-mood="(hop|shake|wide)")?(?: data-if="([^"]*)")?(?: data-on="([^"]*)")?(?: data-cycle="(loop|random)")?(?: data-then="([^"]*)")? data-say="([^"]*)">([^<>\[\]|]*)<\/span>/g;
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

  /* Game markup -> the short form shown in the editor. */
  function toFriendly(source) {
    return source
      .replace(ZONE_RE, function (_, kind, radius, mood, cond, on, cycle, then, say, words) {
        const parts = [kind === "page" ? "page" : radius || String(ZONE_RADIUS)];
        if (mood) parts.push(mood);
        if (cycle) parts.push(cycle);
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

  function zoneHtml(inner) {
    const parts = inner.split("|").map((p) => p.trim());
    const f = { kind: "zone", radius: ZONE_RADIUS, mood: "", cond: "" };
    if (parts.length > 1 && /^(page|\d+(px)?)$/.test(parts[0])) {
      const first = parts.shift();
      if (first === "page") f.kind = "page";
      else f.radius = parseInt(first, 10);
    }
    if (parts.length > 1 && /^(hop|shake|wide)$/.test(parts[0])) f.mood = parts.shift();
    if (parts.length > 1 && /^(loop|random)$/.test(parts[0])) f.cycle = parts.shift();
    if (parts.length > 1 && /^if:/.test(parts[0])) f.cond = parts.shift().slice(3).trim();
    let words = "";
    if (parts.length > 1 && /^on( photo| element)?:/.test(parts[0])) {
      const on = parts.shift();
      if (/^on photo:/.test(on)) f.on = "[data-art='" + on.slice(9).trim() + "']";
      else if (/^on element:/.test(on)) f.on = on.slice(11).trim();
      else words = on.slice(3).trim();
    }
    if (parts.length > 1 && /^then:/.test(parts[0])) f.then = parts.shift().slice(5).trim();
    f.say = parts.join(" | ");
    return zoneTag(f) + words + "</span>";
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
      const close = source.indexOf("</span>", at);
      const inside = close >= 0 ? source.slice(at, close) : "";
      const on = unescAttr(a.on || "");
      const photo = PHOTO_ON_RE.exec(on);
      out.push({
        kind: m[1], from: m.index, to: at, empty: inside === "",
        /* what it covers: a point, the words it wraps, or elements (data-on) */
        shape: m[1] === "page" ? "page" : on ? "element" : inside === "" ? "point" : "words",
        on: on, photo: photo ? photo[1] : "", words: inside.indexOf("<span") < 0 ? inside : "",
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
    /* Words or an element inside: keep them, drop the zone around them. */
    const close = source.indexOf("</span>", r.to);
    if (r.words === "" || close < 0) throw new Error("This zone wraps other markup; remove it in the markup.");
    return source.slice(0, r.from) + source.slice(r.to, close) + source.slice(close + "</span>".length);
  }

  /* DisketteLooks: one <p data-look="keys" ...>text</p> per line. */
  const LOOK_RE = /^<p data-look="([^"]*)"((?:\s[a-z-]+="[^"]*")*)>(.*)<\/p>$/gm;
  function findLooks(source) {
    const out = [];
    for (const m of source.matchAll(LOOK_RE)) {
      const a = attrsOf(m[2]);
      const text = m[3];
      out.push({ keys: m[1].split(/[\s,]+/).filter(Boolean), from: m.index, to: m.index + m[0].length, mood: a.mood || "hop", cycle: a.cycle || "order", then: unescSay(a.then || ""), cond: unescAttr(a.if || ""), text: text, todo: todoOf(text) });
    }
    return out;
  }
  function lookLine(f) {
    return '<p data-look="' + f.keys.join(" ") + '"' + (f.mood && f.mood !== "hop" ? ' data-mood="' + f.mood + '"' : "") +
      (f.cond ? ' data-if="' + escAttr(f.cond.replace(/"/g, "")) + '"' : "") +
      (f.cycle && f.cycle !== "order" ? ' data-cycle="' + f.cycle + '"' : "") +
      (f.then ? ' data-then="' + escSay(f.then) + '"' : "") + ">" + (f.text || "").replace(/\n/g, " ") + "</p>";
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
    for (const m of text.matchAll(/\[\[(?!photo:|diskette:)([^\]]+?)\]\]/g)) {
      const arrow = m[1].lastIndexOf("->");
      out.push({ target: arrow >= 0 ? m[1].slice(arrow + 2) : m[1], from: m.index, to: m.index + m[0].length });
    }
    return out;
  }

  /* Roughly the words a reader sees for a piece of short-form markup, used to
     find a comment's quote in the game. */
  function gameText(text) {
    return text
      .replace(/\[\[(?:photo|diskette):[^\]]*\]\]/g, " ")
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
      zoneTag, todoOf, findReactions, editReaction, findLooks, lookLine, editLook, addLook, findEvents, safeInsertPos,
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
    data.tab = data.tab || "article";
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
      if (name in original && original[name] === store.data.saved[name]) delete store.data.saved[name];
      else if (!(name in original) && !store.data.newPages[name]) delete store.data.saved[name];
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
        text = "GitHub didn't accept the token (it may have expired or been mistyped). Paste a new one under GitHub access.";
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
            mousedown: function (e) {
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
    ["Moving around", "Click words in the game to jump to them here. Ctrl/Cmd-F finds, Ctrl/Cmd-Z undoes."],
  ];

  function buildUi() {
    const toggle = el("button", { class: "ske-toggle", type: "button", text: "✎ Edit articles", onclick: () => setOpen(!store.data.open) });
    const title = el("div", { class: "ske-title" });
    const lastEdit = el("div", { class: "ske-muted ske-last-edit" });
    const editorBox = el("div", { class: "ske-cm" });
    const status = el("div", { class: "ske-status" });
    const pending = el("div", { class: "ske-pending" });
    const missing = el("div", { class: "ske-missing" });
    const tool = (label, tip, fn) => el("button", { type: "button", title: tip, text: label, onclick: fn });
    const fileInput = el("input", { type: "file", accept: "image/*", class: "ske-file", onchange: onPhotoChosen });
    const tokenInput = el("input", { type: "password", class: "ske-token-input", placeholder: "github_pat_...", autocomplete: "off" });
    const commentsTitle = el("summary", { text: "Comments" });
    const commentList = el("div", { class: "ske-comment-list" });
    const commentOthers = el("div", { class: "ske-others" });
    const commentStatus = el("div", { class: "ske-muted ske-comment-status" });
    const commentInput = el("textarea", { class: "ske-comment-input", rows: "2", placeholder: "Leave a note for whoever edits next…" });
    const quoteHint = el("div", { class: "ske-muted ske-quote-hint" });

    const tabButton = (id, label) => el("button", { type: "button", class: "ske-tab-btn", "data-tab": id, text: label, onclick: () => setTab(id) });
    const disketteTab = el("div", { class: "ske-tab ske-tab-diskette" });
    const statusTab = el("div", { class: "ske-tab ske-tab-status" });
    const articleTab = el("div", { class: "ske-tab ske-tab-article" }, [
      title,
      lastEdit,
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
      missing,
      el("div", { class: "ske-actions" }, [
        el("button", { type: "button", class: "ske-undo", text: "Undo my changes to this page", onclick: onRevert }),
      ]),
      el("details", { class: "ske-comments", open: "" }, [
        commentsTitle,
        el("div", { class: "ske-comments-body" }, [
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
      ]),
      el("details", { class: "ske-help ske-github" }, [
        el("summary", { text: "GitHub access" }),
        el("p", { text: "Saving commits to " + REPO + " (branch " + (BRANCH || "?") + "). It needs a fine-grained token with " +
          "Contents: Read and write on that one repository. It's kept only in this browser." }),
        el("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener", text: "Make a token on GitHub" }),
        el("div", { class: "ske-token-row" }, [
          tokenInput,
          el("button", { type: "button", text: "Use", onclick: () => { local.set(TOKEN_KEY, tokenInput.value.trim()); tokenInput.value = ""; refresh(); loadComments(); loadHistory(true); } }),
          el("button", { type: "button", text: "Forget", onclick: () => { local.set(TOKEN_KEY, ""); comments = []; commentsLoaded = false; refresh(); commentsChanged(); } }),
        ]),
      ]),
    ]);
    const panel = el("div", { class: "ske-panel" }, [
      el("div", { class: "ske-head" }, [
        el("b", { text: "Winkipedia editor" }),
        el("button", { type: "button", class: "ske-close", title: "Close the editor", text: "×", onclick: () => setOpen(false) }),
      ]),
      el("div", { class: "ske-tabs" }, [
        tabButton("article", "Article"),
        tabButton("diskette", "Diskette"),
        tabButton("status", "Game status"),
      ]),
      articleTab,
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
    ui = { toggle, panel, title, lastEdit, status, pending, missing, commentsTitle, commentList, commentOthers, commentStatus, commentInput, quoteHint, disketteTab, statusTab };
    view = makeEditor(editorBox);
    setTab(store.data.tab);
  }

  function setTab(id) {
    if (["article", "diskette", "status"].indexOf(id) < 0) id = "article";
    store.data.tab = id;
    store.write();
    ui.panel.querySelectorAll(".ske-tab-btn").forEach((b) => b.classList.toggle("ske-tab-on", b.dataset.tab === id));
    ui.panel.querySelectorAll(".ske-tab").forEach((t) => t.classList.toggle("ske-tab-shown", t.classList.contains("ske-tab-" + id)));
    if (id === "diskette") renderDiskette(true);
    if (id === "status") renderStatus(true);
    if (id === "article" && view) view.requestMeasure();
  }

  function setOpen(open) {
    store.data.open = open;
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
    if (!getToken()) lines.push("Add a GitHub token under “GitHub access” to be able to save.");
    ui.pending.textContent = lines.join("\n");
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
    if (unchanged) delete store.data.drafts[name];
    else store.data.drafts[name] = text;
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
    delete store.data.drafts[name];
    delete store.data.raw[name];
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

  function showPage(name, force) {
    if (name === shownPage && !force) return;
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
      ui.panel.querySelector(".ske-github").open = true;
      say("Add a GitHub token first (under GitHub access).", "error");
      return;
    }
    if (!BRANCH) { say("This preview doesn't know which branch it came from.", "error"); return; }
    const who = ensureName();
    if (!who) { say("Not saved: saves need a name.", "error"); return; }
    say("Saving…", "");
    try {
      const sha = await commitAll(names, photos, authorFor(who), function (clashes) {
        return confirm(clashes.join(", ") + " changed on GitHub since this preview was built. Save yours over it anyway?");
      });
      names.forEach(function (n) {
        store.data.saved[n] = draftSource(n);
        delete store.data.drafts[n];
        delete store.data.raw[n];
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
    const q = selectedQuote();
    ui.quoteHint.textContent = q ? "Quoting: “" + (q.length > 60 ? q.slice(0, 60) + "…" : q) + "”" : "Tip: select words in the article first to pin your comment to them.";
  }

  function commentsChanged() {
    renderComments();
    redecorate();
    markGame(true);
  }

  function renderComments() {
    if (!ui) return;
    const page = shownPage;
    const open = openRoots();
    ui.toggle.textContent = "✎ Edit articles" + (open.length ? " · " + open.length + (open.length === 1 ? " note" : " notes") : "");
    ui.commentList.textContent = "";
    ui.commentOthers.textContent = "";
    if (!getToken()) {
      ui.commentStatus.textContent = "Add a GitHub token (under GitHub access) to see and leave comments.";
      return;
    }
    if (!commentsLoaded) { ui.commentStatus.textContent = "Loading comments…"; return; }
    ui.commentStatus.textContent = "";
    const roots = page ? rootsOn(page) : [];
    const openHere = roots.filter((c) => !c.resolved);
    const done = roots.filter((c) => c.resolved);
    ui.commentsTitle.textContent = "Comments" + (page ? " on this page" : "") + (openHere.length ? " (" + openHere.length + ")" : "");
    if (page && !roots.length) ui.commentList.appendChild(el("div", { class: "ske-muted", text: "No comments on this page yet." }));
    const text = page ? getText() : "";
    openHere.forEach((c, i) => ui.commentList.appendChild(commentThread(c, i + 1, text)));
    if (done.length) {
      const d = el("details", { class: "ske-resolved" }, [el("summary", { text: "Resolved (" + done.length + ")" })]);
      done.forEach((c) => d.appendChild(commentThread(c, 0, text)));
      ui.commentList.appendChild(d);
    }
    const elsewhere = {};
    open.forEach(function (c) { if (c.page !== page) elsewhere[c.page] = (elsewhere[c.page] || 0) + 1; });
    const pages = Object.keys(elsewhere).sort();
    if (pages.length) {
      ui.commentOthers.appendChild(el("div", { class: "ske-muted", text: "Open notes on other pages:" }));
      pages.forEach(function (p) {
        ui.commentOthers.appendChild(el("div", { class: "ske-other" }, [
          el("span", { text: p + " (" + elsewhere[p] + ")" }),
          el("button", { type: "button", text: "Go", onclick: function () {
            if (!hook.goTo(p)) { say("Get Browse out of the Trash first, then Go works.", "error"); return; }
            const first = openRoots().find((c) => c.page === p);
            if (first) setTimeout(() => focusComment(first.id, "panel"), 600);
          } }),
        ]));
      });
    }
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
      c.quote ? el("div", { class: "ske-comment-quote", text: "“" + c.quote + "”" }) : null,
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
    if (!text || !shownPage) return;
    if (!getToken()) { ui.commentStatus.textContent = "Add a GitHub token first (under GitHub access)."; return; }
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
    const page = store.data.open && shownPage && hook.currentPage() === shownPage ? shownPage : null;
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

  /* The zone (or page comment) whose reach a point in the game is in, nearest
     first, like the game's own hit test; null if none. */
  function zoneAtPoint(x, y) {
    const playfield = document.querySelector(".playfield");
    if (!playfield) return null;
    const scale = playfield.getBoundingClientRect().width / (playfield.offsetWidth || 1) || 1;
    const hit = document.elementFromPoint(x, y);
    const direct = hit && hit.closest(".diskette-zone, .diskette-page");
    if (direct) return direct;
    const target = hit && hit.closest(".ske-zone-target");
    let best = null;
    playfield.querySelectorAll(".diskette-zone").forEach(function (z) {
      if (hit && z.closest(".panel") !== hit.closest(".panel")) return;
      const rects = z.dataset.on ? zoneTargets(z).map((t) => t.getBoundingClientRect()) : Array.from(z.getClientRects());
      if (!rects.length) rects.push(z.getBoundingClientRect());
      const shapeDefault = z.dataset.on || z.textContent.trim() ? 10 : ZONE_RADIUS;
      const radius = isNaN(parseFloat(z.dataset.radius)) ? shapeDefault : parseFloat(z.dataset.radius);
      let dist = Infinity;
      rects.forEach(function (r) {
        dist = Math.min(dist, Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom)) / scale);
      });
      if (target && z.dataset.on && zoneTargets(z).indexOf(target) >= 0) dist = 0;
      if (dist <= radius && (!best || dist < best.dist)) best = { z: z, dist: dist };
    });
    return best ? best.z : null;
  }

  /* Brings up a game zone's card in the Diskette tab. */
  function openZoneCard(z) {
    let passageName = null;
    let index = -1;
    const content = z.closest(".browser-page-content");
    if (content && shownPage) {
      passageName = hook.currentPage();
      index = Array.from(content.querySelectorAll(".diskette-zone, .diskette-page")).indexOf(z);
    } else {
      const item = allReactions().find((i) => i.type !== "look" && !isWikiPage(i.passage) && i.say === (z.dataset.say || ""));
      if (item) { passageName = item.passage; index = item.index; }
    }
    if (!passageName || index < 0) { say("Couldn't find that zone in the markup.", "error"); return; }
    const item = allReactions().find((i) => i.passage === passageName && i.index === index && i.type !== "look");
    disketteFilter = item && item.todo ? "todo" : "written";
    focusAfterRender = { passage: passageName, index: index };
    if (store.data.tab !== "diskette") setTab("diskette");
    else renderDiskette(true);
    z.classList.remove("ske-zone-flash");
    void z.offsetWidth;
    z.classList.add("ske-zone-flash");
  }

  /* Press and hold anywhere in a zone's reach (while the panel is open). */
  let holdTimer = null;
  let holdStart = null;
  let swallowClick = false;
  function onGamePointerDown(e) {
    clearTimeout(holdTimer);
    if (!store.data.open || pickingZone || e.button !== 0 || !e.target.closest(".playfield") || e.target.closest(".diskette-assistant, .diskette-eye-hit")) return;
    holdStart = { x: e.clientX, y: e.clientY };
    holdTimer = setTimeout(function () {
      const z = zoneAtPoint(holdStart.x, holdStart.y);
      if (!z) return;
      swallowClick = true;
      openZoneCard(z);
    }, 550);
  }
  function onGamePointerMove(e) {
    if (holdStart && Math.hypot(e.clientX - holdStart.x, e.clientY - holdStart.y) > 6) clearTimeout(holdTimer);
  }

  /* While the panel is open, Diskette's response zones show as dashed
     circles of their radius, and her page comment as a tag. */
  function showZones() {
    const on = !!store.data.open;
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
      const title = on ? "Diskette: " + (z.dataset.say || "") + (z.dataset.if ? "  (if: " + z.dataset.if + ")" : "") + "\nClick (or press and hold) to edit it" : null;
      if (title === null) { if (z.hasAttribute("title")) z.removeAttribute("title"); }
      else if (z.title !== title) z.title = title;
    });
  }

  /* Clicks in the game while the panel is open: comment marks open their
     thread, red links offer to create the page, and clicking words jumps
     the markup to them. */
  function onGameClick(e) {
    clearTimeout(holdTimer);
    if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); return; }
    if (store.data.open && !pickingZone && e.target.closest(".playfield") && !e.target.closest(".diskette-assistant")) {
      const z = e.altKey ? zoneAtPoint(e.clientX, e.clientY) : e.target.closest(".diskette-zone.ske-zone, .diskette-page.ske-zone");
      if (z) { e.preventDefault(); e.stopPropagation(); openZoneCard(z); return; }
    }
    if (!store.data.open || !e.target.closest(".browser-page-content")) return;
    if (pickingZone) { e.preventDefault(); e.stopPropagation(); placeZoneAt(e); return; }
    const red = e.target.closest(".ske-redlink");
    if (red) { e.preventDefault(); e.stopPropagation(); openNewPageDialog(red.dataset.page); return; }
    const mark = e.target.closest(".ske-mark-badge, .ske-mark");
    if (mark && (mark.classList.contains("ske-mark-badge") || !mark.closest("tw-link, tw-enchantment"))) {
      focusComment(mark.dataset.cid, "game");
      return;
    }
    if (e.target.closest("tw-link, tw-enchantment, a, button, input") || !shownPage) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const pos = textPosAt(e.clientX, e.clientY);
    if (pos !== null) selectRange(pos, pos, true);
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

  /* ---------- Diskette tab: every reaction, in one place ---------- */

  /* What each DisketteLooks key is (the game's DISKETTE INSPECTING reads them). */
  const LOOK_KEYS = [
    ["self", "Diskette herself"], ["poke", "a click on her eyes, no drag"], ["page", "any browser page without its own comment"],
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

  let pickingZone = false;
  let disketteFilter = "todo";
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
      delete store.data.drafts[name];
      delete store.data.raw[name];
    } else {
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
  const altsToBox = (t) => (t || "").split(ALT_SPLIT).join("\n");
  const boxToAlts = (t, look) => t.split("\n").map((x) => x.trim()).filter(Boolean).join(look ? " &gt;&gt; " : " >> ");

  const CYCLES = [["order", "in order, then keep the last"], ["loop", "in order, round and round"], ["random", "at random"]];
  function cycleSelect(value, onchange) {
    const s = el("select", { class: "ske-input ske-small", title: "When she's asked again: which of the alternatives (one per line) she says", onchange: onchange });
    CYCLES.forEach(function (c) {
      const o = el("option", { value: c[0], text: "repeats: " + c[1] });
      if (c[0] === (value || "order")) o.selected = true;
      s.appendChild(o);
    });
    return s;
  }

  const expandedCards = new Set();

  function reactionCard(item) {
    const isLook = item.type === "look";
    const cardKey = item.passage + "#" + item.index;
    const card = el("div", { class: "ske-react" + (item.todo ? " ske-react-todo" : "") });
    card.dataset.key = cardKey;
    const covers = item.shape === "words" ? "on “" + gameText(item.words).slice(0, 40) + "”"
      : item.shape === "element" ? (item.photo ? "on photo " + item.photo : "on " + item.on)
      : item.type === "page" ? "page comment" : "point · " + item.radius + " px";
    const where = isLook ? item.keys.join(", ") : placeLabel(item.passage) + " · " + covers;
    const was = isLook ? item.text : item.say;
    const title = item.todo ? item.todo.note || "To write" : gameText(was.replace(ALT_SPLIT, " / ")) || "(nothing yet)";

    const head = el("div", { class: "ske-react-head", title: "Click to " + (expandedCards.has(cardKey) ? "fold" : "edit") });
    if (item.todo) head.appendChild(el("span", { class: "ske-prio ske-prio-" + item.todo.prio, title: "P1: needed to solve the demo. P2: story. P3: flavor.", text: item.todo.prio < 9 ? "P" + item.todo.prio + (item.todo.num < 999 ? "-" + String(item.todo.num).padStart(2, "0") : "") : "TODO" }));
    head.appendChild(el("span", { class: "ske-react-title", text: title }));
    head.appendChild(el("span", { class: "ske-react-where", text: where, title: where }));
    head.addEventListener("click", function () {
      if (expandedCards.has(cardKey)) expandedCards.delete(cardKey);
      else expandedCards.add(cardKey);
      card.replaceWith(reactionCard(item));
    });
    card.appendChild(head);
    if (!expandedCards.has(cardKey)) return card;
    card.classList.add("ske-react-open");

    if (item.type === "zone" && item.shape === "point" && item.context) card.appendChild(el("div", { class: "ske-react-context", text: "…" + item.context + " ●" }));
    if (isLook) card.appendChild(el("div", { class: "ske-muted ske-tiny", text: "When you drag her eyes to " + item.keys.map((k) => (LOOK_KEYS.find((x) => x[0] === k) || [k, k])[1]).join(" / ") }));
    const text = el("textarea", { class: "ske-react-text", rows: "2", placeholder: item.todo ? "Write her line here… (one per line for alternatives)" : "What she says (one per line for alternatives)" });
    text.value = item.todo ? "" : altsToBox(was);
    const keys = isLook ? el("input", { type: "text", class: "ske-input ske-small", value: item.keys.join(" "), title: "Keys: what she's looking at (see ?)" }) : null;
    const radius = item.type === "zone" ? el("input", { type: "number", class: "ske-input ske-small ske-radius", min: "0", max: "400", step: item.shape === "point" ? "10" : "2", value: String(item.radius), title: item.shape === "point" ? "Reach: how far from the point it counts (game px)" : "Slack around the words or element (game px)" }) : null;
    const selector = item.shape === "element" && !item.photo ? el("input", { type: "text", class: "ske-input ske-small ske-cond", value: item.on, title: "CSS selector of what it covers, in the same page or window" }) : null;
    const cond = el("input", { type: "text", class: "ske-input ske-small ske-cond", value: item.cond, placeholder: "only if: event, !event", title: "Only when these events have happened (!name = only before). See Game status." });
    const condNote = el("div", { class: "ske-muted ske-cond-note", text: conditionNow(item.cond) });
    const then = el("input", { type: "text", class: "ske-input ske-small ske-cond", value: item.then || "", placeholder: "after “Thanks”: Need me to look at anything else?", title: "What she says after “Thanks, Diskette!” (her follow-up; it always offers “That's enough, Diskette.”)" });
    let timer = null;
    const apply = function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        const said = boxToAlts(text.value, isLook) || (item.todo ? was : "");
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
          cycle.disabled = text.value.split("\n").filter((x) => x.trim()).length < 2;
          card.classList.toggle("ske-react-todo", !!todoOf(said));
          countTodos();
        } catch (err) { say(err.message, "error"); }
      }, 350);
    };
    const mood = moodSelect(item.mood, apply);
    const cycle = cycleSelect(item.cycle, apply);
    cycle.disabled = text.value.split("\n").filter((x) => x.trim()).length < 2;
    [text, cond, radius, keys, selector, then].forEach((i) => i && i.addEventListener("input", apply));
    card.appendChild(text);
    card.appendChild(el("div", { class: "ske-react-row" }, [
      keys,
      radius ? el("span", { class: "ske-muted ske-tiny", text: item.shape === "point" ? "reach" : "slack" }) : null, radius,
      mood, cycle,
    ]));
    card.appendChild(el("div", { class: "ske-react-row" }, [selector, cond]));
    card.appendChild(el("div", { class: "ske-react-row" }, [then]));
    card.appendChild(condNote);
    const iconBtn = (label, tip, fn) => el("button", { type: "button", class: "ske-icon-btn", title: tip, text: label, onclick: fn });
    card.appendChild(el("div", { class: "ske-react-row ske-react-actions" }, [
      isLook ? null : iconBtn("Show me", "Take the game there and flash it", () => showReaction(item)),
      isLook || !isWikiPage(item.passage) ? null : iconBtn("Edit in markup", "Select it in the Article tab", () => editInMarkup(item)),
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
      setTab("article");
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
    const n = allReactions().filter((i) => i.todo).length;
    const btn = ui.panel.querySelector('.ske-tab-btn[data-tab="diskette"]');
    if (btn) btn.textContent = n ? "Diskette (" + n + " to write)" : "Diskette";
    return n;
  }

  /* Puts a new zone in the open page's markup at pos, and its card up front. */
  function insertZone(pos, page) {
    const text = getText();
    const marker = page ? "[[diskette: page | ]]" : "[[diskette: " + ZONE_RADIUS + " | ]]";
    const at = page ? 0 : safeInsertPos(text, pos);
    const before = text.slice(0, at);
    view.dispatch({ changes: { from: at, to: at, insert: marker }, selection: { anchor: at + marker.length - 2 } });
    focusAfterRender = { passage: shownPage, index: findReactions(fromFriendly(before + marker)).length - 1 };
    disketteFilter = "written";
    setTab("diskette");
    say(page ? "Added a page comment. Write what she says about the page." : "Added a zone. Write her line, and set how far it reaches.", "ok");
  }

  /* The words last selected in the game's page. */
  let lastGameSelection = "";
  document.addEventListener("selectionchange", function () {
    const sel = window.getSelection();
    const node = sel && sel.anchorNode;
    const inPage = node && (node.nodeType === 1 ? node : node.parentElement);
    if (inPage && inPage.closest && inPage.closest(".browser-page-content") && !sel.isCollapsed) lastGameSelection = sel.toString().replace(/\s+/g, " ").trim();
    else if (inPage && inPage.closest && inPage.closest(".browser-page-content")) lastGameSelection = "";
  });

  /* Wraps the selected words (in the markup, or else in the game) in a zone. */
  function zoneOnSelection() {
    if (!shownPage) { say("Open a page in the game's browser first.", "error"); return; }
    const text = getText();
    let r = selection();
    if (r.from === r.to) {
      /* (Clicking the button clears the game's selection, so use the last one.) */
      const words = lastGameSelection;
      const at = words ? text.indexOf(words) : -1;
      if (at < 0) { say("Select some words first: in the markup, or in the game's page (plain words, not across a link).", "error"); return; }
      r = { from: at, to: at + words.length };
    }
    const words = text.slice(r.from, r.to);
    if (/\[\[|\]\]|\||[<>\n]/.test(words)) { say("Pick plain words: no links, photos, tags or line breaks inside.", "error"); return; }
    const marker = "[[diskette: 10 | on: " + words + " | ]]";
    view.dispatch({ changes: { from: r.from, to: r.to, insert: marker }, selection: { anchor: r.from + marker.length - 2 } });
    focusAfterRender = { passage: shownPage, index: findReactions(fromFriendly(text.slice(0, r.from) + marker)).length - 1 };
    disketteFilter = "written";
    setTab("diskette");
    say("Made a zone on “" + words + "”. Write her line.", "ok");
  }

  /* A zone on a photo (or any element) in the open page. */
  function openElementZoneDialog() {
    if (!shownPage) { say("Open a page in the game's browser first.", "error"); return; }
    closeModal();
    const photos = photoFiles(currentSource(shownPage));
    let chosen = photos[0] ? "photo:" + photos[0] : "element";
    const custom = el("input", { type: "text", class: "ske-input", placeholder: "CSS selector, e.g. .forum-user-pic or img" });
    const choice = (value, label) => {
      const radio = el("input", { type: "radio", name: "ske-el", value: value });
      if (value === chosen) radio.checked = true;
      radio.addEventListener("change", () => { chosen = value; });
      return el("label", { class: "ske-template" }, [radio, el("span", { text: " " + label })]);
    };
    openModal("Zone on a photo or element", [
      el("div", { class: "ske-muted", text: "She reacts when the arrow lands on it (or within the slack you set)." }),
      el("div", { class: "ske-templates" }, photos.map((f) => choice("photo:" + f, "Photo " + f)).concat([choice("element", "Another element:"), custom])),
    ], [
      el("button", { type: "button", class: "ske-save", text: "Make zone", onclick: function () {
        let part;
        if (chosen.indexOf("photo:") === 0) part = "on photo: " + chosen.slice(6);
        else if (custom.value.trim()) part = "on element: " + custom.value.trim().replace(/[|\]]/g, "");
        else { custom.focus(); return; }
        closeModal();
        insertMarker("[[diskette: 10 | " + part + " | ]]", chosen.indexOf("photo:") === 0 ? chosen.slice(6) : "");
      } }),
      el("button", { type: "button", text: "Cancel", onclick: closeModal }),
    ]);
  }

  /* Puts a marker right after a photo's line (or at the cursor) and opens its card. */
  function insertMarker(marker, afterPhoto) {
    const text = getText();
    let at = selection().from;
    if (afterPhoto) {
      const p = text.indexOf("[[photo: " + afterPhoto);
      if (p >= 0) at = text.indexOf("]]", p) + 2;
    } else at = safeInsertPos(text, at);
    view.dispatch({ changes: { from: at, to: at, insert: marker }, selection: { anchor: at + marker.length - 2 } });
    focusAfterRender = { passage: shownPage, index: findReactions(fromFriendly(text.slice(0, at) + marker)).length - 1 };
    disketteFilter = "written";
    setTab("diskette");
    say("Made the zone. Write her line.", "ok");
  }

  function placeZoneAt(e) {
    pickingZone = false;
    document.body.classList.remove("ske-picking");
    const photo = e.target.closest(".article-art[data-art]");
    if (photo) { insertMarker("[[diskette: 10 | on photo: " + photo.dataset.art + " | ]]", photo.dataset.art); return; }
    const pos = textPosAt(e.clientX, e.clientY);
    if (pos === null) { say("Couldn't match that spot to the page's text. Try clicking on plain words.", "error"); return; }
    insertZone(pos, false);
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
        disketteFilter = "looks";
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
    ["What she says", "Drag from Diskette's eyes to anything in the game and she reacts. First match wins: a zone where you let go, then the page's comment (browser pages), then her line for the app or thing under the arrow (a window, an icon, the clock, herself...)."],
    ["Zones", "A zone covers a point with a reach in pixels, some words (just those words, plus a little slack), or a photo or other element. Make one with + New. In the markup:\n[[diskette: 80 | Her line.]]   a point\n[[diskette: 10 | on: these words | Her line.]]\n[[diskette: 10 | on photo: file.jpg | Her line.]]"],
    ["Repeats", "Put several alternatives in one box, one per line, and she says one each time she's asked about that spot. “Repeats” picks how: in order then keep the last (a first reaction, a second, then the same one from then on), in order round and round, or at random (never the same twice running). In the markup they're separated by >>.\nSeveral lines for the same app or thing (Apps & things) are picked at random."],
    ["Only if (events)", "Event names from Game status, comma-separated: the reaction counts only when they've all happened. !name means only before it. e.g. zoom-started, !visited:kraska1. So one spot can say one thing early and another later."],
    ["Reactions", "hop (default), shake her head, or wide eyes."],
    ["After “Thanks”", "Her answer offers “Thanks, Diskette!”, which brings a follow-up: “Need me to look at anything else?” unless the reaction has its own (the “after Thanks” box, e.g. “Ugh, can we look at something nicer?”). The follow-up always offers “That's enough, Diskette.”, which tucks her into the tray. The × on any of her bubbles just quiets her; click her to talk again."],
    ["To write", "Text starting with TODO is a note for you; she ignores it. P1 = needed to solve the demo, P2 = story, P3 = flavor. Writing her line replaces the note."],
    ["In the game", "With this panel open, zones show in the game: points as a dot and dashed circle, words and elements outlined; pink when written, orange while still to write. Click a zone (or press and hold, or Alt-click, anywhere it reaches) to open it here."],
    ["Tips", "Keep lines to a sentence or two. <b>bold</b> works. Straight double quotes turn curly. Everything saves with Save to preview… like article edits."],
  ];

  const NEW_ACTIONS = [
    ["+ Zone on selected words", "Select words in the markup or the game first", () => zoneOnSelection()],
    ["+ Zone on a photo / element", "A photo on this page, or any element", () => openElementZoneDialog()],
    ["+ Point zone at the cursor", "A spot with a reach, where the markup cursor is", () => (shownPage ? insertZone(selection().from, false) : say("Open a page in the game's browser first.", "error"))],
    ["+ Zone: click the game", "Click words (a point at the end of the sentence) or a photo", function () {
      if (!shownPage) { say("Open a page in the game's browser first.", "error"); return; }
      pickingZone = true;
      document.body.classList.add("ske-picking");
      say("Click the spot in the game's page where she should react.", "");
    }],
    ["+ Page comment", "What she says about this page as a whole", () => (shownPage ? insertZone(0, true) : say("Open a page in the game's browser first.", "error"))],
    ["+ Line for an app or thing", "A window, an icon, the clock, herself…", () => openLookDialog()],
  ];

  /* A click anywhere outside the + New menu closes it. */
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest(".ske-new-wrap")) document.querySelectorAll(".ske-menu").forEach((m) => m.classList.add("ske-hidden"));
  }, true);

  function renderDiskette(force) {
    if (!ui) return;
    const n = countTodos();
    if (store.data.tab !== "diskette" && !force) return;
    const tab = ui.disketteTab;
    const items = allReactions();
    const lists = {
      todo: items.filter((i) => i.todo).sort(byTodo),
      written: items.filter((i) => !i.todo && i.type !== "look"),
      looks: items.filter((i) => !i.todo && i.type === "look"),
    };
    tab.textContent = "";
    const menu = el("div", { class: "ske-menu ske-hidden" }, NEW_ACTIONS.map((a) => el("button", { type: "button", class: "ske-menu-item", title: a[1], onclick: () => { menu.classList.add("ske-hidden"); a[2](); } }, [
      el("span", { text: a[0] }), el("span", { class: "ske-muted ske-tiny", text: a[1] }),
    ])));
    const newBtn = el("button", { type: "button", class: "ske-new-btn" + (pickingZone ? " ske-picking-on" : ""), text: pickingZone ? "Click the game…" : "+ New ▾", onclick: (e) => { e.stopPropagation(); menu.classList.toggle("ske-hidden"); } });
    tab.appendChild(el("div", { class: "ske-bar" }, [
      el("div", { class: "ske-new-wrap" }, [newBtn, menu]),
      el("div", { class: "ske-filters" }, [
        ["todo", "To write", lists.todo.length], ["written", "Zones", lists.written.length], ["looks", "Apps & things", lists.looks.length],
      ].map((f) => el("button", { type: "button", class: "ske-filter" + (disketteFilter === f[0] ? " ske-filter-on" : ""), onclick: () => { disketteFilter = f[0]; renderDiskette(true); } }, [
        el("span", { text: f[1] + " " }), el("span", { class: "ske-count", text: String(f[2]) }),
      ]))),
      helpButton("How Diskette's reactions work", DISKETTE_HELP),
    ]));
    const list = el("div", { class: "ske-react-list" });
    const shown = lists[disketteFilter] || [];
    if (disketteFilter === "todo" && !n) list.appendChild(el("div", { class: "ske-muted", text: "Nothing left to write." }));
    if (disketteFilter === "looks") {
      const missingKeys = LOOK_KEYS.filter((k) => !items.some((i) => i.type === "look" && !i.todo && i.keys.indexOf(k[0]) >= 0));
      if (missingKeys.length) list.appendChild(el("div", { class: "ske-muted ske-tiny", title: missingKeys.map((k) => k[0] + ": " + k[1]).join("\n"), text: missingKeys.length + " things have no line of their own yet (hover to see)" }));
    }
    if (focusAfterRender) expandedCards.add(focusAfterRender.passage + "#" + focusAfterRender.index);
    shown.forEach((item) => list.appendChild(reactionCard(item)));
    tab.appendChild(list);
    if (focusAfterRender) {
      const card = list.querySelector('[data-key="' + CSS.escape(focusAfterRender.passage + "#" + focusAfterRender.index) + '"]');
      focusAfterRender = null;
      if (card) { card.scrollIntoView({ block: "center" }); const t = card.querySelector("textarea"); if (t) t.focus(); card.classList.add("ske-react-new"); }
    }
  }

  /* ---------- Game status tab: events ---------- */

  const EVENTS_HELP = [
    ["Events", "Moments that, once they happen, stay happened for this playthrough (saved with the game). The list is the GameEvents passage, in story order."],
    ["The marks", "✓ happened   → next (everything it follows has happened)   ○ not yet   ⚠ happened before something it normally follows."],
    ["Testing", "Tick or untick one to fake it (NEW GAME undoes it), e.g. to try a Diskette line with “only if: zoom-started”."],
    ["Automatic ones", "The game also records every window opened (opened:mail) and every page visited (visited:Tom Barry). Those work in “only if” too."],
    ["In Harlowe", "(if: $events contains \"zoom-started\")[...]\nTo mark a new one: (set: $events to it + (ds: \"my-event\"))"],
  ];

  let statusSignature = "";
  function renderStatus(force) {
    if (!ui || store.data.tab !== "status" || !store.data.open) return;
    const events = hook.events ? hook.events() : null;
    const defs = findEvents(currentSource("GameEvents"));
    const sig = JSON.stringify([events, defs.map((d) => d.id)]);
    if (!force && sig === statusSignature) return;
    statusSignature = sig;
    const tab = ui.statusTab;
    tab.textContent = "";
    const happened = new Set(events || []);
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
      list.appendChild(el("label", { class: "ske-event ske-event-" + (done ? "done" : waiting.length ? "wait" : "next"), title: desc + (waiting.length ? (done ? "\nHappened before: " : "\nAfter: ") + waiting.join(", ") : "") }, [
        box,
        el("span", { class: "ske-event-state", text: state }),
        el("code", { text: d.id }),
        el("span", { class: "ske-event-desc", text: desc }),
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
    document.addEventListener("pointerdown", onGamePointerDown, true);
    document.addEventListener("pointermove", onGamePointerMove, true);
    document.addEventListener("pointerup", () => clearTimeout(holdTimer), true);
    new MutationObserver(function () {
      if (store.data.open) requestAnimationFrame(() => markGame(false));
      requestAnimationFrame(showZones);
    }).observe(document.body, { childList: true, subtree: true });
    setInterval(function () { if (store.data.open) renderStatus(false); }, 1000);
    setInterval(function () {
      if (!store.data.open) return;
      const page = hook.currentPage() || null;
      if (page !== lastSeenPage) {
        lastSeenPage = page;
        showPage(page, true);
      }
    }, 400);
    /* Pick up the other person's comments and saves while the panel is open. */
    setInterval(function () { if (store.data.open) { loadComments(); loadHistory(); } }, 60000);
    window.SkunkpetsEditorDebug = { getText: getText, setText: (t) => { setText(t); onInput(); }, select: (a, b) => selectRange(a, b, true), cursor: () => view.state.selection.main.head };
  }

  if (window.SkunkpetsEditorHook) start();
  else window.addEventListener("skunkpets-editor-hook", start);
})();
