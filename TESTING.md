# Testing Keywise in Live

Everything to check in Ableton Live before releasing Keywise. Riskiest first. Restart Live before you start, so it loads the latest devices.

## Before you start

- [ ] **The Generate menu in a MIDI clip lists Keywise Chords, Keywise Bass and Keywise Melody**  
  Open a MIDI clip; the Generate section is in the clip view's left column.
- [ ] **Keywise Keys is in the browser**  
  User Library → Presets → MIDI Effects → Max MIDI Effect.
- [ ] **No red errors in the Max Console when the devices load**

## Bass and Melody reading another clip (Trk/Slot)

*The biggest unknown: the first time a device asks Live for another clip's notes.*

- [ ] **Chord clip on track 1, slot 1. Empty clip on the bass track → Keywise Bass, From Trk/Slot, Trk 1, Slot 1 → Generate**  
  The readout shows Track 1 "(track name)", slot 1: … and a bassline appears. If it says "Can't read other clips here", stop and tell Claude.
- [ ] **A bass clip longer than the chord clip gets the progression repeated to fill it**
- [ ] **After the first Generate, changing Trk or Slot updates the bass right away**
- [ ] **An empty slot, a track that doesn't exist (e.g. 99) and an audio clip each show a message**  
  And the clip is left exactly as it was.
- [ ] **With a group track in the set, the track numbers match what the readout shows**
- [ ] **This Clip mode turns a clip of chords into a bassline**
- [ ] **All of the above with Keywise Melody**

## Fills

- [ ] **Keywise Chords, Feel tab: each fill sounds right**  
  Turnaround, Dominant, Sus, Walk-up, Push, Break. No Fill puts it back.
- [ ] **Every puts fills in the right places**  
  Each Pass, End of Clip, Every 4 Bars, Every 8 Bars.
- [ ] **In A minor, Turnaround ends Bdim → E7 → Am**  
  The "come home" chord should be major (E7), not Em7.
- [ ] **Keywise Bass fills**  
  Walk-up, Run Down, Octaves, Push, Drop Out.
- [ ] **Keywise Melody fills**  
  Run Up, Run Down, Pickup, Long Note, Rest.
- [ ] **Chords, Bass and Melody fills on the same Every setting land together**

## Bass and Melody sound

- [ ] **All 7 bass patterns sound like their names**  
  Held, Pulse, Root-Fifth, Octaves, Walking, Syncopated, Push.
- [ ] **Bass Rate, Oct and Gate do what they say**
- [ ] **Melody: changing Var gives a different melody; the same Var gives the same one**
- [ ] **Melody Rhythm, Density, Oct and Repeat Motif do what they say**

## Keywise Chords

- [ ] **All 6 tabs switch pages, and the "13-16" tab label is readable**
- [ ] **The per-chord Type, Len and Inv menus each change only their own chord**  
  And Type=, Len=, Inv= follow the Key tab.
- [ ] **Duplicate Chords goes 4 → 8 → 12 → 16**  
  Then: go 4 → 8, change chord 8, press again. It should add a fresh copy of chords 1–4.
- [ ] **Presets fill the slots and reset the per-chord menus**
- [ ] **Feel tab: Strum Up/Down, the Arps, Rate, Voice Leading and Vel**
- [ ] **Clip Key follows the clip's Scale; Fill off writes the progression once**
- [ ] **Chords start at your time selection**  
  Select from bar 2 and press Generate. If they start at bar 1, tell Claude.
- [ ] **The readout at the bottom isn't cut off with long progressions**

## Keywise Keys

*Never tried in Live yet.*

- [ ] **In front of a synth, white keys play I–VII of the chosen key; changing the key changes the chords**
- [ ] **Black keys do nothing in White Keys mode; Snap makes every key play a chord**
- [ ] **Smooth on and off, + Bass, Inversion, Octave**
- [ ] **Strum ms (try 30), both Up and Down**
- [ ] **No stuck notes**  
  Play fast, overlap chords, release keys in the middle of a strum. Every note should stop.
- [ ] **Mod wheel and pitch bend still reach the synth**
- [ ] **Record what you play, then point Keywise Bass at that clip**

## Saving

- [ ] **Save the set and reopen it**  
  Settings come back, and no clip changes by itself when the set loads.

## If something breaks

If something breaks, send Claude a screenshot, plus any red text from the Max Console (click the device's edit button, then Window → Max Console in Max).

## After testing

When everything passes: freeze the devices in Max, then upload to maxforlive.com.
