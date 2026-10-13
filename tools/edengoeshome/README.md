# Eden Goes Home site generator

`python3 tools/edengoeshome/gen.py` writes the four pages in `src/building/edengoeshome/`
(index, about, artists, support). Edit copy and the cast/crew/band lists there, then rerun it.
Styles live in `src/building/edengoeshome/css/style.css` (edited by hand).

Headshots: save a square-ish JPEG as `src/building/edengoeshome/images/artists/<slug>.jpg`
(slug = lowercase name with hyphens and no accents, e.g. `orla-meyers.jpg`, 400x400 is plenty).
`gen.py` swaps the initials circle for the photo automatically when the file exists.

Deploy: pushing to `master` with changes under `src/building/edengoeshome/` runs
`.github/workflows/deploy-edengoeshome.yml`, which uploads that folder to the Neocities site
`edengoeshome` (edengoeshome.com). Needs the repo secret `NEOCITIES_API_KEY_EDENGOESHOME`.
(`deploy-neocities.yml` also copies this folder to leolion.com/building/edengoeshome.)
