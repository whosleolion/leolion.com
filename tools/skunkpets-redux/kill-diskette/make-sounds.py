# Makes KILL DISKETTE's sounds from the recordings in sources/ and writes them
# next to the minigame (src/building/skunkpets/minigames/kill-diskette/):
#   gunshot.mp3            the shot, trimmed
#   glass-1..3.mp3         the three glass/bottle breaks (one is picked at random)
#   scream-1..4.mp3        the four screams cut out of screams.mp3 and put
#                          through Diskette's robot voice (same chain as
#                          ../diskette-voice/robotify.py)
# Everything is brought to the same modest loudness (LEVEL, capped at PEAK)
# so nothing is jarring; the game plays them quieter still.
#   pip install numpy scipy imageio-ffmpeg     (or have ffmpeg on your PATH)
#   python3 tools/skunkpets-redux/kill-diskette/make-sounds.py
import os, shutil, subprocess, tempfile, numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'sources')
OUT = os.path.join(HERE, '..', '..', '..', 'src', 'building', 'skunkpets', 'minigames', 'kill-diskette')
try:
    import imageio_ffmpeg; FF = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FF = shutil.which('ffmpeg') or 'ffmpeg'
TMP = tempfile.mkdtemp()
T = lambda name: os.path.join(TMP, name)
sr = 44100
LEVEL = 0.07          # every clip's loudness (RMS of its loud part; 0.07 ~ -23 dBFS), so they match
PEAK = 0.6            # and no sample louder than this (1.0 = full scale)

def load(name):
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', os.path.join(SRC, name),
                    '-ac', '1', '-ar', str(sr), T('in.wav')], check=True)
    return wavfile.read(T('in.wav'))[1].astype(np.float32) / 32768

def fade(y, a=0.005, b=0.08):
    y = y.copy(); na, nb = int(sr*a), int(sr*b)
    y[:na] *= np.linspace(0, 1, na); y[-nb:] *= np.linspace(1, 0, nb) ** 2
    return y

def trim(y, start, end):
    """Seconds start..end, then drop the quiet tail."""
    y = y[int(start*sr):int(end*sr) if end else None]
    loud = np.where(np.abs(y) > np.abs(y).max() * 0.01)[0]
    return y[:loud[-1] + int(sr*0.05)] if len(loud) else y

def save(y, name):
    y = y / (np.abs(y).max() + 1e-9)
    loud = y[np.abs(y) > 0.05]
    y = y * (LEVEL / (np.sqrt(np.mean(loud ** 2)) + 1e-9))
    if np.abs(y).max() > PEAK: y = y * (PEAK / np.abs(y).max())
    y = fade(y)
    wavfile.write(T('out.wav'), sr, (y * 32767).astype(np.int16))
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', T('out.wav'), '-ac', '1', '-ar', str(sr),
                    '-c:a', 'libmp3lame', '-b:a', '96k', os.path.join(OUT, name)], check=True)
    print(name, f'{len(y)/sr:.2f}s')

# The shot and the glass: trimmed, faded out.
save(trim(load('gunshot.mp3'), 0, 1.2), 'gunshot.mp3')
for i, (name, end) in enumerate([('glass-shattering.mp3', 1.8), ('glass-breaking.mp3', 1.8), ('bottle-shatter.mp3', 1.8)], 1):
    save(trim(load(name), 0, end), f'glass-{i}.mp3')

# The screams, robotified like her "hmm"s (see ../diskette-voice/robotify.py).
SCREAMS = [(0.42, 2.02), (2.06, 2.62), (2.64, 3.92), (4.18, 7.08)]
PITCH = 1.8           # higher, but less squeaky than her hmms so a scream still reads as a scream
TEMPO = 1.35          # a bit quicker
RING_HZ = 160
BAND = (450, 7000)
COMB_MS = 2.5
x = load('screams.mp3')
for i, (a, b) in enumerate(SCREAMS, 1):
    seg = sosfilt(butter(4, 120, 'hp', fs=sr, output='sos'), x[int(a*sr):int(b*sr)])
    wavfile.write(T('p_in.wav'), sr, (fade(seg, 0.01, 0.05) * 32767).astype(np.int16))
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', T('p_in.wav'), '-af',
        f'asetrate={int(sr*PITCH)},aresample={sr},atempo={TEMPO/PITCH:.4f}', T('p_out.wav')], check=True)
    y = wavfile.read(T('p_out.wav'))[1].astype(np.float32) / 32768
    t = np.arange(len(y)) / sr
    y = 0.55 * y * np.sin(2*np.pi*RING_HZ*t) + 0.45 * y
    d = int(sr * COMB_MS / 1000); z = y.copy()
    for k in range(d, len(z)): z[k] += 0.45 * z[k-d]
    y = z / (np.abs(z).max() + 1e-9)
    hold = 3; y = np.repeat(y[::hold], hold)[:len(y)]
    y = np.round(y * 48) / 48
    y = sosfilt(butter(4, list(BAND), 'bp', fs=sr, output='sos'), y)
    save(y, f'scream-{i}.mp3')
