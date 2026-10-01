# Backend Editor (preview only)

On the preview (leolion.com/building/skunkpets-preview/) a yellow
**✎ Backend** button sits in the bottom-left corner (with the number of open
comments). It opens a panel beside the game; the game shrinks to make room.

The panel has four editors as tabs, **Markup · Comments · Diskette ·
Events**, which all follow one shared **selection**. **Save to preview…** at
the bottom saves everything changed in any of them as one commit.

## Selecting

- **Drag across words** in the game (any time the panel is open) to select
  them.
- **⌖ Edit** (top of the panel, or press **E**) turns on Edit mode: the
  pointer becomes a crosshair, things outline as you hover, and a click
  selects instead of acting (links don't fire, icons don't drag). Click a
  **paragraph** of a page, a **photo**, or any **thing**: an icon, a window,
  the clock, the Start button, Diskette herself. Dragging across words still
  picks just those.
- The **breadcrumb** under the tabs shows what's selected
  (`Tom Barry › ¶ paragraph › “his two sons”`); click a step to widen the
  selection (the page itself = her comment on the whole page). **Esc**
  clears it; Esc again leaves Edit mode.
- A small **popup** by the selection jumps to the right tab:
  **✎ Markup**, **💬 Comment** (with how many comments are on it), and **◉ Diskette**
  (her line there, or **◉ Diskette +** to make one, in one click).

## The four editors

**Markup.** The whole page's markup, always (the selection is selected and
scrolled to in it). Links are blue, photos green, Diskette's zones pink, HTML
tags brown; typing `[[` suggests page names; Ctrl/Cmd-F finds, Ctrl/Cmd-Z
undoes. The game shows edits as you type. The **?** has the short-form cheat
sheet: `[[Tom Barry]]`, `[[the founder->Tom Barry]]`,
`[[photo: file.jpg | left | 36% | description]]`, and Diskette's
`[[diskette: …]]` markers. **+ Photo** adds a picture (shrunk to 480 px,
saved as JPEG). Links to missing pages are red and listed with **Create**;
**+ New page** makes one from a template (Winkipedia article, fan wiki page,
forum thread, games archive page, blank). Selecting something in game code
(Mail, the NetCon ticket, READ_ME) shows that passage here read-only, with the
selection marked. Unsaved edits are kept in this browser.

**Comments.** Comments for whoever edits next. With a selection, its comments
come first and a new comment is pinned to it (words, a photo, a thing, or game code);
otherwise the open page's comments, and other pages' with **Go**. Comments
highlight in the game while this tab is open; click one to open its thread.
**Reply**, **Resolve**/**Reopen**, **Delete** your own; if the pinned words are
edited away, select new ones and **Re-pin**. Each comment is its own small
commit to `comments.json` (the repository is public, so so are comments); the
first time, it asks your name (**My name…** changes it).

**Diskette.** What she says when the player drags from her eyes
(GUIDE.md 7.10). With a selection: her response to it, edited in place, or
**◉ Diskette reacts here**, which makes a zone shaped to the selection (the
words, the paragraph, the photo, the page) or, for a thing on the desktop,
her line for that thing. Without one: every reaction, the open page first,
then *Desktop & apps* and the other pages, drafts last, with a search box and
**+ Line for something you can't point at** (off the screen, a poke in the
eye, any page...). A card holds her line (**+ Another line**, or Enter, adds something
else for when she's asked again; with more than one, **Asked again: In order /
Loop / Random** appears and the header says e.g. *↻ 3 lines*), her reaction (hop, shake, wide eyes), the zone's slack or reach,
**only if** (events; `!name` = only before), what she says **after
"Thanks"**, and **Make draft** / **Publish**, **Show me**, **Edit in markup**,
**Delete**. Zones show in the game while this tab is open; click one to open
its card.

**Events.** The `GameEvents` list (GUIDE.md 7.16) with what has happened in
this playthrough: ✓ happened, → next, ○ not yet, ⚠ out of order, plus every
other event that happened. **◉ n** on an event = n of Diskette's reactions
depend on it (hover to see which); those of the selection's reaction are
outlined. Tick or untick one to fake it while testing (NEW GAME undoes it).

**What the game shows follows the tab:** comments in Comments, zones in
Diskette, nothing extra in Markup and Events.

## Saving

**Save to preview…** shows every changed passage (green added, red removed)
and makes one commit, under your name, on the branch this preview was built
from; the preview rebuilds within about a minute and your changes keep
showing meanwhile. "Last saved by …" under a page's name says who last saved
it from the editor. Your unsaved changes remember what they were based on: if
the game moves on (someone else's save, a push from Claude), they're carried
over onto the new version, or, if both changed the same lines, flagged with a
warning before saving. If GitHub has something newer for a page you're
saving, it asks before overwriting.

**GitHub access (once per browser):** the **GitHub** button at the top of the
panel. It needs a fine-grained personal access token: GitHub → Settings →
Developer settings → Fine-grained tokens → Generate new token; Repository
access: *Only select repositories* → `whosleolion/leolion.com`; Permissions →
Repository permissions → *Contents*: *Read and write* (not the default
Read-only). It's kept only in this browser; **Forget it** removes it.

What it can't do (yet): rename or delete pages, or edit game code (it's
read-only here; that's still done in the `.twee`).

## Files

- `editor.js`, `editor.css`: the editor. The preview workflow uploads them
  (with `codemirror.bundle.js`) and adds them to the preview page; the live
  game never loads them.
- `codemirror.bundle.js`: the code editor library (CodeMirror 6), bundled to
  one file from `codemirror/` (`npm install && npm run build` there to update
  it).
- `unit-test.js`: the editor's text logic (finding pinned words, adding pages
  to the `.twee`, page-name rules, comment threads, the change list), and a
  build of a new page from every template
  (`node tools/skunkpets-redux/editor/unit-test.js`). It talks to
  the game through `window.SkunkpetsEditorHook` (script section
  `PREVIEW EDITOR HOOK`), which only exists on the preview.
- `roundtrip-test.js`: checks the short link/photo form converts back exactly
  for every page in the `.twee` (`node tools/skunkpets-redux/editor/roundtrip-test.js`).
- `editor-test.mjs`: browser test with GitHub faked. Needs a local preview
  copy: build, run the workflow's "Make the preview copy" commands (or copy
  `src/building/skunkpets` to `src/building/skunkpets-preview`
  and add the editor tags by hand), serve `src/` on port 8765, then run it
  from a folder where `playwright` resolves, with `REPO_ROOT` set to the repo.
  `src/building/skunkpets-preview/` is git-ignored; never commit it.
