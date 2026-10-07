# Stack pose contact-sheet rows (posesheets.mjs) and in-game sequences (seqshots.mjs) into JPEG sheets. Needs Pillow.
#   python3 stack-sheets.py <rowsDir> <outDir>
import os, sys
from PIL import Image, ImageDraw

SHEETS = {
    'poses-locomotion': ['idle', 'run', 'sprint', 'stalk'],
    'poses-air': ['jump', 'land', 'roll', 'slide'],
    'poses-traversal': ['climb', 'leap', 'hang', 'wallrun', 'vault', 'mantle'],
    'poses-combat': ['stance', 'L1', 'L2', 'L3', 'H', 'LAUNCH', 'dodge', 'dodgeback'],
    'poses-kills': ['COUNTER', 'ASSASSIN', 'AIR', 'EXECUTE'],
    'poses-guards': ['guard-march', 'guard-CLUB', 'bodyguard-CLUB', 'sentry-THROW'],
}
# in-game sequences from seqshots.mjs: <name>-<i>.png frames, laid out as rows
GAME = {
    'game-locomotion': ['g-run', 'g-sprint', 'g-stalk'],
    'game-air': ['g-jump', 'g-drop', 'g-roll'],
    'game-traversal': ['g-climb', 'g-vault', 'g-wallrun'],
    'game-combat': ['g-combo', 'g-heavy', 'g-launch', 'g-dodge', 'g-assassinate'],
}
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
def game_row(name):
    frames = []
    i = 0
    while os.path.exists(os.path.join(src, f'{name}-{i}.png')):
        frames.append(Image.open(os.path.join(src, f'{name}-{i}.png')).convert('RGB')); i += 1
    if not frames: return None
    row = Image.new('RGB', (sum(f.width for f in frames), frames[0].height))
    x = 0
    for f in frames: row.paste(f, (x, 0)); x += f.width
    d = ImageDraw.Draw(row); d.rectangle([0, 0, 8 + 8 * len(name), 18], fill=(20, 22, 28)); d.text((4, 3), name[2:], fill=(240, 240, 240))
    return row
for name, rows in GAME.items():
    ims = [r for r in (game_row(n) for n in rows) if r]
    if not ims: continue
    w = max(i.width for i in ims)
    sheet = Image.new('RGB', (w, sum(i.height for i in ims)), (221, 226, 232))
    y = 0
    for i in ims: sheet.paste(i, (0, y)); y += i.height
    sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
    sheet.save(os.path.join(out, name + '.jpg'), quality=80, optimize=True)
    print(name, sheet.size, os.path.getsize(os.path.join(out, name + '.jpg')))
os.makedirs(out, exist_ok=True)
for name, rows in SHEETS.items():
    ims = [Image.open(os.path.join(src, r + '.png')).convert('RGB') for r in rows if os.path.exists(os.path.join(src, r + '.png'))]
    if not ims: continue
    w = max(i.width for i in ims)
    sheet = Image.new('RGB', (w, sum(i.height for i in ims)), (221, 226, 232))
    y = 0
    for i in ims: sheet.paste(i, (0, y)); y += i.height
    sheet = sheet.resize((w * 3 // 4, sheet.height * 3 // 4), Image.LANCZOS)
    sheet.save(os.path.join(out, name + '.jpg'), quality=80, optimize=True)
    print(name, sheet.size, os.path.getsize(os.path.join(out, name + '.jpg')))
