// ─── MetaMuse shared music theory ────────────────────────────────────────────
//
// Scales, chord shapes, chord names and voice leading used by every MetaMuse
// device. build_devices.py pastes this file in front of each device's own
// script, so edit it here and rebuild — the built .js files are generated.
//
// Written in ES5 so it runs in Max's classic [js] object.

var NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Order must match SCALES in build_devices.py
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

// Order must match CHORD_TYPES in build_devices.py.
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

var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

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

// ─── CHORD NAMES ─────────────────────────────────────────────────────────────
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

// Full chord name for a root pitch class and shape, e.g. "Am7" or "C-E-A".
function chordName(rootPc, shape, def) {
    var suffix = (def && def.suffix !== undefined) ? def.suffix : qualityName(shape);
    if (suffix !== null) return NOTES[rootPc] + suffix;
    return shape.map(function (s) { return NOTES[(rootPc + s) % 12]; }).join("-");
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

// ─── VOICE LEADING ───────────────────────────────────────────────────────────
// Given the previous chord's notes and the next chord's notes, try every
// inversion of the next chord in nearby octaves and keep the one whose notes
// move the least. A small pull towards `anchor` (an average pitch) stops a
// long progression drifting up or down the keyboard.

function mean(a) {
    var sum = 0;
    for (var i = 0; i < a.length; i++) sum += a[i];
    return sum / a.length;
}

function ascending(a) {
    return a.slice().sort(function (x, y) { return x - y; });
}

function movement(prev, cand) {
    if (prev.length !== cand.length) return Math.abs(mean(prev) - mean(cand)) * cand.length;
    var cost = 0;
    for (var i = 0; i < cand.length; i++) cost += Math.abs(prev[i] - cand[i]);
    return cost;
}

function smoothestVoicing(prev, next, anchor) {
    var base = ascending(next);
    prev = ascending(prev);
    var best = base, bestCost = Infinity;
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
    return best;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Small repeatable random generator: the same seed always gives the same
// sequence, so pressing Generate again with the same settings is stable.
function seededRandom(seed) {
    var x = (seed * 9301 + 49297) % 233280;
    return function () {
        x = (x * 9301 + 49297) % 233280;
        return x / 233280;
    };
}

// Time range to write into: Live's time selection, if the context has one.
function selectionRange(ctx) {
    var sel = ctx && (ctx.time_selection || ctx.selection);
    if (sel && typeof sel.start_time === "number" && typeof sel.end_time === "number" &&
        sel.end_time > sel.start_time) {
        return { start: sel.start_time, end: sel.end_time };
    }
    return null;
}

// Read a dictionary arriving from live.miditool.in as a plain JS object.
function readDict(name) {
    return JSON.parse(new Dict(name).stringify());
}

// Send notes to live.miditool.out (outlet 0) as a dictionary.
function sendNotes(dictName, notes) {
    var out = new Dict(dictName);
    out.parse(JSON.stringify({ notes: notes }));
    outlet(0, "dictionary", out.name);
}
