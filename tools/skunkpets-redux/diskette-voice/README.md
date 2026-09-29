# Diskette's voice

Each time Diskette pops up, or a speech balloon comes out of her tray icon, she
says one of eight short robot "hmm"s, picked at random (never the same one twice
running). The script section `DISKETTE POP-UP` plays them; the clips are
`src/building/skunkpets-redux/diskette/diskette-hmm-1.mp3` to `-8.mp3`.

- `hmms-various.mp3`: the original recording ("hmms various 1" by freesound_community on
  Pixabay, under the Pixabay Content License: free to use, no credit needed).
- `robotify.py`: cuts the eight hmms out, raises the pitch about fourteen semitones and speeds them up into squeaky chirps,
  and robotifies them (ring modulation, a short metallic echo, a lo-fi
  bitcrush and a tinny-speaker filter). Change `PITCH`, `TEMPO`, `RING_HZ`, `BAND` or `COMB_MS` and
  rerun it to re-voice her; it overwrites the eight clips.
- `diskette-hmms-all.mp3`: all eight processed clips in a row, for listening.
