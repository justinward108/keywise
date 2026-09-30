# Keywise Bass and Keywise Melody

Two MIDI Tools that read the chords in a clip and replace them with a bassline or a melody that
follows those chords.

## How to use them

1. Make (or generate with Keywise Chords) a clip of chords.
2. **Duplicate the clip** onto the track that will play the bass or melody.
3. Open the copy, **select all notes** (Cmd/Ctrl + A).
4. In the clip view's **Transform** section, choose **Keywise Bass** or **Keywise Melody** and press
   **Transform**.
5. Adjust the controls. The result keeps updating from your original chords until you click somewhere
   else in Live. After that, the clip contains the bassline/melody, so run it on a fresh copy of the
   chords if you want to start over.

The readout shows the chords Keywise found, e.g. `Chords found: C G Am F`. It recognises inversions
(B–D–G is read as G). Chords are detected from notes that start together, so **block or strummed
chords work best**; arpeggiated clips confuse it.

If the clip has a **Scale** set, passing notes come from that scale; otherwise they come from the
notes in your chords.

## Keywise Bass

| Control | What it does |
|---|---|
| **Pattern** | *Held*: the root for the whole chord. *Pulse*: repeated root notes. *Root-Fifth*: alternates root and fifth. *Octaves*: alternates low and high root. *Walking*: steps through chord and scale notes and slides into the next chord. *Syncopated*: a 3+3+2 groove. *Push*: holds the root and hits the next chord's root one step early. |
| **Rate** | Step length: 1/4, 1/8, 1/16 or 1/8 triplets. |
| **Oct** | Bass octave (Live's naming: C1 = MIDI note 36). |
| **Gate** | How long each note lasts, as % of its step. Lower = punchier. |
| **Vel** | Note velocity. |

## Keywise Melody

| Control | What it does |
|---|---|
| **Rhythm** | Quarters, 8ths, 16ths, or Mixed (varies beat by beat). |
| **Density** | How busy the melody is. |
| **Oct** | Melody octave. |
| **Var** | Variation. Each number gives a different melody over the same chords, and the same number always gives the same melody. |
| **Vel** | Note velocity. |
| **Repeat Motif** | On: every bar reuses the same rhythm, giving the melody a hook. Off: a new rhythm every bar. |

Notes on the beat land on chord tones and the notes in between move through the scale, so the
melody always fits the chords. Treat it as a starting point: keep the bits you like and edit the rest.
