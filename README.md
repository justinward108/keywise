# MetaMuse Chords — Max for Live MIDI Generator

Chord progressions from any key and mode, written straight into the piano roll.
Uses the same scales and chord types as the METAMUSE web app's Keys & Scales tab.
Requires Live 12+ (MIDI Tools).

## Files

- `metamuse_chords.js` — all the chord logic (scales, chord shapes, naming, note output)
- `build_device.py` — builds `MetaMuse Chords.amxd` (the device patch is defined here)

## Build / install

```
python3 build_device.py "/path/to/User Library/MIDI Tools/Max Generators"
```

The `.js` file must sit next to the `.amxd`. To make a single self-contained file,
open the device in Max (edit button) and click Freeze.

## Use

1. Open a MIDI clip and go to the **Generate** section of the clip view.
2. Choose **MetaMuse Chords** from the generator menu.
3. Press **Generate**. Changing a control afterwards updates the clip live.

The device has four pages (tabs along the top):

- **Key**: key, scale/mode, chord type (Triad = 3 notes up to 13th = 7 notes),
  default chord Length, octave, inversion, + Bass, Clip Key (follow the clip's
  Scale setting), Fill, and progression presets.
- **1-8** and **9-16**: up to 16 chords. Top menu = scale degree ("-" skips),
  menu below = that chord's length in bars ("=" uses the default Length).
  4 one-bar chords: Length "1 bar". 8 half-bar chords: Length "2 beats" and 8 slots.
- **Feel**: Style (Block, Strum Up/Down, Arp Up/Down/Up-Down/Random), Rate
  (strum spread or arp step), Voice Leading (smooth inversions), Velocity.

Chords fill the clip's time selection (or loop). Turn off **Fill** to write the
progression once.
