#!/usr/bin/env python3
"""Fold a Duat export (GM tools → Download export) back into the campaign's files.

    python3 duat-backend/apply_export.py duat-export-<world>-<date>.json src/duat/vcm

Writes each changed page to entries/<slug>.md, adds new pages to world.json "entries",
and removes deleted or merged pages. Commit and deploy, then use GM tools → Clear shared edits.
"""
import json, os, sys

def main(export_path, campaign_dir):
    data = json.load(open(export_path, encoding='utf-8'))
    wpath = os.path.join(campaign_dir, 'world.json')
    world = json.load(open(wpath, encoding='utf-8'))
    listed = world.setdefault('entries', [])
    for slug, text in data.get('entries', {}).items():
        path = os.path.join(campaign_dir, 'entries', slug + '.md')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, 'w', encoding='utf-8').write(text)
        if slug not in listed:
            listed.append(slug)
        print('wrote', path)
    for slug in data.get('deleted', []):
        path = os.path.join(campaign_dir, 'entries', slug + '.md')
        if os.path.exists(path):
            os.remove(path)
            print('removed', path)
        if slug in listed:
            listed.remove(slug)
    json.dump(world, open(wpath, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    open(wpath, 'a', encoding='utf-8').write('\n')
    print('updated', wpath)

if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
