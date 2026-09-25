#!/usr/bin/env python3
"""Builds the 1-bit asset set for /building/sciencecomplete.

Reuses the helpers (and a few tiles) from tools/yepdemo/make_assets.py and
adds the lab: walls, consoles, benches, the shrink ray, servers, the micro
world, the internet, and the cast (scientist, Chris the Enzyme, the Proton,
slimes, bees, pop-up ads).

Legend in the art:  '#' black   '.' white   ' ' transparent
Rows shorter than 16 are padded with transparency on the right.

Run:  pip install pillow && python3 tools/sciencecomplete/make_assets.py [--preview DIR]
"""
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "yepdemo"))
import make_assets as yep  # noqa: E402
from make_assets import T, pattern, stamp, mirror, sheet, preview  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "src", "building", "sciencecomplete", "assets")
YEP_ASSETS = os.path.join(ROOT, "src", "building", "yepdemo", "assets")


def art(*rows):
    rows = [r.ljust(T) for r in rows]
    rows += [" " * T] * (T - len(rows))
    for i, r in enumerate(rows):
        assert len(r) == T, f"row {i} is {len(r)} wide: {r!r}"
    assert len(rows) == T, f"{len(rows)} rows"
    return rows


def on(base, *shape):
    """Stamp transparent-backed art onto an opaque base tile."""
    return stamp(base, 0, 0, art(*shape))


def shift(rows, dy):
    blank = " " * T
    return (rows[-dy:] + [blank] * (-dy)) if dy < 0 else ([blank] * dy + rows[:-dy] if dy else rows)


def up(rows, n=1):
    return rows[n:] + [" " * T] * n


# ---------------------------------------------------------------- tiles

lab_floor = pattern(lambda x, y: (x % 8 == 7 and y % 4 == 1) or (y % 8 == 7 and x % 4 == 1) or (x % 8 == 7 and y % 8 == 7))

wall = pattern(lambda x, y: (y <= 9 and ((x + y) % 2 == 0 or x % 8 == 0)) or y in (10, 13, 15))

console0 = on(wall,
    " ############## ",
    " #............# ",
    " #.##########.# ",
    " #.##########.# ",
    " #.###.##.###.# ",
    " #.###.##.###.# ",
    " #.##########.# ",
    " #.##.####.##.# ",
    " #.###....###.# ",
    " #.##########.# ",
    " #............# ",
    " ######..###### ",
    "      #..#      ",
    "   ##########   ",
    "   #........#   ",
    "   ##########   ")
console1 = on(wall,
    " ############## ",
    " #............# ",
    " #.##########.# ",
    " #.##########.# ",
    " #.##########.# ",
    " #.##...#...#.# ",
    " #.##########.# ",
    " #.##.####.##.# ",
    " #.###....###.# ",
    " #.##########.# ",
    " #............# ",
    " ######..###### ",
    "      #..#      ",
    "   ##########   ",
    "   #........#   ",
    "   ##########   ")

lab_window = on(wall,
    "                ",
    "  ############  ",
    "  #..........#  ",
    "  #.########.#  ",
    "  #.#####.##.#  ",
    "  #.########.#  ",
    "  #.##.#####.#  ",
    "  #.########.#  ",
    "  #.######.#.#  ",
    "  #.########.#  ",
    "  #..........#  ",
    "  ############  ")

cabinet = on(wall,
    "  ############  ",
    "  #....##....#  ",
    "  #....##....#  ",
    "  #....##....#  ",
    "  #...#..#...#  ",
    "  #....##....#  ",
    "  #....##....#  ",
    "  #....##....#  ",
    "  ############  ",
    "  #..........#  ",
    "  #...####...#  ",
    "  #..........#  ",
    "  ############  ",
    "  #..........#  ",
    "  #...####...#  ",
    "  ############  ")

dryer = on(wall,
    "                ",
    "                ",
    "   ##########   ",
    "   #........#   ",
    "   #.######.#   ",
    "   #........#   ",
    "   #........#   ",
    "   ###....###   ",
    "     #.##.#     ",
    "     ######     ")

sink = on(wall,
    "                ",
    "                ",
    "      ###       ",
    "      #.#       ",
    "        #       ",
    "  ############  ",
    "  #..........#  ",
    "  #.########.#  ",
    "  #.#......#.#  ",
    "  #.#......#.#  ",
    "  #.########.#  ",
    "  #..........#  ",
    "  ############  ")

plaque = on(wall,
    "                ",
    "                ",
    "   ##########   ",
    "   #........#   ",
    "   #.######.#   ",
    "   #........#   ",
    "   #.####...#   ",
    "   #........#   ",
    "   ##########   ")

coats = on(wall,
    "                ",
    "################",
    "   #       #    ",
    "  ###     ###   ",
    " #...#   #...#  ",
    "#.....# #.....# ",
    "#..#..# #..#..# ",
    "#..#..# #..#..# ",
    "#..#..# #..#..# ",
    "#.....# #.....# ",
    "#.....# #.....# ",
    "####### ####### ")

coffee = on(wall,
    "                ",
    "  ##########    ",
    "  #........#    ",
    "  #.######.#    ",
    "  #.#....#.#    ",
    "  #.######.#    ",
    "  #........#    ",
    "  #..####..#    ",
    "  #...##...#    ",
    "  #........#    ",
    "  #..####..#    ",
    "  #..#..#.##    ",
    "  #..####..#    ",
    "  ##########    ")

fridge = on(wall,
    "  ############  ",
    "  #..........#  ",
    "  #.#........#  ",
    "  #.#........#  ",
    "  #..........#  ",
    "  ############  ",
    "  #..........#  ",
    "  #.#........#  ",
    "  #.#........#  ",
    "  #.#........#  ",
    "  #..........#  ",
    "  #..........#  ",
    "  #..........#  ",
    "  ############  ",
    "   ##      ##   ")

bench = art(
    "################",
    "#..............#",
    "#..............#",
    "#..............#",
    "#..............#",
    "################",
    "#.############.#",
    "#.#..........#.#",
    "#.#...####...#.#",
    "#.#..........#.#",
    "#.############.#",
    "#..............#",
    "################",
    " ##          ## ")

tubes = stamp(bench, 0, 0, art(
    "  #  #  #  #    ",
    " #.##.##.##.#   ",
    " #.##.##.##.#   ",
    " #.##.##.##.#   ",
    " #####.##.###   ",
    "  ##  ##  ##    "))

button = art(
    "                ",
    "                ",
    "     ######     ",
    "   ##......##   ",
    "  #..........#  ",
    "  ##........##  ",
    "  #.########.#  ",
    "  #..........#  ",
    "  ############  ",
    "    #......#    ",
    "    #......#    ",
    "    #......#    ",
    "    #......#    ",
    "   ##########   ",
    "   #........#   ",
    "   ##########   ")

toilet = art(
    "                ",
    "   ##########   ",
    "   #........#   ",
    "   #........#   ",
    "   ##########   ",
    "    #......#    ",
    "   #..####..#   ",
    "   #.#....#.#   ",
    "   #.#....#.#   ",
    "   #.#....#.#   ",
    "   #..####..#   ",
    "    #......#    ",
    "     ######     ")

stall = art(*(["      ####      "] + ["      #..#      "] * 14 + ["      ####      "]))

stairs = pattern(lambda x, y: x in (0, 15) or y % 4 == 0 or (y % 4 == 3 and (x + y) % 2 == 0))


def space(stars):
    s = ["#" * T] * T
    for (x, y, big) in stars:
        s = stamp(s, x - 1 if big else x, y - 1 if big else y,
                  [" . ", "...", " . "] if big else ["."])
    return s


space0 = space([(2, 3, 1), (11, 2, 0), (7, 8, 0), (13, 11, 1), (4, 13, 0)])
space1 = space([(2, 3, 0), (11, 2, 1), (7, 8, 0), (13, 11, 0), (4, 13, 1)])
moon = stamp(space([(12, 13, 0), (2, 12, 0)]), 3, 2, [
    "   ######   ",
    "  #......#  ",
    " #....#...# ",
    " #........# ",
    " #..#.....# ",
    " #......#.# ",
    " #........# ",
    "  #......#  ",
    "   ######   ",
])

board = art(
    "################",
    "#..............#",
    "#.############.#",
    "#.#..#.##.#..#.#",
    "#.############.#",
    "#.##...#.#..##.#",
    "#.############.#",
    "#.#.##..######.#",
    "#.############.#",
    "#..............#",
    "################",
    "  #          #  ",
    "  #          #  ",
    "  #          #  ",
    " ###        ### ")

hive = art(
    "                ",
    "      ####      ",
    "    ##....##    ",
    "   #........#   ",
    "   ##########   ",
    "  #..........#  ",
    "  ############  ",
    "  #..........#  ",
    " ############## ",
    " #............# ",
    " #.....##.....# ",
    " ######..###### ",
    " #....#..#....# ",
    " ############## ")

ray = art(
    "                ",
    "   #########    ",
    "  #.........##  ",
    "  #.#.#.#...#.# ",
    "  #.........##  ",
    "   #########    ",
    "     #.#        ",
    "     #.#        ",
    "     #.#        ",
    "     #.#        ",
    "    #...#       ",
    "   #######      ")

platform = art(
    "                ",
    "                ",
    "                ",
    "    ########    ",
    "  ##........##  ",
    " #..########..# ",
    " #.#........#.# ",
    " #.#..####..#.# ",
    " #.#........#.# ",
    " #..########..# ",
    "  ##........##  ",
    "    ########    ")

SERVER = art(
    "################",
    "#..............#",
    "#.############.#",
    "#.#1#2######.#.#",
    "#.############.#",
    "#..............#",
    "#.############.#",
    "#.#2#1#######..#",
    "#.############.#",
    "#..............#",
    "#.############.#",
    "#.#1#1#2######.#",
    "#.############.#",
    "#..............#",
    "################",
    " ##          ## ")
server0 = [r.replace("1", ".").replace("2", "#") for r in SERVER]
server1 = [r.replace("1", "#").replace("2", ".") for r in SERVER]

pedestal = art(
    "", "", "", "", "", "", "",
    "   ##########   ",
    "   #........#   ",
    "   ##########   ",
    "    #......#    ",
    "    #......#    ",
    "    #......#    ",
    "   ##########   ",
    "   #........#   ",
    "   ##########   ")

lab_door = art(
    "################",
    "#......##......#",
    "#......##......#",
    "#......##......#",
    "#......##......#",
    "#.....####.....#",
    "#....#.##.#....#",
    "#....######....#",
    "#....##..##....#",
    "#....######....#",
    "#......##......#",
    "#......##......#",
    "#......##......#",
    "#......##......#",
    "#......##......#",
    "################")

doorway = pattern(lambda x, y: True, base="#")
doorway = stamp(doorway, 0, 0, art(*([".#            #."] * 16)))
doorway = stamp(doorway, 5, 5, ["......", " .... ", "  ..  "])

ring = [" ## ", "#..#", "#..#", " ## "]
cyto = ["." * T] * T
for (x, y) in [(2, 2), (10, 8)]:
    cyto = stamp(cyto, x, y, ring)
cyto = stamp(cyto, 12, 2, ["#"])
cyto = stamp(cyto, 4, 12, ["#"])
cyto = stamp(cyto, 8, 14, ["#"])

membrane = pattern(lambda x, y: (x + y) % 2 == 0)
for (x, y) in [(1, 1), (9, 3), (4, 9), (11, 11)]:
    membrane = stamp(membrane, x, y, [" .... ", "..##..", ".#..#.", ".#..#.", "..##..", " .... "])

grow = art(
    "                ",
    "   ##########   ",
    "  #..........#  ",
    " #.....##.....# ",
    " #....####....# ",
    " #...######...# ",
    " #..########..# ",
    " #.....##.....# ",
    " #.....##.....# ",
    " #.....##.....# ",
    " #............# ",
    "  #..........#  ",
    "   ##########   ")

net_floor = pattern(lambda x, y: True, base="#")
net_floor = stamp(net_floor, 0, 0, art(*[
    "".join("." if (x % 8 == 0 and y % 2 == 0) or (y % 8 == 0 and x % 2 == 0) else " " for x in range(T))
    for y in range(T)]))
net_wall = pattern(lambda x, y: x in (0, 15) or y in (0, 15) or (y % 3 == 1 and 2 <= x <= 13 and (x // 2 + y) % 3 != 0))

uplink0 = pattern(lambda x, y: min(x, y, 15 - x, 15 - y) % 4 in (0, 1))
uplink1 = pattern(lambda x, y: min(x, y, 15 - x, 15 - y) % 4 in (2, 3))

TILES = [
    ("lab_floor", lab_floor), ("wall", wall), ("console0", console0), ("console1", console1),
    ("lab_window", lab_window), ("cabinet", cabinet), ("dryer", dryer), ("sink", sink),
    ("plaque", plaque), ("coats", coats), ("coffee", coffee), ("fridge", fridge),
    ("bench", bench), ("tubes", tubes), ("button", button), ("toilet", toilet),
    ("stall", stall), ("stairs", stairs), ("space0", space0), ("space1", space1),
    ("moon", moon), ("board", board), ("hive", hive), ("ray", ray),
    ("platform", platform), ("server0", server0), ("server1", server1), ("pedestal", pedestal),
    ("lab_door", lab_door), ("doorway", doorway), ("cyto", cyto), ("membrane", membrane),
    ("grow", grow), ("net_floor", net_floor), ("net_wall", net_wall), ("uplink0", uplink0),
    ("uplink1", uplink1),
    # borrowed from YEP
    ("floor", yep.floor), ("table", yep.table), ("pot", yep.pot), ("door", yep.door),
    ("mat", yep.mat), ("flower", yep.flower), ("void", yep.void), ("rug", yep.rug),
]

# ---------------------------------------------------------------- sprites

HEAD_DOWN = [
    "                ",
    "     ######     ",
    "    ########    ",
    "   #..####..#   ",
    "   #..####..#   ",
    "   #........#   ",
    "   #.#....#.#   ",
    "   #........#   ",
    "    #..##..#    ",
    "     ######     ",
]
HEAD_UP = [
    "                ",
    "     ######     ",
    "    ########    ",
    "   ##########   ",
    "   #........#   ",
    "   ##########   ",
    "   ##########   ",
    "   ##########   ",
    "    ########    ",
    "     ######     ",
]
HEAD_RIGHT = [
    "                ",
    "     ######     ",
    "    ########    ",
    "   #######..#   ",
    "   #######..#   ",
    "   #######...#  ",
    "   ######..#.#  ",
    "   ######....#  ",
    "    ####....#   ",
    "     ######     ",
]

s_down0 = art(*HEAD_DOWN,
              "    #.#..#.#    ",
              "   #..#..#..#   ",
              "   #.#....#.#   ",
              "   ##..##..##   ",
              "   #...##...#   ",
              "    ##    ##    ")
s_down1 = s_down0[:15] + ["    ##          "]
s_down2 = mirror(s_down1)
s_up0 = art(*HEAD_UP,
            "    #......#    ",
            "   #........#   ",
            "   #.#....#.#   ",
            "   ##......##   ",
            "   #...##...#   ",
            "    ##    ##    ")
s_up1 = s_up0[:15] + ["          ##    "]
s_up2 = mirror(s_up1)
s_right0 = art(*HEAD_RIGHT,
               "     #....#     ",
               "     #..#.#     ",
               "     #.##.#     ",
               "     #.##.#     ",
               "     #....#     ",
               "      ####      ")
s_right1 = art(*HEAD_RIGHT,
               "     #....#     ",
               "    #...#..#    ",
               "    #..##..#    ",
               "     #.##.#     ",
               "     #....#     ",
               "    ##    ##    ")

chris0 = art(
    "",
    "",
    "",
    "    ######",
    "  ##......##",
    " #..........#",
    " #..#...#..#",
    " #..#...#.#",
    " #.......#",
    " #..#...#.#",
    " #...###...#",
    " #..........#",
    "  #........#",
    "   ########",
    "    #    #")
chris1 = up(chris0)
HAT = [
    "     ####",
    "    #....#",
    "  ##########",
]
chris_hat0 = stamp(chris0, 0, 1, HAT)
chris_hat1 = stamp(chris1, 0, 0, HAT)

proton0 = art(
    "",
    "      ####",
    "    ##....##",
    "   #........#",
    "  #..#....#..#",
    "  #....##....#",
    " #.....##.....#",
    " #...######...#",
    " #...######...#",
    " #.....##.....#",
    "  #....##....#",
    "  #..........#",
    "   #........#",
    "    ##....##",
    "      ####")
proton1 = stamp(proton0, 0, 0, art("", "", "", "", "  #..........#"))

slime0 = art(
    "", "", "", "", "",
    "      ####",
    "    ##....##",
    "   #........#",
    "  #..##..##..#",
    "  #..##..##..#",
    " #............#",
    " #...#....#...#",
    " #....####....#",
    "  ############")
slime1 = art(
    "", "", "", "", "", "", "",
    "     ######",
    "   ##......##",
    "  #..##..##..#",
    " #...##..##...#",
    "#..............#",
    "#....#....#....#",
    "#.....####.....#",
    " ##############")

BEE = [" ## ##", "#..#..#", " #####", "#.#.#.#", " #####"]
bees0 = stamp(stamp(art(), 2, 1, BEE), 8, 8, BEE)
bees1 = stamp(stamp(art(), 4, 3, BEE), 7, 6, BEE)

ad0 = art(
    "################",
    "#.#########.#.##",
    "################",
    "#..............#",
    "#......##......#",
    "#......##......#",
    "#......##......#",
    "#......##......#",
    "#..............#",
    "#......##......#",
    "#..............#",
    "#.############.#",
    "#.#.#.#.#.#.##.#",
    "#.############.#",
    "#..............#",
    "################")
ad1 = [r.replace(".", "x").replace("#", ".").replace("x", "#") if 3 <= i <= 10 else r for i, r in enumerate(ad0)]

avatar0 = art(
    " ############## ",
    " #............# ",
    " #.##########.# ",
    " #.##########.# ",
    " #.###.##.###.# ",
    " #.###.##.###.# ",
    " #.##########.# ",
    " #.##.####.##.# ",
    " #.###....###.# ",
    " #.##########.# ",
    " #............# ",
    " ######..###### ",
    "      #..#      ",
    "     #.##.#     ",
    "    #.#  #.#    ",
    "    ##    ##    ")
avatar1 = up(avatar0)

SPRITES = [
    ("s_down0", s_down0), ("s_down1", s_down1), ("s_down2", s_down2),
    ("s_up0", s_up0), ("s_up1", s_up1), ("s_up2", s_up2),
    ("s_left0", mirror(s_right0)), ("s_left1", mirror(s_right1)),
    ("s_right0", s_right0), ("s_right1", s_right1),
    ("chris0", chris0), ("chris1", chris1), ("chris_hat0", chris_hat0), ("chris_hat1", chris_hat1),
    ("proton0", proton0), ("proton1", proton1), ("slime0", slime0), ("slime1", slime1),
    ("bees0", bees0), ("bees1", bees1), ("ad0", ad0), ("ad1", ad1),
    ("avatar0", avatar0), ("avatar1", avatar1),
    # map pickups
    ("hat", art("", "", "", "      ####", "     #....#", "     #....#", "   ##########", "  #..........#", "   ##########")),
    ("phone", art("", "", "      ######", "      #....#", "      #.##.#", "      #.##.#", "      #....#", "      #.##.#", "      ######")),
    ("usb", art("", "      ####", "      #..#", "     ######", "     #....#", "     #.##.#", "     #....#", "     ######")),
    ("arrow", yep.arrow), ("cursor", art("", "", "", "", "", "    ##", "    ###", "    ####", "    ###", "    ##")),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    tiles, tindex = sheet(TILES)
    sprites, sindex = sheet(SPRITES)
    tiles.save(os.path.join(OUT, "tiles.png"))
    sprites.save(os.path.join(OUT, "sprites.png"))
    for f in ("font.png", "FONT-LICENSE-OFL.txt"):
        shutil.copy(os.path.join(YEP_ASSETS, f), os.path.join(OUT, f))
    if "--preview" in sys.argv:
        d = sys.argv[sys.argv.index("--preview") + 1]
        preview(TILES, os.path.join(d, "sc_tiles.png"))
        preview(SPRITES, os.path.join(d, "sc_sprites.png"))
    with open(os.path.join(OUT, "atlas.json"), "w") as fh:
        json.dump({"size": T, "cols": 8, "tiles": tindex, "sprites": sindex,
                   "font": {"cell": 8, "cols": 16, "first": 32}}, fh, indent=1)
    print(f"{len(TILES)} tiles, {len(SPRITES)} sprites -> {OUT}")


if __name__ == "__main__":
    main()
