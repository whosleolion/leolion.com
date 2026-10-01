# Website Redesign — leolion.com

Custom HTML/CSS/JS rebuild of Leo Lion's personal website. Goal: replace Squarespace with a faster, more tailored, more dynamic site.

## Project Goals
- Responsive, mobile-first design
- Dynamic and theatrical feel matching Leo's brand
- Clean, direct HTML/CSS/JS (no build tools required to run)
- Custom-coded, no CMS dependency
- Showcase: directing, playwriting, teaching, RPG, and featured shows (HELP ME!!!!, I WAS NEVER HERE)

## Structure
```
Website-Redesign/
  _source-backup/     ← original site content scraped from leolion.com
    pages/            ← markdown files with all text content per page
    images/           ← downloaded images (directing/, playwriting/, rpg/)
  src/                ← new website source files
    index.html
    directing.html
    playwriting.html
    teaching.html
    rpg.html
    helpme.html
    iwasneverhere.html
    css/
    js/
    images/           ← optimized assets for the new site
  CLAUDE.md
```

## Brand Notes
- Tagline: "I MAKE PLAYS AND GAMES AND THINGS IN BETWEEN"
- Motto: "surprise yourself!"
- Role: director / performer / educator / game artist
- Location: Brooklyn, NY
- Key orgs: The Firebird Project (founder), Phoenix Theatre Ensemble (associate AD)
- Membership: Dramatists Guild, Stage Directors & Choreographers Society
- Education: BA Theatre (Directing), Fordham University '22

## Contact
- Email: leo@firebird.nyc / leo.lion.q@gmail.com
- Phone: +1 (718) 915-3925
- Address: 345 West 86th St, #216, New York, NY 10024
- Instagram: @whosleolion
- TikTok: @whosleolion

## Key External Links to Preserve
- https://thefirebirdproject.org
- https://phoenixtheatreensemble.org
- https://iwasneverhere.show
- https://helpmetheshow.com (tour ticketing subdomains)
- New Play Exchange (playwriting listings)

## Deploy
Neocities site `leolioncom` (leolion.com). Pushing to `master` runs `.github/workflows/deploy-neocities.yml`, which uploads every file under `src/` to the site root (only `src/` — nothing else in this repo is deployed). Auth is the `NEOCITIES_API_KEY_LEOLIONCOM` repo secret. `netlify.toml` is a leftover from an earlier hosting plan and is not active.

## Skunkpets Redux (Twine game)
`src/building/skunkpets/index.html` (leolion.com/building/skunkpets, noindexed) is a Twine / Harlowe 3.1 story built from `tools/skunkpets-redux/skunkpets-redux.twee`. Edit the `.twee`, never the HTML; `node tools/skunkpets-redux/build.js` rewrites only the page's `<tw-storydata>` block, and the deploy workflow runs the same build before uploading, so a pushed `.twee` edit goes live on its own. Images load from tinypetgames.neocities.org by absolute URL; Diskette's cut-outs are embedded via `url("inline:...")`. `build.js` generates the `WinkiIndex` passage from passages tagged `article`. Preview before shipping: pushing any branch other than `master` that touches the game runs `.github/workflows/preview-skunkpets.yml`, which publishes this game's folder to leolion.com/building/skunkpets-preview/ (yellow PREVIEW badge, its own save slot; the page loads its song/voice files from that folder via `siteAsset`). Iterate there; push to `master` only when Leo says to ship. The preview also has a Winkipedia article editor (`tools/skunkpets-redux/editor/`, preview only) that commits Leo's edits straight to that branch, so always `git pull` the branch before working on the game. Its comments (Leo and Sofe's notes to each other, sometimes to Claude) live in `tools/skunkpets-redux/editor/comments.json`; check open ones for requests when picking up work. The editor can also create new wiki pages (appended to the `.twee` with template tags); its code-editor library is the vendored `editor/codemirror.bundle.js` (rebuild from `editor/codemirror/`). Editor tests: `editor/roundtrip-test.js`, `editor/unit-test.js` (Node) and `editor/editor-test.mjs` (browser, GitHub faked). Photos in articles are `<div class="article-art" data-art="file.jpg" ...>` blocks; `build.js` embeds `tools/skunkpets-redux/art/file.jpg` for each. Diskette's "inspecting" mode (drag from her eyes to something; her pupils follow the mouse) answers from response zones `<span class="diskette-zone" data-radius="80" data-say="...">` / page comments `<span class="diskette-page" data-say="...">` (editor: `[[diskette: 80 | ...]]`), else the `DisketteLooks` passage; never put `&quot;` in `data-say`. Text starting `TODO P1-04 ...` is a to-write note she ignores (the editor's Diskette tab lists them by priority); `data-if="event, !event"` makes a reaction depend on events. Events: the saved dataset `$events` (`opened:<window>`, `visited:<page>`, `zoom-started`...; script section EVENTS, catalog passage `GameEvents`, shown in the editor's Game status tab; mark new ones with `(set: $events to it + (ds: "x"))`). Her eye pieces come from `diskette-eyes.py`. `tools/skunkpets-redux/GUIDE.md` explains every system; `playtest.mjs` is a headless boot-to-ending check (Playwright). Harlowe 3.1 gotchas: temp variables die at the end of their hook, `READ_ME` in text reads as a `_ME` variable (write `READ&#95;ME`), and `(passages: where ...)` / `(dialog:)` don't exist.

## Duat (campaign catalogs)
`src/duat/` is Duat, a static no-build campaign-catalog engine (wiki/Obsidian-style entries, explorable pin maps). Engine: `src/duat/engine/duat.{js,css}`. Campaigns: `src/duat/<id>/` with `world.json` + `entries/*.md` + `images/`. Pilot: Vista City Mondays at `src/duat/vcm/` (leolion.com/duat/vcm), noindexed and unlinked from the main site, so keep it covert. The authoring format is documented in `DUAT.md`. New entries must be added to the `entries` list in `world.json`. Everything else (pages, details, pins, settings, new campaigns at `/duat/play/?w=<id>`) can be done from the site; site edits live in the save service (`duat-backend/Code.gs`) and can be folded back into files with `duat-backend/apply_export.py`.
