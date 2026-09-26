# MetaMuse for Ableton Live (Max for Live)

Four devices built on the METAMUSE chord theory (same scales and chord types as
the web app's Keys & Scales tab). Requires Live 12+ Suite (or Max for Live).

| Device | Type | Where it appears in Live | What it does |
|---|---|---|---|
| MetaMuse Chords | MIDI Tool – Generate | Clip view → Generate | Writes chord progressions into the clip |
| MetaMuse Bass | MIDI Tool – Transform | Clip view → Transform | Turns chords in a clip into a bassline |
| MetaMuse Melody | MIDI Tool – Transform | Clip view → Transform | Writes a melody that follows the chords |
| MetaMuse Chord Keys | MIDI Effect | Browser → Max for Live / MIDI Effects | One key plays a full chord, live |

## Files

- `src/theory.js` — shared theory: scales, chord shapes, chord names, voice leading
- `src/chords.js`, `src/lines.js`, `src/chordkeys.js` — each device's own logic
- `maxpatch.py` — small toolkit for writing Max for Live device files
- `build_devices.py` — lays out the four devices and builds them
- `test_devices.cjs` — checks the built scripts in Node

Each device's `.js` is generated (theory.js + its own file), so edit `src/` and rebuild.

## Build / test / install

```
python3 build_devices.py && node test_devices.cjs
python3 build_devices.py "/path/to/User Library"
```

The install puts each device (and its `.js`, which must stay next to it) in the right
User Library folder. To make a single self-contained file, open the device in Max and Freeze.

## MetaMuse Chords

Open a MIDI clip, choose MetaMuse Chords in the Generate section, press Generate.
Changing a control afterwards updates the clip live. Pages (tabs along the top):

- **Key**: key, scale/mode, chord type (Triad = 3 notes up to 13th = 7 notes), default
  chord Length, octave, inversion, + Bass, Clip Key (follow the clip's Scale), Fill, presets.
- **1-8** / **9-16**: up to 16 chords. Top menu = scale degree ("-" skips), menu below =
  that chord's length in bars ("=" uses the default Length).
  4 one-bar chords: Length "1 bar". 8 half-bar chords: Length "2 beats" and 8 slots.
- **Feel**: Style (Block, Strum Up/Down, Arp Up/Down/Up-Down/Random), Rate, Voice Leading, Velocity.

Chords fill the clip's time selection (or loop). Turn off **Fill** to write the progression once.

## MetaMuse Bass / Melody

1. Duplicate your chord clip onto the bass (or lead) track.
2. Select all notes, pick MetaMuse Bass or Melody in the Transform section, press Transform.
3. Tweak the controls — the result updates from the original chords until you click elsewhere.

Chords are detected from notes that start together, so block or strummed chords work
best (not arpeggios). Bass patterns: Held, Pulse, Root-Fifth, Octaves, Walking,
Syncopated, Push. Melody: Rhythm, Density, Octave, Variation (a different melody per
number), Repeat Motif.

## MetaMuse Chord Keys

Put it in front of any instrument.

- **White Keys**: the white keys always play chords I–VII of your key (C = I, D = ii,
  E = iii, F = IV, G = V, A = vi, B = vii°); black keys are ignored.
- **Snap**: any key plays the chord on the nearest scale note at or below it.
- **Smooth** (voice leading), **+ Bass**, **Inversion**, **Octave**, and **Strum** (ms, up/down).
