# Keywise

**Free Max for Live devices that keep your music in key.** Pick a key and a mode, and Keywise writes
chord progressions, basslines and melodies straight into Ableton Live's piano roll, or lets you
play full chords with one finger.

No music theory needed: chords are chosen by number (I, ii, iii, IV, V, vi, vii°), and Keywise
works out the notes for whichever key and mode you pick.

| Device | What it does | Where it lives in Live |
|---|---|---|
| **Keywise Chords** | Writes chord progressions (up to 16 chords) into a MIDI clip | Clip view → **Generate** |
| **Keywise Bass** | Turns the chords in a clip into a bassline | Clip view → **Transform** |
| **Keywise Melody** | Writes a melody that follows the chords in a clip | Clip view → **Transform** |
| **Keywise Keys** | Play one key, hear a full chord in your key | MIDI effect, in front of any instrument |

## Requirements

- **Ableton Live 12 Suite**, or Live 12 Standard with the Max for Live add-on.
  (Chords, Bass and Melody are Live 12 "MIDI Tools", which don't exist in Live 11.)
- Made and tested on **macOS**. Windows should work the same way; please open an issue if it doesn't.

## Install

1. **Download** this project: click the green **Code** button above, then **Download ZIP**, and unzip it.
2. **Find your User Library.** In Live, open **Settings → Library** and look at
   **Location of User Library**. (On a Mac it is usually `Music/Ableton/User Library`.)
3. **Copy the files** from the `devices` folder into your User Library.
   Copy the *files*, not the folders, so you don't replace anything already there:

   | Copy everything inside… | …into this folder of your User Library |
   |---|---|
   | `devices/Generate` | `MIDI Tools/Max Generators` |
   | `devices/Transform` | `MIDI Tools/Max Transformations` |
   | `devices/MIDI Effect` | `Presets/MIDI Effects/Max MIDI Effect` |

   If one of those folders doesn't exist yet, create it (the names must match exactly).
   Each `.amxd` device needs its `.js` file right next to it.
4. **Restart Live.**

## Quick start

1. Create a MIDI clip on a track with an instrument and open it (double-click).
2. In the clip view on the left, find the **Generate** section, choose **Keywise Chords** from its menu,
   and press **Generate**. You get I – V – vi – IV in C major.
3. Change the key, the scale/mode or the chords on the device — the clip updates as you go.
4. Want a bassline? Duplicate the clip onto a bass track, select all notes, choose
   **Keywise Bass** in the **Transform** section and press **Transform**.

## Guides

- [Keywise Chords](docs/chords.md) — progressions, chord types, lengths, inversions, strum and arpeggio
- [Keywise Bass and Keywise Melody](docs/bass-and-melody.md) — turning chords into lines
- [Keywise Keys](docs/keys.md) — playing chords live with one finger
- [Building from source](docs/developing.md) — for anyone who wants to change the devices

## Troubleshooting

- **The device isn't in the Generate/Transform menu.** Restart Live, and check that the files are in
  exactly the folders listed above.
- **The Max window says it can't find a `.js` file.** The `.js` file must be in the same folder as
  the `.amxd` device. Copy both.
- **Nothing happens when I press Generate.** Make sure a MIDI clip is open in the clip view.
- **Bass or Melody gives strange results.** They read the chords from the notes you select. Block or
  strummed chords work best; arpeggiated clips confuse the chord detection.

## License

Free to use, share and change under the [MIT License](LICENSE).
