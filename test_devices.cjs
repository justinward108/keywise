// Checks the built device scripts outside of Max.
//
//   python3 build_devices.py && node test_devices.cjs   (tests the files in devices/)
//
// Each script runs in a sandbox with stand-ins for Max's outlet(), post(),
// Dict and Task, then its functions are called directly.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const BUILD = path.join(__dirname, "devices");
const dicts = {};

// Arrays made inside the sandbox have their own prototype, so compare as JSON.
const eq = (actual, expected) => assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));

function load(subfolder, script, args) {
    const out = [];
    const sandbox = {
        jsarguments: [script].concat(args || []),
        // Messages a device sends to its own controls come straight back in,
        // like in Max (set sandbox.onOutlet to wire them up).
        outlet: (...a) => { out.push(a); if (sandbox.onOutlet) sandbox.onOutlet(a); },
        post: () => {},
        Task: function (fn) { this.schedule = () => fn(); this.cancel = () => {}; },
        // Named dictionaries are shared by every device, as in Max.
        Dict: function (name) {
            this.name = name;
            this.parse = (s) => { dicts[name] = JSON.parse(s); };
            this.stringify = () => JSON.stringify(dicts[name] || {});
        },
        console,
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(BUILD, subfolder, script), "utf8"), sandbox);
    sandbox.out = out;
    return sandbox;
}

const names = (notes) => {
    const byStart = {};
    notes.forEach((n) => (byStart[n.start_time] = byStart[n.start_time] || []).push(n.pitch));
    return Object.keys(byStart).map(Number).sort((a, b) => a - b)
        .map((t) => t + ":" + byStart[t].sort((a, b) => a - b).join(","));
};

// ─── Chords ──────────────────────────────────────────────────────────────────
{
    const c = load("Generate", "keywise_chords.js");
    const ctx = { time_selection: { start_time: 0, end_time: 16 } };
    eq(names(c.generateNotes(c.state, ctx)),
        ["0:60,64,67", "4:67,71,74", "8:69,72,76", "12:65,69,72"]);
    c.state.type = 1; c.state.voiceLead = 1;
    const v = c.progression(c.state, null).map((x) => x.upper.join(","));
    eq(v, ["60,64,67,71", "62,65,67,71", "60,64,67,69", "60,64,65,69"]);
    c.state.type = 0; c.state.voiceLead = 0;
    c.state.slotLens[0] = 7; // 2 bars
    eq(names(c.generateNotes(c.state, ctx)).map((s) => s.split(":")[0]), ["0", "8", "12"]);
    // Per-chord inversions: G in 1st inversion (B D G), Am in 2nd (E A C).
    c.state.slotLens[0] = 0;
    c.state.slotInvs[1] = 2; c.state.slotInvs[2] = 3;
    eq(c.progression(c.state, null).map((x) => x.upper.join(",")),
        ["60,64,67", "71,74,79", "76,81,84", "65,69,72"]);
    // With Voice Leading on, hand-picked inversions stay; the others still move smoothly.
    c.state.voiceLead = 1;
    const vl = c.progression(c.state, null);
    eq(vl[1].upper, [71, 74, 79]);
    eq(vl[2].upper, [76, 81, 84]);
    eq(vl[3].upper, [77, 81, 84]);   // F moves the least from E A C: F A C
    c.state.voiceLead = 0; c.state.slotInvs = c.state.slotInvs.map(() => 0);
    // Per-chord types: C triad, G7, Am9, Fmaj7 in one progression.
    c.state.slotTypes = [0, 2, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    eq(c.progression(c.state, null).map((x) => x.name), ["C", "G7", "Am9", "Fmaj7"]);
    eq(c.progression(c.state, null).map((x) => x.upper.length), [3, 4, 5, 4]);
    c.state.voiceLead = 1;   // mixed sizes still voice-lead without errors
    assert(c.progression(c.state, null).every((x) => x.upper.every((p) => p > 40 && p < 100)));
    c.state.voiceLead = 0; c.state.slotTypes = c.state.slotTypes.map(() => 0);
    // Duplicate: 4 chords -> 8 -> 12 -> 16, each press adding one more copy of
    // the original 4, keeping per-chord settings.
    c.state.slotTypes[1] = 2; c.state.slotLens[2] = 3;
    const dup = c.duplicateSlots(c.state);
    eq(dup.map((d) => d[0]), [4, 5, 6, 7]);
    eq(dup[1], [5, 5, 2, 0, 0]);   // slot 6 = copy of slot 2: V, 7th
    eq(dup[2], [6, 6, 0, 3, 0]);   // slot 7 = copy of slot 3: vi, 1/2 bar
    const apply = (copies) => copies.forEach((d) => { c.state.slots[d[0]] = d[1];
        c.state.slotTypes[d[0]] = d[2]; c.state.slotLens[d[0]] = d[3]; c.state.slotInvs[d[0]] = d[4]; });
    apply(dup);
    c.state.slots[7] = 5;                                   // edit the copy: chord 8 becomes V
    const third = c.duplicateSlots(c.state);
    eq(third.map((d) => d[0]), [8, 9, 10, 11]);             // 8 -> 12: still adds 4...
    eq(third.map((d) => d[1]), [1, 5, 6, 4]);               // ...copies of the original 4
    apply(third);
    eq(c.duplicateSlots(c.state).map((d) => d[0]), [12, 13, 14, 15]);   // 12 -> 16
    c.state.slots[15] = 1;
    eq(c.duplicateSlots(c.state), []);                      // full: nothing to do
    c.state.slots = [1, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    eq(c.duplicateSlots(c.state).map((d) => d[0]), [3, 4, 5]);          // a new 3-chord pattern: 3 -> 6
    c.state.slots = [1, 5, 6, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    c.state.slotTypes = c.state.slotTypes.map(() => 0); c.state.slotLens = c.state.slotLens.map(() => 0);
    c.state.slotInvs = c.state.slotInvs.map(() => 0);
    console.log("chords ok  ", c.readoutText(c.state, null));
}

// ─── Bass & Melody ───────────────────────────────────────────────────────────
// Input: C - G/B (inversion) - Am7 - F, one bar each, as a chord clip would be.
const chordClip = [];
[[60, 64, 67], [59, 62, 67], [57, 60, 64, 67], [65, 69, 72]].forEach((ch, i) =>
    ch.forEach((p, k) => chordClip.push({ pitch: p, start_time: i * 4 + k * 0.02, duration: 4, velocity: 100, mute: 0 })));

{
    const b = load("Generate", "keywise_lines.js", ["bass"]);
    b.state.source = 1;   // This Clip
    const chords = b.detectChords(chordClip);
    eq(chords.map((c) => c.name), ["C", "G", "Am", "F"]);
    const roots = (pattern, rate) => {
        b.state.pattern = pattern; b.state.rate = rate;
        return b.transform(b.state, chordClip, null);
    };
    eq(roots(0, 0).map((n) => n.pitch), [36, 43, 45, 41]);           // Held
    assert.strictEqual(roots(1, 1).length, 32);                                            // Pulse 8ths
    const walk = roots(4, 0);
    assert.strictEqual(walk.length, 16);
    assert.strictEqual(walk[3].pitch, 42);            // walks from C towards G: F#
    console.log("bass ok     walking:", walk.map((n) => n.pitch).join(" "));
    b.state.pattern = 6;
    console.log("            push:   ", b.transform(b.state, chordClip, null).map((n) => n.pitch + "@" + n.start_time).join(" "));
}
{
    const m = load("Generate", "keywise_lines.js", ["melody"]);
    m.state.source = 1;   // This Clip
    const mel = m.transform(m.state, chordClip, null);
    const cMajor = [0, 2, 4, 5, 7, 9, 11];
    assert(mel.length > 8);
    mel.forEach((n) => assert(cMajor.includes(n.pitch % 12), "melody note out of key: " + n.pitch));
    // notes on the beat are chord tones
    mel.filter((n) => Number.isInteger(n.start_time)).forEach((n) => {
        const chord = m.detectChords(chordClip).find((c) => n.start_time >= c.start && n.start_time < c.end);
        assert(chord.pcs.includes(n.pitch % 12), "downbeat not a chord tone at " + n.start_time);
    });
    console.log("melody ok  ", mel.map((n) => n.pitch).join(" "));
}

// ─── Trk/Slot: Bass/Melody follow a Session View clip ────────────────────────
// A stand-in for Live's API with a small Live set:
//   Track 1 "Chords": slot 1 C G Am F (1 bar each), slot 2 empty,
//                     slot 3 Am F C G (F half a bar), slot 4 Am G C with its loop on G C
//   Track 2 "Drums":  slot 1 an audio clip
function chordClipNotes(chords) {   // [[pitches], beats] ... -> notes
    const notes = []; let t = 0;
    chords.forEach(([pitches, beats]) => {
        pitches.forEach((p) => notes.push({ pitch: p, start_time: t, duration: beats, velocity: 100, mute: 0 }));
        t += beats;
    });
    return notes;
}
const C = [60, 64, 67], G = [55, 59, 62], Am = [57, 60, 64], F = [53, 57, 60];
const liveSet = [
    { name: "Chords", slots: [
        { midi: 1, start: 0, end: 16, notes: chordClipNotes([[C, 4], [G, 4], [Am, 4], [F, 4]]) },
        null,
        { midi: 1, start: 0, end: 14, notes: chordClipNotes([[Am, 4], [F, 2], [C, 4], [G, 4]]) },
        { midi: 1, start: 4, end: 12, notes: chordClipNotes([[Am, 4], [G, 4], [C, 4]]) },
    ] },
    { name: "Drums", slots: [{ midi: 0, start: 0, end: 4, notes: [] }] },
];
function FakeLiveAPI(callback, path) {
    const m = path.match(/^live_set tracks (\d+)(?: clip_slots (\d+) clip)?$/);
    const track = m && liveSet[+m[1]];
    const clip = track && m[2] !== undefined ? track.slots[+m[2]] : null;
    const target = m && m[2] !== undefined ? clip : track;
    this.id = target ? "7" : "0";
    this.get = (prop) => ({ name: [track && track.name], is_midi_clip: [clip && clip.midi],
                            loop_start: [clip && clip.start], loop_end: [clip && clip.end] })[prop];
    this.call = (fn, fromPitch, pitchSpan, from, span) => JSON.stringify({ notes: clip.notes.filter(
        (n) => n.start_time >= from && n.start_time < from + span) });
}

{
    const b = load("Generate", "keywise_lines.js", ["bass"]);
    b.LiveAPI = FakeLiveAPI;
    b.state.pattern = 0;  // Held, so each chord gives one root note
    const sel = (end) => ({ time_selection: { start_time: 0, end_time: end } });
    const roots = (trk, slot, end) => { b.state.track = trk; b.state.slot = slot;
        const out = b.transform(b.state, [], sel(end)); return out && out.map((n) => n.pitch + "@" + n.start_time); };

    eq(roots(1, 1, 32), ["36@0", "43@4", "45@8", "41@12", "36@16", "43@20", "45@24", "41@28"]);  // looped twice
    eq(b.readoutText(), 'Track 1 "Chords", slot 1:  C  G  Am  F  C  G  Am  F');
    eq(roots(1, 3, 26), ["45@0", "41@4", "36@6", "43@10", "45@14", "41@18", "36@20", "43@24"]);
    eq(roots(1, 4, 16), ["43@0", "36@4", "43@8", "36@12"]);  // only the loop (beats 4-12: G C) is used
    eq(roots(1, 2, 16), null);
    assert(b.readoutText().startsWith('Track 1 "Chords", slot 2 is empty.'));
    eq(roots(9, 1, 16), null);
    assert(b.readoutText().startsWith("There is no track 9."));
    eq(roots(2, 1, 16), null);
    assert(b.readoutText().startsWith('Track 2 "Drums", slot 1 isn\'t a MIDI clip.'));

    const m = load("Generate", "keywise_lines.js", ["melody"]);
    m.LiveAPI = FakeLiveAPI;
    m.state.track = 1; m.state.slot = 3;
    const aMinor = [9, 11, 0, 2, 4, 5, 7];
    const mel = m.transform(m.state, [], sel(14));
    assert(mel.length > 4 && mel.every((n) => aMinor.includes(n.pitch % 12) && n.start_time < 14));
    console.log("trk/slot ok");
}

// ─── Fills ───────────────────────────────────────────────────────────────────
{
    const c = load("Generate", "keywise_chords.js");
    eq(c.fillPoints(0, 0, 32, 16, 4), [16, 32]);            // Each Pass (4-bar progression)
    eq(c.fillPoints(1, 0, 32, 16, 4), [32]);                // End of Clip
    eq(c.fillPoints(3, 0, 64, 16, 4), [32, 64]);            // Every 8 Bars
    const fillNames = (fill, every, end) => {
        c.state.fillType = c.FILLS.indexOf(fill); c.state.fillEvery = every;
        const ctx = { time_selection: { start_time: 0, end_time: end } };
        return c.applyFills(c.state, ctx, c.timeline(c.state, ctx)).sort((a, b) => a.t - b.t)
            .map((e) => e.chord.name + "@" + e.t);
    };
    eq(fillNames("Turnaround", 0, 16), ["C@0", "G@4", "Am@8", "Dm@12", "G7@14"]);
    eq(fillNames("Dominant", 1, 32), ["C@0", "G@4", "Am@8", "F@12", "C@16", "G@20", "Am@24", "G7@28"]);
    eq(fillNames("Sus", 0, 16), ["C@0", "G@4", "Am@8", "Gsus4@12", "G@14"]);
    eq(fillNames("Walk-up", 0, 16), ["C@0", "G@4", "Am@8", "Am@12", "Bdim@14"]);
    eq(fillNames("Push", 0, 16), ["C@0", "G@4", "Am@8", "F@12", "C@15.5"]);
    eq(fillNames("Break", 0, 16), ["C@0", "G@4", "Am@8", "F@12", "F@13"]);
    c.state.root = 9; c.state.scale = 1; c.state.slots = [1, 6, 3, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    eq(fillNames("Turnaround", 0, 16), ["Am@0", "F@4", "C@8", "Bdim@12", "E7@14"]);  // minor: real V7
    c.state.root = 0; c.state.scale = 0; c.state.slots = [1, 5, 6, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    c.state.fillType = 0; c.state.fillEvery = 0;

    // Bass and Melody over C G Am F (This Clip), fill at the end leading back to C.
    const bar4 = { time_selection: { start_time: 0, end_time: 16 } };   // the clip's 4 bars
    const b = load("Generate", "keywise_lines.js", ["bass"]);
    b.state.source = 1; b.state.pattern = 0;   // This Clip, Held
    const bassEnd = (fill) => { b.state.fillType = b.BASS_FILLS.indexOf(fill);
        return b.transform(b.state, chordClip, bar4).filter((n) => n.start_time >= 12).map((n) => n.pitch + "@" + n.start_time); };
    // Held F (41) shortened to 2 beats, then F G A B (29 31 33 35) walking up into C1 (36).
    const walk = bassEnd("Walk-up");
    eq(walk, ["41@12", "29@14", "31@14.5", "33@15", "35@15.5"]);
    eq(bassEnd("Run Down"), ["41@12", "43@14", "41@14.5", "40@15", "38@15.5"]);   // G F E D down to C
    eq(bassEnd("Push"), ["41@12", "36@15.5"]);                         // C root an 8th early
    eq(bassEnd("Drop Out"), ["41@12"]);
    const m = load("Generate", "keywise_lines.js", ["melody"]);
    m.state.source = 1;
    m.state.fillType = m.MELODY_FILLS.indexOf("Run Up");
    const run = m.transform(m.state, chordClip, bar4).filter((n) => n.start_time >= 14);
    eq(run.length, 8);
    assert(run.every((n, i) => i === 0 || n.pitch > run[i - 1].pitch));   // ascending
    assert(run.every((n) => [0, 2, 4, 5, 7, 9, 11].includes(n.pitch % 12)));
    m.state.fillType = m.MELODY_FILLS.indexOf("Rest");
    eq(m.transform(m.state, chordClip, bar4).filter((n) => n.start_time >= 14).length, 0);
    console.log("fills ok    bass walk-up:", walk.join(" "), "| melody run:", run.map((n) => n.pitch).join(" "));
}

// ─── Keys ──────────────────────────────────────────────────────────────
{
    const k = load("MIDI Effect", "keywise_keys.js");
    const bytes = () => k.out.filter((a) => a[0] === 0).map((a) => a[1]);  // outlet(0, byte)
    k.state.voiceLead = 0;
    k.state.root = 9; k.state.scale = 1;  // A natural minor
    // White keys: C3 = i (Am), F3 = iv (Dm) ... in A minor.
    assert.strictEqual(k.chordForKey(k.state, 60, null).name, "i  Am");
    assert.strictEqual(k.chordForKey(k.state, 65, null).name, "iv  Dm");
    assert.strictEqual(k.chordForKey(k.state, 61, null), null);  // black key ignored

    k.out.length = 0;
    [0x90, 60, 100].forEach(k.msg_int);           // press C3
    eq(bytes(), [0x90, 69, 100, 0x90, 72, 100, 0x90, 76, 100]);
    k.out.length = 0;
    [0x80, 60, 0].forEach(k.msg_int);             // release
    eq(bytes(), [0x80, 69, 0, 0x80, 72, 0, 0x80, 76, 0]);
    k.out.length = 0;
    [0xB0, 1, 64].forEach(k.msg_int);             // mod wheel passes through
    eq(bytes(), [0xB0, 1, 64]);

    k.state.mapping = 1; k.state.root = 0; k.state.scale = 0;  // Snap, C major
    assert.strictEqual(k.chordForKey(k.state, 66, null).name, "IV  F");  // F# snaps to F
    console.log("keys ok");
}
console.log("all tests passed");
