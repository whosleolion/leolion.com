# Skunkpets Redux — source and build

The game lives at `src/building/skunkpets-redux/index.html` (served at
leolion.com/building/skunkpets-redux). It's a Twine / Harlowe 3.1 story that
plays as a refurbished Windows XP desktop.

**Edit `skunkpets-redux.twee`, not the HTML.** Every passage, the stylesheet and
the script are in that one file. Then rebuild:

    node tools/skunkpets-redux/build.js

That rewrites only the story block inside `src/building/skunkpets-redux/index.html`
(the Harlowe engine already in the page is reused, so no Twine/Tweego install is
needed). The deploy workflow also runs this build before uploading, so pushing an
edited `.twee` to `master` is enough; the build is picked up even from the GitHub
web editor.

To refresh the tinypetgames copy, pass its path:

    node tools/skunkpets-redux/build.js path/to/neocities-tinypetgames/skunkpets-redux/skunkpets-redux.html

Images load from tinypetgames.neocities.org by absolute URL, so the same page works
on either site. Diskette's two transparent cut-outs (`diskette-cutout.png`,
`diskette-icon.png`) are embedded into the page by `build.js` via
`url("inline:...")` in the stylesheet. `build.js` also generates the `WinkiIndex`
passage (Winkipedia's search list) from every passage tagged `article`.

`playtest.mjs` needs Playwright + Chromium; it plays boot to ending with real
mouse clicks and drags and exits non-zero on any failure:

    node tools/skunkpets-redux/build.js
    (cd src && python3 -m http.server 8765)
    node tools/skunkpets-redux/playtest.mjs http://localhost:8765/building/skunkpets-redux/ /tmp/shots

`extract.js` does the reverse of the build (published HTML → `.twee`); it was used
once to recover the source and shouldn't normally be needed.

**`GUIDE.md` explains every system in plain language**, with recipes for common
changes (new window, new app in the Trash, new web page, sending an email,
Diskette's lines).
