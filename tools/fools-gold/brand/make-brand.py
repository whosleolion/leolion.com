"""Builds the Fool's Gold brand files (SVG with outlined letters) from the Fraunces display face.
Usage: python3 -I make-brand.py <Fraunces.woff> <out-dir>
Fraunces is licensed under the SIL Open Font License; the letters here are converted to outlines.
"""
import math, sys, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

font = TTFont(sys.argv[1]); gs = font.getGlyphSet(); cm = font.getBestCmap()
out = sys.argv[2]; os.makedirs(out, exist_ok=True)

def glyph(ch):
    g = gs[cm[ord(ch)]]; p = SVGPathPen(gs); g.draw(p)
    return p.getCommands(), g.width

# palette
INK = '#0c0d0f'; SLATE_HI = '#171d22'; SLATE_LO = '#080a0c'
GLINT = '#f4e3a0'; BRASS = '#d2b04a'; BRASS_LO = '#8a6e22'; DEEP = '#16120a'

# ---------------------------------------------------------------- icon
G_PATH, G_W = glyph('G')
S = 0.27                                   # G scale (units -> px on the 1024 canvas)
GX = 512 - (43 + 1369) / 2 * S             # centre the glyph's outline
GY = 512 + (699 * S)                       # baseline so the outline centres vertically

def ticks(r0, r1, n, w):
    parts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        x0, y0 = 512 + r0 * math.cos(a), 512 + r0 * math.sin(a)
        x1, y1 = 512 + r1 * math.cos(a), 512 + r1 * math.sin(a)
        parts.append(f'M{x0:.1f} {y0:.1f}L{x1:.1f} {y1:.1f}')
    return f'<path d="{"".join(parts)}" stroke="#4a3a10" stroke-opacity=".55" stroke-width="{w}" stroke-linecap="butt" fill="none"/>'

def icon(rounded=False, bg=True):
    rx = ' rx="228"' if rounded else ''
    bgrect = f'<rect width="1024" height="1024"{rx} fill="url(#bg)"/>' if bg else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{SLATE_HI}"/><stop offset="1" stop-color="{SLATE_LO}"/></linearGradient>
<linearGradient id="rim" x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="{GLINT}"/><stop offset=".5" stop-color="{BRASS}"/><stop offset="1" stop-color="{BRASS_LO}"/></linearGradient>
<linearGradient id="face" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#e6cb6a"/><stop offset=".55" stop-color="{BRASS}"/><stop offset="1" stop-color="#a9892f"/></linearGradient>
</defs>
{bgrect}
<circle cx="512" cy="512" r="388" fill="url(#rim)"/>
{ticks(360, 388, 84, 7)}
<circle cx="512" cy="512" r="344" fill="url(#rim)" opacity=".9"/>
<circle cx="512" cy="512" r="330" fill="url(#face)"/>
<circle cx="512" cy="512" r="330" fill="none" stroke="#fff6cf" stroke-opacity=".55" stroke-width="4"/>
<circle cx="512" cy="512" r="340" fill="none" stroke="#5a460f" stroke-opacity=".45" stroke-width="3"/>
<g transform="translate({GX:.1f} {GY:.1f}) scale({S} -{S})"><path d="{G_PATH}" fill="#fff3bf" opacity=".55" transform="translate(0 -22)"/></g>
<g transform="translate({GX:.1f} {GY:.1f}) scale({S} -{S})"><path d="{G_PATH}" fill="{DEEP}"/></g>
<rect x="500" y="262" width="24" height="500" rx="2" fill="{DEEP}"/>
</svg>
'''

open(f'{out}/icon.svg', 'w').write(icon(False))
open(f'{out}/favicon.svg', 'w').write(icon(True))

# ---------------------------------------------------------------- wordmark
def wordmark(fg, accent):
    text = "Fool’s Gold"
    size = 0.1                      # units -> px; ~200px cap
    x = 0; parts = []; gx = None
    for ch in text:
        if ch == ' ':
            x += 480; continue
        d, w = glyph(ch)
        if ch == 'G':
            gx = x
            parts.append(f'<path transform="translate({x * size:.1f} 150) scale({size} -{size})" d="{d}" fill="{accent}"/>')
            cx = (x + (43 + 1369) / 2) * size
            parts.append(f'<rect x="{cx - 4:.1f}" y="2" width="8" height="178" rx="1" fill="{accent}"/>')
        else:
            parts.append(f'<path transform="translate({x * size:.1f} 150) scale({size} -{size})" d="{d}" fill="{fg}"/>')
        x += w - 20
    width = x * size
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 0 {width + 20:.0f} 190" width="{(width + 20) * 2:.0f}" height="380">{"".join(parts)}</svg>\n'

open(f'{out}/wordmark-on-dark.svg', 'w').write(wordmark('#ecebe6', BRASS))
open(f'{out}/wordmark-on-light.svg', 'w').write(wordmark('#16181a', '#8a6a0f'))
print('ok')
