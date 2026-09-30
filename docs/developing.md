# Building from source

The devices are generated from plain text files, so they can be read, changed and rebuilt without
opening Max. You need Python 3 and (for the tests) Node.js.

## Layout

```
src/theory.js       shared music theory: scales, chord shapes, chord names, voice leading
src/chords.js       Keywise Chords
src/lines.js        Keywise Bass and Keywise Melody (one script, "bass" or "melody" mode)
src/keys.js         Keywise Keys
maxpatch.py         small toolkit for writing Max for Live (.amxd) files
build_devices.py    lays out the four devices and builds them
test_devices.cjs    checks the built scripts in Node
devices/            the built devices, ready to install (generated — don't edit)
```

Each device's `.js` file is `src/theory.js` followed by the device's own script, so edit the files in
`src/` and rebuild rather than editing `devices/`.

The scripts are ES5 JavaScript for Max's classic `[js]` object.

## Build and test

```
python3 build_devices.py
node test_devices.cjs
```

To build and install straight into Live at the same time, pass your User Library folder:

```
python3 build_devices.py "/path/to/User Library"
```

## Notes

- MIDI Tools (Generate/Transform) are shown in a panel of about **152 × 146 px**; keep their controls
  inside that area. Keywise Chords uses tabbed pages to fit.
- Menu order in `build_devices.py` must match the matching arrays in `src/` (scales, chord types,
  lengths…). Comments next to each list say which one.
- Each `.amxd` needs its `.js` next to it. To make a single self-contained file, open the device in
  Max (edit button in Live) and click **Freeze**.
