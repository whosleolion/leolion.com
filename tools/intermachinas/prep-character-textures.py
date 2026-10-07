# Turn downloaded CC0 Poly Haven maps into small tintable detail maps for the INTERMACHINAS characters.
# Albedo -> luminance, re-centred to a light grey (so material.color sets the hue), contrast boosted.
# Inputs: <srcDir> holds the 1k JPGs from fetch-polyhaven-textures.mjs (hessian_380, brown_leather,
# green_metal_rust) and <srcDir>/../gasmask/textures/ the Old Gas Mask maps. Needs Pillow.
#   python3 prep-character-textures.py <srcDir> src/building/intermachinas/assets/characters
import sys, os
from PIL import Image, ImageOps, ImageStat, ImageEnhance, ImageChops

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
S = 512

def detail(name, dst, mean=200, contrast=1.6, size=S, q=82):
    im = Image.open(os.path.join(src, name)).convert('L').resize((size, size), Image.LANCZOS)
    m = ImageStat.Stat(im).mean[0]
    im = im.point(lambda v: max(0, min(255, mean + (v - m) * contrast)))
    im.save(os.path.join(out, dst), quality=q, optimize=True, progressive=True)

def normal(name, dst, size=S, q=85, flatten=1.0):
    im = Image.open(os.path.join(src, name)).convert('RGB').resize((size, size), Image.LANCZOS)
    im.save(os.path.join(out, dst), quality=q, optimize=True, progressive=True)

detail('hessian_380_Diffuse.jpg', 'cloth_d.jpg', mean=205, contrast=2.2)
normal('hessian_380_nor_gl.jpg', 'cloth_n.jpg')
detail('brown_leather_Diffuse.jpg', 'leather_d.jpg', mean=200, contrast=2.0)
normal('brown_leather_nor_gl.jpg', 'leather_n.jpg')
detail('green_metal_rust_Diffuse.jpg', 'enamel_d.jpg', mean=215, contrast=1.8)
normal('green_metal_rust_nor_gl.jpg', 'enamel_n.jpg')
# gas mask keeps its own colours (black rubber, green filter), just smaller
gm = os.path.join(src, '..', 'gasmask', 'textures')
Image.open(os.path.join(gm, 'old_gas_mask_diff_1k.jpg')).convert('RGB').resize((S, S), Image.LANCZOS).save(os.path.join(out, 'gasmask_d.jpg'), quality=84, optimize=True, progressive=True)
Image.open(os.path.join(gm, 'old_gas_mask_nor_gl_1k.jpg')).convert('RGB').resize((S, S), Image.LANCZOS).save(os.path.join(out, 'gasmask_n.jpg'), quality=85, optimize=True, progressive=True)
for f in sorted(os.listdir(out)): print(f, os.path.getsize(os.path.join(out, f)))
