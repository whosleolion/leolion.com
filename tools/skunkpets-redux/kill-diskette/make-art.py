# Makes KILL DISKETTE's pictures of her from Leo's drawings in sources/ and
# writes them next to the minigame (src/building/skunkpets/minigames/kill-diskette/):
#   diskette.png              the usual one
#   diskette-<name>.png       the variants she sometimes pops up as
# The disc's centre hole (white with black rings) is painted over in the
# disc's grey (Leo asked for it gone). The white paper around her is made transparent (a flood fill from the
# edges, so her eyes and the hole in the middle stay white), and every
# picture is cropped to the same box, so she's the same size and in the same
# place whichever one pops up.
#   python3 tools/skunkpets-redux/kill-diskette/make-art.py
import os
from collections import deque
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'sources')
OUT = os.path.join(HERE, '..', '..', '..', 'src', 'building', 'skunkpets', 'minigames', 'kill-diskette')
PICTURES = {
    'diskette.png': 'diskette-drawn-original.png',
    'diskette-gasp.png': 'variant-gasp.png',
    'diskette-x-eyes.png': 'variant-x-eyes.png',
    'diskette-brutus.png': 'variant-brutus.png',
    'diskette-nyaa.png': 'variant-nyaa.png',
    'diskette-stop.png': 'variant-stop.png',
}

# Where the centre hole is in every drawing (same canvas): centre and radii, px.
HOLE = (248, 180, 45, 46)
DISC_GREY = (217, 221, 222, 255)

def cut_out(path):
    a = np.array(Image.open(path).convert('RGBA'))
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    cx, cy, rx, ry = HOLE
    a[((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1] = DISC_GREY
    h, w = a.shape[:2]
    light = a[:, :, :3].astype(int).min(axis=2) > 200
    bg = np.zeros((h, w), bool)
    q = deque((y, x) for y in range(h) for x in (0, w - 1)) + deque((y, x) for x in range(w) for y in (0, h - 1))
    for y, x in list(q):
        if not light[y, x]: continue
        bg[y, x] = True
    q = deque((y, x) for y, x in q if bg[y, x])
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and light[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))
    a[:, :, 3] = np.where(bg, 0, 255)
    return Image.fromarray(a)

pics = {out: cut_out(os.path.join(SRC, src)) for out, src in PICTURES.items()}
boxes = [p.getbbox() for p in pics.values()]
box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
for out, p in pics.items():
    p.crop(box).save(os.path.join(OUT, out), optimize=True)
print('box', box, 'size', (box[2] - box[0], box[3] - box[1]))
