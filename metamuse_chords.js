// MetaMuse Chords — Max for Live MIDI Generator (Live 12+)
//
// Builds chord progressions from a key, scale/mode and chord type (the same
// theory as the METAMUSE web app's Keys & Scales tab) and writes them into
// the clip that is open in Live's piano roll.
//
// Patch wiring (see build_device.py):
//   inlet 0  : UI messages (root, scale, type, ...) and the notes dictionary
//              from live.miditool.in (left outlet)
//   inlet 1  : context dictionary from live.miditool.in (middle outlet)
//   outlet 0 : "dictionary <name>" -> live.miditool.out
//   outlet 1 : bang -> live.miditool.in (regenerate when a control changes)
//   outlet 2 : UI feedback -> [route readout slot preset]
//
// Written in ES5 so it runs in Max's classic [js] object.

inlets = 2;
outlets = 3;

// ─── THEORY DATA (mirrors src/App.js in the web app) ─────────────────────────

var NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Order must match the Scale menu in build_device.py
var SCALES = [
    ["Major",            [0, 2, 4, 5, 7, 9, 11]],
    ["Natural Minor",    [0, 2, 3, 5, 7, 8, 10]],
    ["Harmonic Minor",   [0, 2, 3, 5, 7, 8, 11]],
    ["Melodic Minor",    [0, 2, 3, 5, 7, 9, 11]],
    ["Dorian",           [0, 2, 3, 5, 7, 9, 10]],
    ["Phrygian",         [0, 1, 3, 5, 7, 8, 10]],
    ["Lydian",           [0, 2, 4, 6, 7, 9, 11]],
    ["Mixolydian",       [0, 2, 4, 5, 7, 9, 10]],
    ["Locrian",          [0, 1, 3, 5, 6, 8, 10]],
    ["Pentatonic Major", [0, 2, 4, 7, 9]],
    ["Pentatonic Minor", [0, 3, 5, 7, 10]],
    ["Blues",            [0, 3, 5, 6, 7, 10]],
    ["Whole Tone",       [0, 2, 4, 6, 8, 10]],
    ["Diminished (W-H)", [0, 2, 3, 5, 6, 8, 9, 11]]
];

// Order must match the Type menu in build_device.py.
// "steps" = stack every other scale note (diatonic, follows the mode).
// "semis" = fixed shape built on each scale degree (same as the web app).
var CHORD_TYPES = [
    { label: "Triad",    steps: [0, 2, 4] },
    { label: "7th",      steps: [0, 2, 4, 6] },
    { label: "9th",      steps: [0, 2, 4, 6, 8] },
    { label: "5th",      semis: [0, 7],             suffix: "5" },
    { label: "add9",     semis: [0, 4, 7, 14],      suffix: "add9" },
    { label: "sus2",     semis: [0, 2, 7],          suffix: "sus2" },
    { label: "sus4",     semis: [0, 5, 7],          suffix: "sus4" },
    { label: "maj9",     semis: [0, 4, 7, 11, 14],  suffix: "maj9" },
    { label: "min9",     semis: [0, 3, 7, 10, 14],  suffix: "m9" },
    { label: "9 (dom)",  semis: [0, 4, 7, 10, 14],  suffix: "9" },
    { label: "add11",    semis: [0, 4, 7, 17],      suffix: "add11" },
    { label: "m/maj7",   semis: [0, 3, 7, 11],      suffix: "m(maj7)" },
    { label: "dim7",     semis: [0, 3, 6, 9],       suffix: "dim7" },
    { label: "aug",      semis: [0, 4, 8],          suffix: "aug" }
];

// Order must match the Length menu in build_device.py (values in beats)
var LENGTHS = [0.5, 1, 2, 3, 4, 6, 8, 16];

// Order must match the Presets menu. Degrees are 1-based; 0 = empty slot.
var PRESETS = [
    null, // "Presets…" placeholder
    [1, 5, 6, 4],
    [1, 6, 4, 5],
    [6, 4, 1, 5],
    [2, 5, 1],
    [6, 2, 5, 1],
    [1, 4, 5, 4],
    [1, 6, 3, 7],
    [1, 4, 5],
    [1, 7, 6, 5],
    [1, 5, 6, 3, 4, 1, 4, 5]
];

var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
var NUM_SLOTS = 8;

// ─── STATE (set by the UI controls) ──────────────────────────────────────────

var state = {
    root: 0,          // 0 = C
    scale: 0,         // index into SCALES
    useClipScale: 0,  // 1 = take key/scale from the clip (Live's Scale Mode)
    type: 0,          // index into CHORD_TYPES
    octave: 3,        // Ableton naming: C3 = MIDI 60
    inversion: 0,
    length: 4,        // index into LENGTHS
    fill: 1,          // repeat progression to fill the time selection
    bass: 0,          // add root an octave below
    velocity: 100,
    slots: [1, 5, 6, 4, 0, 0, 0, 0]
};

var context = null;   // last context dictionary from live.miditool.in
var ready = 0;        // becomes 1 once live.thisdevice fires

// ─── PURE CHORD LOGIC (no Max calls — testable in Node) ─────────────────────

// Returns { name, intervals } for the key currently in use.
function currentScale(st, ctx) {
    if (st.useClipScale && ctx && ctx.scale && ctx.scale.scale_intervals &&
        ctx.scale.scale_intervals.length) {
        return {
            root: ctx.scale.root_note || 0,
            name: ctx.scale.scale_name || "Clip scale",
            intervals: ctx.scale.scale_intervals
        };
    }
    return { root: st.root, name: SCALES[st.scale][0], intervals: SCALES[st.scale][1] };
}

// Semitone offsets (from the chord root) for scale degree degIdx (0-based).
function chordShape(intervals, degIdx, type) {
    var def = CHORD_TYPES[type];
    if (def.semis) return def.semis.slice();
    var len = intervals.length;
    var base = intervals[degIdx];
    var out = [];
    for (var i = 0; i < def.steps.length; i++) {
        var pos = degIdx + def.steps[i];
        out.push(intervals[pos % len] + 12 * Math.floor(pos / len) - base);
    }
    return out;
}

// Name a diatonic shape from its intervals, e.g. [0,3,7,10] -> "m7".
// Returns null for stacks with no common name (e.g. pentatonic stacks).
function qualityName(shape) {
    var key = shape.map(function (s) { return s % 12; }).slice(1).join(",");
    var names = {
        "4,7": "", "3,7": "m", "3,6": "dim", "4,8": "aug", "2,7": "sus2", "5,7": "sus4",
        "4,7,11": "maj7", "4,7,10": "7", "3,7,10": "m7", "3,6,10": "m7b5",
        "3,6,9": "dim7", "3,7,11": "m(maj7)", "4,8,11": "maj7#5", "4,8,10": "7#5",
        "4,7,11,2": "maj9", "4,7,10,2": "9", "3,7,10,2": "m9", "3,6,10,2": "m9b5",
        "3,7,11,2": "m(maj9)", "4,7,10,1": "7b9", "3,6,10,1": "m7b5b9",
        "3,7,10,1": "m7b9", "4,8,11,2": "maj9#5"
    };
    return names.hasOwnProperty(key) ? names[key] : null;
}

// Roman numeral, lowercase for minor/diminished chords.
function romanFor(degIdx, shape) {
    var r = ROMAN[degIdx] || String(degIdx + 1);
    var third = shape.length > 1 ? shape[1] % 12 : 4;
    var fifth = shape.length > 2 ? shape[2] % 12 : 7;
    if (third === 3) r = r.toLowerCase();
    if (third === 3 && fifth === 6) r += (shape.length > 3 && shape[3] % 12 === 10) ? "ø" : "°";
    if (third === 4 && fifth === 8) r += "+";
    return r;
}

// One chord for a 1-based scale degree, or null if the degree doesn't exist
// in this scale (e.g. degree 7 in a pentatonic scale).
function buildChord(st, ctx, degree) {
    var sc = currentScale(st, ctx);
    var degIdx = degree - 1;
    if (degIdx < 0 || degIdx >= sc.intervals.length) return null;

    var shape = chordShape(sc.intervals, degIdx, st.type);
    var def = CHORD_TYPES[st.type];
    var rootPc = (sc.root + sc.intervals[degIdx]) % 12;
    var rootMidi = (st.octave + 2) * 12 + sc.root + sc.intervals[degIdx];

    var pitches = shape.map(function (s) { return rootMidi + s; });
    for (var i = 0; i < st.inversion % pitches.length; i++) {
        pitches.push(pitches.shift() + 12);
    }
    if (st.bass) pitches.unshift(rootMidi - 12);

    pitches = pitches.filter(function (p) { return p >= 0 && p <= 127; });

    var suffix = def.suffix !== undefined ? def.suffix : qualityName(shape);
    var name = suffix !== null ? NOTES[rootPc] + suffix :
        shape.map(function (s) { return NOTES[(rootPc + s) % 12]; }).join("-");

    return {
        name: name,
        roman: romanFor(degIdx, shape),
        pitches: pitches
    };
}

// Time range to write into: Live's time selection if we can find it.
function selectionRange(ctx) {
    var sel = ctx && (ctx.time_selection || ctx.selection);
    if (sel && typeof sel.start_time === "number" && typeof sel.end_time === "number" &&
        sel.end_time > sel.start_time) {
        return { start: sel.start_time, end: sel.end_time };
    }
    return null;
}

// The list of chords from the slots, skipping empty ones.
function progression(st, ctx) {
    var chords = [];
    for (var i = 0; i < st.slots.length; i++) {
        if (!st.slots[i]) continue;
        var c = buildChord(st, ctx, st.slots[i]);
        if (c) chords.push(c);
    }
    return chords;
}

// Note list in the format live.miditool.out expects.
function generateNotes(st, ctx) {
    var chords = progression(st, ctx);
    var notes = [];
    if (!chords.length) return notes;

    var beats = LENGTHS[st.length];
    var range = selectionRange(ctx);
    var start = range ? range.start : 0;
    var end = (range && st.fill) ? range.end : start + beats * chords.length;
    if (range && !st.fill) end = Math.min(end, range.end);

    var t = start, i = 0;
    while (t < end - 1e-6) {
        var dur = Math.min(beats, end - t);
        var chord = chords[i % chords.length];
        for (var p = 0; p < chord.pitches.length; p++) {
            notes.push({
                pitch: chord.pitches[p],
                start_time: t,
                duration: dur,
                velocity: st.velocity,
                mute: 0
            });
        }
        t += beats;
        i++;
    }
    return notes;
}

function readoutText(st, ctx) {
    var sc = currentScale(st, ctx);
    var chords = progression(st, ctx);
    if (st.useClipScale && !(ctx && ctx.scale)) return "Using the clip's scale: press Generate";
    var head = NOTES[sc.root % 12] + " " + sc.name;
    if (!chords.length) return head + ": no chords (pick degrees above)";
    return head + ":  " + chords.map(function (c) {
        return c.roman + " " + c.name;
    }).join("  ·  ");
}

// ─── MAX GLUE ────────────────────────────────────────────────────────────────

// Re-run the apply cycle so the clip updates as controls move. Debounced so a
// preset (8 slot changes at once) only rewrites the clip one time.
var regenerate = (typeof Task !== "undefined") ?
    new Task(function () { outlet(1, "bang"); }) : null;

function changed() {
    outlet(2, "readout", "set", readoutText(state, context));
    if (ready && regenerate) {
        regenerate.cancel();
        regenerate.schedule(30);
    }
}

function root(v)      { state.root = v | 0; changed(); }
function scale(v)     { state.scale = v | 0; changed(); }
function clipscale(v) { state.useClipScale = v ? 1 : 0; changed(); }
function type(v)      { state.type = v | 0; changed(); }
function octave(v)    { state.octave = v | 0; changed(); }
function inversion(v) { state.inversion = v | 0; changed(); }
function length(v)    { state.length = v | 0; changed(); }
function fill(v)      { state.fill = v ? 1 : 0; changed(); }
function bass(v)      { state.bass = v ? 1 : 0; changed(); }
function velocity(v)  { state.velocity = Math.max(1, Math.min(127, v | 0)); changed(); }

function slot(i, v) {
    if (i < 0 || i >= NUM_SLOTS) return;
    state.slots[i] = v | 0;
    changed();
}

// Picking a preset sets the slot menus; each menu then reports back via slot().
function preset(v) {
    var p = PRESETS[v | 0];
    if (!p) return;
    for (var i = 0; i < NUM_SLOTS; i++) outlet(2, "slot", i, p[i] || 0);
    outlet(2, "preset", "set", 0);
}

// live.thisdevice -> "loaded": parameters are restored, safe to write to clips.
function loaded() {
    ready = 1;
    outlet(2, "readout", "set", readoutText(state, context));
}

var loggedContext = 0;

function dictionary(name) {
    var data = JSON.parse(new Dict(name).stringify());
    if (inlet === 1) {
        context = data;
        if (!loggedContext) {
            post("MetaMuse Chords: clip context = " + JSON.stringify(data) + "\n");
            loggedContext = 1;
        }
        return;
    }
    // Left inlet: the clip's notes arrive after the context -> generate.
    var out = new Dict("metamuse_chords_out");
    out.parse(JSON.stringify({ notes: generateNotes(state, context) }));
    outlet(2, "readout", "set", readoutText(state, context));
    outlet(0, "dictionary", out.name);
}

// Node test hook (ignored inside Max, where `module` is undefined).
if (typeof module !== "undefined") {
    module.exports = {
        state: state, SCALES: SCALES, CHORD_TYPES: CHORD_TYPES, LENGTHS: LENGTHS, PRESETS: PRESETS,
        buildChord: buildChord, generateNotes: generateNotes, readoutText: readoutText
    };
}
