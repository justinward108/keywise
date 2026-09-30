# Keywise Keys

A MIDI effect for playing live: press one key, hear a full chord in your key and mode.

**Open it:** in Live's browser go to your **User Library → Presets → MIDI Effects → Max MIDI Effect**
(or search for "Keywise Keys") and drag it onto a MIDI track, **in front of** the instrument.

## Two ways to play

**White Keys** (default): the white keys always play the seven chords of your key, in order.

| Key you press | C | D | E | F | G | A | B |
|---|---|---|---|---|---|---|---|
| Chord you hear | I | ii | iii | IV | V | vi | vii° |

So in **A minor**, C–D–E–F play Am, B°, C, Dm; switch to **F# Dorian** and the same white keys play
the right chords for F# Dorian. Black keys are ignored in this mode. The octave you play in sets the
octave of the chord.

**Snap**: any key (black or white) plays the chord built on the nearest note of your scale, at or
below the key you press.

## Controls

| Control | What it does |
|---|---|
| **Key**, **Scale / Mode** | The key and mode of the chords. |
| **Keys** | White Keys or Snap (see above). |
| **Chord** | Chord type: Triad (3 notes) to 13th (7 notes), or fixed shapes like sus4 and add9. |
| **Octave** | Shift the chords up or down by octaves. |
| **Inversion** | Which note of the chord is at the bottom. |
| **+ Bass** | Adds the root an octave below. |
| **Smooth** | Voice leading: each chord uses the inversion closest to the previous one, so changes sound connected. |
| **Strum ms** / **Up-Down** | Staggers the notes by that many milliseconds, low-to-high or high-to-low. 0 = all together. |

The big readout shows the chord you are playing, e.g. `iv  Dm`.

Mod wheel, pitch bend, aftertouch and other MIDI messages pass through unchanged.

Tip: record-arm the track and record what you play. Keywise Keys sends the full chords, so the
recorded clip contains all the notes, ready for Keywise Bass and Keywise Melody.
