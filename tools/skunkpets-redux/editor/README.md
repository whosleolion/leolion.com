# Winkipedia article editor (preview only)

On the preview (leolion.com/building/skunkpets-preview/) a yellow
**✎ Edit articles** button sits in the bottom-left corner. It opens a panel
beside the game; the game shrinks to make room.

1. Open any Winkipedia page in the game's browser (Winkipedia articles, the
   fan wiki, the games archive: anything tagged `wiki`). Its text appears in
   the panel, and the panel follows along as you click links in the game.
   Clicking words in the game jumps the text to them.
2. Edit. The game shows your changes as you type. The text box is a small code
   editor: links are blue, photos green, HTML tags brown, Harlowe code purple;
   Ctrl/Cmd-F finds, Ctrl/Cmd-Z undoes, and typing `[[` suggests page names.
   Links and photos use a short form (the Cheat sheet in the panel has it):
   - `[[Tom Barry]]` links to a page; `[[the founder->Tom Barry]]` links with
     other words.
   - `[[photo: file.jpg | right | description]]` is a photo;
     `[[photo: file.jpg | left | 36% | description]]` floats it left at 36%
     wide. Move the line to move the photo; right after a heading puts it
     beside that section. Delete the line to remove it.
   - `[[diskette: 80 | what she says]]` is a spot Diskette reacts to when
     the player drags from her eyes to within 80 pixels of it (add `shake`
     or `wide` before the words for a different reaction), and
     `[[diskette: page | what she says]]` is what she says about the whole
     page. While the panel is open, zones show in the game as a pink dot
     with a dashed circle of their reach. See GUIDE.md 7.10.
   - **+ Photo** adds a picture from your computer (shrunk to 480 px wide and
     saved as JPEG) and puts its line where your cursor is.
   Unsaved edits are kept in this browser, so a reload doesn't lose them.
3. **New pages.** A link to a page that doesn't exist yet is red (wavy in the
   text, red words in the game) and listed under the text with **Create**
   (or Ctrl/Cmd-click it, or click it in the game). **+ New page** makes one
   from scratch. Pick a look: *Winkipedia article* (searchable in Winkipedia),
   *Fan wiki page*, *Forum thread*, *Games archive page* or *Blank wiki page*.
   The page appears in the game straight away, and articles are searchable
   before you save. "Undo my changes" on an unsaved new page removes it.
   Pages can't be renamed or deleted from here (on purpose, for now); if a
   page isn't wanted, just remove the links to it.
4. **Save to preview…** shows every changed and new page, green lines added
   and red removed, then makes one commit on GitHub, credited to your name, on
   the branch this preview was built from. The preview rebuilds within about a
   minute; your changes keep showing in the meantime. From there they ship
   like any other change. Under the page name, "Last saved by …" says who
   last saved it from the editor.

**Tabs.** The panel has three: **Article** (the markup, above),
**Diskette** and **Game status**. **Save to preview…** sits under all three
and saves everything changed in any of them in one commit.

**Diskette tab: her reactions.** Everything Diskette says when the player
drags from her eyes (GUIDE.md 7.10), in three lists:
- **To write**: spots that need a line (their text is a `TODO P1-04 ...`
  note, which she ignores), most important first: P1 = needed to solve the
  demo, P2 = story, P3 = flavor. Write her line in the card and it replaces
  the note; the count on the tab goes down.
- **Zones & page comments**: the written ones, wherever they are.
- **Apps & things**: her lines for windows, icons, the clock, herself...
  (the `DisketteLooks` passage), plus the keys that have no line yet.

Cards are one line each (priority, what it is, where); click one to open
it. Open, it edits in place: her line (several lines = alternatives she
goes through when asked again, per **repeats**), the reach or slack in
pixels, her reaction (hop, shake her head, wide eyes), **only if** (event
names from Game status, comma-separated; `!name` = only before it), and
what she says **after "Thanks"**. Changes show in the game as you type.
**Show me** takes the game there and flashes the zone. Cards also work for
reactions in Mail, the NetCon ticket and the desktop, which the Article tab
can't open. The **?** buttons (here, in Game status, and the Article tab's
markup cheat sheet) open short explanations.

A zone covers **a point** with a reach, **words**, or **a photo or other
element** (GUIDE.md 7.10). New ones (all under **+ New**): **+ Point zone at the cursor**, **+ Zone:
click the game** (click words for a point at the end of that sentence, or a
photo for a zone on it), **+ Zone on selected words** (select them in the
markup or in the game first), **+ Zone on a photo / element**, **+ Page
comment**, and **+ Line for an app or thing**. **How it works** in the tab is
the short version of all this. While the panel is open, zones show in the
game (points as a dot with a dashed circle of their reach, words underlined,
elements outlined; pink when written, orange while still to write), and
**clicking one** (its dot or words), **pressing and holding** anywhere in its
reach, or **Alt-clicking** there opens its card. **Edit in markup** on a card
selects the zone in the Article tab.

**Game status tab: events.** The `GameEvents` list (GUIDE.md 7.16) with what
has happened in this playthrough so far: ✓ happened, → next, ○ not yet,
⚠ out of order, and everything else that happened (pages visited, windows
opened). Tick or untick one to fake it while testing (NEW GAME undoes it).

**GitHub access (once per browser).** Saving needs a fine-grained personal
access token: GitHub → Settings → Developer settings → Fine-grained tokens →
Generate new token; Repository access: *Only select repositories* →
`whosleolion/leolion.com`; Permissions → Repository permissions → add
*Contents* and switch its dropdown from *Read-only* (the default) to
*Read and write*. A read-only token gets as far as "Saving…" and then fails;
you can fix it by editing the token's permissions on GitHub, no need to make a
new one. Paste it under **GitHub access** in the panel. It's stored only in this
browser's localStorage for leolion.com; **Forget** removes it.

**Comments.** Select words in the text, write a note under **Comments on
this page**, and **Post comment**: the note is pinned to those words, which are
highlighted with a numbered tab in the text and in the game (only while the
panel is open, so playtesting still looks like the real game). Click a
highlight (in the game, click its number) to open the note; click a note to
jump to its words. **Reply** threads an answer under it. **Resolve** folds it
away (**Reopen** brings it back); you can **Delete** your own. If the pinned
words are edited away, the note says so; select new words and **Re-pin**, or
resolve it. The first time you post or save, it asks your name (**My name…**
changes it). Notes on other pages are listed with **Go**, which opens that page
at the note (Browse has to be out of the Trash). The ✎ button shows how many
notes are open, and everything refreshes every minute while the panel is open
(or press **Refresh**). Each comment is its own small commit to
`tools/skunkpets-redux/editor/comments.json` on the same branch; it doesn't
rebuild the preview. The repository is public, so so are the comments.

**If someone else changed the same page** since the preview was built (e.g. a
push from Claude), saving asks before overwriting it. Other pages' changes are
kept; only the pages you edited are replaced.

What it can't do (yet): rename or delete pages, or edit the game's other
passages (desktop, mail, Diskette). Those are still edited in the `.twee`.

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
