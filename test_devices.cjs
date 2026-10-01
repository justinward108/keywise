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
    // Duplicate: 4 chords -> 8 -> 16, keeping per-chord settings.
    c.state.slotTypes[1] = 2; c.state.slotLens[2] = 3;
    const dup = c.duplicateSlots(c.state);
    eq(dup.map((d) => d[0]), [4, 5, 6, 7]);
    eq(dup[1], [5, 5, 2, 0, 0]);   // slot 6 = copy of slot 2: V, 7th
    eq(dup[2], [6, 6, 0, 3, 0]);   // slot 7 = copy of slot 3: vi, 1/2 bar
    dup.forEach((d) => { c.state.slots[d[0]] = d[1]; c.state.slotTypes[d[0]] = d[2];
                         c.state.slotLens[d[0]] = d[3]; c.state.slotInvs[d[0]] = d[4]; });
    eq(c.duplicateSlots(c.state).map((d) => d[0]), [8, 9, 10, 11, 12, 13, 14, 15]);
    c.state.slots[15] = 1;
    eq(c.duplicateSlots(c.state), []);   // full: nothing to do
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
    b.state.source = 8;   // This Clip
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
    m.state.source = 8;   // This Clip
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

// ─── Prog A-H: Chords saves progressions, Bass/Melody pick one ───────────────
{
    const c = load("Generate", "keywise_chords.js");
    // Wire Chords' control messages back in, as the patch does in Live.
    const control = { Root: "root", Scale: "scale", Clip_Scale: "clipscale", Chord_Type: "type",
        Length: "length", Octave: "octave", Inversion: "inversion", Bass: "bass", Fill: "fill",
        Style: "style", Rate: "rate", Voice_Leading: "voicelead", Velocity: "velocity" };
    c.onOutlet = (a) => {
        if (a[0] !== 2) return;
        if (a[1] === "script") c[control[a[3]]](a[4]);
        if (["slot", "slottype", "slotlen", "slotinv"].includes(a[1])) c[a[1]](a[2], a[3]);
    };

    const b = load("Generate", "keywise_lines.js", ["bass"]);
    b.state.pattern = 0;  // Held
    b.state.source = 0;   // Prog A
    assert.strictEqual(b.transform(b.state, [], null), null);   // nothing saved yet
    assert(b.readoutText().startsWith("Prog A is empty"));

    c.loaded();                                    // Prog A: C major I V vi IV
    c.bank(1);                                     // Prog B starts as a copy...
    c.root(9); c.scale(1);                         // ...then becomes A minor i VI III VII
    [1, 6, 3, 7].forEach((d, i) => c.slot(i, d));
    c.slotlen(1, 3);                               // F lasts half a bar
    eq(c.readoutText(c.state, null), "B · A Natural Minor:  Am  F  C  G");

    const bangsBefore = c.out.filter((a) => a[0] === 1).length;
    c.bank(0);                                     // back to A: controls restored
    eq(c.state.root, 0); eq(c.state.slots.slice(0, 4), [1, 5, 6, 4]); eq(c.state.slotLens[1], 0);
    eq(c.readoutText(c.state, null), "A · C Major:  C  G  Am  F");
    eq(c.out.filter((a) => a[0] === 1).length, bangsBefore);   // switching never rewrites the clip

    const sel = (end) => ({ time_selection: { start_time: 0, end_time: end } });
    eq(b.transform(b.state, [], sel(16)).map((n) => n.pitch), [36, 43, 45, 41]);      // Prog A
    b.state.source = 1;                                                                 // Prog B
    eq(b.transform(b.state, [], sel(26)).map((n) => n.pitch + "@" + n.start_time), [
        "45@0", "41@4", "36@6", "43@10", "45@14", "41@18", "36@20", "43@24"]);        // looped
    eq(b.readoutText(), "Prog B · A Natural Minor:  Am  F  C  G  Am  F  C  G");
    b.state.source = 2;                                                                 // Prog C: empty
    assert.strictEqual(b.transform(b.state, [], sel(16)), null);

    const m = load("Generate", "keywise_lines.js", ["melody"]);
    m.state.source = 1;
    const aMinor = [9, 11, 0, 2, 4, 5, 7];
    const mel = m.transform(m.state, [], sel(14));
    assert(mel.length > 4 && mel.every((n) => aMinor.includes(n.pitch % 12) && n.start_time < 14));
    console.log("prog A-H ok");
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
