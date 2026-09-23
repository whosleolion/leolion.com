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
- Callouts work like Obsidian's: `> [!rumor] Heard at the bar` (also note, tip, warning, danger, quote, question).

The "Mentioned in" (backlinks) and "On the map" sections build themselves.

## Maps

A map is an entry with `type: map` and an `image:`. Pins go in a `pins` block anywhere in the body:

````markdown
```pins
55.3, 41.5 | [[Sample Location]]
71, 66     | [[Sample Faction|Faction HQ]] | Optional note shown in the pin card.
14, 34     | The Docks | Plain label with no entry.
```
````

Coordinates are percentages of the image (x from the left, y from the top). To get them, open the map with `?edit` before the `#`, e.g. `https://leolion.com/duat/vcm/?edit#/e/vista-city`, and tap the spot. That copies the `x, y | ` prefix for you.

Any image works, so a "map" can also be an infomap: a relationship web, an org chart, or a district diagram.

To link straight to a pin, use `#/e/vista-city?pin=sample-location`.

## Heads-up

Everything under `src/` is public once deployed. Don't put GM secrets in a player-facing catalog. `hidden: true` only removes an entry from lists and search.

## Local preview

Run `cd src && python3 -m http.server`, then open http://localhost:8000/duat/vcm/. Opening the file straight from disk won't work.
