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
//   outlet 2 : UI feedback -> [route readout slot slotlen preset]
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
//           These are the main chord sizes: 3, 4, 5, 6 and 7 notes.
// "semis" = fixed shape built on each scale degree (same as the web app).
var CHORD_TYPES = [
    { label: "Triad",    steps: [0, 2, 4] },
    { label: "7th",      steps: [0, 2, 4, 6] },
    { label: "9th",      steps: [0, 2, 4, 6, 8] },
    { label: "11th",     steps: [0, 2, 4, 6, 8, 10] },
    { label: "13th",     steps: [0, 2, 4, 6, 8, 10, 12] },
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

// Per-slot length menu, in beats (4 beats = 1 bar). 0 = use the Length menu.
// Order must match SLOT_LENGTHS in build_device.py.
var SLOT_LENGTHS = [0, 0.5, 1, 2, 3, 4, 6, 8, 12, 16];

// Play styles and their step rate. Order must match build_device.py.
var STYLES = ["Block", "Strum Up", "Strum Down", "Arp Up", "Arp Down", "Arp Up-Down", "Arp Random"];
var RATES = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 1 / 6, 1 / 3];  // 1/64 ... 1/4, 1/16T, 1/8T

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
    [1, 5, 6, 3, 4, 1, 4, 5],
    [1, 1, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5],                 // 12-bar blues
    [1, 5, 6, 4, 1, 5, 6, 4, 6, 4, 1, 5, 6, 4, 5, 5]      // 16-chord pop song
];

var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
var NUM_SLOTS = 16;

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
    style: 0,         // index into STYLES
    rate: 2,          // index into RATES
    voiceLead: 0,     // 1 = pick inversions so chords move smoothly
    slots:    [1, 5, 6, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    slotLens: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
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

// Name a diatonic shape from its intervals, e.g. [0,3,7,10] -> "m7",
// [0,4,7,10,14,17,21] -> "13", [0,4,7,11,14,18] -> "maj9(#11)".
// Returns null for stacks with no common name (e.g. pentatonic stacks).
var TRIAD_NAMES = { "4,7": "", "3,7": "m", "3,6": "dim", "4,8": "aug", "2,7": "sus2", "5,7": "sus4" };

// Triad + 7th -> name pattern; {n} becomes 7, 9, 11 or 13.
var SEVENTH_NAMES = {
    "4,7,11": "maj{n}", "4,7,10": "{n}", "3,7,10": "m{n}", "3,6,10": "m{n}b5",
    "3,6,9": "dim{n}", "3,7,11": "m(maj{n})", "4,8,11": "maj{n}#5", "4,8,10": "{n}#5"
};

// Upper extensions: which pitch class is "natural", and names for altered ones.
var EXTENSIONS = [
    { n: 9,  natural: 2, altered: { 1: "b9", 3: "#9" } },
    { n: 11, natural: 5, altered: { 6: "#11", 4: "b11" } },
    { n: 13, natural: 9, altered: { 8: "b13", 10: "#13" } }
];

function qualityName(shape) {
    var pcs = shape.map(function (s) { return s % 12; });
    if (pcs.length === 3) {
        var t = pcs.slice(1).join(",");
        return TRIAD_NAMES.hasOwnProperty(t) ? TRIAD_NAMES[t] : null;
    }
    var base = pcs.slice(1, 4).join(",");
    if (!SEVENTH_NAMES.hasOwnProperty(base)) return null;

    // The highest natural extension names the chord (C9, C11, C13) as long as
    // everything below it is natural too; altered ones go in brackets.
    var n = 7, alts = [];
    for (var i = 4; i < pcs.length; i++) {
        var ext = EXTENSIONS[i - 4];
        if (pcs[i] === ext.natural && !alts.length) n = ext.n;
        else if (pcs[i] === ext.natural) alts.push(String(ext.n));
        else if (ext.altered.hasOwnProperty(pcs[i])) alts.push(ext.altered[pcs[i]]);
        else return null;
    }
    return SEVENTH_NAMES[base].replace("{n}", n) + (alts.length ? "(" + alts.join(",") + ")" : "");
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

    var upper = shape.map(function (s) { return rootMidi + s; });
    for (var i = 0; i < st.inversion % upper.length; i++) {
        upper.push(upper.shift() + 12);
    }

    var suffix = def.suffix !== undefined ? def.suffix : qualityName(shape);
    var name = suffix !== null ? NOTES[rootPc] + suffix :
        shape.map(function (s) { return NOTES[(rootPc + s) % 12]; }).join("-");

    return {
        name: name,
        roman: romanFor(degIdx, shape),
        upper: upper,                        // the chord voicing
        bass: st.bass ? rootMidi - 12 : null // optional root below it
    };
}

// All notes of a chord, low to high, kept inside the MIDI range.
function chordPitches(chord) {
    var all = chord.upper.slice();
    if (chord.bass !== null) all.push(chord.bass);
    return all.filter(function (p) { return p >= 0 && p <= 127; })
              .sort(function (a, b) { return a - b; });
}

// ─── VOICE LEADING ───────────────────────────────────────────────────────────
// For each chord after the first, try every inversion in nearby octaves and
// keep the one whose notes move the least from the previous chord. A small
// pull towards the first chord's register stops the progression drifting.

function mean(a) {
    var sum = 0;
    for (var i = 0; i < a.length; i++) sum += a[i];
    return sum / a.length;
}

function movement(prev, cand) {
    if (prev.length !== cand.length) return Math.abs(mean(prev) - mean(cand)) * cand.length;
    var cost = 0;
    for (var i = 0; i < cand.length; i++) cost += Math.abs(prev[i] - cand[i]);
    return cost;
}

function voiceLead(chords) {
    if (chords.length < 2) return;
    var anchor = mean(chords[0].upper);
    var prev = chords[0].upper.slice().sort(function (a, b) { return a - b; });
    for (var c = 1; c < chords.length; c++) {
        var base = chords[c].upper.slice().sort(function (a, b) { return a - b; });
        var best = null, bestCost = Infinity;
        for (var k = 0; k < base.length; k++) {
            var inv = base.slice();
            for (var r = 0; r < k; r++) inv.push(inv.shift() + 12);
            for (var shift = -24; shift <= 12; shift += 12) {
                var cand = inv.map(function (p) { return p + shift; });
                if (cand[0] < 0 || cand[cand.length - 1] > 127) continue;
                var cost = movement(prev, cand) + 0.5 * Math.abs(mean(cand) - anchor);
                if (cost < bestCost) { bestCost = cost; best = cand; }
            }
        }
        if (best) chords[c].upper = best;
        prev = chords[c].upper;
    }
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

// The list of chords from the slots, skipping empty ones. Each chord gets
// its length in beats: the slot's own length, or the Length menu's.
function progression(st, ctx) {
    var chords = [];
    for (var i = 0; i < st.slots.length; i++) {
        if (!st.slots[i]) continue;
        var c = buildChord(st, ctx, st.slots[i]);
        if (!c) continue;
        c.beats = SLOT_LENGTHS[st.slotLens[i]] || LENGTHS[st.length];
        chords.push(c);
    }
    if (st.voiceLead) voiceLead(chords);
    return chords;
}

// Small repeatable random generator, so "Arp Random" gives the same
// pattern each time you press Generate with the same settings.
function seededRandom(seed) {
    var x = seed * 9301 + 49297;
    return function () {
        x = (x * 9301 + 49297) % 233280;
        return x / 233280;
    };
}

// Order of notes for an arpeggio over pitches (low to high).
function arpOrder(pitches, style, count, rand) {
    var up = pitches, down = pitches.slice().reverse();
    var cycle;
    if (style === "Arp Up") cycle = up;
    else if (style === "Arp Down") cycle = down;
    else if (style === "Arp Up-Down") cycle = up.concat(down.slice(1, -1));
    var out = [];
    for (var i = 0; i < count; i++) {
        out.push(cycle ? cycle[i % cycle.length] :
            pitches[Math.floor(rand() * pitches.length)]);
    }
    return out;
}

// Notes for one chord placed at time t for dur beats.
function chordNotes(st, chord, t, dur, index) {
    var pitches = chordPitches(chord);
    var style = STYLES[st.style];
    var rate = RATES[st.rate];
    var notes = [];
    function add(pitch, start, length) {
        notes.push({ pitch: pitch, start_time: start, duration: length,
                     velocity: st.velocity, mute: 0 });
    }

    if (style === "Block") {
        pitches.forEach(function (p) { add(p, t, dur); });
    } else if (style === "Strum Up" || style === "Strum Down") {
        var order = style === "Strum Up" ? pitches : pitches.slice().reverse();
        order.forEach(function (p, k) {
            var offset = Math.min(k * rate, dur * 0.5);  // never strum past half the chord
            add(p, t + offset, dur - offset);
        });
    } else {
        var steps = Math.max(1, Math.ceil(dur / rate - 1e-6));
        var seq = arpOrder(pitches, style, steps, seededRandom(index + 1));
        for (var s = 0; s < steps; s++) {
            var start = t + s * rate;
            add(seq[s], start, Math.min(rate, t + dur - start));
        }
    }
    return notes;
}

// Note list in the format live.miditool.out expects.
function generateNotes(st, ctx) {
    var chords = progression(st, ctx);
    var notes = [];
    if (!chords.length) return notes;

    var total = 0;
    chords.forEach(function (c) { total += c.beats; });

    var range = selectionRange(ctx);
    var start = range ? range.start : 0;
    var end = (range && st.fill) ? range.end : start + total;
    if (range && !st.fill) end = Math.min(end, range.end);

    var t = start, i = 0;
    while (t < end - 1e-6) {
        var chord = chords[i % chords.length];
        var dur = Math.min(chord.beats, end - t);
        notes = notes.concat(chordNotes(st, chord, t, dur, i));
        t += chord.beats;
        i++;
    }
    return notes;
}

function readoutText(st, ctx) {
    var sc = currentScale(st, ctx);
    var chords = progression(st, ctx);
    if (st.useClipScale && !(ctx && ctx.scale)) return "Using the clip's scale: press Generate";
    var head = NOTES[sc.root % 12] + " " + sc.name;
    if (!chords.length) return head + ": pick chords above";
    // Kept short: the Generate panel is narrow.
    return head + ":  " + chords.map(function (c) { return c.name; }).join("  ");
}

// ─── MAX GLUE ────────────────────────────────────────────────────────────────

// Re-run the apply cycle so the clip updates as controls move. Debounced so a
// preset (32 slot changes at once) only rewrites the clip one time.
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
function style(v)     { state.style = v | 0; changed(); }
function rate(v)      { state.rate = v | 0; changed(); }
function voicelead(v) { state.voiceLead = v ? 1 : 0; changed(); }

function slot(i, v) {
    if (i < 0 || i >= NUM_SLOTS) return;
    state.slots[i] = v | 0;
    changed();
}

function slotlen(i, v) {
    if (i < 0 || i >= NUM_SLOTS) return;
    state.slotLens[i] = v | 0;
    changed();
}

// Picking a preset sets the slot menus (and resets their lengths to "=");
// each menu then reports back via slot() / slotlen().
function preset(v) {
    var p = PRESETS[v | 0];
    if (!p) return;
    for (var i = 0; i < NUM_SLOTS; i++) {
        outlet(2, "slot", i, p[i] || 0);
        outlet(2, "slotlen", i, 0);
    }
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
        STYLES: STYLES, progression: progression,
        buildChord: buildChord, generateNotes: generateNotes, readoutText: readoutText
    };
}
