/* =========================================================
   SKUNKPETS REDUX: WINKIPEDIA ARTICLE EDITOR (preview only)
   ---------------------------------------------------------
   Loaded only on leolion.com/building/skunkpets-redux-preview/
   (the preview workflow adds it; the live game never has it).

   "Edit articles" opens a panel beside the game. Open any
   Winkipedia page in the in-game browser and its text shows
   up in the panel; changes appear in the game as you type.
   "Save to preview" commits them to GitHub (the branch the
   preview was built from), which rebuilds the preview, and
   from there they ship like any other change.

   Links and photos are shown in a shorter form while editing
   and turned back into the game's real markup on save:
     [[Tom Barry]]                  link to a page
     [[shown words->Page name]]     link with other words
     [[photo: file.jpg | right | 40% | description]]
   Saving needs a GitHub token (asked for once, kept in this
   browser). See tools/skunkpets-redux/editor/README.md.
   ========================================================= */

(function () {
  "use strict";

  /* ---------- Short markup <-> game markup (pure, tested in Node) ---------- */

  const LINK_RE = /\(link: "([^"]*)"\)\[\(set: \$navPending to "([^"]*)"\)\(display: "func-navigate"\)\]/g;
  const PHOTO_RE = /<div class="article-art( article-art-left)?" data-art="([^"]+)"(?: style="width: ([\d.]+%)")? role="img" aria-label="([^"]*)"><\/div>/g;

  const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const unescAttr = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const quote = (s) => (s.indexOf('"') < 0 ? '"' + s + '"' : "'" + s + "'");

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

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { toFriendly, fromFriendly, replacePassage, photoFiles };
  }
  if (typeof document === "undefined") return;

  /* ---------- Settings ---------- */

  const script = document.currentScript;
  const REPO = (script && script.dataset.repo) || "whosleolion/leolion.com";
  const BRANCH = (script && script.dataset.branch) || "";
  const TWEE_PATH = "tools/skunkpets-redux/skunkpets-redux.twee";
  const ART_PATH = "tools/skunkpets-redux/art/";
  const STORE_KEY = "skunkpets-editor";
  const TOKEN_KEY = "skunkpets-editor-token";
  const PANEL_WIDTH = 440;

  const store = (function () {
    let data;
    try { data = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { data = {}; }
    data.drafts = data.drafts || {};      /* name -> short-markup text not yet saved */
    data.photos = data.photos || {};      /* file -> data: URL, added but not yet saved */
    data.saved = data.saved || {};        /* name -> source saved but not yet in this build */
    data.savedPhotos = data.savedPhotos || {};
    data.open = !!data.open;
    return {
      data: data,
      write: function () { try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) {} },
    };
  })();

  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } };
  const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} };

  let hook = null;
  const original = {}; /* name -> source as built into this page */

  function passage(name) {
    const p = hook && hook.passages.get(name);
    return p instanceof Map ? p : null;
  }
  const isEditable = (name) => {
    const p = passage(name);
    return !!p && (p.get("tags") || []).indexOf("wiki") >= 0;
  };
  function originalSource(name) {
    if (!(name in original)) original[name] = passage(name).get("source");
    return original[name];
  }

  /* Every photo file the game knows: in any passage, or added in the editor. */
  function knownPhotos() {
    const files = new Set(Object.keys(store.data.photos).concat(Object.keys(store.data.savedPhotos)));
    hook.passages.forEach(function (p, name) {
      if (p instanceof Map) photoFiles(name in original ? original[name] : p.get("source")).forEach((f) => files.add(f));
    });
    return files;
  }

  /* ---------- Applying edits to the running game ---------- */

  function currentSource(name) {
    const d = store.data.drafts[name];
    if (d != null) return fromFriendly(d);
    if (name in store.data.saved) return store.data.saved[name];
    return originalSource(name);
  }

  function applyToGame(name) {
    const p = passage(name);
    if (p) p.set("source", currentSource(name));
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
      if (!passage(name) || originalSource(name) === store.data.saved[name]) delete store.data.saved[name];
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
      const err = new Error("GitHub said " + res.status + " for " + path + ": " + (await res.text()).slice(0, 200));
      err.status = res.status;
      throw err;
    }
    return options.raw ? res.text() : res.json();
  }

  /* One commit with every changed article and new photo. Retries if the
     branch moved underneath (another save, or a push from Claude). */
  async function commitAll(names, photos, confirmOverwrite) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = await gh("/git/ref/heads/" + encodeURIComponent(BRANCH));
      const head = ref.object.sha;
      const commit = await gh("/git/commits/" + head);
      let twee = await gh("/contents/" + TWEE_PATH + "?ref=" + head, { raw: true });

      const clashes = [];
      names.forEach(function (name) {
        const r = replacePassage(twee, name, fromFriendly(store.data.drafts[name]));
        if (r.before !== originalSource(name) && r.before !== store.data.saved[name]) clashes.push(name);
        twee = r.twee;
      });
      if (clashes.length && !confirmOverwrite(clashes)) throw new Error("Not saved.");

      const tree = [{ path: TWEE_PATH, mode: "100644", type: "blob", content: twee }];
      for (const f of photos) {
        const blob = await gh("/git/blobs", { method: "POST", body: { content: store.data.photos[f].url.split(",")[1], encoding: "base64" } });
        tree.push({ path: ART_PATH + f, mode: "100644", type: "blob", sha: blob.sha });
      }
      const newTree = await gh("/git/trees", { method: "POST", body: { base_tree: commit.tree.sha, tree: tree } });
      const message = "Edit Winkipedia: " + names.concat(photos.map((f) => "photo " + f)).join(", ") +
        "\n\nMade with the preview's article editor.";
      const newCommit = await gh("/git/commits", { method: "POST", body: { message: message, tree: newTree.sha, parents: [head] } });
      try {
        await gh("/git/refs/heads/" + encodeURIComponent(BRANCH), { method: "PATCH", body: { sha: newCommit.sha } });
        return newCommit.sha;
      } catch (e) {
        if (e.status !== 422) throw e; /* branch moved: start over on the new head */
      }
    }
    throw new Error("The branch kept changing while saving. Try again in a minute.");
  }

  /* ---------- Panel ---------- */

  let ui = null;
  let shownPage = null;
  let applyTimer = null;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach((c) => node.appendChild(c));
    return node;
  }

  function buildUi() {
    const toggle = el("button", { class: "ske-toggle", type: "button", text: "✎ Edit articles", onclick: () => setOpen(!store.data.open) });
    const title = el("div", { class: "ske-title" });
    const text = el("textarea", { class: "ske-text", spellcheck: "true", oninput: onInput });
    const status = el("div", { class: "ske-status" });
    const pending = el("div", { class: "ske-pending" });
    const tool = (label, tip, fn) => el("button", { type: "button", title: tip, text: label, onclick: fn });
    const fileInput = el("input", { type: "file", accept: "image/*", class: "ske-file", onchange: onPhotoChosen });
    const tokenInput = el("input", { type: "password", class: "ske-token-input", placeholder: "github_pat_...", autocomplete: "off" });

    const panel = el("div", { class: "ske-panel" }, [
      el("div", { class: "ske-head" }, [
        el("b", { text: "Winkipedia editor" }),
        el("button", { type: "button", class: "ske-close", title: "Close the editor", text: "×", onclick: () => setOpen(false) }),
      ]),
      title,
      el("div", { class: "ske-tools" }, [
        tool("Link", "Link the selected words: [[Page]] or [[words->Page]]", () => wrap("[[", "]]")),
        tool("Bold", "''bold''", () => wrap("''", "''")),
        tool("Italic", "//italic//", () => wrap("//", "//")),
        tool("Heading", "<h2>Heading</h2>", () => wrap("<h2>", "</h2>\\")),
        tool("+ Photo", "Add a photo from your computer", () => fileInput.click()),
        fileInput,
      ]),
      text,
      el("div", { class: "ske-actions" }, [
        el("button", { type: "button", class: "ske-save", text: "Save to preview", onclick: onSave }),
        el("button", { type: "button", text: "Undo my changes to this page", onclick: onRevert }),
      ]),
      status,
      pending,
      el("details", { class: "ske-help" }, [
        el("summary", { text: "Cheat sheet" }),
        el("pre", { text:
          "[[Tom Barry]]                  link to a page\n" +
          "[[the founder->Tom Barry]]     link with other words\n" +
          "[[photo: file.jpg | right | description]]\n" +
          "[[photo: file.jpg | left | 36% | description]]\n" +
          "''bold''   //italic//   <h2>Heading</h2>\n" +
          "A \\ at the end of a line joins it to the next one.\n" +
          "Move a photo line to move the photo: right after a\n" +
          "heading puts it beside that section." }),
      ]),
      el("details", { class: "ske-help ske-github" }, [
        el("summary", { text: "GitHub access" }),
        el("p", { text: "Saving commits to " + REPO + " (branch " + (BRANCH || "?") + "). It needs a fine-grained token with " +
          "Contents: Read and write on that one repository. It's kept only in this browser." }),
        el("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener", text: "Make a token on GitHub" }),
        el("div", { class: "ske-token-row" }, [
          tokenInput,
          el("button", { type: "button", text: "Use", onclick: () => { setToken(tokenInput.value.trim()); tokenInput.value = ""; refresh(); } }),
          el("button", { type: "button", text: "Forget", onclick: () => { setToken(""); refresh(); } }),
        ]),
      ]),
    ]);
    document.body.appendChild(toggle);
    document.body.appendChild(panel);
    ui = { toggle, panel, title, text, status, pending };
  }

  function setOpen(open) {
    store.data.open = open;
    store.write();
    ui.panel.classList.toggle("ske-open", open);
    ui.toggle.classList.toggle("ske-toggle-on", open);
    hook.reserveRight(open ? PANEL_WIDTH : 0);
    shownPage = null;
    refresh();
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
    if (drafts.length || photos.length) lines.push("Not saved yet: " + drafts.concat(photos.map((f) => "photo " + f)).join(", "));
    if (saved.length) lines.push("Saved, waiting for the preview to rebuild: " + saved.join(", "));
    if (!getToken()) lines.push("Add a GitHub token under “GitHub access” to be able to save.");
    ui.pending.textContent = lines.join("\n");
  }

  function wrap(before, after) {
    const t = ui.text;
    const a = t.selectionStart;
    const b = t.selectionEnd;
    t.setRangeText(before + t.value.slice(a, b) + after, a, b, "select");
    t.focus();
    onInput();
  }

  function onInput() {
    if (!shownPage) return;
    const name = shownPage;
    const source = fromFriendly(ui.text.value);
    const baseline = name in store.data.saved ? store.data.saved[name] : originalSource(name);
    if (source === baseline) delete store.data.drafts[name];
    else store.data.drafts[name] = ui.text.value;
    store.write();
    refresh();
    checkPhotos();
    clearTimeout(applyTimer);
    applyTimer = setTimeout(function () {
      applyToGame(name);
      if (hook.currentPage() === name) redraw();
    }, 400);
  }

  function checkPhotos() {
    const known = knownPhotos();
    const missing = photoFiles(fromFriendly(ui.text.value)).filter((f) => !known.has(f));
    if (missing.length) say("No photo called " + missing.join(", ") + ". Use + Photo to add one.", "error");
    else if (ui.status.classList.contains("ske-error")) say("");
    return missing;
  }

  function onRevert() {
    if (!shownPage || !(shownPage in store.data.drafts)) return;
    if (!confirm("Undo your unsaved changes to “" + shownPage + "”?")) return;
    delete store.data.drafts[shownPage];
    store.write();
    applyToGame(shownPage);
    redraw();
    showPage(shownPage, true);
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
      const t = ui.text;
      const at = t.selectionStart;
      const line = "[[photo: " + name + " | right | " + file.name.replace(/\.[^.]+$/, "").replace(/[|\]]/g, " ") + "]]";
      const before = at > 0 && t.value[at - 1] !== "\n" ? "\n" : "";
      t.setRangeText(before + line + "\n", at, at, "end");
      t.focus();
      onInput();
      say("Added " + name + ". Move its line to move the photo; it's saved with the article.", "ok");
    };
    img.onerror = () => say("That file isn't an image this browser can read.", "error");
    img.src = URL.createObjectURL(file);
  }

  async function onSave() {
    const names = Object.keys(store.data.drafts);
    if (!names.length) { say("Nothing to save.", ""); return; }
    if (!getToken()) {
      ui.panel.querySelector(".ske-github").open = true;
      say("Add a GitHub token first (under GitHub access).", "error");
      return;
    }
    if (!BRANCH) { say("This preview doesn't know which branch it came from.", "error"); return; }
    const known = knownPhotos();
    const missing = [].concat.apply([], names.map((n) => photoFiles(fromFriendly(store.data.drafts[n])))).filter((f) => !known.has(f));
    if (missing.length) { say("Can't save: no photo called " + missing.join(", ") + ".", "error"); return; }
    /* Only photos that a saved article actually uses go up. */
    const used = new Set([].concat.apply([], names.map((n) => photoFiles(fromFriendly(store.data.drafts[n])))));
    const photos = Object.keys(store.data.photos).filter((f) => used.has(f));

    say("Saving…", "");
    try {
      const sha = await commitAll(names, photos, function (clashes) {
        return confirm(clashes.join(", ") + " changed on GitHub since this preview was built. Save yours over it anyway?");
      });
      names.forEach(function (n) {
        store.data.saved[n] = fromFriendly(store.data.drafts[n]);
        delete store.data.drafts[n];
      });
      photos.forEach(function (f) {
        store.data.savedPhotos[f] = store.data.photos[f];
        delete store.data.photos[f];
      });
      store.write();
      refresh();
      say("Saved (" + sha.slice(0, 7) + "). The preview rebuilds in about a minute; your changes already show here.", "ok");
    } catch (err) {
      say(err.message || String(err), "error");
    }
  }

  function showPage(name, force) {
    if (name === shownPage && !force) return;
    shownPage = name;
    if (!name) {
      ui.title.textContent = "Open a Winkipedia page in the game's browser to edit it here.";
      ui.text.value = "";
      ui.text.disabled = true;
      return;
    }
    if (!isEditable(name)) {
      shownPage = null;
      ui.title.textContent = "“" + name + "” isn't a Winkipedia page, so it can't be edited here.";
      ui.text.value = "";
      ui.text.disabled = true;
      return;
    }
    ui.title.textContent = name;
    ui.text.disabled = false;
    ui.text.value = name in store.data.drafts ? store.data.drafts[name] : toFriendly(currentSource(name));
    checkPhotos();
  }

  function start() {
    hook = window.SkunkpetsEditorHook;
    if (!hook || ui) return;
    hook.passages.forEach((p, name) => { if (p instanceof Map) originalSource(name); });
    settleSaved();
    Object.keys(store.data.drafts).concat(Object.keys(store.data.saved)).forEach(applyToGame);
    photoStyles();
    buildUi();
    setOpen(store.data.open);
    setInterval(function () {
      if (!store.data.open) return;
      const page = hook.currentPage();
      if (page !== (shownPage || null)) showPage(page || null);
    }, 400);
  }

  if (window.SkunkpetsEditorHook) start();
  else window.addEventListener("skunkpets-editor-hook", start);
})();
