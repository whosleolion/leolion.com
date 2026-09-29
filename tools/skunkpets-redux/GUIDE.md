# Skunkpets Redux — How It All Works

A plain-language tour of the whole build. Read it top to bottom once and you'll
know where everything lives, why it's built the way it is, and how to change it.
Each system section ends with a **"Try it"** recipe you can follow to make your
own change.

---

## Contents

1. [The big picture](#1-the-big-picture)
2. [The files and the build loop](#2-the-files-and-the-build-loop)
3. [Reading the .twee file](#3-reading-the-twee-file)
4. [Harlowe in ten minutes](#4-harlowe-in-ten-minutes)
5. [The game's memory (variables)](#5-the-games-memory-variables)
6. [What happens when you press PLAY](#6-what-happens-when-you-press-play)
7. [The systems, one by one](#7-the-systems-one-by-one)
   - 7.1 [The monitor and CRT look](#71-the-monitor-and-crt-look)
   - 7.2 [Windows](#72-windows)
   - 7.3 [Taskbar, Start menu and clock](#73-taskbar-start-menu-and-clock)
   - 7.4 [Desktop icons, the grid and the Trash](#74-desktop-icons-the-grid-and-the-trash)
   - 7.5 [The web browser](#75-the-web-browser)
   - 7.6 [Winkipedia and search](#76-winkipedia-and-search)
   - 7.7 [The other websites](#77-the-other-websites)
   - 7.8 [Mail](#78-mail)
   - 7.9 [Popup dialogs](#79-popup-dialogs)
   - 7.10 [Diskette](#710-diskette)
   - 7.11 [READ_ME and Notes](#711-read_me-and-notes)
   - 7.12 [Sounds](#712-sounds)
   - 7.13 [The ending](#713-the-ending)
   - 7.14 [Small polish systems](#714-small-polish-systems)
8. [Art and images](#8-art-and-images)
9. [Gotchas and troubleshooting](#9-gotchas-and-troubleshooting)
10. [Glossary](#10-glossary)

---

## 1. The big picture

Skunkpets Redux is a **Twine** story that pretends to be an old Windows XP
computer. Twine stories are made of **passages** (named chunks of text and
code) written in a story language. This one uses **Harlowe 3.1**.

A useful way to think about it is a stage play:

| Part | Stage-play job | Where it lives |
|---|---|---|
| **Passages** (Harlowe) | The *script*: what's on stage and what happens when someone acts | The `:: Name` sections of `skunkpets-redux.twee` |
| **Stylesheet** (CSS) | The *set and costumes*: how everything looks | The `:: StoryStylesheet` section |
| **Script** (JavaScript) | The *stagehands*: physical stuff the script can't do alone (dragging, sounds, typing into boxes) | The `:: StoryScript` section |

The single most important idea in the whole build:

> **The desktop is redrawn from scratch every time anything changes.**
> The game keeps a list of facts in variables (which windows are open, which
> page the browser is on, what's in the Trash…). When you click something, the
> game changes a variable and then redraws the entire desktop from those facts.

This is why the code is so often `(set: ...)` followed by
`(replace: ?desktoproot)[(display: "RenderDesktop")]` — "change a fact, then
redraw". It keeps things simple: there's only one place (`RenderDesktop`) that
decides what the screen looks like.

The JavaScript's job is mostly to remember things Harlowe forgets on redraw
(exact window positions, minimized windows) and to handle physical
interactions like dragging.

---

## 2. The files and the build loop

The project lives in the **leolion.com GitHub repo** (`whosleolion/leolion.com`),
so you can work on it from any machine, or right in the browser on github.com.

| Where | What it is |
|---|---|
| `tools/skunkpets-redux/skunkpets-redux.twee` | **The game.** Every passage, the stylesheet and the script, in one text file. This is the only file you normally edit. |
| `tools/skunkpets-redux/build.js` | Turns the `.twee` file into the playable HTML page. |
| `tools/skunkpets-redux/playtest.mjs` | Plays the whole game automatically and reports anything broken. |
| `tools/skunkpets-redux/extract.js` | The reverse of build: pulls a `.twee` back out of a published HTML page. (Used once, at the start. You shouldn't need it.) |
| `tools/skunkpets-redux/diskette-cutout.png`, `diskette-icon.png` | Transparent cut-outs of Diskette, embedded into the page when you build. |
| `tools/skunkpets-redux/GUIDE.md` | This guide. (`README.md` next to it is the short version.) |
| `src/building/skunkpets-redux/index.html` | **The playable game** that the build writes, served at leolion.com/building/skunkpets-redux. |

### The loop

**On github.com (phone, any computer, no setup):**

1. Open `tools/skunkpets-redux/skunkpets-redux.twee` on github.com and press
   the ✏️ edit button.
2. Make your change and **Commit changes** to `master`.
3. That's it. The deploy workflow rebuilds the game and publishes it to
   leolion.com in a minute or two. You can watch it under the repo's
   **Actions** tab.

**On a computer with the repo cloned:**

1. **Edit** `tools/skunkpets-redux/skunkpets-redux.twee` in any text editor.
2. **Build** (from the repo folder):
   ```bash
   node tools/skunkpets-redux/build.js
   ```
3. **Test:** serve `src/` with any local web server and open
   `/building/skunkpets-redux/`, or run the playtest (see `README.md`).
4. **Publish:** commit and push to `master`. Pushing deploys automatically.

> Pushing to `master` publishes **the whole site** (`src/`), not just this game.
> That's how the repo already works; just avoid pushing half-finished edits to
> other pages at the same time.

### How build.js works (you don't need to, but in case)

The published HTML page contains the whole Harlowe engine plus a hidden
`<tw-storydata>` block holding your passages. `build.js` only rewrites that
block, which is why you don't need Twine or Tweego installed. While building it
also does two helpful things:

- **Embeds images** written as `url("inline:filename.png")` in the CSS, so the
  image travels inside the page (used for Diskette).
- **Generates the search index** passage `WinkiIndex` (see
  [7.6](#76-winkipedia-and-search)), so you never maintain it by hand.

### Publishing to tinypetgames too

Images load from `https://tinypetgames.neocities.org/...` by full address, so
the very same page works on both sites. To refresh the tinypetgames copy, build
into it and upload that file through the Neocities dashboard:

```bash
node tools/skunkpets-redux/build.js path/to/neocities-tinypetgames/skunkpets-redux/skunkpets-redux.html
```

---

## 3. Reading the .twee file

A `.twee` file is just passages one after another. Each starts with a header
line:

```
:: Tom Barry [wiki article] {"position":"475,475","size":"100,100"}
```

- `Tom Barry` is the passage's **name** (how other code refers to it).
- `[wiki article]` are **tags**, labels that change how the passage is treated.
- `{...}` is where the box sits in the Twine editor's map. Ignore it.

Everything until the next `::` line is the passage body.

### Tags used in this game

| Tag | Meaning |
|---|---|
| `startup` | Runs once when the game loads (`GameStart`). |
| `header` | Shown at the top of every passage (`PageHeader`, the fullscreen button). |
| `stylesheet` / `script` | The CSS and JavaScript sections. |
| `wiki` | A page the in-game **browser** can show. |
| `article` | A Winkipedia encyclopedia article (makes it **searchable**). |
| `fanwiki`, `gamesarchive`, `devlink` | Which in-game website a page belongs to (for your own organisation). |

### A map of the passages

| Group | Passages |
|---|---|
| **Start** | `Desktop` (the PLAY splash), `GameStart`, `PageHeader`, `DESKTOP START` |
| **Drawing the desktop** | `RenderDesktop`, `RenderBrowserChrome`, `RenderBookmarks`, `RenderMailInbox`, `RenderDiskette`, `DisketteTopic` |
| **Actions ("func-")** | `func-open`, `func-navigate`, `func-back`, `func-forward`, `func-restore`, `func-trash`, `func-dialog-ok`, `DesktopActions` |
| **Winkipedia** | `Winkipedia`, `Winkipedia Search Result`, and the 14 `article` pages (Skunkpets, Tom Barry, …) |
| **Fan wiki** | `Skunkpets Fan Wiki`, `FanWiki: …`, `Forum: …`, `forum-user-…`, `img-fanwikibar`, `func-screenshot-bruce` (the clickable screenshot in a forum thread) |
| **Games archive** | `globalgamesarchive.co.uk`, `kraska1`, `kraska1: …`, `img-gamesarch`, `img-kraskabar` |
| **Login** | `devlink-userbase: login`, `devlink-userbase: logged in` |
| **Other pages** | `New Tab`, `Skunkpets.com` (404) |
| **Sound snippets** | `sound-email`, `sound-demo-end` |
| **Ending** | `DemoEnd`, `WIN` |
| **Leftovers** | `Welcome Page`, `Second Page` (old test pages that only link to each other; safe to delete) |

---

## 4. Harlowe in ten minutes

Just what you need to read this game's code.

### Variables

```
(set: $browserPage to "Tom Barry")
```

- `$name`: a **story variable**. Remembered for the whole game.
- `_name`: a **temporary variable**. Forgotten quickly (see gotcha below).

Values can be text (`"hello"`), numbers, `true`/`false`, **arrays** (lists,
`(a: "browser", "mail")`) and **datamaps** (labelled records,
`(dm: "from", "someone@site.net", "subject", "hi")`).

Useful list tricks used everywhere:

```
(set: $openWindows to it + (a: "mail"))     <- add "mail" to the list
(set: $openWindows to it - (a: "mail"))     <- remove it
(if: $openWindows contains "mail")[...]     <- is it in the list?
```

### Hooks: the square brackets

A **hook** is a chunk of passage in `[ ]` that something acts on:

```
(if: $mailRead's length < $mailAll's length)[You have mail!]
```

A hook can have a **name** so other code can find it:

```
|desktoproot>[ ...the whole desktop... ]
```

and then `?desktoproot` refers to it:

```
(replace: ?desktoproot)[(display: "RenderDesktop")]   <- redraw the desktop
```

### The macros this game leans on

| Macro | Plain English |
|---|---|
| `(set: $x to ...)` | Remember a fact. |
| `(if: ...)[ ]` `(else-if: ...)[ ]` `(else:)[ ]` `(unless: ...)[ ]` | Only show/do this when… |
| `(display: "Passage")` | Paste another passage's contents here. Used like a function call. |
| `(replace: ?hook)[...]` | Swap a named hook's contents. |
| `(link: "text")[...]` | A clickable link; runs the hook when clicked (once). `(link-repeat:)` can be clicked again and again. |
| `(click: ?hook)[...]` | Make an existing named hook clickable. |
| `(for: each _item, ...$list)[...]` | Repeat for every item in a list (used for the mail inbox). |
| `(live: 2s)[...]` + `(stop:)` | A timer: run after 2 seconds (the `(stop:)` makes it run once). |
| `(go-to: "Passage")` | Leave for a whole new passage (only used for the splash → desktop and the ending). |
| `(print: ...)` | Output text or HTML built from variables, e.g. `(print: '<img src="' + $artroot + 'ui/mail.png">')`. |

### Whitespace

- **Every newline becomes a line break** on screen. That's why lots of desktop
  code is written on long single lines, and why the CSS hides stray `<br>`s in
  the desktop chrome.
- `{ ... }` around code **collapses whitespace** (no stray line breaks). Most
  `func-` passages are wrapped in `{ }`.
- A `\` at the end of a line joins it to the next line (no break).

---

## 5. The game's memory (variables)

All set up in `GameStart`. If you ever wonder "where does the game keep track
of X?", it's one of these.

| Variable | What it remembers |
|---|---|
| `$desktopItems` | Which items are on the desktop, e.g. `(a: "readme", "recycle")`. |
| `$trashItems` | Which items are in the Trash, e.g. `(a: "browser", "mail", "notes", "diskette")`. |
| `$openWindows` | Which windows are open, e.g. `(a: "browser", "mail")`. |
| `$openPending`, `$restorePending`, `$trashPending`, `$navPending` | "Arguments" handed to a `func-` passage just before it's displayed (Harlowe 3.1 functions can't take parameters). |
| `$focusWin`, `$focusSeq` | A request to bring a window to the front (see [7.2](#72-windows)). |
| `$startOpen` | Is the Start menu open? |
| `$browserPage` | The page the browser is showing (a passage name). |
| `$navHistory`, `$navForward` | Pages for the Back and Forward buttons. |
| `$home` | The page the browser opens on (`"New Tab"`). |
| `$uiBookmarks` | Bookmarks (starts as Winkipedia and Skunkpets.com). |
| `$starbarOpen` | Is the bookmark menu open? |
| `$navBlocked` | Pages that can't be bookmarked. |
| `$mailAll` | Every email, newest first, as datamaps with `id`, `from`, `subject`, `body`. |
| `$mailRead` | IDs of emails that have been read. |
| `$mailOpen` | ID of the email currently expanded (0 = none). |
| `$mail4Sent` | Has the post-login "stop" email been sent yet? |
| `$dialog`, `$dialogTitle`, `$dialogIcon`, `$dialogOk`, `$dialogAction`, `$dialogCancel` | The popup box (see [7.9](#79-popup-dialogs)). |
| `$disketteTopic` | What Diskette is currently explaining (`""` = her main menu). |
| `$imgroot`, `$artroot` | Base folders for images (see [8](#8-art-and-images)). |

---

## 6. What happens when you press PLAY

1. The page loads and **`GameStart`** (tagged `startup`) runs, setting every
   variable above.
2. The first passage shown is **`Desktop`**: the black splash with the PLAY
   button. (`PageHeader` adds the fullscreen button to every passage.)
3. PLAY does `(go-to: "DESKTOP START")`.
4. **`DESKTOP START`** is tiny. It creates three named hooks and then never
   changes again:

   ```
   |desktoproot>[(display: "RenderDesktop")]   <- the whole visible desktop
   |sfx>[]                                     <- a place to play sounds
   |actions>[(display: "DesktopActions")]      <- hidden links JavaScript can press
   ```

5. **`RenderDesktop`** draws the monitor, icons, open windows, taskbar, popups
   and Diskette, all from the variables.
6. From then on, every interaction is "change variables, then
   `(replace: ?desktoproot)[(display: "RenderDesktop")]`".

The only other passage change is the ending, `DemoEnd` → `WIN`.

---

## 7. The systems, one by one

### 7.1 The monitor and CRT look

**What you see:** the XP desktop floating on black, with curved-glass edges, a
soft glow bleeding past them, scanlines and a faint flicker.

**Where:** CSS section `MONITOR`; `fitMonitor()` in the script.

**How it works**, back to front:

- `.monitor` is a fixed **960 × 720** box, the size of the original art.
  JavaScript (`fitMonitor`) measures the browser window and scales the whole
  box up or down to fit, so everything inside can use simple fixed pixel
  positions.
- `.monitor-glow` is a blurred, brightened copy of the wallpaper behind the
  screen. The blur spills past the screen edge into the black, which reads as
  light bleed.
- `.playfield` is the screen itself. Its shape comes from an **SVG mask**, a
  drawn rounded rectangle whose edges bow slightly outward, softly blurred. The
  mask hides everything outside that shape, so the screen looks like curved
  glass.
- `.wallpaper` is Bliss, cropped out of the original `bg-desktop.png` art using
  background positioning.
- `.crt` sits on top of everything: scanline stripes, a dark vignette, a faint
  glass sheen, an inner bevel glow, and `.crt::after`, a white layer whose
  opacity flickers between 0 and 3%. It has `pointer-events: none` so clicks
  pass straight through it. The flicker switches off for players who've asked
  their computer for reduced motion.

**Try it:** make the flicker stronger by raising the `opacity` numbers in
`@keyframes crtFlicker` (they're 0.000–0.030 now).

### 7.2 Windows

**What you see:** XP-style windows you can drag, minimize, close and click to
bring forward, each with a taskbar button.

**Where:** each window is written out in `RenderDesktop`; window behaviour is
in the script sections `TASKBAR / WINDOW SETUP`, `GENERIC DRAGGING ENGINE` and
`FOCUS REQUESTS`; the look is CSS `WINDOWS (XP Luna)` and
`XP LUNA BUTTON PRIMITIVES`.

**How a window is declared** (Mail, trimmed):

```
(if: $openWindows contains "mail")[
  <div class="panel" data-window-template="mail" data-title="Mail Client" style="top: 80px; left: 220px; width: 540px; height: 380px;">
    <div class="panel-bar">
      <span class="panel-title"><span class="panel-icon"></span>Mail Client</span>
      <div class="panel-controls">
        <button class="panel-minimize" type="button"></button>
        |close-mail>[<button class="panel-close" type="button"></button>]
      </div>
    </div>
    <div class="panel-body mail-panel-body">(display: "RenderMailInbox")</div>
  </div>
  (click: ?close-mail)[(set: $openWindows to $openWindows - (a:"mail"))(replace: ?desktoproot)[(display: "RenderDesktop")]]
]
```

- **Open/closed** is Harlowe's job: the window only exists while its name is
  in `$openWindows`. The × button removes it and redraws.
- **Dragging, stacking, minimizing and taskbar buttons** are JavaScript's job.
  Every 250 ms, and whenever the page changes, `initDesktopUI()` scans for new
  `.panel` elements and wires them up. Because redraws create brand-new
  elements, JavaScript keeps its own notes, `windowPositions`,
  `windowZIndices` and `minimizedWindows`, and re-applies them to each fresh
  window. That's why a dragged window stays put when the desktop redraws.
- **Opening** goes through `func-open`: it adds the window to `$openWindows`
  and makes a **focus request**.

**Focus requests (how Harlowe asks JavaScript to do something).** Harlowe
can't call JavaScript directly. So when a window should jump to the front,
`func-open` increases `$focusSeq` and sets `$focusWin`. `RenderDesktop` prints
both into a hidden marker, and the script (`handleFocusRequest`) notices the
new number and brings that window forward. Each number is handled once.

**Try it: add a new window.** Copy the Mail block in `RenderDesktop`, change
every `mail` to your name (say `calc`), set a size and position in `style`,
and put your content in `panel-body`. Open it from anywhere with
`(set: $openPending to "calc")(display: "func-open")`. For a title-bar icon,
add a line to the CSS near
`.panel[data-window-template="mail"] .panel-icon`.

### 7.3 Taskbar, Start menu and clock

**Where:** the `taskbar` and `start-menu` blocks near the end of
`RenderDesktop`; CSS `TASKBAR + START MENU`; script `TASKBAR CLOCK`.

- The **taskbar** is drawn by `RenderDesktop`. Its window buttons are added by
  JavaScript (`addTaskbarItem`) into `.taskbar-tasks`, one per window.
  Clicking one restores a minimized window and brings it forward.
- The **Start button** toggles `$startOpen`. The Start menu lists only apps
  that are on the desktop, `(if: $desktopItems contains "browser")[...]`, so
  the Trash can't be bypassed. A see-through `.start-overlay` behind the menu
  closes it when you click anywhere else.
- The **clock** is filled in by `updateClock()` with your real local time.
- The bar is 34 px tall but only 25 px show; the bottom 9 px tuck under the
  curved glass edge so its buttons never get clipped.

### 7.4 Desktop icons, the grid and the Trash

**What you see:** you start with only READ_ME.txt and the Trash. Everything
else is inside the Trash. Drag things out to use them, drag them back in to
throw them away, and icons always snap to a grid.

**Where:** icons are near the top of `RenderDesktop`; the Trash window is the
`recycle` block; script sections `DESKTOP ICONS`, `ICON POSITIONS + DESKTOP GRID`
and `TRASH — DRAG ITEMS BACK ONTO THE DESKTOP`; passages `DesktopActions`,
`func-restore`, `func-trash`.

**Which items exist where** is just two lists, `$desktopItems` and
`$trashItems`. Each desktop icon is wrapped in
`(if: $desktopItems contains "...")[...]`, and each Trash entry in
`(if: $trashItems contains "...")[...]`.

**Double-clicking an icon.** A single click only selects it (the script
stops the click from reaching Harlowe). A double-click passes a click through
to the icon's `(click: ?icon-...)` hook, which calls `func-open`.

**The grid.** The script defines the grid in one line:

```js
const GRID = { left: 26, top: 22, width: 92, height: 94, iconWidth: 82, iconHeight: 90 };
```

That makes 10 columns × 7 rows. `nearestFreeCell()` finds the closest cell
nobody else is using. Dropping an icon anywhere snaps it there, and the spot is
remembered in `iconPositions` so redraws don't undo it.

**Talking to Harlowe from JavaScript (the hidden-link trick).** Dragging is
JavaScript, but "move Mail out of the Trash" has to change Harlowe variables,
which JavaScript can't touch. So `DesktopActions` renders a hidden list of
Harlowe links:

```
(link-repeat: "restore:mail")[(set: $restorePending to "mail")(display: "func-restore")]
(link-repeat: "trash:mail")[(set: $trashPending to "mail")(display: "func-trash")]
```

The script finds the link whose text matches and "clicks" it
(`runDesktopAction("restore:mail")`). This same trick is used by the logins
and searches too. It lives in `DESKTOP START`, outside `desktoproot`, so the
links survive every redraw.

**Dragging out of the Trash** (`startBinDrag`): press on an item, a
see-through "ghost" icon follows the mouse, and letting go over open desktop
(not over a window or the taskbar) snaps to the nearest free cell and runs
`restore:<item>`. **Dragging back in** is handled by the normal icon drag: if
you let go over the Trash icon or the open Trash window, it runs
`trash:<item>`, which also closes that app's window. `TRASHABLE` lists what
can be thrown away (everything but the Trash itself).

**Try it: add a new app that starts in the Trash** (say `calc`):
1. `GameStart`: add `"calc"` to `$trashItems`.
2. `RenderDesktop`: add a desktop icon block (copy Notes'), a Trash entry
   (copy Notes' `bin-icon`), a Start-menu line and a window (7.2).
3. `DesktopActions`: add `restore:calc` and `trash:calc` links.
4. Script: add `"calc"` to `TRASHABLE`.

### 7.5 The web browser

**Where:** the `browser` window in `RenderDesktop`; `RenderBrowserChrome`
(Back/Forward/★ bar); `RenderBookmarks`; `func-navigate`, `func-back`,
`func-forward`; CSS `BROWSER WINDOW`.

- **Every web page is a passage tagged `wiki`.** The browser just does
  `(display: $browserPage)` inside its window.
- **Going somewhere:**
  `(set: $navPending to "Tom Barry")(display: "func-navigate")`. That pushes
  the current page onto `$navHistory`, clears `$navForward` and changes
  `$browserPage`. This one line is how every link in every wiki page works.
- **Back/Forward** move pages between `$navHistory` and `$navForward`.
- **Bookmarks:** the ★ button opens `RenderBookmarks`, which lists
  `$uiBookmarks` and lets you star or unstar the current page. Pages in
  `$navBlocked` can't be starred.

**Try it: add a new web page.**

```
:: My New Page [wiki]
<div class="wiki-article">\
<h1>My New Page</h1>\
Some text, and a link back to (link: "Tom Barry")[(set: $navPending to "Tom Barry")(display: "func-navigate")].
</div>
```

Link to it from another page with
`(link: "my page")[(set: $navPending to "My New Page")(display: "func-navigate")]`.
Add `article` to its tags if it should be findable in Winkipedia.

### 7.6 Winkipedia and search

**Where:** passages `Winkipedia`, `Winkipedia Search Result`; script
`WINKIPEDIA — SEARCH`; the index is generated by `build.js`.

- Searching **"skunkpets"** or **"skunkpets.com"** always opens the Skunkpets
  article (through a hidden link in the `Winkipedia` passage).
- Otherwise search matches an article's **exact name**, ignoring capitals and
  extra spaces. The list of searchable pages is the generated `WinkiIndex`
  passage: one hidden link per passage tagged **`article`**. To make a page
  searchable, tag it `article` and rebuild.
- **Experiment, switched off:** with `WINKI_REAL_FALLBACK = true` in the
  script, a search with no in-game article opens the real Wikipedia article in
  an iframe on the `Winkipedia Search Result` page.

### 7.7 The other websites

- **Skunkpets Fan Wiki** and its pages (`fanwiki` tag) share the banner
  `img-fanwikibar`. Forum posts reuse small `forum-user-…` passages for each
  poster's avatar and details.
- **Global Games Archive** (`globalgamesarchive.co.uk`) has a search box
  handled by the script (`GLOBAL GAMES ARCHIVE — SEARCH`). Searching "kraska",
  "bad door", "skunkpets" (and a few others) presses a hidden link to `kraska1`.
- **kraska1** pages embed the minigames in `<iframe>`s from
  tinypetgames.neocities.org. The "devlink-userbase" link shows an "exiting to
  external website" popup first.
- **devlink-userbase login** is plain HTML inputs with the checking done in
  the script (`DEVLINK-USERBASE — LOGIN + PASSWORD RECOVERY`). The right
  details are **bruce1 / thegoldwoman**. With the right username but wrong
  password, "Forgot password?" appears; the answer "josh" reveals the hint.
  Success presses a hidden link to `devlink-userbase: logged in`.
- **Skunkpets.com** is a fake Apache "404 Not Found" page.

### 7.8 Mail

**Where:** `RenderMailInbox`; `devlink-userbase: logged in`; CSS
`MAIL CLIENT`.

- Emails are datamaps in `$mailAll`, **newest first**. The inbox starts empty
  ("Your inbox is empty").
- Clicking a subject marks it read (adds its id to `$mailRead`) and expands it
  (`$mailOpen`). The Mail icon shows the red "1" badge whenever
  `$mailRead` is shorter than `$mailAll`.
- **The only email in the story** arrives 4 seconds after logging in: the
  `logged in` page runs a `(live: 4s)` timer (guarded by `$mail4Sent` so it
  fires once), adds email id 4, plays the email sound, and shows the
  "You have one new email message. / Open Now" popup. Email 4's body is
  special-cased in `RenderMailInbox` so its "game over" link can start the
  ending.

**Try it: send an email.** Anywhere in a passage:

```
(set: $mailAll to (a: (dm: "id", 5, "from", "someone@oversoft.net", "subject", "hello", "body", "Just saying hi.")) + $mailAll)
(replace: ?sfx)[(display: "sound-email")]
```

Give each email a new `id`. For links or formatting in the body, add a
special case next to `(if: _msg's id is 4)` in `RenderMailInbox`.

### 7.9 Popup dialogs

Harlowe 3.1 has no built-in in-page popup, so there's a homemade one at the
end of `RenderDesktop`. To show one, set its variables and redraw:

```
(set: $dialog to "Something happened!")
(set: $dialogTitle to "Alert")
(set: $dialogIcon to "info")     <- or "mail" for the envelope icon
(set: $dialogOk to "OK")         <- button text
(set: $dialogAction to "")       <- what OK does (see func-dialog-ok)
(set: $dialogCancel to false)    <- true adds a Cancel button
(replace: ?desktoproot)[(display: "RenderDesktop")]
```

OK runs `func-dialog-ok`, which clears the popup and then does its action:
`"openmail"` opens Mail, `"devlink"` goes to the login page, `""` does nothing
else. Add your own actions there.

### 7.10 Diskette

**What you see:** drag Diskette out of the Trash, double-click her, and she
appears bottom-right like the old Office helper, with a pale-yellow speech
bubble offering to explain the apps you have.

**Where:** `RenderDiskette` (her bubble and menu), `DisketteTopic` (her
answers), CSS `DISKETTE`.

- She isn't a window. When `"diskette"` is in `$openWindows`,
  `RenderDesktop` displays `RenderDiskette`, a floating character with no
  taskbar button.
- Her menu only lists apps that are in `$desktopItems`, and adds a nudge if
  `$trashItems` isn't empty.
- Choosing a topic sets `$disketteTopic`; `DisketteTopic` holds one answer per
  topic. Edit the text there to change what she says.

**Try it:** give her something new to say about the browser by editing the
`(if: $disketteTopic is "browser")[...]` line in `DisketteTopic`.

### 7.11 READ_ME and Notes

- **READ_ME.txt** is a desktop icon drawn in CSS (a page with a folded corner)
  that opens a Notepad-style window with the store's message. Edit the text in
  the `readme` window in `RenderDesktop`.
- **Notes** is a text box. The script (`NOTES WINDOW`) saves what you type in
  the browser's local storage, so it survives closing the window and even
  reloading the page.

### 7.12 Sounds

| Sound | How |
|---|---|
| **Email arrives** | `(replace: ?sfx)[(display: "sound-email")]`. The `sfx` hook sits outside the desktop, so redraws can't cut the sound off. |
| **Every click** | A quiet click added by the script (`CLICK SOUND`) to links and buttons. |
| **Dragging out of the Trash** | A pick-up tick and a set-down thunk, synthesized live in the browser (`UI SOUNDS`). To use recorded sounds instead, put their URLs in `UI_SOUND_FILES`. |
| **Ending** | `sound-demo-end`, played by `DemoEnd`. |
| **Skunkpets music** | "Comfortable Mystery" (Kevin MacLeod, CC BY 4.0), started by the Skunkpets zoom (below). The file is `src/building/skunkpets-redux/comfortable-mystery.mp3`; the tinypetgames copy streams it from leolion.com. CC BY requires the credit line on the ending card, so keep it. |

**The Skunkpets zoom** (script section `THE SKUNKPETS ZOOM`). The monitor
starts at 80% size (`ZOOM_START`). The first time the Skunkpets Winkipedia
article appears (it carries a hidden `<span class="zoom-trigger">`), the song
starts and the monitor grows to full size over `ZOOM_SECONDS` (60). Once per
visit; the song fades out at the demo end. To trigger it from a different
page, move the `zoom-trigger` span into that passage. The zoom multiplies
into the monitor's scale through the `--monitor-zoom` CSS variable.

### 7.13 The ending

Clicking "game over" in the "stop" email does `(go-to: "DemoEnd")`: a
glitchy black flicker (CSS `DEMO END TRANSITION SCREEN`) plus the end sound,
then after 3.5 seconds `WIN`, the "THANK YOU FOR PLAYING / REMEMBER SKUNKPETS?"
card, which fades in with the playtest survey link.

### 7.14 Small polish systems

- **Text selection** (CSS at the top, plus script `SELECT ALL`): the desktop
  chrome can't be highlighted; only page text, mail bodies and text boxes
  can. Ctrl+A only selects the page you last clicked in.
- **Fullscreen button:** `PageHeader` plus script `FULLSCREEN TOGGLE`.
- **Custom cursors and fonts:** CSS `RETRO PIXEL CURSOR` and the `@import` of
  Dokdo, Goldman, Press Start 2P and Tiny5 at the top of the stylesheet.
- **Boot flash:** the playfield plays `skunkpetsPowerOn` once when it first
  appears.
- **Lightbox:** clicking a `.lightbox-thumb` image (like the screenshot in the
  forum) opens it full size.

---

## 8. Art and images

- `$artroot` = `https://tinypetgames.neocities.org/skunkpets/img/`: the
  **original game's art** (desktop icons, wallpaper, login mascot, loading GIF,
  cursors).
- `$imgroot` = `https://tinypetgames.neocities.org/assets/img/`: the **redux
  content art** (pets, junkmates, banners, avatars).
- Both point at tinypetgames by full address, so the page works wherever it's
  hosted. New art has to be uploaded to tinypetgames first, or embedded with
  `inline:` (see below).
- Images are usually printed with
  `(print: '<img src="' + $artroot + 'ui/mail.png">')` because Harlowe can't
  put a variable directly inside an HTML attribute.
- **Diskette's cut-outs** are made from `skunkpets/img/misc/diskette.png` with
  the white background removed. They're embedded into the page at build time
  via `url("inline:...")`, so they don't need uploading anywhere.
- The **icons' labels are part of the art** ("Mail", "Browse" etc. are baked
  into the PNGs). READ_ME and Diskette don't have baked labels, so they use a
  CSS caption styled to match.

---

## 9. Gotchas and troubleshooting

**Harlowe 3.1 quirks that bit this project:**

- **Temporary variables die at the end of their hook.** `_x` set inside an
  `(if:)[...]` doesn't exist outside it. The mail inbox once broke this way.
- **Underscore followed by letters looks like a variable.** Writing
  `READ_ME.txt` in passage text makes Harlowe look for a variable `_ME`. Use
  `READ&#95;ME.txt` instead.
- **House style:** `(click: ?hook)` always goes on its own line, after the hook
  it applies to. Stick to that and your code will match the rest.
- **`(passages: where ...)` doesn't work in 3.1**, which is why the search
  index is generated by `build.js`.
- **`(dialog:)` doesn't exist in 3.1**, hence the homemade popup.

**Errors show up as purple boxes** in the game with a ▶ to expand the details.
Search the `.twee` for the passage mentioned.

**"My change isn't showing":**
- Did you run `node tools/skunkpets-redux/build.js`? (Not needed if you edited
  on github.com; the deploy does it.)
- Did the deploy finish? Check the repo's **Actions** tab; a red ✗ means the
  build or upload failed, and clicking it shows why.
- Harlowe **remembers your last session** in the browser tab, so a reload can
  drop you back mid-game with old variables. Open a new tab or window.
- Test through a local web server rather than opening the HTML file straight
  from disk; browsers restrict some features for files opened from disk.

**Layout looks broken after an edit:** remember that newlines become line
breaks. If a stray gap appears in a window, the fix is usually joining lines
with `\` or wrapping code in `{ }`.

---

## 10. Glossary

| Term | Meaning |
|---|---|
| **Passage** | A named chunk of the story. |
| **Twee** | The plain-text format for writing a Twine story as one file. |
| **Harlowe** | The story language (version 3.1) this game is written in. |
| **Macro** | A Harlowe command in parentheses, like `(set:)` or `(if:)`. |
| **Hook** | A `[ ]` chunk of passage that a macro acts on; can be named `|name>[ ]`. |
| **Datamap** | A labelled record: `(dm: "from", "x", "subject", "y")`. |
| **Render passage** | A passage whose only job is to draw part of the screen (`Render…`). |
| **func- passage** | A passage used like a function: set some `$...Pending` variables, then display it. |
| **Redraw** | `(replace: ?desktoproot)[(display: "RenderDesktop")]`: rebuild the desktop from variables. |
| **Hidden link trick** | JavaScript clicking an invisible Harlowe link to change Harlowe variables. |
| **Focus request** | Harlowe asking JavaScript to bring a window forward, via `$focusWin`/`$focusSeq`. |
| **Playfield** | The screen area inside the monitor where everything happens. |
| **CRT overlay** | The top layer that adds scanlines, glow and flicker. |
| **Inline image** | An image embedded directly in the page at build time (`url("inline:...")`). |
