# Keywise

**Free Max for Live devices that keep your music in key.** Pick a key and a mode, and Keywise writes
chord progressions, basslines and melodies straight into Ableton Live's piano roll, or lets you
play full chords with one finger.

No music theory needed: chords are chosen by number (I, ii, iii, IV, V, vi, vii°), and Keywise
works out the notes for whichever key and mode you pick.

| Device | What it does | Where it lives in Live |
|---|---|---|
| [**Keywise Chords**](#keywise-chords) | Writes chord progressions (up to 16 chords) into a MIDI clip | Clip view → **Generate** |
| [**Keywise Bass**](#keywise-bass) | Writes a bassline that follows your chords | Clip view → **Generate** |
| [**Keywise Melody**](#keywise-melody) | Writes a melody that follows your chords | Clip view → **Generate** |
| [**Keywise Keys**](#keywise-keys) | Play one key, hear a full chord in your key | MIDI effect, in front of any instrument |

**They work as a team:** Keywise Chords remembers up to eight progressions (**Prog A–H**: say verse
in A, chorus in B). Open an empty clip on your bass or lead track, pick Keywise Bass or Keywise
Melody, choose which progression to follow, and press Generate. No copying clips around.

**Contents:** [Requirements](#requirements) · [Install](#install) · [Quick start](#quick-start) ·
[Chords](#keywise-chords) · [Bass](#keywise-bass) · [Melody](#keywise-melody) · [Keys](#keywise-keys) ·
[How the chord numbers work](#how-the-chord-numbers-work) · [Troubleshooting](#troubleshooting) ·
[Building from source](#building-from-source) · [License](#license)

---

## Requirements

- **Ableton Live 12 Suite**, or Live 12 Standard with the Max for Live add-on.
  Keywise Chords, Bass and Melody are Live 12 **MIDI Tools**, which don't exist in Live 11.
- Made and tested on **macOS**. Windows should work the same way; please
  [open an issue](https://github.com/justinward108/keywise/issues) if it doesn't.

## Install

### 1. Download

Click the green **Code** button at the top of this page, choose **Download ZIP**, and unzip it.
The devices are in the `devices` folder:

```
devices/
├── Generate/       Keywise Chords.amxd, keywise_chords.js,
│                   Keywise Bass.amxd, Keywise Melody.amxd, keywise_lines.js
└── MIDI Effect/    Keywise Keys.amxd, keywise_keys.js
```

### 2. Find your User Library

In Live, open **Settings → Library** (on Windows: **Options → Settings → Library**) and look at
**Location of User Library**. On a Mac it is usually `~/Music/Ableton/User Library`; on Windows,
`\Users\<you>\Documents\Ableton\User Library`.

### 3. Copy the files into the User Library

Copy the **files** (not the folders, so nothing already there gets replaced):

| Copy everything inside… | …into this folder of your User Library |
|---|---|
| `devices/Generate` (5 files) | `MIDI Tools/Max Generators` |
| `devices/MIDI Effect` (2 files) | `Presets/MIDI Effects/Max MIDI Effect` |

- If one of those folders doesn't exist yet, create it. The names must match exactly.
- Every `.amxd` device needs its `.js` file in the **same folder**. Keywise Bass and Keywise Melody
  share `keywise_lines.js`.

### 4. Restart Live

The devices now appear in:

- **Keywise Chords**, **Keywise Bass** and **Keywise Melody**: in a MIDI clip's **Generate** section menu.
- **Keywise Keys**: in the browser under **User Library → Presets → MIDI Effects → Max MIDI Effect**
  (or search for "Keywise").

### Updating

Download the new version and copy the files again, replacing the old ones. Restart Live.

If you installed a version where Keywise Bass and Melody were in the **Transform** section, delete
`Keywise Bass.amxd`, `Keywise Melody.amxd` and `keywise_lines.js` from
`MIDI Tools/Max Transformations`; they now live in `MIDI Tools/Max Generators`.

### Uninstalling

Delete the files you copied (the `Keywise …amxd` devices and the `keywise_….js` files), and
`keywise_progressions.json` in `MIDI Tools/Max Generators` (your saved progressions).

## Quick start

1. Put an instrument on a MIDI track, create an empty MIDI clip and double-click it to open the clip view.
2. In the clip view's left-hand column, find the **Generate** section. (If the column is cut off,
   drag the divider above the clip view upwards or scroll the column.)
3. Choose **Keywise Chords** from the Generate menu and press **Generate**.
   You get **I – V – vi – IV** in C major: C, G, Am, F.
4. Change the key, the scale/mode, the chords or anything else on the device. The clip updates as you go.
5. For a bassline: on a bass track, create an empty MIDI clip of the same length and open it. In its
   **Generate** section choose **Keywise Bass** and press **Generate**. The bassline follows your
   Keywise Chords progression. **Keywise Melody** works the same way on a lead track.

Hover over any control and Live's **Info View** (bottom left) explains what it does.

---

## Keywise Chords

*A MIDI Tool in the clip view's **Generate** section.* Writes a chord progression into the open clip.

- Chords fill the clip's **time selection** (normally the clip's loop).
- After the first **Generate**, every change on the device rewrites the clip straight away.
- The readout at the bottom shows the key and the chord names, e.g. `C Major: C G Am F`.

The device has six tabs: **Key · 1-4 · 5-8 · 9-12 · 13-16 · Feel**.

### Key tab

| Control | Options | What it does |
|---|---|---|
| **Key** | C … B | The key of the progression. |
| **Scale / Mode** | Major, Natural Minor, Harmonic Minor, Melodic Minor, Dorian, Phrygian, Lydian, Mixolydian, Locrian, Pentatonic Major, Pentatonic Minor, Blues, Whole Tone, Diminished (W-H) | The scale the chords are built from. |
| **Chord type** | Triad (3), 7th (4), 9th (5), 11th (6), 13th (7), 5th, add9, sus2, sus4, maj9, min9, 9 (dom), add11, m/maj7, dim7, aug | The chord type for every chord set to *Type=*. See [chord types](#chord-types). |
| **Length** | 1/2 beat, 1 beat, 2 beats, 3 beats, 1 bar, 6 beats, 2 bars, 4 bars | How long each chord lasts, for chords set to *Len=*. Default: 1 bar. |
| **Oct** | 0 – 6 | Octave of the chords. Live's naming: C3 = middle C. Default: 3. |
| **Inv** | 0 – 3 | Inversion for chords set to *Inv=*. 0 = root position; 1 = the lowest note moves up an octave; 2 = the two lowest; 3 = the three lowest. |
| **+ Bass** | on / off | Adds each chord's root an octave below. |
| **Clip Key** | on / off | Ignore Key and Scale and use the clip's own **Scale** setting (Live's Scale Mode) instead. |
| **Fill** | on / off | On (default): repeat the progression until the selection is full. Off: write it once. |
| **Presets** | see below | Loads a progression into the chord slots and resets their type, length and inversion. |
| **Prog** | Prog A – Prog H | Which progression you are editing. See [Prog A–H](#prog-ah). |
| **Duplicate Chords** | button | Copies your chords into the next empty slots. See [Duplicate Chords](#duplicate-chords). |

**Presets:**

| Preset | Chords | In C major / A minor |
|---|---|---|
| I V vi IV | I – V – vi – IV | C G Am F |
| I vi IV V | I – vi – IV – V | C Am F G |
| vi IV I V | vi – IV – I – V | Am F C G |
| ii V I | ii – V – I | Dm G C |
| vi ii V I | vi – ii – V – I | Am Dm G C |
| I IV V IV | I – IV – V – IV | C F G F |
| i VI III VII | 1 – 6 – 3 – 7 (use a minor scale) | Am F C G |
| i iv v | 1 – 4 – 5 (use a minor scale) | Am Dm Em |
| i VII VI V | 1 – 7 – 6 – 5 (use a minor scale) | Am G F Em |
| Canon (8) | I – V – vi – iii – IV – I – IV – V | C G Am Em F C F G |
| 12-bar Blues | I I I I – IV IV I I – V IV I V | 12 chords |
| Pop Song (16) | I V vi IV ×2 – vi IV I V – vi IV V V | 16 chords |

Presets are built from scale degrees, so they follow whatever key and scale you choose.

### Chord tabs (1-4, 5-8, 9-12, 13-16)

Up to **16 chords**, four per tab. Each chord is a column of four menus:

```
[ I   ]  Chord: which chord of the scale, I – VII.  "-" leaves the slot empty (skipped).
[Type=]  Chord type for this chord only.            "Type=" uses Chord type on the Key tab.
[Len= ]  Length in bars for this chord only.        "Len="  uses Length on the Key tab.
[Inv= ]  Inversion for this chord only.             "Inv="  uses Inv (and Voice Leading).
```

| Menu | Options |
|---|---|
| Chord | -, I, II, III, IV, V, VI, VII |
| Type | Type=, Triad, 7th, 9th, 11th, 13th, 5th, add9, sus2, sus4, maj9, min9, 9, add11, mM7, dim7, aug |
| Length (bars) | Len=, 1/8, 1/4, 1/2, 3/4, 1, 1.5, 2, 3, 4 |
| Inversion | Inv=, Root, 1st, 2nd, 3rd ("3rd" only matters for chords of 4+ notes) |

The chord menus always show capital numerals; whether a chord comes out major, minor or diminished
depends on the scale, and the readout shows the real chord name.

**Example** (C major): `I / Type=` · `V / 7th` · `VI / 9th / 1/2` · `IV / 7th` gives
**C (1 bar) – G7 (1 bar) – Am9 (½ bar) – Fmaj7 (1 bar)**.

### Prog A–H

Keywise Chords remembers **eight progressions**, A to H, each with its own chords and settings
(key, scale, chord types, lengths, inversions, feel). Use one letter per section of your song, e.g.
verse = A, chorus = B, bridge = C.

- The **Prog** menu (Key tab, bottom left) picks the letter you're editing. Every change is saved
  under that letter straight away.
- **Switching to a letter you've used** brings its progression back onto the controls, so you can
  carry on editing it.
- **Switching to an empty letter** starts it as a copy of the progression you were on: handy for a
  variation of the verse.
- **Switching letters never changes the open clip.** Press **Generate** to write the progression
  into it.
- **Keywise Bass and Melody** follow whichever letter you choose in their **From** menu.

A typical song: open the verse chord clip, set Prog to **A**, make the verse chords, Generate. Open the
chorus chord clip, set Prog to **B**, make the chorus chords, Generate. Then the bass clips: verse bass
**From Prog A**, chorus bass **From Prog B**.

The progressions are saved in a small file, `keywise_progressions.json`, next to the devices in your
User Library, so they're still there after you restart Live. They are shared by all your Live sets:
starting a new song, just reuse the letters.

### Duplicate Chords

On the Key tab. Each press copies your chords, including each one's type, length and inversion, into
the next empty slots: 4 chords → 8 → 16 (3 chords → 6 → 12). It copies everything up to your last
filled chord, including empty "-" slots in between. Use it to repeat a phrase and then change the
copy, e.g. a different last chord for an "answer".

If all 16 slots are used, or no chords are filled in, it does nothing and says why in the readout.

### Feel tab

| Control | Options | What it does |
|---|---|---|
| **Style** | Block, Strum Up, Strum Down, Arp Up, Arp Down, Arp Up-Down, Arp Random | *Block*: all notes together. *Strum*: notes staggered low-to-high or high-to-low, like a guitar. *Arp*: one note at a time, cycling through the chord. Arp Random gives the same pattern every time for the same settings. |
| **Rate** | 1/64, 1/32, 1/16, 1/8, 1/4, 1/16T, 1/8T | The gap between strummed notes, or the length of each arpeggio step. Try 1/64 for strums and 1/16 for arpeggios. Default: 1/16. |
| **Voice Leading** | on / off | Chooses each chord's inversion automatically so the notes move as little as possible from the previous chord: smoother, more "pianist" changes. The first chord uses **Inv**; chords with their own inversion keep it. |
| **Vel** | 1 – 127 | Note velocity. Default: 100. |

### Chord types

**Built from the scale** (they follow the mode, so their quality changes from chord to chord):

| Type | Notes | Example on I in C major | Example on ii |
|---|---|---|---|
| Triad | 3 | C | Dm |
| 7th | 4 | Cmaj7 | Dm7 |
| 9th | 5 | Cmaj9 | Dm9 |
| 11th | 6 | Cmaj11 | Dm11 |
| 13th | 7 | Cmaj13 | Dm13 |

A 13th uses every note of a 7-note scale. 11ths and 13ths are dense; a lower **Oct**, an inversion or
**Voice Leading** help them sit well. The readout names altered notes the scale brings in, e.g.
`Fmaj9(#11)` in Lydian.

**Fixed shapes** (the same shape on every chord, whatever the scale):

| Type | Shape | Sound |
|---|---|---|
| 5th | root + 5th | Power chord, neither major nor minor |
| add9 | major triad + 9th | Bright, open |
| sus2 | root, 2nd, 5th | Open, floating |
| sus4 | root, 4th, 5th | Tense, wants to resolve |
| maj9 | major 7th + 9th | Lush, warm |
| min9 | minor 7th + 9th | Deep, soulful |
| 9 (dom) | dominant 7th + 9th | Funky, bluesy |
| add11 | major triad + 11th | Wide, spacious |
| m/maj7 | minor triad + major 7th | Haunting, film-noir |
| dim7 | stacked minor 3rds | Maximum tension |
| aug | major triad, raised 5th | Dreamy, unsettled |

---

## Keywise Bass

*A MIDI Tool in the clip view's **Generate** section.* Writes a bassline that follows a chord
progression: either the one you made in Keywise Chords, or the chords already in the clip.

### How to use it

**From a Keywise Chords progression** (Prog A–H):

1. Make a progression with **Keywise Chords** (any track) and note its letter, e.g. **Prog A**.
2. On your bass track, create an **empty MIDI clip** (same length as the chord clip) and open it.
3. In the **Generate** section choose **Keywise Bass**, set **From** to **Prog A**, and press **Generate**.
4. Adjust the controls; the bassline updates as you go.

The progression is looped to fill the clip, so a 4-bar progression fills an 8-bar clip twice.
If you change the chords in Keywise Chords later, open the bass clip and press **Generate** again.

**From This Clip:**

1. Open a clip that contains chords (for example a copy of your chord clip, or chords you played
   with Keywise Keys).
2. Choose **Keywise Bass** in the **Generate** section, set **From** to **This Clip** and press **Generate**.
3. The chords in the clip are replaced by the bassline.

The readout shows what's being followed, e.g. `Prog B · A Natural Minor: Am F C G`.

### Controls

| Control | Options | What it does |
|---|---|---|
| **Pattern** | Held, Pulse, Root-Fifth, Octaves, Walking, Syncopated, Push | See below. Default: Pulse. |
| **Rate** | 1/4, 1/8, 1/16, 1/8T | Step length of the pattern. Default: 1/8. |
| **Oct** | 0 – 3 | Bass octave. Live's naming: C1 = MIDI note 36. Default: 1. |
| **Gate** | 10 – 100 | How long each note lasts, as a % of its step. Lower = punchier. Default: 90. |
| **Vel** | 1 – 127 | Note velocity. Default: 100. |
| **From** | Prog A – Prog H, This Clip | Which progression to follow (see above). Default: Prog A. |

| Pattern | What you get |
|---|---|
| **Held** | One long root note for each chord. |
| **Pulse** | The root repeated on every step. |
| **Root-Fifth** | Alternates the root and the 5th. |
| **Octaves** | Alternates the low root and the root an octave up. |
| **Walking** | One note per step through chord and scale notes, sliding a half step into the next chord's root. Works best with Rate 1/4. |
| **Syncopated** | A 3 + 3 + 2 rhythm (the "tresillo") on root, root, fifth. |
| **Push** | Holds the root, then hits the next chord's root one step early. |

---

## Keywise Melody

*A MIDI Tool in the clip view's **Generate** section.* Writes a melody that fits a chord progression:
either the one you made in Keywise Chords, or the chords already in the clip.

### How to use it

Same as [Keywise Bass](#how-to-use-it): open an empty clip on your lead track, choose **Keywise Melody**
in the **Generate** section, set **From** to the progression's letter (Prog A–H) and press **Generate**.
With **This Clip**, open a clip of chords instead; they get replaced by the melody.

Notes on the beat land on **chord notes**; notes in between move through the **scale**, so the
melody always fits. Treat it as a sketch: keep what you like and edit the rest.

### Controls

| Control | Options | What it does |
|---|---|---|
| **Rhythm** | Quarters, 8ths, 16ths, Mixed | Note values. Mixed varies them beat by beat. Default: 8ths. |
| **Density** | 0 – 100 | How busy the melody is: the % chance of a note on each step (a little higher on the beat). Default: 60. |
| **Oct** | 2 – 6 | Melody octave. Default: 4. |
| **Var** | 1 – 99 | Variation. Every number is a different melody over the same chords, and the same number always gives the same melody. Flip through them to audition ideas. |
| **Vel** | 1 – 127 | Velocity of notes on the beat (notes between beats are a little softer). Default: 100. |
| **Repeat Motif** | on / off | On (default): every bar reuses the same rhythm, so the melody has a hook. Off: a new rhythm each bar. |
| **From** | Prog A – Prog H, This Clip | Which progression to follow. Default: Prog A. |

### Notes for Bass and Melody

- **Prog A–H** follows that letter's progression from Keywise Chords (see [Prog A–H](#prog-ah)).
  If the letter is empty, the readout says so and the clip is left untouched.
- **This Clip: block or strummed chords work best.** Chords are detected from notes that start together (within
  1/8 of a beat), and each chord lasts until the next one starts. Arpeggiated clips are read as
  single notes and give odd results.
- **Inversions are understood.** B–D–G is read as G, not as a B chord.
- **Passing notes** come from the clip's **Scale** setting if it has one, otherwise from the key and
  scale saved with the progression (Prog A–H) or the notes in your chords (This Clip).

---

## Keywise Keys

*A MIDI effect.* Press one key, hear a full chord in your key and mode. For jamming, writing and
performing; record the track and you get a full chord clip.

### How to use it

Drag **Keywise Keys** from the browser (**User Library → Presets → MIDI Effects → Max MIDI Effect**)
onto a MIDI track, **in front of** the instrument. Choose a key and scale and play.

### White Keys mode (default)

The white keys always play the seven chords of your key, in order, whatever key you pick:

| Key you press | C | D | E | F | G | A | B |
|---|---|---|---|---|---|---|---|
| Chord you hear | I | ii | iii | IV | V | vi | vii° |

So in **A minor**, C – D – E – F play Am, B°, C, Dm; switch to **F# Dorian** and the same white keys
play F# Dorian's chords. Black keys are ignored. The octave you play in sets the chord's octave.
In scales with fewer than 7 notes (pentatonic, blues…), the extra white keys continue into the next
octave.

### Snap mode

Every key, black or white, plays the chord built on the nearest note of your scale at or below the
key you press.

### Controls

| Control | Options | What it does |
|---|---|---|
| **Key** | C … B | Key of the chords. |
| **Scale / Mode** | same 14 scales as Keywise Chords | Scale of the chords. |
| **Keys** | White Keys, Snap | How keys map to chords (see above). |
| **Chord** | Triad (3) … 13th (7), and the fixed shapes | Chord type, same list as [Keywise Chords](#chord-types). |
| **Octave** | -2 – +2 | Shifts the chords by octaves. |
| **Inversion** | 0 – 3 | Which chord note is at the bottom. |
| **+ Bass** | on / off | Adds the root an octave below. |
| **Smooth** | on / off | Voice leading: each chord uses the inversion closest to the previous one. On by default. |
| **Strum ms** | 0 – 200 | Delay between the notes of each chord, in milliseconds. 0 = all together. |
| **Strum** | Up, Down | Strum low-to-high or high-to-low. |

The large readout shows the chord you are playing, e.g. `iv  Dm`, or a reminder of the key map when
idle. Velocity comes from how hard you play. Mod wheel, pitch bend, aftertouch, CCs and all other MIDI
pass through unchanged.

---

## How the chord numbers work

Every scale has seven notes (some have five or six). Number them 1 to 7 and build a chord on each:
that's what **I, ii, iii, IV, V, vi, vii°** mean.

- **Uppercase** = major chord, **lowercase** = minor, **°** = diminished, **+** = augmented.
- In C major: I = C, ii = Dm, iii = Em, IV = F, V = G, vi = Am, vii° = B°.
- The same numbers work in **every key**: I – V – vi – IV is C – G – Am – F in C major and
  E – B – C#m – A in E major. That's why progressions are portable: change Key and everything moves.
- Modes change which chords are major or minor. In **D Dorian**, ii is Em and IV is G (major), which is
  where Dorian's jazzy colour comes from.

## Troubleshooting

| Problem | Fix |
|---|---|
| A device isn't in the Generate menu | Restart Live. Check the files are in exactly the folders listed under [Install](#install). |
| The Max window says it can't find a `.js` file | The `.js` file must be in the same folder as the `.amxd`. Copy both. |
| Nothing happens when I press Generate | A MIDI clip must be open in the clip view. |
| The Generate section is cut off | Drag the divider above the clip view upwards to make it taller, or scroll the left-hand column. |
| Bass or Melody says "Prog A is empty" | In Keywise Chords, set **Prog** to that letter and make a progression, or pick another letter in **From**. |
| Bass follows the wrong progression | Check the letter in its **From** menu matches the **Prog** letter of the chords you want. |
| Bass or Melody doesn't match my new chords | They don't follow changes on their own: open the bass/melody clip and press Generate again. |
| This Clip gives strange results | Use block or strummed chords, and run it on chords, not on a clip that already holds a bassline or melody. |
| Keywise Keys plays nothing on black keys | That's White Keys mode. Switch **Keys** to **Snap** to use every key. |
| My settings were reset after updating | New versions can add or move controls; set them again. |

Found a bug or have an idea? [Open an issue](https://github.com/justinward108/keywise/issues).

---

## Building from source

The devices are generated from plain text files, so they can be read, changed and rebuilt without
opening Max. You need Python 3, and Node.js for the tests.

```
src/theory.js       shared music theory: scales, chord shapes, chord names, voice leading
src/chords.js       Keywise Chords
src/lines.js        Keywise Bass and Keywise Melody (one script, "bass" or "melody" mode)
src/keys.js         Keywise Keys
maxpatch.py         small toolkit for writing Max for Live (.amxd) files
build_devices.py    lays out the four devices and builds them
test_devices.cjs    checks the built scripts in Node
devices/            the built devices, ready to install (generated; don't edit)
```

Build and test:

```
python3 build_devices.py
node test_devices.cjs
```

Build and install straight into Live at the same time by passing your User Library folder:

```
python3 build_devices.py "/path/to/User Library"
```

Notes:

- Each device's `.js` is `src/theory.js` followed by the device's own script, so edit `src/` and
  rebuild rather than editing `devices/`. The scripts are ES5 JavaScript for Max's classic `[js]` object.
- MIDI Tools are shown in a panel of about **152 × 146 px**; keep their controls inside that area.
- Menu order in `build_devices.py` must match the arrays in `src/` (scales, chord types, lengths…).
- To make a single self-contained device file, open the device in Max (the edit button in Live)
  and click **Freeze**.

## License

Free to use, share and change under the [MIT License](LICENSE). © 2026 Justin Ward.
