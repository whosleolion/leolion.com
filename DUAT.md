# Duat: authoring guide

Duat is our lightweight campaign catalog: a wiki-ish, Obsidian-flavored quickref that runs as plain static files (no build step, no CMS). The engine lives at `src/duat/engine/`. Each campaign is a folder beside it.

Pilot campaign: **Vista City Mondays** → `src/duat/vcm/` → https://leolion.com/duat/vcm/ (noindexed and not linked from the main site).

## Campaign folder

```
src/duat/vcm/
  index.html      shell (copy it for a new campaign; only the <title> changes)
  world.json      title, theme, entry list
  entries/*.md    one Markdown file per entry
  images/         portraits, maps, handouts
```

### world.json

```jsonc
{
  "title": "Vista City Mondays",
  "short": "VCM",                      // brand text on phones
  "kicker": "Player quickref",
  "subtitle": "Everything the crew knows so far.",
  "home": "home",                      // entry whose body shows on the home page
  "theme": { "accent": "#ff5a36" },    // overrides any CSS token: bg, panel, text, muted, accent, font-display…
  "types": { "gang": { "label": "Gangs", "one": "Gang", "color": "#e66" } },   // optional: add/rename types
  "typeOrder": ["map", "character", "location", "faction", "item", "session", "note"],
  "navTypes": ["map", "pc", "session", "character", "faction"],  // types in the top bar and on the home page; the rest are found via maps, links and search
  "newestFirst": ["session"],          // types listed newest-first
  "mapMajorTypes": ["district"],       // pins always labeled; other pins' labels appear as you zoom in
  "entries": ["home", "vista-city", "sample-character"]
}
```

(Real JSON has no comments. They're here only to explain the fields.)

**To add an entry, create `entries/<slug>.md` and add `<slug>` to `entries`.** An entry that's missing from the list won't show up.

## Entries

```markdown
---
title: Marla Voss
type: character            # map | character | location | faction | item | session | note | anything else
aliases: [The Widow, Marla]
tags: [npc, docks]
image: marla.jpg           # bare filename = images/marla.jpg
summary: Optional. Otherwise the first paragraph is used.
order: 1                   # optional sort key (sessions, etc.)
hidden: true               # optional: reachable by link but not listed or searchable
# any other key becomes a row in the infobox:
affiliation: "[[The Lantern Society]]"
status: Missing
---
Body in Markdown.
```

Markdown supports headings, **bold**, *italic*, ~~strike~~, ==highlight==, nested lists, `- [ ]` checkboxes, tables, quotes, images, code, and:

- `[[Entry Title]]`, `[[slug]]`, `[[alias]]`, `[[Title|shown text]]` are wikilinks. A link to something that doesn't exist yet shows as dashed "unwritten" text, so you can link first and write later.
- `![[picture.png]]` embeds an image from `images/`.
- `::: leo` … `:::` wraps one person's account. Several people can write about the same thing (e.g. the GM's recap and a player's notes on the same session), and each block is labeled with its author. Authors live in `world.json` under `"authors": { "leo": { "name": "Leo", "role": "GM", "color": "#ff5a36" } }`. For a whole entry by one person, use `author: leo` in the frontmatter instead. Every author gets a page at `#/by/<id>`.
- Callouts work like Obsidian's: `> [!rumor] Heard at the bar` (also note, tip, warning, danger, quote, question).

The "Mentioned in" (backlinks) and "On the map" sections build themselves; the GM can switch either off per page (`showmentions: false`, `showmap: false`).

## Maps

A map is an entry with `type: map` and an `image:`. Pins go in a `pins` block anywhere in the body:

````markdown
```pins
55.3, 41.5 | [[Sample Location]]
71, 66     | [[Sample Faction|Faction HQ]] | Optional note shown in the pin card.
14, 34     | The Docks | Plain label with no entry.
```
````

Add `pins: labels` to a map's frontmatter to make each pin a name plate (the label itself is the tap target) instead of a dot + label. Labels come in tiers so the zoomed-out view stays readable: pins for `mapMajorTypes` entries always show; other linked pins appear once you zoom in a bit, and plain pins (roads, terrain) after that.

Coordinates are percentages of the image (x from the left, y from the top). You rarely need to type them: the 📍 button on a map places pins by tapping (see Shared editing).

A map can also take an `overlay:` image: a transparent drawing (roads, walls, bridges…) stacked on top of the base art in the same pixel space, so it pans and zooms with it. Vista City uses Leo's painted map (`images/vista-city.webp`) with `images/vista-city-overlay.svg` on top. Any image works, so a "map" can also be an infomap: a relationship web, an org chart, or a district diagram.

To link straight to a pin, use `#/e/vista-city?pin=sample-location`.

## Shared editing

Everything in the catalog can be entered from the page itself; the files are just the starting point.

- **＋ New** (top bar) adds a page: name, category, the category's own fields, and your notes. While you type the name it checks every page (hidden ones too) by name and nickname: an exact match (ignoring case, punctuation and a leading "The") is blocked with a link to the existing page; close spellings and shared words are listed, and you confirm by pressing Create again. It also notes where the name is already written as a `[[link]]`. A map needs its image uploaded.
- **✎ Edit → Notes**: write your own notes on any page in plain markup. They show as "Name's notes", and other people's notes are never touched. Typing `[[` pops up a list of matching pages; **? Markup** opens a cheat sheet (links, bold, headings, lists, quotes, callouts, tables).
- **✎ Edit → Page details**: name (renaming keeps the old name as a nickname, so links don't break), category, the category's fields, nicknames and other spellings, tags, other info rows (label + value, markup), a short description, and a picture. Maps also get their display settings: name-plate pins, which categories are always labeled, and an overlay drawing.
- **The home page** (kicker, tagline and welcome text): the ✎ Edit beside the title (GM only).
- **📍 on a map**: tap the map to add a pin (pick a page, or type a plain label), tap a pin to change, move or remove it, then **Save pins**.

**Signing in** is the name chip in the top bar ("Sign in"): pick your name and enter the passkey. You stay signed in on that device; the chip then shows your name, and its menu has GM tools (for the GM) and Sign out. Tapping ✎ Edit while signed out asks you to sign in first.

**The GM's writing is the page.** The person whose role is "GM" (or `world.json` `"gm": "leo"`) writes the page's own text: it shows without any name label. Everyone else's notes appear as labeled blocks ("Thomas's notes"), with chips under the title.

**GM passkey.** Signing in with the GM passkey (`edit.gmHash`) adds a "Notes by" picker (edit anyone's notes), and in Page details: hide, show or hide the "On the map" and "Mentioned in" sections, merge into another page (notes move over, the name becomes a nickname), and delete. **GM tools** is in the name chip's menu.

**Campaign settings (GM tools).** Title, short name, accent color; the people who can sign in (name, role, color); categories (plural/singular names, color, order, their **fields**, and whether each is in the top bar, listed newest-first, or always labeled on maps); and new passkeys.

**Category fields.** Each category lists the fields its pages have, and Page details / ＋ New show exactly those. A field has a name and a kind: *Text*, *Page link* (stored as `[[Page]]`), *Number*, *Date*, or *Sort number* (at most one per category; the category is ordered by it, like a session number). They appear first in the info box, in the listed order. In `world.json` they live under `types.<id>.fields`, e.g. `"session": { "fields": [{ "label": "Session number", "kind": "sort" }, { "label": "Date", "kind": "date" }] }`. Saved as the campaign's settings row, which overrides `world.json` at load. Renaming the campaign is safe: edits are keyed to its fixed id.

**New campaigns (GM tools → Start a new campaign).** Give it a name and a welcome text. It lives entirely in the save service and opens at `/duat/play/?w=<link-name>`, starting with the current campaign's categories and just you as a player. Everything else, including maps, is added from the site.

**Folding edits back into the files.** Site edits are rows in the "Duat edits" sheet, layered over the `.md` files when a page loads. To make the files the single source again: GM tools → **Download export**, then run

```
python3 duat-backend/apply_export.py duat-export-<world>-<date>.json src/duat/vcm
```

commit and deploy, and finally GM tools → **Clear shared edits**.

Config lives in `world.json`:

```json
"edit": { "endpoint": "<web app URL>", "keyHash": "<sha256 of the passkey>", "gmHash": "<sha256 of the GM passkey>" }
```

- **`endpoint` empty:** preview mode. Edits (and uploaded pictures) save in that browser only.
- **`endpoint` set:** shared. Edits go to a small Google Apps Script (`duat-backend/Code.gs`) that keeps them in a Google Sheet in the GM's Drive and stores uploaded pictures in a "Duat uploads" Drive folder. To set it up (about 2 minutes):
  1. Go to script.google.com, create a New project, and paste in `duat-backend/Code.gs`.
  2. Click Deploy → New deployment → Web app. Set *Execute as: Me* and *Who has access: Anyone*, then Deploy. Authorize it when asked (it needs Sheets and Drive).
  3. Copy the web app URL (it ends in `/exec`) into `world.json` `edit.endpoint`.

  **Updating the script later:** paste the new code, then Deploy → Manage deployments → ✎ → Version: *New version* → Deploy. That keeps the same URL.

Passkeys are changed from Campaign settings; the save service stores them (as hashes) and every campaign uses the same pair. The hashes in `Code.gs` and `world.json` are only the starting values. Passkeys are shared door keys, not real security: anyone with the player passkey can write as anyone, and the GM passkey can delete. Only give them out accordingly.

**Updating the save service** when `Code.gs` changes: paste the new code, then Deploy → Manage deployments → ✎ → Version: *New version* → Deploy (same URL). GM tools shows which version is running.

The only thing that still needs the files is the engine itself (`src/duat/engine/`), plus the optional step of folding site edits into `.md` files.

## Heads-up

Everything under `src/` is public once deployed. Don't put GM secrets in a player-facing catalog. `hidden: true` only removes an entry from lists and search.

## Local preview

Run `cd src && python3 -m http.server`, then open http://localhost:8000/duat/vcm/. Opening the file straight from disk won't work.
