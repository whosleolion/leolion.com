# Makes Diskette's voice: cuts the eight "hmm"s out of hmms-various.mp3, pitches
# them up and robotifies them, and writes
# src/building/skunkpets/diskette/diskette-hmm-1..8.mp3 (plus
# diskette-hmms-all.mp3 here, all eight in a row, for listening).
#   pip install numpy scipy imageio-ffmpeg     (or have ffmpeg on your PATH)
#   python3 tools/skunkpets-redux/diskette-voice/robotify.py
# Tweak PITCH / TEMPO / RING_HZ / BAND / COMB_MS below and rerun. SEGS are the start/end
# seconds of each hmm in the original.
import os, shutil, subprocess, tempfile, numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', '..', 'src', 'building', 'skunkpets', 'diskette')
try:
    import imageio_ffmpeg; FF = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FF = shutil.which('ffmpeg') or 'ffmpeg'
TMP = tempfile.mkdtemp()
T = lambda name: os.path.join(TMP, name)
subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', os.path.join(HERE, 'hmms-various.mp3'),
                '-ac', '1', '-ar', '44100', T('src.wav')], check=True)
SEGS = [(0.92,1.64),(2.92,3.78),(4.42,5.14),(6.42,6.90),(8.14,8.84),(9.96,10.74),(11.76,12.54),(13.52,14.30)]
PITCH = 2.25     # ~ +14 semitones: squeaky
TEMPO = 1.6      # much quicker than the original, so each hmm is a chirp
RING_HZ = 160    # ring-mod carrier (the "robot")
BAND = (450, 7000)  # tinny-speaker band-pass, Hz
COMB_MS = 2.5    # metallic echo delay
sr, x = wavfile.read(T('src.wav')); x = x.astype(np.float32) / 32768

def ff_pitch(seg):
    wavfile.write(T('tmp_in.wav'), sr, (seg * 32767).astype(np.int16))
    # asetrate raises pitch and speed together; atempo brings the speed back down to TEMPO.
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', T('tmp_in.wav'), '-af',
        f'asetrate={int(sr*PITCH)},aresample={sr},atempo={TEMPO/PITCH:.4f}', T('tmp_out.wav')], check=True)
    return wavfile.read(T('tmp_out.wav'))[1].astype(np.float32) / 32768

def fade(y, a=0.012, b=0.06):
    y = y.copy(); na, nb = int(sr*a), int(sr*b)
    y[:na] *= np.linspace(0, 1, na); y[-nb:] *= np.linspace(1, 0, nb) ** 2
    return y

outs = []
for i, (a, b) in enumerate(SEGS, 1):
    seg = x[int((a-0.06)*sr):int((b+0.12)*sr)]
    seg = sosfilt(butter(4, 120, 'hp', fs=sr, output='sos'), seg)          # rumble/breath floor
    y = ff_pitch(fade(seg))
    t = np.arange(len(y)) / sr
    y = 0.55 * y * np.sin(2*np.pi*RING_HZ*t) + 0.45 * y                    # ring mod, part dry so the hmm stays readable
    d = int(sr * COMB_MS / 1000); z = y.copy()                                     # short comb = metallic resonance
    for k in range(d, len(z)): z[k] += 0.45 * z[k-d]
    y = z
    hold = 3; y = np.repeat(y[::hold], hold)[:len(y)]                      # sample-and-hold decimation
    y = np.round(y * 48) / 48                                             # ~6-bit crush (applied at unit scale below)
    y = sosfilt(butter(4, list(BAND), 'bp', fs=sr, output='sos'), y)      # tinny little speaker
    y = fade(y / (np.abs(y).max() + 1e-9) * 0.8, 0.005, 0.05)
    wavfile.write(T(f'robot-{i}.wav'), sr, (y * 32767).astype(np.int16))
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', T(f'robot-{i}.wav'), '-ac', '1', '-ar', '44100',
                    '-c:a', 'libmp3lame', '-b:a', '96k', os.path.join(OUT, f'diskette-hmm-{i}.mp3')], check=True)
    outs.append(y); outs.append(np.zeros(int(sr*0.45), np.float32))
    print(i, f'{len(y)/sr:.2f}s')
all_ = np.concatenate(outs)
wavfile.write(T('all.wav'), sr, (all_ * 32767).astype(np.int16))
subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', T('all.wav'), '-c:a', 'libmp3lame', '-b:a', '128k', os.path.join(HERE, 'diskette-hmms-all.mp3')], check=True)
