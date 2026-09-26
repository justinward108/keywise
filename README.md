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

1. Open a MIDI clip and go to the **Generate** tab in the clip view.
2. Choose **MetaMuse Chords** from the generator menu.
3. Pick Key, Scale/Mode, Chord type (Triad = 3 notes up to 13th = 7 notes) and the scale degrees in the 8 slots (or a preset).
4. Press **Generate**. Changing a control afterwards updates the clip live.

Chords fill the clip's time selection (or loop). Turn off **Fill Selection** to write
the progression once. **Use Clip Scale** follows the clip's Scale Mode instead of Key/Scale.
