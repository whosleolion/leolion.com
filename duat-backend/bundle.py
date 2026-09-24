#!/usr/bin/env python3
"""Bundle each Duat campaign's entries into one bundle.json (run by the deploy, not committed).

    python3 duat-backend/bundle.py src/duat

The engine loads bundle.json when it exists (one request instead of one per page) and falls
back to entries/<slug>.md otherwise, so the files stay the source of truth.
"""
import json, sys, pathlib

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'src/duat')
for world in sorted(root.glob('*/world.json')):
    folder = world.parent
    slugs = json.loads(world.read_text(encoding='utf-8')).get('entries', [])
    entries = {}
    for slug in slugs:
        f = folder / 'entries' / f'{slug}.md'
        if f.exists():
            entries[slug] = f.read_text(encoding='utf-8')
    (folder / 'bundle.json').write_text(json.dumps({'entries': entries}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{folder}: bundled {len(entries)} of {len(slugs)} entries')
