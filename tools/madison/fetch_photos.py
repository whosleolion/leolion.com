#!/usr/bin/env python3
"""Picks a spread of open street-level photos (KartaView, CC BY-SA 4.0) near 932 Madison St and
saves downsized copies + src/building/madison/data/photos.json for the in-game "compare" spots."""
import io, json, math, os, urllib.request
from PIL import Image
LAT0, LON0 = 40.6880103, -73.9201576
MX = 111320 * math.cos(math.radians(LAT0)); MZ = 110950
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "src", "building", "madison")
UA = {"User-Agent": "block-explorer-dev/0.1"}
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
SEQS = ["1302803", "1306563", "1297505", "1295635"]   # 2018 dashcam passes along Broadway / Putnam Ave
photos = []
for s in SEQS:
    pg = 1
    while True:
        d = json.loads(get(f"https://api.kartaview.org/2.0/sequence/{s}/photos?itemsPerPage=500&page={pg}"))["result"]["data"]
        photos += d; pg += 1
        if len(d) < 500: break
cand = []
for p in photos:
    x = (float(p["lng"]) - LON0) * MX; z = -(float(p["lat"]) - LAT0) * MZ
    if math.hypot(x, z) < 150: cand.append((math.hypot(x, z), x, z, p))
cand.sort(key=lambda c: c[0])
picked = []
for d, x, z, p in cand:
    if all(math.hypot(x - q["x"], z - q["z"]) > 34 for q in picked) and len(picked) < 12:
        f = f"kv_{p['sequenceId']}_{p['sequenceIndex']}.jpg"
        try: im = Image.open(io.BytesIO(get(p["fileurlLTh"]))).convert("RGB")
        except Exception as e: print("skip", f, e); continue
        im.thumbnail((1024, 1024)); im.save(os.path.join(OUT, "photos", f), quality=74, optimize=True)
        picked.append({"x": round(x, 1), "z": round(z, 1), "h": float(p["heading"]), "date": p["shotDate"][:10], "f": f,
                       "src": f"https://kartaview.org/details/{p['sequenceId']}/{p['sequenceIndex']}"})
json.dump(picked, open(os.path.join(OUT, "data", "photos.json"), "w"), separators=(",", ":"))
print(len(picked), "photos")
