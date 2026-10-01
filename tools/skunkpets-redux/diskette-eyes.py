"""Makes the pieces for Diskette's moving pupils (her "inspecting" mode)
from diskette-cutout.png:

  diskette-body.png      her picture with the pupils painted out
  diskette-pupil-l.png   left pupil (black with alpha), and
  diskette-pupil-r.png   right pupil, cut from the original
  diskette-eyemask.png   where pupils may show: the eye-whites,
                         minus the lashes that overlap them

EYES below are the eye-white ellipses (centre x, centre y, radius x,
radius y) in diskette-cutout.png pixels, fitted by hand; the script's
DISKETTE INSPECTING section uses the same numbers. Needs Pillow,
numpy and scipy:  python3 tools/skunkpets-redux/diskette-eyes.py
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as nd

HERE = os.path.dirname(os.path.abspath(__file__))
EYES = [(91.5, 89.5, 27.5, 20.5), (156.8, 100.5, 25.5, 18.5)]

src = Image.open(os.path.join(HERE, "diskette-cutout.png")).convert("RGBA")
px = np.array(src).astype(float)
lum = px[..., 0] * 0.299 + px[..., 1] * 0.587 + px[..., 2] * 0.114
H, W = lum.shape
yy, xx = np.mgrid[0:H, 0:W]


def ellipse(cx, cy, rx, ry, grow=0.0):
    return ((xx - cx) / (rx + grow)) ** 2 + ((yy - cy) / (ry + grow)) ** 2 <= 1


body = px.copy()
mask_all = np.zeros((H, W), float)
for side, (cx, cy, rx, ry) in zip("lr", EYES):
    eye = ellipse(cx, cy, rx, ry)
    # The pupil: the big dark blob in the middle of the eye.
    core = eye & ellipse(cx, cy, rx * 0.6, ry * 0.7) & (lum < 90)
    core = nd.binary_fill_holes(nd.binary_closing(core, iterations=2))
    lab, _ = nd.label(core)
    core = lab == lab[int(cy), int(cx)]
    pupil = nd.binary_fill_holes(nd.binary_dilation(core, iterations=3) & (lum < 238))
    hole = nd.binary_dilation(pupil, iterations=2)

    # Paint the pupil out: blend the eye-white across the hole, row-wise and
    # column-wise, from the colours just outside it.
    fill = np.zeros((H, W, 4))
    count = np.zeros((H, W))
    ys, xs = np.where(hole)
    for axis in (0, 1):
        for y, x in zip(ys, xs):
            a = b = None
            if axis:
                l = x
                while l > 0 and hole[y, l]: l -= 1
                r = x
                while r < W - 1 and hole[y, r]: r += 1
                ca, cb, t = px[y, l], px[y, r], (x - l) / (r - l)
            else:
                u = y
                while u > 0 and hole[u, x]: u -= 1
                d = y
                while d < H - 1 and hole[d, x]: d += 1
                ca, cb, t = px[u, x], px[d, x], (y - u) / (d - u)
            fill[y, x] += ca * (1 - t) + cb * t
            count[y, x] += 1
    body[hole] = fill[hole] / count[hole][:, None]
    for _ in range(3):  # smooth out streaks from the blending
        body[hole] = nd.gaussian_filter(body, sigma=(1.5, 1.5, 0))[hole]

    # The pupil sprite: black, alpha from how dark each pixel is against the
    # eye-white around it.
    white = np.median(lum[nd.binary_dilation(hole, iterations=3) & ~hole])
    alpha = np.clip((white - lum) / white, 0, 1) * pupil
    y0, y1 = np.where(pupil.any(1))[0][[0, -1]]
    x0, x1 = np.where(pupil.any(0))[0][[0, -1]]
    sprite = np.zeros((y1 - y0 + 1, x1 - x0 + 1, 4), np.uint8)
    sprite[..., 3] = (alpha[y0:y1 + 1, x0:x1 + 1] * 255).round()
    Image.fromarray(sprite).save(os.path.join(HERE, "diskette-pupil-%s.png" % side))
    print(side, "pupil box", x0, y0, x1 + 1, y1 + 1, "white", round(white))

    # Where pupils may show: inside the eye-white, not on the dark lashes
    # and lids that overlap it (anything dark outside the pupil).
    lashes = (lum < 170) & ~nd.binary_dilation(pupil, iterations=2)
    soft = np.clip(1 - (np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) - 0.97) / 0.06, 0, 1)
    mask_all = np.maximum(mask_all, soft * ~lashes)

Image.fromarray(body.round().astype(np.uint8)).save(os.path.join(HERE, "diskette-body.png"))
m = np.zeros((H, W, 4), np.uint8)
m[..., 3] = (mask_all * 255).round()
Image.fromarray(m).save(os.path.join(HERE, "diskette-eyemask.png"))
