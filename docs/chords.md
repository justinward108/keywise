# Keywise Chords

A MIDI Tool that writes chord progressions into the clip you have open.

**Open it:** open a MIDI clip → clip view → **Generate** section → choose **Keywise Chords** →
press **Generate**. After that, every change you make on the device updates the clip straight away.

The chords fill the clip's **time selection** (or its loop if nothing is selected).

The device has six tabs along the top: **Key · 1-4 · 5-8 · 9-12 · 13-16 · Feel**.
Hover over any control to see what it does in Live's Info View.

## Key tab

| Control | What it does |
|---|---|
| **Key** (C, C#, D…) | The key the chords are in. |
| **Scale / Mode** | Major, Natural Minor, Harmonic Minor, Melodic Minor, Dorian, Phrygian, Lydian, Mixolydian, Locrian, Pentatonic Major/Minor, Blues, Whole Tone, Diminished. |
| **Chord type** | Used by every chord set to *Type=*. Triad (3 notes), 7th (4), 9th (5), 11th (6) and 13th (7) are built from the scale, so they follow the mode. The others (5th, add9, sus2, sus4, maj9, min9, 9, add11, m/maj7, dim7, aug) are fixed shapes. |
| **Length** | How long each chord lasts, for chords set to *Len=*. |
| **Oct** | Octave of the chords (Live's naming: C3 = middle C). |
| **Inv** | Inversion for chords set to *Inv=*: 0 = root position, 1 = lowest note moved up an octave, and so on. |
| **+ Bass** | Adds each chord's root an octave below. |
| **Clip Key** | Ignore Key and Scale and use the clip's own **Scale** setting instead. |
| **Fill** | On: repeat the progression until the selection is full. Off: write it once. |
| **Presets** | Load a common progression: I–V–vi–IV, ii–V–I, 12-bar blues, a 16-chord pop song and more. |
| **Duplicate Chords** | Copies your chords into the next empty slots (4 → 8 → 16), each with its type, length and inversion, so you can repeat a pattern and change the copies. |

## Chord tabs (1-4, 5-8, 9-12, 13-16)

Each chord is a column of four menus:

```
[ I   ]   chord: which chord of the scale (I–VII). "-" = leave this slot empty
[Type=]   chord type for this chord only ("Type=" follows the Key tab)
[Len= ]   length in bars for this chord only ("Len=" follows the Key tab)
[Inv= ]   inversion for this chord only: Root, 1st, 2nd, 3rd ("Inv=" follows the Key tab)
```

Example: `I · V (7th) · vi (9th, 1/2 bar) · IV (7th)` in C major gives C, G7, Am9, Fmaj7.

The readout at the bottom always shows the chord names.

**What the numbers mean.** I is the chord built on the first note of the scale, ii on the second,
and so on. Uppercase = major, lowercase = minor, ° = diminished. The same numbers work in every
key: I–V–vi–IV is C–G–Am–F in C major and E–B–C#m–A in E major.

## Feel tab

| Control | What it does |
|---|---|
| **Style** | *Block* (all notes together), *Strum Up/Down* (notes staggered like a guitar), *Arp Up/Down/Up-Down/Random* (one note at a time). |
| **Rate** | Strum spread per note, or arpeggio step. Try 1/64 for strums and 1/16 for arpeggios. |
| **Voice Leading** | Picks each chord's inversion automatically so the notes move as little as possible. Chords with their own inversion keep it. |
| **Vel** | Note velocity. |

## Tips

- Start from a preset, then change one chord at a time and listen.
- Build four chords you like, press **Duplicate Chords**, then change the last chord or two of the copy
  for an "answer" phrase.
- Turn on **Voice Leading** for smooth, pianistic changes; set one chord's inversion by hand if you
  want a particular chord to stand out.
