#!/usr/bin/env python3
"""Builds the 1-bit asset set for /building/yepdemo.

Every tile and sprite is hand-drawn below as 16x16 ASCII art (or generated
from a simple pattern), then written out as PNG atlases plus an index JSON:

    src/building/yepdemo/assets/tiles.png    world tiles (8 per row)
    src/building/yepdemo/assets/sprites.png  characters + items (8 per row)
    src/building/yepdemo/assets/font.png     8x8 bitmap font, ASCII 32-126
    src/building/yepdemo/assets/atlas.json   name -> index for all of the above

Legend in the art:  '#' black   '.' white   ' ' transparent

Run:  pip install pillow && python3 tools/yepdemo/make_assets.py
The font is Press Start 2P (SIL OFL 1.1), rasterized to 1-bit; pass
--font PATH to a .ttf/.woff of it. If omitted, the existing font.png is kept.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "src", "building", "yepdemo", "assets")
T = 16
BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def art(*rows):
    rows = list(rows)
    assert len(rows) == T, f"need {T} rows, got {len(rows)}"
    for i, r in enumerate(rows):
        assert len(r) == T, f"row {i} is {len(r)} wide: {r!r}"
    return rows


def pattern(fn, base="."):
    """Opaque tile from a function (x, y) -> True for black."""
    return ["".join("#" if fn(x, y) else base for x in range(T)) for y in range(T)]


def stamp(rows, x, y, shape):
    rows = [list(r) for r in rows]
    for dy, line in enumerate(shape):
        for dx, c in enumerate(line):
            if c != " " and 0 <= x + dx < T and 0 <= y + dy < T:
                rows[y + dy][x + dx] = c
    return ["".join(r) for r in rows]


def mirror(rows):
    return [r[::-1] for r in rows]


def to_img(rows):
    im = Image.new("RGBA", (T, T), CLEAR)
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c == "#":
                im.putpixel((x, y), BLACK)
            elif c == ".":
                im.putpixel((x, y), WHITE)
    return im


# ---------------------------------------------------------------- tiles

TUFT = ["#.#", ".#."]
blank = ["." * T] * T

grass = blank
for (x, y) in [(2, 3), (11, 6), (5, 12)]:
    grass = stamp(grass, x, y, TUFT)

grass2 = blank
for (x, y) in [(9, 9)]:
    grass2 = stamp(grass2, x, y, TUFT)

# light gravel: sparse offset dot grid
path = pattern(lambda x, y: (x % 4 == 0 and y % 4 == 0) or (x % 4 == 2 and y % 4 == 2 and (x + y) % 8 == 4))


def water(shift):
    w = ["#" * T] * T
    wave = ["..  ..", "  ..  "]
    for (x, y) in [(1, 3), (9, 7), (3, 12)]:
        w = stamp(w, (x + shift) % 12, y, [s.replace(" ", "#") for s in wave])
    return w


water0 = water(0)
water1 = water(3)

# wood planks: vertical boards with staggered butt joints
floor = pattern(lambda x, y: x % 4 == 3 or (x % 8 < 3 and y == 5) or (4 <= x % 8 < 7 and y == 12))

# brick: mortar lines every 4 rows, seams offset per course
brick = pattern(lambda x, y: y % 4 == 3 or (y % 8 < 3 and x % 8 == 0) or (4 <= y % 8 < 7 and x % 8 == 4))

# roof: 50% dither with dark shingle lines
roof = pattern(lambda x, y: y % 4 == 3 or ((x + y) % 2 == 0 and y % 4 != 0))

roof_edge = art(
    "#.#.#.#.#.#.#.#.",
    ".#.#.#.#.#.#.#.#",
    "#.#.#.#.#.#.#.#.",
    "################",
    "################",
    "................",
    "................",
    "################",
    "#.......#.......",
    "#.......#.......",
    "#.......#.......",
    "################",
    "....#.......#...",
    "....#.......#...",
    "....#.......#...",
    "################",
)

window = art(
    "...............#",
    "..............#.",
    "################",
    "#..............#",
    "#.#####..#####.#",
    "#.#...#..#...#.#",
    "#.#.#.#..#...#.#",
    "#.#...#..#...#.#",
    "#.#####..#####.#",
    "#.#...#..#...#.#",
    "#.#...#..#.#.#.#",
    "#.#...#..#...#.#",
    "#.#####..#####.#",
    "#..............#",
    "################",
    "#.......#.......",
)

door = art(
    "................",
    "..############..",
    "..#..........#..",
    "..#.########.#..",
    "..#.#......#.#..",
    "..#.#......#.#..",
    "..#.########.#..",
    "..#..........#..",
    "..#.......##.#..",
    "..#.......##.#..",
    "..#..........#..",
    "..#.########.#..",
    "..#.#......#.#..",
    "..#.########.#..",
    "..#..........#..",
    "################",
)

# interior wall: vertical-stripe wallpaper with a skirting board
wallpaper = pattern(lambda x, y: y >= 13 or y == 11 or (x % 4 == 1 and y < 11 and y % 2 == 0))

void = ["#" * T] * T

rug = pattern(lambda x, y: x in (1, 14) or y in (1, 14) or
              (2 < x < 13 and 2 < y < 13 and (x + y) % 4 == 0))

mat = pattern(lambda x, y: (x in (2, 13) and 4 <= y <= 11) or (y in (4, 11) and 2 <= x <= 13) or
              (4 <= x <= 11 and 6 <= y <= 9 and (x + y) % 2 == 0))

# overlays (transparent background, drawn on top of a base tile)

tree = art(
    "    ########    ",
    "  ##........##  ",
    " #...#.....#..# ",
    " #.#....#.....# ",
    "#.....#....#...#",
    "#..#.......#.#.#",
    "#....#..#......#",
    "#.#......#..#..#",
    " #...#.#.....#.#",
    " #.#.....#.#..# ",
    "  ##.#......##  ",
    "    ###..###    ",
    "      #..#      ",
    "      #..#      ",
    "    ###..###    ",
    "   #.#....#.#   ",
)

bush = art(
    "                ",
    "                ",
    "                ",
    "                ",
    "     ######     ",
    "   ##......##   ",
    "  #..#....#..#  ",
    " #......#.....# ",
    " #.#..#.....#.# ",
    " #.....#..#...# ",
    " #..#.......#.# ",
    "  #....#.#...#  ",
    "   ##.......##  ",
    "    #########   ",
    "                ",
    "                ",
)

rock = art(
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "      #####     ",
    "    ##.....#    ",
    "   #.....#..#   ",
    "  #..##.....##  ",
    "  #.......#..#  ",
    " #...#........# ",
    " #.......##...# ",
    " ##..#......### ",
    "  ############  ",
    "                ",
    "                ",
)

flower = art(
    "                ",
    "                ",
    "   #            ",
    "  #.#     #     ",
    "   #     #.#    ",
    "   #      #     ",
    "          #     ",
    "                ",
    "      #         ",
    "     #.#     #  ",
    "      #     #.# ",
    "      #      #  ",
    "             #  ",
    "                ",
    "                ",
    "                ",
)

fence = art(
    "                ",
    "                ",
    "                ",
    "  ##        ##  ",
    " #..#      #..# ",
    "################",
    "................",
    "################",
    " #..#      #..# ",
    "################",
    "................",
    "################",
    " #..#      #..# ",
    " #..#      #..# ",
    " ####      #### ",
    "                ",
)

sign = art(
    "                ",
    "                ",
    "  ############  ",
    "  #..........#  ",
    "  #.######...#  ",
    "  #..........#  ",
    "  #.####.###.#  ",
    "  #..........#  ",
    "  ############  ",
    "       ##       ",
    "       ##       ",
    "       ##       ",
    "       ##       ",
    "      ####      ",
    "                ",
    "                ",
)

chest = art(
    "                ",
    "                ",
    "                ",
    "   ##########   ",
    "  #..........#  ",
    "  #.########.#  ",
    "  #..........#  ",
    "  ############  ",
    "  #....##....#  ",
    "  #...#..#...#  ",
    "  #....##....#  ",
    "  #..........#  ",
    "  #..........#  ",
    "  ############  ",
    "                ",
    "                ",
)

chest_open = art(
    "                ",
    "   ##########   ",
    "  #..........#  ",
    "  #.########.#  ",
    "  #..........#  ",
    "  ############  ",
    "  ############  ",
    "  ############  ",
    "  #..........#  ",
    "  #..........#  ",
    "  #..........#  ",
    "  #..........#  ",
    "  #..........#  ",
    "  ############  ",
    "                ",
    "                ",
)

lamp = art(
    "      ####      ",
    "     #....#     ",
    "    #.#..#.#    ",
    "    #......#    ",
    "    ########    ",
    "      #..#      ",
    "       ##       ",
    "       ##       ",
    "       ##       ",
    "       ##       ",
    "       ##       ",
    "       ##       ",
    "      #..#      ",
    "     #....#     ",
    "     ######     ",
    "                ",
)

well = art(
    "                ",
    "  ############  ",
    " #............# ",
    "  ############  ",
    "   #        #   ",
    "   #   ##   #   ",
    "   #   ##   #   ",
    "  ############  ",
    " #............# ",
    " #.##########.# ",
    " ##..........## ",
    " #.#.#.#.#.#..# ",
    " #............# ",
    " #..#.#.#.#.#.# ",
    "  ############  ",
    "                ",
)

grave = art(
    "                ",
    "                ",
    "     ######     ",
    "    #......#    ",
    "   #...##...#   ",
    "   #..####..#   ",
    "   #...##...#   ",
    "   #...##...#   ",
    "   #........#   ",
    "   #.#.#.#..#   ",
    "   #........#   ",
    "   #........#   ",
    "  ############  ",
    "  #..........#  ",
    "  ############  ",
    "                ",
)

table = art(
    "                ",
    "                ",
    "                ",
    " ############## ",
    " #............# ",
    " #.......##...# ",
    " #......#..#..# ",
    " ############## ",
    " #.##########.# ",
    " #.#        #.# ",
    " #.#        #.# ",
    " #.#        #.# ",
    " ###        ### ",
    "                ",
    "                ",
    "                ",
)

bed = art(
    "  ############  ",
    "  #..........#  ",
    "  #.########.#  ",
    "  #.#......#.#  ",
    "  #.########.#  ",
    "  #..........#  ",
    "  ############  ",
    "  #.#.#.#.#.##  ",
    "  ##.#.#.#.#.#  ",
    "  #.#.#.#.#.##  ",
    "  ##.#.#.#.#.#  ",
    "  #.#.#.#.#.##  ",
    "  ##.#.#.#.#.#  ",
    "  ############  ",
    "  #..........#  ",
    "  ############  ",
)

shelf = art(
    "################",
    "#..............#",
    "#.#.##.#..#.##.#",
    "#.#.##.#.##.##.#",
    "#.#.##.#.##.##.#",
    "#.#.##.#.##.##.#",
    "################",
    "#..............#",
    "#.##.#.##..#.#.#",
    "#.##.#.##.##.#.#",
    "#.##.#.##.##.#.#",
    "#.##.#.##.##.#.#",
    "################",
    "#..............#",
    "################",
    "                ",
)

pot = art(
    "                ",
    "                ",
    "                ",
    "                ",
    "     ######     ",
    "      #..#      ",
    "    ##....##    ",
    "   #........#   ",
    "  #..######..#  ",
    "  #..........#  ",
    "  #.#.#.#.#..#  ",
    "  #..........#  ",
    "   #........#   ",
    "    ########    ",
    "                ",
    "                ",
)

TILES = [
    ("grass", grass), ("grass2", grass2), ("path", path), ("water0", water0),
    ("water1", water1), ("floor", floor), ("brick", brick), ("roof", roof),
    ("roof_edge", roof_edge), ("window", window), ("door", door), ("wallpaper", wallpaper),
    ("void", void), ("rug", rug), ("mat", mat), ("tree", tree),
    ("bush", bush), ("rock", rock), ("flower", flower), ("fence", fence),
    ("sign", sign), ("chest", chest), ("chest_open", chest_open), ("lamp", lamp),
    ("well", well), ("grave", grave), ("table", table), ("bed", bed),
    ("shelf", shelf), ("pot", pot),
]

# ---------------------------------------------------------------- sprites

HEAD_DOWN = [
    "                ",
    "     ######     ",
    "    ########    ",
    "   ##########   ",
    "   ####.#####   ",
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
    "   ##########   ",
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
    "   ##########   ",
    "   ##########   ",
    "   #######...#  ",
    "   ######..#.#  ",
    "   ######....#  ",
    "    ####....#   ",
    "     ######     ",
]

p_down0 = art(*HEAD_DOWN,
              "    #.#..#.#    ",
              "   #.#....#.#   ",
              "   ##......##   ",
              "    #......#    ",
              "    ########    ",
              "     ##  ##     ")
p_down1 = art(*HEAD_DOWN,
              "    #.#..#.#    ",
              "   #.#....#.#   ",
              "   ##......##   ",
              "    #......#    ",
              "    ########    ",
              "     ##         ")
p_down2 = mirror(p_down1)
p_up0 = art(*HEAD_UP,
            "    #......#    ",
            "   #.#....#.#   ",
            "   ##......##   ",
            "    #......#    ",
            "    ########    ",
            "     ##  ##     ")
p_up1 = art(*HEAD_UP,
            "    #......#    ",
            "   #.#....#.#   ",
            "   ##......##   ",
            "    #......#    ",
            "    ########    ",
            "         ##     ")
p_up2 = mirror(p_up1)
p_right0 = art(*HEAD_RIGHT,
               "     #....#     ",
               "     #.##.#     ",
               "     #.##.#     ",
               "     #....#     ",
               "     ######     ",
               "      ####      ")
p_right1 = art(*HEAD_RIGHT,
               "     #....#     ",
               "    #..##.#     ",
               "    #..##..#    ",
               "     #....#     ",
               "     ######     ",
               "    ##    ##    ")
p_left0 = mirror(p_right0)
p_left1 = mirror(p_right1)

elder0 = art(
    "                ",
    "      ####      ",
    "     #....#     ",
    "    #......#    ",
    "    ########    ",
    "    #......#    ",
    "    #.#..#.#    ",
    "    #......#    ",
    "    #.####.#    ",
    "   #.#....#.#   ",
    "  #..#....#..#  ",
    "  #.#.#..#.#.#  ",
    "  ##.#....#.##  ",
    "   #.#.##.#.#   ",
    "   ##########   ",
    "    ##    ##    ",
)
elder1 = art(
    "                ",
    "                ",
    "      ####      ",
    "     #....#     ",
    "    #......#    ",
    "    ########    ",
    "    #......#    ",
    "    #.#..#.#    ",
    "    #......#    ",
    "    #.####.#    ",
    "  #..#....#..#  ",
    "  #.#.#..#.#.#  ",
    "  ##.#....#.##  ",
    "   #.#.##.#.#   ",
    "   ##########   ",
    "    ##    ##    ",
)

kid0 = art(
    "     ##  ##     ",
    "    #..##..#    ",
    "    ########    ",
    "   ##########   ",
    "   ##......##   ",
    "   #.#....#.#   ",
    "   #........#   ",
    "   ##..##..##   ",
    "   ###....###   ",
    "   ##.####.##   ",
    "    #.#..#.#    ",
    "   ##......##   ",
    "  #..........#  ",
    "  #.#.#.#.#..#  ",
    "  ############  ",
    "     #    #     ",
)
kid1 = art(
    "                ",
    "     ##  ##     ",
    "    #..##..#    ",
    "    ########    ",
    "   ##########   ",
    "   ##......##   ",
    "   #.#....#.#   ",
    "   #........#   ",
    "   ##..##..##   ",
    "   ###....###   ",
    "   ##.####.##   ",
    "   ##......##   ",
    "  #..........#  ",
    "  #.#.#.#.#..#  ",
    "  ############  ",
    "     #    #     ",
)

cat0 = art(
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "   #   #        ",
    "   ## ##        ",
    "   #####     #  ",
    "   #.#.#     #  ",
    "   #####    #   ",
    "    ###    #    ",
    "   ########     ",
    "  #########     ",
    "  #########     ",
    "  ## #  # ##    ",
    "                ",
)
cat1 = art(
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "   #   #        ",
    "   ## ##        ",
    "   #####        ",
    "   #####        ",
    "   #####     ## ",
    "    ###    ##   ",
    "   ########     ",
    "  #########     ",
    "  #########     ",
    "  ## #  # ##    ",
    "                ",
)

ghost0 = art(
    "                ",
    "     ######     ",
    "    #......#    ",
    "   #........#   ",
    "   #.##..##.#   ",
    "   #.##..##.#   ",
    "   #........#   ",
    "   #...##...#   ",
    "   #...##...#   ",
    "  #..........#  ",
    " #.#........#.# ",
    "  ##........##  ",
    "   #........#   ",
    "   #..#..#..#   ",
    "   #.# ## #.#   ",
    "   ##      ##   ",
)
ghost1 = art(
    "     ######     ",
    "    #......#    ",
    "   #........#   ",
    "   #.##..##.#   ",
    "   #.##..##.#   ",
    "   #........#   ",
    "   #...##...#   ",
    "   #...##...#   ",
    "  #..........#  ",
    " #.#........#.# ",
    "  ##........##  ",
    "   #........#   ",
    "   #........#   ",
    "   ##..#..#.#   ",
    "    ##.# #.##   ",
    "     ##   ##    ",
)

d20 = art(
    "                ",
    "       ##       ",
    "     ##..##     ",
    "   ##......##   ",
    "  #.########.#  ",
    "  #.#......#.#  ",
    "  #..#....#..#  ",
    "  #..#....#..#  ",
    "  #...#..#...#  ",
    "  #...#..#...#  ",
    "  #....##....#  ",
    "  #.##....##.#  ",
    "   ##......##   ",
    "     ##..##     ",
    "       ##       ",
    "                ",
)
page = art(
    "                ",
    "   #######      ",
    "   #.....##     ",
    "   #.....#.#    ",
    "   #.....####   ",
    "   #.####...#   ",
    "   #........#   ",
    "   #.######.#   ",
    "   #........#   ",
    "   #.####.#.#   ",
    "   #........#   ",
    "   #.######.#   ",
    "   #......#.#   ",
    "   #.......##   ",
    "   ##########   ",
    "                ",
)
key = art(
    "                ",
    "                ",
    "                ",
    "   ####         ",
    "  #....#        ",
    " #..##..######  ",
    " #.#  #......## ",
    " #..##..###.#.# ",
    "  #....#  #.#.# ",
    "   ####    # #  ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
)
arrow = art(
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "    ########    ",
    "     ######     ",
    "      ####      ",
    "       ##       ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
)
bubble = art(
    "  ############  ",
    " #............# ",
    " #............# ",
    " #..##..##..#.# ",
    " #..##..##..#.# ",
    " #............# ",
    " #............# ",
    "  #####..#####  ",
    "      #.#       ",
    "      ##        ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
    "                ",
)

SPRITES = [
    ("p_down0", p_down0), ("p_down1", p_down1), ("p_down2", p_down2),
    ("p_up0", p_up0), ("p_up1", p_up1), ("p_up2", p_up2),
    ("p_left0", p_left0), ("p_left1", p_left1),
    ("p_right0", p_right0), ("p_right1", p_right1),
    ("elder0", elder0), ("elder1", elder1), ("kid0", kid0), ("kid1", kid1),
    ("cat0", cat0), ("cat1", cat1), ("ghost0", ghost0), ("ghost1", ghost1),
    ("d20", d20), ("page", page), ("key", key), ("arrow", arrow), ("bubble", bubble),
]


def sheet(items, cols=8):
    rows = (len(items) + cols - 1) // cols
    im = Image.new("RGBA", (cols * T, rows * T), CLEAR)
    index = {}
    for i, (name, rows_) in enumerate(items):
        im.paste(to_img(rows_), ((i % cols) * T, (i // cols) * T))
        index[name] = i
    return im, index


def font_sheet(path):
    """ASCII 32..126 into 8x8 cells, 16 per row, black ink on transparent."""
    f = ImageFont.truetype(path, 8)
    im = Image.new("RGBA", (16 * 8, 6 * 8), CLEAR)
    for c in range(32, 127):
        g = Image.new("L", (8, 8), 0)
        ImageDraw.Draw(g).text((0, 0), chr(c), font=f, fill=255)
        i = c - 32
        for y in range(8):
            for x in range(8):
                if g.getpixel((x, y)) > 127:
                    im.putpixel(((i % 16) * 8 + x, (i // 16) * 8 + y), BLACK)
    return im


def preview(items, path, cols=8, scale=4):
    """Contact sheet on a mid-grey so transparency is visible."""
    rows = (len(items) + cols - 1) // cols
    cell = T * scale + 8
    im = Image.new("RGBA", (cols * cell, rows * cell), (128, 128, 128, 255))
    for i, (_, r) in enumerate(items):
        im.alpha_composite(to_img(r).resize((T * scale, T * scale), Image.NEAREST),
                           ((i % cols) * cell + 4, (i // cols) * cell + 4))
    im.save(path)


def main():
    os.makedirs(OUT, exist_ok=True)
    tiles, tindex = sheet(TILES)
    sprites, sindex = sheet(SPRITES)
    tiles.save(os.path.join(OUT, "tiles.png"))
    sprites.save(os.path.join(OUT, "sprites.png"))
    if "--font" in sys.argv:
        font_sheet(sys.argv[sys.argv.index("--font") + 1]).save(os.path.join(OUT, "font.png"))
    if "--preview" in sys.argv:
        d = sys.argv[sys.argv.index("--preview") + 1]
        preview(TILES, os.path.join(d, "preview_tiles.png"))
        preview(SPRITES, os.path.join(d, "preview_sprites.png"))
    with open(os.path.join(OUT, "atlas.json"), "w") as fh:
        json.dump({"size": T, "cols": 8, "tiles": tindex, "sprites": sindex,
                   "font": {"cell": 8, "cols": 16, "first": 32}}, fh, indent=1)
    print(f"{len(TILES)} tiles, {len(SPRITES)} sprites -> {OUT}")


if __name__ == "__main__":
    main()
