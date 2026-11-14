#!/usr/bin/env python3
"""Builds src/building/madison/data/block.json from public NYC data.

Sources (all keyless):
  NYC Open Data (data.cityofnewyork.us)
    5zhs-2jue  Building Footprints (roof height, ground elevation, year)
    64uk-42ks  PLUTO (floors, year built, building class, address, use)
    52n9-sdep  Planimetric sidewalks      vs44-rznx  pavement edge
    inkn-q76z  Street centerlines (names, widths, direction)
    hn5i-inap  Forestry tree points       5bgh-vtsn  hydrants
  NYS orthoimagery (orthos.its.ny.gov): mean roof colour per building, backyard canopy

Everything is projected to local metres around 932 Madison St:
  x = east, z = south (three.js: -z is north), y = up.

Usage: python3 tools/madison/build_data.py [cache_dir]
"""
import io, json, math, os, sys, time, urllib.parse, urllib.request

LAT0, LON0 = 40.6880103, -73.9201576          # 932 Madison St (OSM building centroid)
S, W, N, E = 40.6850, -73.9243, 40.6910, -73.9160
MX = 111320 * math.cos(math.radians(LAT0))
MZ = 110950
FT = 0.3048
UA = {"User-Agent": "block-explorer-dev/0.1"}
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "src", "building", "madison", "data", "block.json")
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, ".cache")
os.makedirs(CACHE, exist_ok=True)


def fetch(url, name, binary=False):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        for attempt in range(4):
            try:
                data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()
                break
            except Exception as e:  # noqa
                print("retry", name, e); time.sleep(2 ** attempt)
        else:
            raise SystemExit("failed " + url)
        open(path, "wb").write(data)
    data = open(path, "rb").read()
    return data if binary else json.loads(data)


def soda(ds, where, name, fmt="geojson", select=None):
    q = {"$where": where, "$limit": 20000}
    if select: q["$select"] = select
    return fetch(f"https://data.cityofnewyork.us/resource/{ds}.{fmt}?" + urllib.parse.urlencode(q), name)


def box(col): return f"within_box({col},{N},{W},{S},{E})"
def P(lon, lat): return [round((lon - LON0) * MX, 2), round(-(lat - LAT0) * MZ, 2)]
def ring(r):
    pts = [P(*c[:2]) for c in r]
    if pts[0] == pts[-1]: pts.pop()
    return pts
def area(r): return sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r))) / 2


def inside(p, r):
    x, y = p; c = False
    for i in range(len(r)):
        a, b = r[i], r[i - 1]
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]: c = not c
    return c


# ---------- buildings + PLUTO ----------
bl = soda("5zhs-2jue", box("the_geom"), "bldg.geojson")
pl = soda("64uk-42ks", f"latitude between {S} and {N} and longitude between {W} and {E}", "pluto.json", "json",
          "bbl,address,numfloors,yearbuilt,bldgclass,landuse,comarea,retailarea,unitsres,lotfront")
pluto = {str(int(float(r["bbl"]))): r for r in pl}
buildings = []
for f in bl["features"]:
    p = f["properties"]
    lot = pluto.get(p.get("mappluto_bbl") or p.get("base_bbl") or "", {})
    h = float(p.get("height_roof") or 0) * FT
    for poly in f["geometry"]["coordinates"]:
        r = ring(poly[0])
        if len(r) < 3 or abs(area(r)) < 6: continue
        if area(r) < 0: r.reverse()            # positive in (x,z) == clockwise seen from above
        fl = float(lot.get("numfloors") or 0)
        if h < 2: h = max(3.2, fl * 3.1)
        b = {"p": r, "h": round(h, 2), "g": p.get("feature_code") == "5110"}
        if lot:
            b.update({"a": lot.get("address", "").title(), "f": fl, "y": int(lot.get("yearbuilt") or 0),
                      "c": lot.get("bldgclass", ""), "u": lot.get("landuse", ""),
                      "com": float(lot.get("comarea") or 0) > 0, "bbl": str(int(float(lot["bbl"])))})
        if not b.get("y") and p.get("construction_year"): b["y"] = int(p["construction_year"])
        buildings.append(b)

# ---------- orthophoto: roof colours + backyard canopy ----------
try:
    from PIL import Image
    OW, OH = 2100, 2000
    d = fetch("https://orthos.its.ny.gov/arcgis/rest/services/wms/Latest/MapServer/export?" + urllib.parse.urlencode(
        {"bbox": f"{W},{S},{E},{N}", "bboxSR": 4326, "imageSR": 4326, "size": f"{OW},{OH}", "format": "jpg", "f": "image"}),
        "ortho.jpg", True)
    mos = Image.open(io.BytesIO(d)).convert("RGB")
    px = mos.load()
    def sample(x, z):
        i = int((LON0 + x / MX - W) / (E - W) * mos.width); j = int((N - (LAT0 - z / MZ)) / (N - S) * mos.height)
        return px[i, j] if 0 <= i < mos.width and 0 <= j < mos.height else None
    for b in buildings:
        r = b["p"]; xs = [q[0] for q in r]; zs = [q[1] for q in r]; acc = []
        for i in range(7):
            for j in range(7):
                q = (min(xs) + (max(xs) - min(xs)) * (i + .5) / 7, min(zs) + (max(zs) - min(zs)) * (j + .5) / 7)
                if inside(q, r):
                    c = sample(*q)
                    if c: acc.append(c)
        if acc: b["r"] = "#%02x%02x%02x" % tuple(sum(c[k] for c in acc) // len(acc) for k in range(3))
    HAVE_ORTHO = True
except ImportError:
    HAVE_ORTHO = False
    print("PIL missing: skipping roof colours / canopy")

# ---------- streets ----------
cl = soda("inkn-q76z", f"within_box(the_geom,{N + .004},{W - .006},{S - .004},{E + .006})", "centerline.geojson")
streets = []
for f in cl["features"]:
    p = f["properties"]
    if p.get("rw_type") not in ("1", None) and p.get("stname_label") != "ALLEY": continue
    for line in f["geometry"]["coordinates"]:
        streets.append({"n": p["stname_label"].title(), "w": round(float(p.get("streetwidth") or 30) * FT, 2),
                        "d": p.get("trafdir") or "TW", "p": [P(*c[:2]) for c in line]})

# Broadway carries the elevated BMT Jamaica Line (J/Z): chain its segments into one polyline.
segs = [s["p"] for s in streets if s["n"] == "Broadway"]
chain = segs.pop(0)
changed = True
while segs and changed:
    changed = False
    for s in segs:
        for cand in (s, s[::-1]):
            if math.dist(cand[0], chain[-1]) < 1.5: chain = chain + cand[1:]; changed = True
            elif math.dist(cand[-1], chain[0]) < 1.5: chain = cand[:-1] + chain; changed = True
            else: continue
            segs.remove(s); break
        if changed: break
if chain[0][0] > chain[-1][0]: chain.reverse()     # west -> east

sw = soda("52n9-sdep", box("the_geom"), "sidewalk.geojson")
sidewalks = []
for f in sw["features"]:
    for poly in f["geometry"]["coordinates"]:
        rs = [ring(r) for r in poly]
        if abs(area(rs[0])) > 20: sidewalks.append(rs)
pe = soda("vs44-rznx", box("the_geom"), "pavedge.geojson")
curbs = [[P(*c[:2]) for c in line] for f in pe["features"] for line in f["geometry"]["coordinates"]]

# ---------- trees, hydrants ----------
tr = soda("hn5i-inap", box("location"), "trees.geojson")
trees = []
for f in tr["features"]:
    p = f["properties"]
    if p.get("tpstructure") in ("Retired", "Stump", "Dead") or not f.get("geometry"): continue
    x, z = P(*f["geometry"]["coordinates"][:2])
    sp = (p.get("genusspecies") or "").split(" - ")
    trees.append({"x": x, "z": z, "d": float(p.get("dbh") or 4), "s": sp[-1].strip()})
hy = soda("5bgh-vtsn", box("the_geom"), "hydrants.geojson")
hydrants = [P(*f["geometry"]["coordinates"][:2]) for f in hy["features"]]

# backyard canopy: green orthophoto pixels inside block interiors, away from buildings
yard = []
if HAVE_ORTHO:
    step = 5.0
    interiors = [h for rs in sidewalks for h in rs[1:]]
    xi = -(LON0 - W) * MX
    while xi < (E - LON0) * MX:
        zi = -(N - LAT0) * MZ
        while zi < (LAT0 - S) * MZ:
            c = sample(xi, zi)
            if c and c[1] > c[0] * 1.06 and c[1] > c[2] * 1.12 and 40 < c[1] < 190:
                q = (xi, zi)
                if any(inside(q, h) for h in interiors) and not any(
                        abs(q[0] - b["p"][0][0]) < 60 and abs(q[1] - b["p"][0][1]) < 60 and inside(q, b["p"]) for b in buildings):
                    yard.append([round(xi, 1), round(zi, 1)])
            zi += step
        xi += step

out = {"origin": {"lat": LAT0, "lon": LON0, "address": "932 Madison St, Brooklyn, NY 11221"},
       "bounds": [P(W, N), P(E, S)], "buildings": buildings, "streets": streets, "el": chain,
       "sidewalks": sidewalks, "curbs": curbs, "trees": trees, "yardTrees": yard, "hydrants": hydrants}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w"), separators=(",", ":"))
print({k: (len(v) if isinstance(v, list) else v) for k, v in out.items() if k != "origin"},
      os.path.getsize(OUT) // 1024, "KB")
