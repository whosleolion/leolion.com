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

  const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const unescAttr = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const quote = (s) => (s.indexOf('"') < 0 ? '"' + s + '"' : "'" + s + "'");

  /* Game markup -> the short form shown in the editor. */
  function toFriendly(source) {
    return source
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

  /* The short form -> game markup. */
  function fromFriendly(text) {
    return text
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
    for (const m of text.matchAll(/\[\[(?!photo:)([^\]]+?)\]\]/g)) {
      const arrow = m[1].lastIndexOf("->");
      out.push({ target: arrow >= 0 ? m[1].slice(arrow + 2) : m[1], from: m.index, to: m.index + m[0].length });
    }
    return out;
  }

  /* Roughly the words a reader sees for a piece of short-form markup, used to
     find a comment's quote in the game. */
  function gameText(text) {
    return text
      .replace(/\[\[photo:[^\]]*\]\]/g, " ")
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

  function currentSource(name) {
    const d = store.data.drafts[name];
    if (d != null) return fromFriendly(d);
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
        const body = fromFriendly(store.data.drafts[name]);
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
    if (!m || /^\[\[photo:/.test(m.text)) return null;
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

    const panel = el("div", { class: "ske-panel" }, [
      el("div", { class: "ske-head" }, [
        el("b", { text: "Winkipedia editor" }),
        el("button", { type: "button", class: "ske-close", title: "Close the editor", text: "×", onclick: () => setOpen(false) }),
      ]),
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
      ]),
      editorBox,
      missing,
      el("div", { class: "ske-actions" }, [
        el("button", { type: "button", class: "ske-save", text: "Save to preview…", onclick: openReview }),
        el("button", { type: "button", class: "ske-undo", text: "Undo my changes to this page", onclick: onRevert }),
      ]),
      status,
      pending,
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
      el("details", { class: "ske-help" }, [
        el("summary", { text: "Cheat sheet" }),
        el("pre", { text:
          "[[Tom Barry]]                  link to a page\n" +
          "[[the founder->Tom Barry]]     link with other words\n" +
          "  (type [[ for page names; red = page doesn't exist\n" +
          "   yet: Ctrl/Cmd-click it or use Create below)\n" +
          "[[photo: file.jpg | right | description]]\n" +
          "[[photo: file.jpg | left | 36% | description]]\n" +
          "''bold''   //italic//   <h2>Heading</h2>\n" +
          "A \\ at the end of a line joins it to the next one.\n" +
          "Move a photo line to move the photo: right after a\n" +
          "heading puts it beside that section.\n" +
          "Click words in the game to jump to them here.\n" +
          "Ctrl/Cmd-F finds, Ctrl/Cmd-Z undoes." }),
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
    document.body.appendChild(toggle);
    document.body.appendChild(panel);
    ui = { toggle, panel, title, lastEdit, status, pending, missing, commentsTitle, commentList, commentOthers, commentStatus, commentInput, quoteHint };
    view = makeEditor(editorBox);
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
    const used = new Set([].concat.apply([], names.map((n) => photoFiles(fromFriendly(store.data.drafts[n])))));
    const missingPhotos = Array.from(used).filter((f) => !known.has(f));
    if (missingPhotos.length) { say("Can't save: no photo called " + missingPhotos.join(", ") + ".", "error"); return; }
    const photos = Object.keys(store.data.photos).filter((f) => used.has(f));

    const blocks = names.map(function (name) {
      const before = isNewPage(name) && !(name in store.data.saved) ? "" : toFriendly(baseline(name));
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
        store.data.saved[n] = fromFriendly(store.data.drafts[n]);
        delete store.data.drafts[n];
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

  /* Clicks in the game while the panel is open: comment marks open their
     thread, red links offer to create the page, and clicking words jumps
     the markup to them. */
  function onGameClick(e) {
    if (!store.data.open || !e.target.closest(".browser-page-content")) return;
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
    const caret = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (!caret || caret.startContainer.nodeType !== Node.TEXT_NODE) return;
    const t = caret.startContainer.nodeValue;
    const off = caret.startOffset;
    const doc = getText();
    const tries = [[off - 20, off + 20], [off - 10, off + 10], [0, 30]];
    for (const [a, b] of tries) {
      const from = Math.max(0, a);
      const snippet = t.slice(from, Math.min(t.length, b)).replace(/\s+/g, " ");
      if (snippet.trim().length < 6) continue;
      const i = doc.indexOf(snippet);
      if (i >= 0) {
        const pos = i + Math.min(snippet.length, off - from);
        selectRange(pos, pos, true);
        return;
      }
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
    renderComments();
    loadComments();
    loadHistory();
    document.addEventListener("click", onGameClick, true);
    new MutationObserver(function () {
      if (store.data.open) requestAnimationFrame(() => markGame(false));
    }).observe(document.body, { childList: true, subtree: true });
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
